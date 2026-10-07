import { renderAsync } from "docx-preview";
import html2pdf from "html2pdf.js";

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException("Conversão cancelada.", "AbortError");
}

async function waitForRenderedAssets(container: HTMLElement): Promise<void> {
  const images = Array.from(container.querySelectorAll("img"));
  await Promise.all(images.map(async (image) => {
    if (image.complete) return;
    try {
      await image.decode();
    } catch {
      // O html2canvas ainda tentará desenhar a imagem e informará falhas reais.
    }
  }));
  await document.fonts?.ready;
}

export async function convertDocxToPdf(file: File, signal: AbortSignal): Promise<Blob> {
  throwIfAborted(signal);

  const renderHost = document.createElement("div");
  renderHost.className = "word-render-host";
  renderHost.setAttribute("aria-hidden", "true");
  document.body.append(renderHost);

  try {
    await renderAsync(file, renderHost, renderHost, {
      inWrapper: false,
      breakPages: true,
      ignoreLastRenderedPageBreak: false,
      renderHeaders: true,
      renderFooters: true,
      renderFootnotes: true,
      renderEndnotes: true,
      useBase64URL: true,
      experimental: true,
    });
    throwIfAborted(signal);
    await waitForRenderedAssets(renderHost);
    throwIfAborted(signal);

    const pdfOptions = {
        margin: 0,
        image: { type: "jpeg", quality: 0.96 },
        html2canvas: {
          scale: 1.5,
          useCORS: true,
          backgroundColor: "#ffffff",
          logging: false,
        },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: {
          mode: ["css", "legacy"],
          after: ".word-render-host > section:not(:last-child)",
          avoid: ["tr", "img"],
        },
      } as const;

    const result = await html2pdf()
      .set(pdfOptions)
      .from(renderHost)
      .outputPdf("blob");

    throwIfAborted(signal);
    if (!(result instanceof Blob) || result.size === 0) {
      throw new Error("O PDF gerado está vazio.");
    }
    return result;
  } finally {
    renderHost.remove();
  }
}
