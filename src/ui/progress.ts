import type { ProcessingProgress } from "../types";
import { formatBytes } from "../utils/formatBytes";
import { formatPercent } from "../utils/formatPercent";
import { getElement, setText } from "./elements";

const stages: ProcessingProgress["stage"][] = [
  "Lendo pasta",
  "Analisando arquivos",
  "Otimizando imagens",
  "Preparando arquivo compactado",
  "Gerando arquivo",
  "Finalizando",
  "Concluído",
];

export function renderProgress(progress: ProcessingProgress): void {
  const percentage = progress.totalFiles > 0 ? (progress.currentFile / progress.totalFiles) * 100 : 0;
  setText("#progress-stage", progress.stage);
  setText("#progress-count", `${progress.currentFile.toLocaleString("pt-BR")} / ${progress.totalFiles.toLocaleString("pt-BR")}`);
  setText("#progress-percent", formatPercent(percentage));
  setText("#current-file", progress.currentPath || "Preparando…");
  setText("#processed-size", formatBytes(progress.processedBytes));
  setText("#optimized-size", formatBytes(progress.outputBytes));
  setText("#live-saving", progress.outputBytes > 0
    ? formatPercent(100 - (progress.outputBytes / Math.max(progress.processedBytes, 1)) * 100)
    : "0,0%");
  setText("#image-progress", `${progress.processedImages.toLocaleString("pt-BR")} / ${progress.totalImages.toLocaleString("pt-BR")}`);
  getElement<HTMLElement>("#progress-bar").style.width = `${Math.min(100, percentage)}%`;

  const activeIndex = stages.indexOf(progress.stage);
  document.querySelectorAll<HTMLElement>("[data-stage]").forEach((element, index) => {
    element.classList.toggle("is-active", index === activeIndex);
    element.classList.toggle("is-complete", index < activeIndex || progress.stage === "Concluído");
  });
}
