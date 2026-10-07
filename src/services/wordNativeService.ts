const BRIDGE_URL = "http://127.0.0.1:43127";

export interface WordBridgeInfo {
  ready: boolean;
  engine: string;
  version: string;
}

function bridgeErrorMessage(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: string };
    if (parsed.error) return parsed.error;
  } catch {
    // A resposta pode ser texto simples em erros anteriores à inicialização do Word.
  }
  return body.trim() || `O conversor local respondeu com o código ${status}.`;
}

export async function checkWordBridge(signal?: AbortSignal): Promise<WordBridgeInfo> {
  const response = await fetch(`${BRIDGE_URL}/health`, {
    method: "GET",
    cache: "no-store",
    signal,
    headers: { "X-ConcreZip-Bridge": "1" },
  });
  if (!response.ok) throw new Error(bridgeErrorMessage(response.status, await response.text()));
  return response.json() as Promise<WordBridgeInfo>;
}

export async function convertWithMicrosoftWord(file: File, signal: AbortSignal): Promise<Blob> {
  const response = await fetch(`${BRIDGE_URL}/convert`, {
    method: "POST",
    cache: "no-store",
    signal,
    headers: {
      "Content-Type": "application/octet-stream",
      "X-ConcreZip-Bridge": "1",
      "X-ConcreZip-Filename": encodeURIComponent(file.name),
    },
    body: file,
  });
  if (!response.ok) throw new Error(bridgeErrorMessage(response.status, await response.text()));

  const pdf = await response.blob();
  const signature = new TextDecoder("ascii").decode(await pdf.slice(0, 5).arrayBuffer());
  if (pdf.size === 0 || signature !== "%PDF-") {
    throw new Error("O Microsoft Word não retornou um PDF válido.");
  }
  return pdf;
}
