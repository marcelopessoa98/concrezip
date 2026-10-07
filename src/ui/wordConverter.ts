import { checkWordBridge, convertWithMicrosoftWord } from "../services/wordNativeService";
import { formatBytes } from "../utils/formatBytes";
import { getElement, setHidden, setText } from "./elements";

type ConversionStatus = "pending" | "converting" | "complete" | "error";

interface ConversionItem {
  id: number;
  file: File;
  outputName: string;
  status: ConversionStatus;
  outputBytes?: number;
  error?: string;
}

const markup = `
  <section class="word-hero">
    <div>
      <p class="eyebrow red">CONVERSOR NATIVO CONCREFUJI</p>
      <h2>Conversão pelo Word.<br><em>Formatação preservada.</em></h2>
      <p>Gere vários PDFs separados usando o próprio Microsoft Word, sem recriar ou reinterpretar os documentos.</p>
    </div>
    <div class="privacy-card">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 4.5 5.2v5.7c0 5 3.2 9.4 7.5 11.1 4.3-1.7 7.5-6.1 7.5-11.1V5.2L12 2Zm0 3 4.5 1.9v4c0 3.4-1.9 6.6-4.5 8-2.6-1.4-4.5-4.6-4.5-8v-4L12 5Z"/></svg>
      <div><strong>Conversão privada e local</strong><p>Os documentos ficam no computador e são convertidos pelo Microsoft Word instalado.</p></div>
    </div>
  </section>

  <section id="word-bridge-card" class="card word-bridge-card is-checking">
    <div class="word-bridge-status"><span id="word-bridge-dot"></span><div><strong id="word-bridge-title">Verificando conversor local…</strong><p id="word-bridge-detail">Aguarde enquanto procuramos o Microsoft Word.</p></div></div>
    <div class="word-bridge-actions">
      <a id="download-word-helper" class="button ghost" href="/concrezip-conversor-word.zip" download>Baixar conversor local</a>
      <button id="check-word-bridge" class="button primary" type="button">Verificar novamente</button>
    </div>
    <details id="word-helper-instructions" class="word-helper-instructions">
      <summary>Como preparar este computador</summary>
      <ol><li>Baixe e extraia o pacote.</li><li>Abra <strong>Iniciar Conversor Word.cmd</strong>.</li><li>Mantenha a janela do conversor aberta e clique em <strong>Verificar novamente</strong>.</li></ol>
      <p>Requer Windows com Microsoft Word instalado. O auxiliar recebe arquivos somente pelo endereço local deste computador.</p>
    </details>
  </section>

  <div id="word-error" class="notice error" hidden><strong>Não foi possível continuar.</strong><span id="word-error-text"></span></div>

  <section class="card word-selection-card">
    <div id="word-drop-zone" class="word-drop-zone" tabindex="0" role="button" aria-label="Selecionar arquivos Word">
      <div class="word-icon" aria-hidden="true"><span>W</span></div>
      <div><h3>Selecione os arquivos Word</h3><p>Arraste vários arquivos para cá ou escolha no computador</p></div>
      <button id="select-word-files" class="button primary" type="button">Selecionar arquivos</button>
      <input id="word-file-input" type="file" accept=".docx,.doc,.docm,.rtf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword" multiple hidden>
      <small>Compatível com .docx, .doc, .docm e .rtf. Os arquivos originais não são modificados.</small>
    </div>
  </section>

  <section id="word-workspace" hidden>
    <article class="card word-queue-card">
      <div class="word-queue-heading">
        <div><span>DOCUMENTOS SELECIONADOS</span><h3 id="word-file-count">0 arquivos</h3></div>
        <div class="word-queue-actions"><button id="add-word-files" class="button ghost" type="button">Adicionar arquivos</button><button id="clear-word-files" class="button text" type="button">Limpar lista</button></div>
      </div>
      <div id="word-file-list" class="word-file-list"></div>
    </article>
    <div class="word-action-row">
      <div><strong id="word-ready-title">Pronto para converter</strong><p id="word-save-caption"></p></div>
      <button id="start-word-conversion" class="button primary large" type="button">Escolher pasta e converter</button>
    </div>
  </section>

  <section id="word-result" class="card word-result-card" hidden>
    <div class="success-icon">✓</div>
    <p class="eyebrow red">CONVERSÃO NATIVA CONCLUÍDA</p>
    <h2 id="word-result-title"></h2>
    <p id="word-result-caption"></p>
    <button id="new-word-conversion" class="button primary" type="button">Nova conversão</button>
  </section>
`;

let items: ConversionItem[] = [];
let nextId = 1;
let processing = false;
let bridgeReady = false;
let controller: AbortController | undefined;

function extensionOf(name: string): string {
  return name.slice(name.lastIndexOf(".")).toLowerCase();
}

function pdfNameFor(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, "").trim() || "documento";
  return `${base}.pdf`;
}

function uniqueOutputName(preferred: string, used: Set<string>): string {
  const base = preferred.replace(/\.pdf$/i, "");
  let candidate = preferred;
  let suffix = 2;
  while (used.has(candidate.toLocaleLowerCase("pt-BR"))) {
    candidate = `${base} (${suffix}).pdf`;
    suffix += 1;
  }
  used.add(candidate.toLocaleLowerCase("pt-BR"));
  return candidate;
}

function addFiles(files: FileList | File[]): void {
  if (processing) return;
  const allowed = new Set([".docx", ".doc", ".docm", ".rtf"]);
  const incoming = Array.from(files).filter((file) => allowed.has(extensionOf(file.name)));
  const known = new Set(items.map((item) => `${item.file.name}|${item.file.size}|${item.file.lastModified}`));
  const usedNames = new Set(items.map((item) => item.outputName.toLocaleLowerCase("pt-BR")));

  for (const file of incoming) {
    const signature = `${file.name}|${file.size}|${file.lastModified}`;
    if (known.has(signature)) continue;
    known.add(signature);
    items.push({ id: nextId++, file, outputName: uniqueOutputName(pdfNameFor(file.name), usedNames), status: "pending" });
  }
  renderQueue();
}

function statusLabel(item: ConversionItem): string {
  if (item.status === "pending") return "Aguardando";
  if (item.status === "converting") return "Convertendo pelo Word…";
  if (item.status === "complete") return `Concluído · ${formatBytes(item.outputBytes ?? 0)}`;
  return "Falha na conversão";
}

function renderQueue(): void {
  const list = getElement<HTMLElement>("#word-file-list");
  list.replaceChildren(...items.map((item) => {
    const row = document.createElement("div");
    row.className = `word-file-row status-${item.status}`;
    const details = document.createElement("div");
    details.className = "word-file-details";
    const name = document.createElement("strong");
    name.textContent = item.file.name;
    const meta = document.createElement("span");
    meta.textContent = `${formatBytes(item.file.size)} · saída: ${item.outputName}`;
    details.append(name, meta);
    const status = document.createElement("span");
    status.className = "word-file-status";
    status.textContent = item.error ? `${statusLabel(item)} — ${item.error}` : statusLabel(item);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "word-remove-file";
    remove.setAttribute("aria-label", `Remover ${item.file.name}`);
    remove.textContent = "×";
    remove.disabled = processing;
    remove.addEventListener("click", () => {
      items = items.filter((current) => current.id !== item.id);
      renderQueue();
    });
    row.append(details, status, remove);
    return row;
  }));

  setText("#word-file-count", `${items.length.toLocaleString("pt-BR")} ${items.length === 1 ? "arquivo" : "arquivos"}`);
  setHidden("#word-workspace", items.length === 0);
  setHidden(".word-selection-card", items.length > 0);
  setText("#word-save-caption", bridgeReady
    ? window.showDirectoryPicker ? "Cada PDF será salvo separadamente na pasta escolhida." : "Cada PDF será baixado separadamente."
    : "Abra o conversor local para habilitar a conversão fiel pelo Microsoft Word.");
  const startButton = getElement<HTMLButtonElement>("#start-word-conversion");
  startButton.disabled = processing || items.length === 0 || !bridgeReady;
  if (!processing) startButton.textContent = window.showDirectoryPicker ? "Escolher pasta e converter" : "Converter e baixar PDFs";
  getElement<HTMLButtonElement>("#add-word-files").disabled = processing;
  getElement<HTMLButtonElement>("#clear-word-files").disabled = processing;
}

async function refreshBridgeStatus(): Promise<void> {
  const card = getElement<HTMLElement>("#word-bridge-card");
  const button = getElement<HTMLButtonElement>("#check-word-bridge");
  card.className = "card word-bridge-card is-checking";
  button.disabled = true;
  setText("#word-bridge-title", "Verificando conversor local…");
  setText("#word-bridge-detail", "Procurando o Microsoft Word neste computador.");
  try {
    const info = await checkWordBridge(AbortSignal.timeout(4_000));
    bridgeReady = info.ready;
    card.className = "card word-bridge-card is-ready";
    setText("#word-bridge-title", "Conversor local conectado");
    setText("#word-bridge-detail", `${info.engine} ${info.version} pronto para preservar a formatação original.`);
    getElement<HTMLDetailsElement>("#word-helper-instructions").open = false;
  } catch {
    bridgeReady = false;
    card.className = "card word-bridge-card is-offline";
    setText("#word-bridge-title", "Conversor local não encontrado");
    setText("#word-bridge-detail", "Baixe ou abra o auxiliar para converter com o mecanismo original do Microsoft Word.");
  } finally {
    button.disabled = false;
    renderQueue();
  }
}

async function saveBlob(blob: Blob, name: string, directory?: FileSystemDirectoryHandle): Promise<void> {
  if (directory) {
    const handle = await directory.getFileHandle(name, { create: true });
    const writable = await handle.createWritable();
    try {
      await writable.write(blob);
      await writable.close();
    } catch (error) {
      await writable.abort(error).catch(() => undefined);
      throw error;
    }
    return;
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

async function chooseDestination(): Promise<FileSystemDirectoryHandle | undefined> {
  const directory = await window.showDirectoryPicker?.({ mode: "readwrite" });
  if (!directory) return undefined;
  const usedNames = new Set<string>();
  for await (const entry of directory.values()) {
    if (entry.kind === "file") usedNames.add(entry.name.toLocaleLowerCase("pt-BR"));
  }
  for (const item of items) item.outputName = uniqueOutputName(pdfNameFor(item.file.name), usedNames);
  return directory;
}

async function startConversion(): Promise<void> {
  if (processing || items.length === 0) return;
  setHidden("#word-error", true);
  if (!bridgeReady) {
    showWordError(new Error("Abra o Conversor Word local e clique em “Verificar novamente”."));
    return;
  }

  let directory: FileSystemDirectoryHandle | undefined;
  try {
    directory = await chooseDestination();
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;
    showWordError(error);
    return;
  }

  processing = true;
  controller = new AbortController();
  for (const item of items) {
    item.status = "pending";
    item.error = undefined;
    item.outputBytes = undefined;
  }
  renderQueue();
  const button = getElement<HTMLButtonElement>("#start-word-conversion");
  button.disabled = false;
  button.textContent = "Cancelar conversão";
  button.classList.remove("primary");
  button.classList.add("danger");

  let completed = 0;
  let failed = 0;
  try {
    for (const item of items) {
      if (controller.signal.aborted) throw new DOMException("Conversão cancelada.", "AbortError");
      item.status = "converting";
      setText("#word-ready-title", `Convertendo ${completed + failed + 1} de ${items.length} pelo Microsoft Word`);
      renderQueue();
      try {
        const pdf = await convertWithMicrosoftWord(item.file, controller.signal);
        await saveBlob(pdf, item.outputName, directory);
        item.status = "complete";
        item.outputBytes = pdf.size;
        completed += 1;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") throw error;
        item.status = "error";
        item.error = error instanceof Error ? error.message : "Erro inesperado.";
        failed += 1;
      }
      renderQueue();
    }

    setHidden("#word-workspace", true);
    setHidden("#word-result", false);
    setText("#word-result-title", `${completed.toLocaleString("pt-BR")} PDF(s) criado(s) pelo Word`);
    setText("#word-result-caption", failed > 0
      ? `${failed.toLocaleString("pt-BR")} arquivo(s) apresentaram erro. Os demais foram exportados com a formatação original.`
      : "Todos os documentos foram exportados separadamente pelo mecanismo nativo do Microsoft Word.");
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "AbortError")) showWordError(error);
  } finally {
    processing = false;
    controller = undefined;
    button.classList.add("primary");
    button.classList.remove("danger");
    setText("#word-ready-title", "Pronto para converter");
    renderQueue();
  }
}

function showWordError(error: unknown): void {
  setText("#word-error-text", error instanceof Error ? error.message : "Ocorreu um erro inesperado.");
  setHidden("#word-error", false);
}

function reset(): void {
  controller?.abort();
  items = [];
  setHidden("#word-result", true);
  setHidden("#word-error", true);
  getElement<HTMLInputElement>("#word-file-input").value = "";
  renderQueue();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

export function mountWordConverter(container: HTMLElement): void {
  container.innerHTML = markup;
  const input = getElement<HTMLInputElement>("#word-file-input");
  const openPicker = (): void => input.click();
  getElement("#select-word-files").addEventListener("click", openPicker);
  getElement("#add-word-files").addEventListener("click", openPicker);
  getElement("#clear-word-files").addEventListener("click", reset);
  getElement("#new-word-conversion").addEventListener("click", reset);
  getElement("#check-word-bridge").addEventListener("click", () => void refreshBridgeStatus());
  getElement("#start-word-conversion").addEventListener("click", () => {
    if (processing) controller?.abort();
    else void startConversion();
  });
  input.addEventListener("change", () => {
    if (input.files) addFiles(input.files);
    input.value = "";
  });

  const dropZone = getElement<HTMLElement>("#word-drop-zone");
  for (const eventName of ["dragenter", "dragover"]) {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropZone.classList.add("dragging");
    });
  }
  for (const eventName of ["dragleave", "drop"]) {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropZone.classList.remove("dragging");
    });
  }
  dropZone.addEventListener("drop", (event) => {
    const files = (event as DragEvent).dataTransfer?.files;
    if (files) addFiles(files);
  });
  dropZone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") openPicker();
  });
  renderQueue();
  void refreshBridgeStatus();
}
