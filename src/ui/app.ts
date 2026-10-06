import type {
  CompressionResult,
  OptimizationMode,
  OptimizationSettings,
  ProcessingProgress,
  ScanResult,
} from "../types";
import { createArchive } from "../services/archiveService";
import { scanDirectoryHandle, scanDroppedItems, scanFileList } from "../services/directoryScanner";
import { estimateResult } from "../services/estimationService";
import {
  chooseArchiveDestination,
  supportsDirectoryPicker,
  supportsStreamingSave,
} from "../services/fileSystemService";
import { formatBytes } from "../utils/formatBytes";
import { formatPercent } from "../utils/formatPercent";
import { logger } from "../utils/logger";
import { getElement, setHidden, setText } from "./elements";
import { renderProgress } from "./progress";

const appMarkup = `
  <header class="topbar">
    <div class="brand-mark" aria-hidden="true"><span>CF</span></div>
    <div>
      <p class="eyebrow">CONCREFUJI · FERRAMENTAS</p>
      <h1>Compactador de Laudos</h1>
    </div>
    <div class="local-badge"><span></span> 100% local</div>
  </header>

  <main class="page-shell">
    <section class="hero">
      <div>
        <p class="eyebrow red">COMPACTADOR DE LAUDOS CONCREFUJI</p>
        <h2>Arquivos menores.<br><em>Mesma organização.</em></h2>
        <p class="hero-copy">Reduza o tamanho dos arquivos de laudos preservando a organização das pastas.</p>
      </div>
      <div class="privacy-card">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 4.5 5.2v5.7c0 5 3.2 9.4 7.5 11.1 4.3-1.7 7.5-6.1 7.5-11.1V5.2L12 2Zm0 3 4.5 1.9v4c0 3.4-1.9 6.6-4.5 8-2.6-1.4-4.5-4.6-4.5-8v-4L12 5Zm-1 3v4.2l3.2 1.9 1-1.7-2.2-1.3V8h-2Z"/></svg>
        <div><strong>Privacidade garantida</strong><p>Seus arquivos não são enviados para nenhum servidor. Todo o processamento acontece localmente no seu navegador.</p></div>
      </div>
    </section>

    <div id="browser-warning" class="notice warning" hidden></div>
    <div id="error-banner" class="notice error" hidden><strong>Não foi possível continuar.</strong><span id="error-text"></span></div>

    <section id="selection-card" class="card selection-card">
      <div id="drop-zone" class="drop-zone" tabindex="0" role="button" aria-label="Selecionar pasta da obra">
        <div class="folder-icon" aria-hidden="true"><span></span></div>
        <h3>Selecione a pasta da obra</h3>
        <p>Arraste uma pasta para cá ou escolha no computador</p>
        <button id="select-folder" class="button primary" type="button">Selecionar pasta</button>
        <button id="fallback-folder" class="button text" type="button">Usar seletor compatível</button>
        <input id="folder-input" type="file" webkitdirectory multiple hidden />
        <small>Os arquivos originais não são modificados.</small>
      </div>
      <div id="scan-status" class="scan-status" hidden>
        <span class="spinner"></span><div><strong>Analisando arquivos…</strong><p id="scan-count">Preparando leitura</p></div>
      </div>
    </section>

    <section id="workspace" hidden>
      <article class="card summary-card">
        <div class="summary-heading"><div class="folder-mini"></div><div><span>OBRA SELECIONADA</span><h3 id="root-name"></h3></div><button id="change-folder" class="button ghost" type="button">Trocar pasta</button></div>
        <div class="stats-grid">
          <div><span>Tamanho original</span><strong id="total-size"></strong></div>
          <div><span>Arquivos</span><strong id="total-files"></strong></div>
          <div><span>Imagens</span><strong id="total-images"></strong></div>
          <div><span>Pastas</span><strong id="total-folders"></strong></div>
          <div><span>PDFs</span><strong id="total-pdfs"></strong></div>
          <div><span>Outros</span><strong id="total-other"></strong></div>
        </div>
      </article>

      <div class="section-title"><span>2</span><div><h3>Escolha o nível de redução</h3><p>Você poderá ajustar antes de iniciar.</p></div></div>
      <div class="mode-grid">
        <label class="mode-card selected"><input type="radio" name="mode" value="maximum" checked><span class="radio-ui"></span><div class="mode-icon">↘</div><strong>Máxima redução</strong><p>Ideal para consulta técnica e maior economia.</p><ul><li>Até 1920 px</li><li>Qualidade JPEG 70%</li></ul><b>MAIOR ECONOMIA</b></label>
        <label class="mode-card"><input type="radio" name="mode" value="balanced"><span class="radio-ui"></span><div class="mode-icon">◐</div><strong>Equilibrado</strong><p>Boa economia com maior definição visual.</p><ul><li>Até 2560 px</li><li>Qualidade JPEG 80%</li></ul></label>
        <label class="mode-card"><input type="radio" name="mode" value="archive-only"><span class="radio-ui"></span><div class="mode-icon">□</div><strong>Somente compactar</strong><p>Preserva as imagens sem alterações.</p><ul><li>Sem redimensionar</li><li>Economia menor</li></ul></label>
      </div>
      <p id="archive-only-warning" class="notice subtle" hidden>Fotografias JPEG já utilizam compressão. Nesse modo, a redução de tamanho poderá ser pequena.</p>

      <details id="advanced" class="card advanced-card">
        <summary>Configurações avançadas <span>Opcional</span></summary>
        <input id="custom-mode" type="radio" name="mode" value="custom" hidden>
        <div class="advanced-grid">
          <label>Resolução máxima<select id="max-dimension"><option value="1920">1920 px</option><option value="2560">2560 px</option><option value="3840">3840 px</option><option value="0">Original</option></select></label>
          <label>Qualidade JPEG <output id="quality-output">70%</output><input id="jpeg-quality" type="range" min="50" max="95" value="70"></label>
          <label>Meta desejada (GB)<input id="target-size" type="number" min="0.1" step="0.1" value="5"></label>
        </div>
      </details>

      <article class="estimate-card">
        <div><span>ESTIMATIVA APROXIMADA</span><strong id="estimate-size">Calculando…</strong><p id="estimate-caption">Amostrando fotografias sem alterar os originais.</p></div>
        <div id="target-status" class="target-status"></div>
      </article>

      <div class="action-row">
        <div><strong>Pronto para compactar</strong><p id="save-method"></p></div>
        <button id="start-processing" class="button primary large" type="button" disabled>Escolher destino e compactar</button>
      </div>
    </section>

    <section id="processing" class="card processing-card" hidden>
      <div class="processing-heading"><div><span id="progress-stage">Preparando</span><h3>Compactando a obra</h3></div><strong id="progress-percent">0,0%</strong></div>
      <div class="progress-track"><div id="progress-bar"></div></div>
      <div class="progress-line"><span id="progress-count">0 / 0</span><span id="current-file">Preparando…</span></div>
      <ol class="stage-list">
        <li data-stage><i>1</i>Lendo pasta</li><li data-stage><i>2</i>Analisando</li><li data-stage><i>3</i>Otimizando</li><li data-stage><i>4</i>Preparando ZIP</li><li data-stage><i>5</i>Gerando</li><li data-stage><i>6</i>Finalizando</li><li data-stage><i>7</i>Concluído</li>
      </ol>
      <div class="live-stats"><div><span>Processado</span><strong id="processed-size">0 B</strong></div><div><span>Novo tamanho</span><strong id="optimized-size">0 B</strong></div><div><span>Economia atual</span><strong id="live-saving">0%</strong></div><div><span>Imagens</span><strong id="image-progress">0 / 0</strong></div></div>
      <button id="cancel-processing" class="button danger" type="button">Cancelar processamento</button>
    </section>

    <section id="result" class="card result-card" hidden>
      <div class="success-icon">✓</div><p class="eyebrow red">COMPACTAÇÃO CONCLUÍDA</p><h2 id="result-name"></h2><p id="result-file" class="result-file"></p>
      <div class="result-stats"><div><span>Original</span><strong id="result-original"></strong></div><div><span>Arquivo final</span><strong id="result-final"></strong></div><div><span>Redução</span><strong id="result-reduction"></strong></div><div class="highlight"><span>Economia</span><strong id="result-saving"></strong></div></div>
      <div class="checks"><span>✓ Estrutura preservada</span><span>✓ Originais não modificados</span><span>✓ Processamento realizado localmente</span></div>
      <p id="failed-summary" class="notice warning" hidden></p>
      <button id="new-compression" class="button primary" type="button">Nova compactação</button>
    </section>

    <details class="log-panel"><summary>Mostrar detalhes técnicos</summary><div id="log-list"></div></details>
    <p class="mobile-note">Para laudos grandes, recomendamos usar um computador com Google Chrome ou Microsoft Edge.</p>
  </main>
  <footer><span>ConcreFuji</span><p>Processamento privado e local · Nenhum arquivo é enviado pela internet</p></footer>
`;

interface AppState {
  scan?: ScanResult;
  scanAbort?: AbortController;
  estimateAbort?: AbortController;
  processingAbort?: AbortController;
  estimating: boolean;
  processing: boolean;
}

const state: AppState = { estimating: false, processing: false };

function settingsFromUi(): OptimizationSettings {
  const selected = getElement<HTMLInputElement>('input[name="mode"]:checked').value as OptimizationMode;
  const maxSelect = getElement<HTMLSelectElement>("#max-dimension");
  const quality = Number(getElement<HTMLInputElement>("#jpeg-quality").value) / 100;
  const hardware = navigator.hardwareConcurrency || 4;
  const concurrency = Math.max(2, Math.min(4, Math.floor(hardware / 2)));

  if (selected === "maximum") return { mode: selected, maxDimension: 1920, jpegQuality: 0.7, concurrency };
  if (selected === "balanced") return { mode: selected, maxDimension: 2560, jpegQuality: 0.8, concurrency };
  if (selected === "archive-only") return { mode: selected, maxDimension: null, jpegQuality: 1, concurrency };
  return {
    mode: "custom",
    maxDimension: Number(maxSelect.value) || null,
    jpegQuality: quality,
    concurrency,
  };
}

function showError(error: unknown): void {
  if (error instanceof DOMException && error.name === "AbortError") return;
  const message = error instanceof Error ? error.message : "Ocorreu um erro inesperado.";
  setText("#error-text", message);
  setHidden("#error-banner", false);
  logger.error(message);
}

function clearError(): void {
  setHidden("#error-banner", true);
}

async function handleScan(factory: (signal: AbortSignal) => Promise<ScanResult>): Promise<void> {
  clearError();
  state.scanAbort?.abort();
  state.scanAbort = new AbortController();
  setHidden("#scan-status", false);
  getElement<HTMLButtonElement>("#select-folder").disabled = true;
  logger.clear();
  logger.info("Leitura da pasta iniciada");

  try {
    const scan = await factory(state.scanAbort.signal);
    if (scan.totalFiles === 0) throw new Error("A pasta selecionada está vazia.");
    state.scan = scan;
    logger.info(`${scan.totalFiles.toLocaleString("pt-BR")} arquivos encontrados`);
    logger.info(`${scan.totalImages.toLocaleString("pt-BR")} imagens encontradas`);
    renderScan(scan);
    await updateEstimate();
  } catch (error) {
    showError(error);
  } finally {
    setHidden("#scan-status", true);
    getElement<HTMLButtonElement>("#select-folder").disabled = false;
  }
}

function renderScan(scan: ScanResult): void {
  setText("#root-name", scan.rootName);
  setText("#total-size", formatBytes(scan.totalBytes));
  setText("#total-files", scan.totalFiles.toLocaleString("pt-BR"));
  setText("#total-images", scan.totalImages.toLocaleString("pt-BR"));
  setText("#total-folders", scan.totalDirectories.toLocaleString("pt-BR"));
  setText("#total-pdfs", scan.totalPdfs.toLocaleString("pt-BR"));
  setText("#total-other", scan.totalOther.toLocaleString("pt-BR"));
  setHidden("#selection-card", true);
  setHidden("#workspace", false);
  setHidden("#result", true);
  setText("#save-method", supportsStreamingSave()
    ? "O ZIP será gravado progressivamente no local escolhido."
    : "Seu navegador usará download em memória; prefira Chrome ou Edge para pastas grandes.");
}

async function updateEstimate(): Promise<void> {
  const scan = state.scan;
  if (!scan || state.processing) return;
  state.estimateAbort?.abort();
  const controller = new AbortController();
  state.estimateAbort = controller;
  state.estimating = true;
  setText("#estimate-size", "Calculando…");
  getElement<HTMLButtonElement>("#start-processing").disabled = true;

  try {
    const estimate = await estimateResult(scan, settingsFromUi(), controller.signal);
    if (controller.signal.aborted) return;
    setText("#estimate-size", `~${formatBytes(estimate.estimatedBytes)}`);
    setText("#estimate-caption", estimate.sampledImages > 0
      ? `Estimativa aproximada baseada em ${estimate.sampledImages} fotografias. O resultado final pode variar.`
      : "Estimativa aproximada. O resultado final pode variar.");
    const targetGb = Number(getElement<HTMLInputElement>("#target-size").value);
    const targetBytes = targetGb * 1024 ** 3;
    const reachesTarget = targetGb > 0 && estimate.estimatedBytes <= targetBytes;
    const target = getElement<HTMLElement>("#target-status");
    target.className = `target-status ${reachesTarget ? "positive" : "caution"}`;
    target.textContent = targetGb > 0
      ? reachesTarget
        ? `A configuração atual pode atingir a meta de ${targetGb.toLocaleString("pt-BR")} GB.`
        : `A configuração atual provavelmente não atingirá ${targetGb.toLocaleString("pt-BR")} GB.`
      : "Defina uma meta opcional para comparar.";
    logger.info("Estimativa concluída");
  } catch (error) {
    if (!controller.signal.aborted) showError(error);
  } finally {
    if (state.estimateAbort === controller) {
      state.estimating = false;
      getElement<HTMLButtonElement>("#start-processing").disabled = false;
    }
  }
}

function updateModeUi(): void {
  const mode = getElement<HTMLInputElement>('input[name="mode"]:checked').value as OptimizationMode;
  document.querySelectorAll<HTMLElement>(".mode-card").forEach((card) => {
    const radio = card.querySelector<HTMLInputElement>('input[type="radio"]');
    card.classList.toggle("selected", Boolean(radio?.checked));
  });
  setHidden("#archive-only-warning", mode !== "archive-only");
  const values = mode === "maximum" ? ["1920", "70"] : mode === "balanced" ? ["2560", "80"] : null;
  if (values) {
    getElement<HTMLSelectElement>("#max-dimension").value = values[0] ?? "1920";
    getElement<HTMLInputElement>("#jpeg-quality").value = values[1] ?? "70";
    setText("#quality-output", `${values[1]}%`);
  }
  void updateEstimate();
}

async function startProcessing(): Promise<void> {
  const scan = state.scan;
  if (!scan || state.processing) return;
  clearError();

  if (!supportsStreamingSave() && scan.totalBytes > 1024 ** 3) {
    const proceed = window.confirm("Este navegador não permite salvar por streaming. Um ZIP grande poderá exceder a memória. Deseja continuar mesmo assim?");
    if (!proceed) return;
  }

  try {
    const destination = await chooseArchiveDestination(scan.rootName);
    state.processing = true;
    state.processingAbort = new AbortController();
    setHidden("#workspace", true);
    setHidden("#processing", false);
    logger.info(`Processamento iniciado (${destination.isStreaming ? "salvamento por streaming" : "download em memória"})`);
    const initial: ProcessingProgress = {
      stage: "Preparando arquivo compactado",
      currentFile: 0,
      totalFiles: scan.totalFiles,
      currentPath: "",
      processedBytes: 0,
      outputBytes: 0,
      originalBytes: scan.totalBytes,
      processedImages: 0,
      totalImages: scan.totalImages,
    };
    renderProgress(initial);
    const result = await createArchive(
      scan,
      settingsFromUi(),
      destination,
      state.processingAbort.signal,
      renderProgress,
    );
    logger.info("Arquivo ZIP concluído");
    renderResult(scan, result);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      logger.warning("Processamento cancelado pelo usuário");
      setHidden("#processing", true);
      setHidden("#workspace", false);
    } else {
      showError(error);
      setHidden("#processing", true);
      setHidden("#workspace", false);
    }
  } finally {
    state.processing = false;
    state.processingAbort = undefined;
  }
}

function renderResult(scan: ScanResult, result: CompressionResult): void {
  const reduction = Math.max(0, result.originalBytes - result.finalBytes);
  const saving = result.originalBytes > 0 ? (reduction / result.originalBytes) * 100 : 0;
  setHidden("#processing", true);
  setHidden("#result", false);
  setText("#result-name", scan.rootName);
  setText("#result-file", result.archiveName);
  setText("#result-original", formatBytes(result.originalBytes));
  setText("#result-final", formatBytes(result.finalBytes));
  setText("#result-reduction", formatBytes(reduction));
  setText("#result-saving", formatPercent(saving));
  if (result.failedImages > 0) {
    setText("#failed-summary", `${result.failedImages.toLocaleString("pt-BR")} imagem(ns) não puderam ser otimizadas e foram preservadas no formato original.`);
    setHidden("#failed-summary", false);
  } else {
    setHidden("#failed-summary", true);
  }
}

function resetApp(): void {
  state.scanAbort?.abort();
  state.estimateAbort?.abort();
  state.processingAbort?.abort();
  state.scan = undefined;
  setHidden("#selection-card", false);
  setHidden("#workspace", true);
  setHidden("#processing", true);
  setHidden("#result", true);
  clearError();
  getElement<HTMLInputElement>("#folder-input").value = "";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function bindEvents(): void {
  const input = getElement<HTMLInputElement>("#folder-input");
  const openNativePicker = async (): Promise<void> => {
    if (!supportsDirectoryPicker()) {
      input.click();
      return;
    }
    try {
      const handle = await window.showDirectoryPicker?.();
      if (handle) await handleScan((signal) => scanDirectoryHandle(handle, signal, (count) => setText("#scan-count", `${count.toLocaleString("pt-BR")} arquivos localizados`)));
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) showError(error);
    }
  };

  getElement("#select-folder").addEventListener("click", () => void openNativePicker());
  getElement("#fallback-folder").addEventListener("click", () => input.click());
  getElement("#change-folder").addEventListener("click", resetApp);
  getElement("#new-compression").addEventListener("click", resetApp);
  getElement("#start-processing").addEventListener("click", () => void startProcessing());
  getElement("#cancel-processing").addEventListener("click", () => state.processingAbort?.abort());
  input.addEventListener("change", () => {
    if (input.files?.length) void handleScan((signal) => scanFileList(input.files ?? [], signal, (count) => setText("#scan-count", `${count.toLocaleString("pt-BR")} arquivos localizados`)));
  });

  const dropZone = getElement<HTMLElement>("#drop-zone");
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
    const items = (event as DragEvent).dataTransfer?.items;
    if (items?.length) void handleScan((signal) => scanDroppedItems(items, signal));
  });
  dropZone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") void openNativePicker();
  });

  document.querySelectorAll<HTMLInputElement>('input[name="mode"]').forEach((radio) => radio.addEventListener("change", updateModeUi));
  getElement<HTMLInputElement>("#jpeg-quality").addEventListener("input", (event) => {
    const inputElement = event.currentTarget as HTMLInputElement;
    setText("#quality-output", `${inputElement.value}%`);
    getElement<HTMLInputElement>("#custom-mode").checked = true;
    document.querySelectorAll<HTMLElement>(".mode-card").forEach((card) => card.classList.remove("selected"));
  });
  let estimateTimer = 0;
  const scheduleEstimate = (): void => {
    window.clearTimeout(estimateTimer);
    estimateTimer = window.setTimeout(() => void updateEstimate(), 350);
  };
  getElement("#jpeg-quality").addEventListener("change", scheduleEstimate);
  getElement("#max-dimension").addEventListener("change", () => {
    getElement<HTMLInputElement>("#custom-mode").checked = true;
    document.querySelectorAll<HTMLElement>(".mode-card").forEach((card) => card.classList.remove("selected"));
    scheduleEstimate();
  });
  getElement("#target-size").addEventListener("change", scheduleEstimate);
}

function configureCompatibilityNotice(): void {
  const messages: string[] = [];
  if (!supportsDirectoryPicker()) messages.push("A seleção moderna de pastas não está disponível; será usado o seletor compatível.");
  if (!supportsStreamingSave()) messages.push("O salvamento progressivo não está disponível. Para arquivos grandes, use Chrome ou Edge atualizado no computador.");
  if (messages.length) {
    setText("#browser-warning", messages.join(" "));
    setHidden("#browser-warning", false);
  }
}

function bindLogger(): void {
  logger.subscribe((entries) => {
    getElement("#log-list").innerHTML = entries
      .map((entry) => `<p class="${entry.level}"><time>${entry.time}</time><span>${entry.message.replace(/[&<>]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[char] ?? char)}</span></p>`)
      .join("");
  });
}

export function mountApp(container: HTMLElement): void {
  container.innerHTML = appMarkup;
  configureCompatibilityNotice();
  bindEvents();
  bindLogger();
}
