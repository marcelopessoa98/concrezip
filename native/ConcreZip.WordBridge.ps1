param(
    [int]$Port = 43127
)

$ErrorActionPreference = "Stop"
$maxFileBytes = 250MB
$listener = $null
$word = $null
$mutex = $null
$createdNew = $false
$wordProcessId = $null

function Write-HttpResponse {
    param(
        [System.IO.Stream]$Stream,
        [int]$StatusCode,
        [string]$StatusText,
        [byte[]]$Body,
        [string]$ContentType = "application/json; charset=utf-8"
    )

    $headers = @(
        "HTTP/1.1 $StatusCode $StatusText",
        "Content-Type: $ContentType",
        "Content-Length: $($Body.Length)",
        "Access-Control-Allow-Origin: *",
        "Access-Control-Allow-Methods: GET, POST, OPTIONS",
        "Access-Control-Allow-Headers: Content-Type, X-ConcreZip-Bridge, X-ConcreZip-Filename",
        "Access-Control-Allow-Private-Network: true",
        "Access-Control-Expose-Headers: X-ConcreZip-Engine",
        "Cross-Origin-Resource-Policy: cross-origin",
        "Cache-Control: no-store",
        "X-ConcreZip-Engine: Microsoft-Word",
        "Connection: close",
        "",
        ""
    ) -join "`r`n"

    $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($headers)
    $Stream.Write($headerBytes, 0, $headerBytes.Length)
    if ($Body.Length -gt 0) { $Stream.Write($Body, 0, $Body.Length) }
    $Stream.Flush()
}

function Write-JsonResponse {
    param(
        [System.IO.Stream]$Stream,
        [int]$StatusCode,
        [string]$StatusText,
        [hashtable]$Value
    )
    $json = $Value | ConvertTo-Json -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    Write-HttpResponse -Stream $Stream -StatusCode $StatusCode -StatusText $StatusText -Body $bytes
}

function Read-HttpRequest {
    param([System.IO.Stream]$Stream)

    $headerBytes = New-Object System.Collections.Generic.List[byte]
    $matched = 0
    $delimiter = [byte[]](13, 10, 13, 10)
    while ($matched -lt 4) {
        $next = $Stream.ReadByte()
        if ($next -lt 0) { throw "Conexão encerrada antes do cabeçalho HTTP." }
        $headerBytes.Add([byte]$next)
        if ($headerBytes.Count -gt 65536) { throw "Cabeçalho HTTP maior que o permitido." }
        if ($next -eq $delimiter[$matched]) { $matched += 1 } else { $matched = if ($next -eq 13) { 1 } else { 0 } }
    }

    $headerText = [System.Text.Encoding]::ASCII.GetString($headerBytes.ToArray(), 0, $headerBytes.Count - 4)
    $lines = $headerText -split "`r`n"
    $requestLine = $lines[0] -split " "
    if ($requestLine.Count -lt 2) { throw "Linha de requisição HTTP inválida." }
    $headers = @{}
    foreach ($line in $lines | Select-Object -Skip 1) {
        $separator = $line.IndexOf(":")
        if ($separator -gt 0) {
            $headers[$line.Substring(0, $separator).Trim().ToLowerInvariant()] = $line.Substring($separator + 1).Trim()
        }
    }
    return @{ Method = $requestLine[0].ToUpperInvariant(); Path = $requestLine[1]; Headers = $headers }
}

function Save-RequestBody {
    param(
        [System.IO.Stream]$Stream,
        [long]$Length,
        [string]$Destination
    )
    if ($Length -le 0) { throw "O arquivo Word recebido está vazio." }
    if ($Length -gt $maxFileBytes) { throw "O arquivo excede o limite de 250 MB." }

    $buffer = New-Object byte[] 65536
    $remaining = $Length
    $fileStream = [System.IO.File]::Open($Destination, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
    try {
        while ($remaining -gt 0) {
            $wanted = [int][Math]::Min($buffer.Length, $remaining)
            $read = $Stream.Read($buffer, 0, $wanted)
            if ($read -le 0) { throw "A conexão terminou antes do recebimento completo do arquivo." }
            $fileStream.Write($buffer, 0, $read)
            $remaining -= $read
        }
    } finally {
        $fileStream.Dispose()
    }
}

function Convert-WordDocument {
    param(
        [string]$InputPath,
        [string]$OutputPath
    )
    $document = $null
    try {
        $document = $word.Documents.Open($InputPath, $false, $true)
        $document.ExportAsFixedFormat($OutputPath, 17)
    } finally {
        if ($null -ne $document) {
            $document.Close(0)
            [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($document)
        }
    }
}

try {
    $mutex = New-Object System.Threading.Mutex($true, "Local\ConcreZipWordBridge", [ref]$createdNew)
    if (-not $createdNew) { throw "O Conversor Word da ConcreZip já está aberto." }

    Write-Host "Iniciando o Microsoft Word..." -ForegroundColor Cyan
    $existingWordProcessIds = @(Get-Process WINWORD -ErrorAction SilentlyContinue | ForEach-Object { $_.Id })
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0
    $wordProcess = Get-Process WINWORD -ErrorAction SilentlyContinue |
        Where-Object { $_.Id -notin $existingWordProcessIds } |
        Sort-Object Id -Descending |
        Select-Object -First 1
    if ($null -ne $wordProcess) {
        $wordProcessId = $wordProcess.Id
        $watchdogScript = "Wait-Process -Id $PID -ErrorAction SilentlyContinue; Stop-Process -Id $wordProcessId -Force -ErrorAction SilentlyContinue"
        $watchdogEncoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($watchdogScript))
        Start-Process powershell.exe -ArgumentList "-NoLogo -NoProfile -WindowStyle Hidden -EncodedCommand $watchdogEncoded" -WindowStyle Hidden
    }

    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
    $listener.Start()
    Write-Host ""
    Write-Host "Conversor Word da ConcreZip pronto." -ForegroundColor Green
    Write-Host "Mantenha esta janela aberta enquanto estiver convertendo documentos."
    Write-Host "Microsoft Word $($word.Version) - porta local $Port"
    Write-Host "Pressione Q para encerrar com segurança."

    while ($true) {
        if ([Console]::KeyAvailable) {
            $key = [Console]::ReadKey($true)
            if ($key.Key -eq [ConsoleKey]::Q) { break }
        }
        if (-not $listener.Pending()) {
            Start-Sleep -Milliseconds 150
            continue
        }
        $client = $listener.AcceptTcpClient()
        try {
            $client.ReceiveTimeout = 300000
            $client.SendTimeout = 300000
            $stream = $client.GetStream()
            $request = Read-HttpRequest -Stream $stream

            if ($request.Method -eq "OPTIONS") {
                Write-HttpResponse -Stream $stream -StatusCode 204 -StatusText "No Content" -Body ([byte[]]@())
                continue
            }
            if ($request.Method -eq "GET" -and $request.Path -eq "/health") {
                Write-JsonResponse -Stream $stream -StatusCode 200 -StatusText "OK" -Value @{ ready = $true; engine = "Microsoft Word"; version = [string]$word.Version }
                continue
            }
            if ($request.Method -ne "POST" -or $request.Path -ne "/convert") {
                Write-JsonResponse -Stream $stream -StatusCode 404 -StatusText "Not Found" -Value @{ error = "Rota não encontrada." }
                continue
            }
            if ($request.Headers["x-concrezip-bridge"] -ne "1") {
                Write-JsonResponse -Stream $stream -StatusCode 400 -StatusText "Bad Request" -Value @{ error = "Protocolo do conversor inválido." }
                continue
            }

            $contentLength = 0L
            if (-not [long]::TryParse($request.Headers["content-length"], [ref]$contentLength)) {
                throw "O tamanho do arquivo não foi informado pelo navegador."
            }
            $encodedName = $request.Headers["x-concrezip-filename"]
            $fileName = [System.IO.Path]::GetFileName([System.Uri]::UnescapeDataString($encodedName))
            $extension = [System.IO.Path]::GetExtension($fileName).ToLowerInvariant()
            if ($extension -notin @(".doc", ".docx", ".docm", ".rtf")) {
                throw "Formato Word não compatível: $extension"
            }

            $jobDirectory = Join-Path ([System.IO.Path]::GetTempPath()) ("ConcreZip-" + [guid]::NewGuid().ToString("N"))
            [void][System.IO.Directory]::CreateDirectory($jobDirectory)
            $inputPath = Join-Path $jobDirectory ("entrada" + $extension)
            $outputPath = Join-Path $jobDirectory "saida.pdf"
            try {
                Save-RequestBody -Stream $stream -Length $contentLength -Destination $inputPath
                Convert-WordDocument -InputPath $inputPath -OutputPath $outputPath
                if (-not (Test-Path -LiteralPath $outputPath)) { throw "O Microsoft Word não criou o arquivo PDF." }
                $pdfBytes = [System.IO.File]::ReadAllBytes($outputPath)
                Write-HttpResponse -Stream $stream -StatusCode 200 -StatusText "OK" -Body $pdfBytes -ContentType "application/pdf"
                Write-Host "Convertido: $fileName" -ForegroundColor Green
            } finally {
                if (Test-Path -LiteralPath $jobDirectory) { Remove-Item -LiteralPath $jobDirectory -Recurse -Force -ErrorAction SilentlyContinue }
            }
        } catch {
            Write-Host "Falha: $($_.Exception.Message)" -ForegroundColor Red
            try { Write-JsonResponse -Stream $client.GetStream() -StatusCode 500 -StatusText "Internal Server Error" -Value @{ error = $_.Exception.Message } } catch {}
        } finally {
            $client.Dispose()
        }
    }
} catch {
    Write-Host ""
    Write-Host "Não foi possível iniciar o conversor: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Confirme que o Microsoft Word está instalado e tente novamente."
    Read-Host "Pressione Enter para fechar"
    exit 1
} finally {
    if ($null -ne $listener) { $listener.Stop() }
    if ($null -ne $word) {
        $word.Quit()
        [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($word)
    }
    if ($null -ne $mutex) { $mutex.Dispose() }
}
