import type { WorkerRequest, WorkerResponse } from "../types";
import ImageWorker from "../workers/image.worker?worker&inline";

interface PendingTask {
  resolve: (blob: Blob) => void;
  reject: (error: Error) => void;
}

interface WorkerSlot {
  worker: Worker;
  busy: boolean;
}

export class ImageOptimizerPool {
  private readonly slots: WorkerSlot[];
  private readonly pending = new Map<number, PendingTask>();
  private readonly queue: Array<{ request: WorkerRequest; task: PendingTask }> = [];
  private nextId = 1;
  private terminated = false;

  constructor(size: number) {
    const safeSize = Math.max(1, Math.min(4, size));
    this.slots = Array.from({ length: safeSize }, () => this.createSlot());
  }

  optimize(file: File, maxDimension: number, quality: number, signal?: AbortSignal): Promise<Blob> {
    if (this.terminated) return Promise.reject(new Error("Otimizador encerrado."));
    if (signal?.aborted) return Promise.reject(new DOMException("Operação cancelada.", "AbortError"));

    const id = this.nextId++;
    return new Promise<Blob>((resolve, reject) => {
      const task = { resolve, reject };
      this.queue.push({ request: { id, file, maxDimension, quality }, task });
      signal?.addEventListener(
        "abort",
        () => reject(new DOMException("Operação cancelada.", "AbortError")),
        { once: true },
      );
      this.dispatch();
    });
  }

  terminate(): void {
    this.terminated = true;
    for (const slot of this.slots) slot.worker.terminate();
    for (const task of this.pending.values()) task.reject(new DOMException("Operação cancelada.", "AbortError"));
    for (const queued of this.queue) queued.task.reject(new DOMException("Operação cancelada.", "AbortError"));
    this.pending.clear();
    this.queue.length = 0;
  }

  private createSlot(): WorkerSlot {
    // Worker incorporado ao bundle: continua disponível se a conexão cair após a página carregar.
    const worker = new ImageWorker();
    const slot: WorkerSlot = { worker, busy: false };
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const task = this.pending.get(event.data.id);
      this.pending.delete(event.data.id);
      slot.busy = false;
      if (task) {
        if (event.data.blob) task.resolve(event.data.blob);
        else task.reject(new Error(event.data.error || "Falha ao otimizar imagem."));
      }
      this.dispatch();
    };
    worker.onerror = (event) => {
      slot.busy = false;
      const error = new Error(event.message || "Falha no worker de imagem.");
      for (const task of this.pending.values()) task.reject(error);
      this.pending.clear();
      this.dispatch();
    };
    return slot;
  }

  private dispatch(): void {
    if (this.terminated) return;
    for (const slot of this.slots) {
      if (slot.busy) continue;
      const queued = this.queue.shift();
      if (!queued) return;
      slot.busy = true;
      this.pending.set(queued.request.id, queued.task);
      slot.worker.postMessage(queued.request);
    }
  }
}
