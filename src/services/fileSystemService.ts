import { BlobWriter } from "@zip.js/zip.js";
import { sanitizeArchiveName } from "../utils/pathUtils";

export interface ArchiveDestination {
  name: string;
  writer: WritableStream<Uint8Array> | BlobWriter;
  isStreaming: boolean;
  finish: (blob?: Blob) => Promise<void>;
  abort: () => Promise<void>;
  getWrittenBytes: () => number;
}

export function supportsDirectoryPicker(): boolean {
  return typeof window.showDirectoryPicker === "function";
}

export function supportsStreamingSave(): boolean {
  return typeof window.showSaveFilePicker === "function";
}

export async function chooseArchiveDestination(rootName: string): Promise<ArchiveDestination> {
  const name = sanitizeArchiveName(rootName);

  if (window.showSaveFilePicker) {
    const handle = await window.showSaveFilePicker({
      suggestedName: name,
      types: [{ description: "Arquivo ZIP", accept: { "application/zip": [".zip"] } }],
    });
    const fileStream = await handle.createWritable();
    let bytes = 0;
    const counter = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        bytes += chunk.byteLength;
        controller.enqueue(chunk);
      },
    });
    const pipePromise = counter.readable.pipeTo(fileStream);

    return {
      name: handle.name,
      writer: counter.writable,
      isStreaming: true,
      finish: async () => {
        await pipePromise;
      },
      abort: async () => {
        try {
          await counter.writable.abort(new DOMException("Operação cancelada.", "AbortError"));
        } catch {
          // O stream pode já ter sido abortado pela biblioteca ZIP.
        }
      },
      getWrittenBytes: () => bytes,
    };
  }

  const blobWriter = new BlobWriter("application/zip");
  return {
    name,
    writer: blobWriter,
    isStreaming: false,
    finish: async (blob) => {
      if (!blob) throw new Error("O arquivo ZIP não pôde ser preparado para download.");
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = name;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    },
    abort: async () => undefined,
    getWrittenBytes: () => blobWriter.size,
  };
}
