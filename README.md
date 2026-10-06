# Compactador de Laudos ConcreFuji

Aplicação web estática para reduzir e compactar pastas de laudos cautelares sem enviar arquivos para servidores. A pasta é lida no navegador, fotografias JPEG podem ser redimensionadas e recomprimidas em Web Workers, e o resultado é escrito em um arquivo ZIP preservando a hierarquia original.

## Privacidade e arquitetura

- Todo o processamento ocorre localmente no navegador.
- Não há backend, API de upload, analytics ou telemetria.
- Os arquivos originais são somente lidos; nunca são sobrescritos, movidos ou excluídos.
- No Chrome e Edge, o ZIP é gravado progressivamente no destino escolhido pela File System Access API. Assim, o arquivo final não precisa ficar inteiro na memória.
- A biblioteca `@zip.js/zip.js` cria o ZIP incrementalmente e usa ZIP64 para arquivos e pacotes acima dos limites do ZIP clássico.
- O pipeline trabalha em pequenos lotes de 2 a 4 imagens, conforme o processador disponível. Cada `ImageBitmap` é fechado pelo worker após o uso.

## Tecnologias

- TypeScript estrito
- HTML e CSS puros
- Vite
- Web Workers, `createImageBitmap` e `OffscreenCanvas`
- File System Access API
- `@zip.js/zip.js`

Não são usados React, Vue, Angular, bibliotecas de interface ou funções serverless.

## Executar localmente

Requisitos: Node.js 20 ou mais recente apenas para desenvolvimento e build. O usuário final não precisa de Node.js.

```bash
npm install
npm run dev
```

Abra o endereço local informado pelo Vite, preferencialmente no Google Chrome ou Microsoft Edge.

## Build

```bash
npm run build
npm run preview
```

O build estático é gerado em `dist`.

## Deploy na Vercel

O arquivo `vercel.json` já define o comando de build e o diretório de saída. Importe o repositório na Vercel ou use a CLI:

```bash
vercel
```

Nenhuma variável de ambiente e nenhuma função serverless são necessárias.

## Como funciona

1. A pasta é escolhida por `showDirectoryPicker()`; em navegadores sem suporte é usado `input[webkitdirectory]`.
2. A aplicação percorre apenas os metadados para somar tamanhos e classificar arquivos.
3. Uma pequena amostra distribuída de JPEGs produz a estimativa de tamanho.
4. O usuário escolhe o arquivo de destino antes do processamento.
5. JPEGs são processados em workers, com fila limitada. PNG e WebP são preservados nesta primeira versão para evitar perda de transparência ou conversões arriscadas.
6. Cada resultado é adicionado ao ZIP e sua referência é liberada antes do próximo lote.
7. PDFs, documentos, vídeos e outros arquivos entram no pacote sem transformação.

Se uma imagem falhar, o arquivo original é incluído e a ocorrência aparece no log técnico.

## Navegadores e arquivos grandes

Chrome e Edge atuais em desktop são recomendados. O salvamento progressivo depende de contexto seguro (`https` ou `localhost`) e da File System Access API.

Quando `showSaveFilePicker()` não existe, a aplicação oferece um download tradicional. Esse fallback precisa manter o ZIP final em memória e, por isso, exibe um alerta para pastas maiores que 1 GB. Para laudos de 10–20 GB, use Chrome/Edge e o salvamento progressivo.

O resultado real depende do conteúdo. JPEGs já comprimidos, PDFs e vídeos podem reduzir pouco. A meta informada é apenas comparada à estimativa; a aplicação não promete atingir um tamanho exato nem reduz a qualidade de forma automática e destrutiva.

## Formatos

- Otimizados: `.jpg` e `.jpeg`.
- Preservados: `.png`, `.webp`, `.pdf`, documentos, planilhas, textos, vídeos e demais arquivos.
- Saída: `.zip` com ZIP64 habilitado.

## Limitações conhecidas

- O navegador precisa conseguir decodificar a fotografia para otimizá-la. Caso contrário, o original é preservado.
- PNG e WebP ainda não são recomprimidos.
- A aplicação não pode consultar de forma portátil o espaço livre do volume de destino; erros de gravação, inclusive falta de espaço, são apresentados ao usuário.
- Ao cancelar uma gravação, o navegador ou sistema operacional pode manter um arquivo parcial no destino escolhido. A pasta original permanece intacta.
- A contagem de pastas inclui a pasta raiz selecionada e pastas vazias quando a API moderna ou o arraste de diretório permite identificá-las.
