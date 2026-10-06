import type { WorkerRequest, WorkerResponse } from "../types";

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { id, file, maxDimension, quality } = event.data;
  let bitmap: ImageBitmap | undefined;

  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Canvas indisponível para processar a imagem.");

    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await canvas.convertToBlob({ type: "image/jpeg", quality });
    const response: WorkerResponse = { id, blob };
    scope.postMessage(response);
  } catch (error) {
    const response: WorkerResponse = {
      id,
      error: error instanceof Error ? error.message : "Falha desconhecida ao otimizar imagem.",
    };
    scope.postMessage(response);
  } finally {
    bitmap?.close();
  }
};

export {};
