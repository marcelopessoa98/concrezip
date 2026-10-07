import { renderAsync } from "docx-preview";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

const CSS_PIXELS_PER_INCH = 96;
const MILLIMETERS_PER_INCH = 25.4;
const RENDER_SCALE = 1.5;

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
      // O renderizador informará a falha caso a imagem realmente não possa ser desenhada.
    }
  }));
  await document.fonts?.ready;
}

function millimetersFromCanvasPixels(pixels: number): number {
  return (pixels / RENDER_SCALE / CSS_PIXELS_PER_INCH) * MILLIMETERS_PER_INCH;
}

async function renderPage(page: HTMLElement, signal: AbortSignal): Promise<HTMLCanvasElement> {
  throwIfAborted(signal);
  const canvas = await html2canvas(page, {
    scale: RENDER_SCALE,
    useCORS: true,
    backgroundColor: "#ffffff",
    logging: false,
    imageTimeout: 30_000,
    removeContainer: true,
  });
  throwIfAborted(signal);
  return canvas;
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

    const pages = Array.from(renderHost.querySelectorAll<HTMLElement>(":scope > section"));
    if (pages.length === 0) throw new Error("O documento não contém páginas que possam ser convertidas.");

    let pdf: jsPDF | undefined;
    for (const page of pages) {
      const canvas = await renderPage(page, signal);
      try {
        if (canvas.width === 0 || canvas.height === 0) {
          throw new Error("Uma das páginas não pôde ser renderizada.");
        }

        const widthMm = millimetersFromCanvasPixels(canvas.width);
        const heightMm = millimetersFromCanvasPixels(canvas.height);
        const orientation = widthMm > heightMm ? "landscape" : "portrait";

        if (!pdf) {
          pdf = new jsPDF({ unit: "mm", format: [widthMm, heightMm], orientation, compress: true });
        } else {
          pdf.addPage([widthMm, heightMm], orientation);
        }

        pdf.addImage(canvas, "JPEG", 0, 0, widthMm, heightMm, undefined, "FAST");
      } finally {
        canvas.width = 1;
        canvas.height = 1;
      }
    }

    throwIfAborted(signal);
    if (!pdf) throw new Error("Nenhuma página foi gerada.");
    const result = pdf.output("blob");
    if (!(result instanceof Blob) || result.size === 0) throw new Error("O PDF gerado está vazio.");
    return result;
  } finally {
    renderHost.remove();
  }
}
