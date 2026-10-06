import { BlobReader, BlobWriter, ZipWriter } from "@zip.js/zip.js";
import type {
  CompressionResult,
  FileEntry,
  OptimizationSettings,
  ProcessingProgress,
  ScanResult,
} from "../types";
import { extensionOf } from "../utils/pathUtils";
import { logger } from "../utils/logger";
import type { ArchiveDestination } from "./fileSystemService";
import { ImageOptimizerPool } from "./imageOptimizer";

type ProgressCallback = (progress: ProcessingProgress) => void;

interface PreparedEntry {
  entry: FileEntry;
  blob: Blob;
  optimized: boolean;
  failed: boolean;
}

const COMPRESSIBLE_EXTENSIONS = new Set(["txt", "csv", "json", "xml", "html", "css", "js", "md"]);

function isOptimizableJpeg(entry: FileEntry, settings: OptimizationSettings): boolean {
  return (
    settings.mode !== "archive-only" &&
    settings.maxDimension !== null &&
    ["jpg", "jpeg"].includes(extensionOf(entry.relativePath))
  );
}

async function prepareEntry(
  entry: FileEntry,
  settings: OptimizationSettings,
  pool: ImageOptimizerPool,
  signal: AbortSignal,
): Promise<PreparedEntry> {
  if (!isOptimizableJpeg(entry, settings) || settings.maxDimension === null) {
    return { entry, blob: entry.file, optimized: false, failed: false };
  }

  try {
    const optimized = await pool.optimize(entry.file, settings.maxDimension, settings.jpegQuality, signal);
    if (optimized.size >= entry.size) {
      return { entry, blob: entry.file, optimized: true, failed: false };
    }
    return { entry, blob: optimized, optimized: true, failed: false };
  } catch (error) {
    if (signal.aborted) throw error;
    logger.warning(`${entry.relativePath} não pôde ser otimizada. Original preservado.`);
    return { entry, blob: entry.file, optimized: false, failed: true };
  }
}

export async function createArchive(
  scan: ScanResult,
  settings: OptimizationSettings,
  destination: ArchiveDestination,
  signal: AbortSignal,
  onProgress: ProgressCallback,
): Promise<CompressionResult> {
  const writer = new ZipWriter(destination.writer, {
    zip64: true,
    bufferedWrite: false,
    useWebWorkers: true,
  });
  const pool = new ImageOptimizerPool(settings.concurrency);
  let processedBytes = 0;
  let outputBytes = 0;
  let processedImages = 0;
  let failedImages = 0;
  let currentFile = 0;

  const report = (stage: ProcessingProgress["stage"], path = ""): void => {
    onProgress({
      stage,
      currentFile,
      totalFiles: scan.totalFiles,
      currentPath: path,
      processedBytes,
      outputBytes,
      originalBytes: scan.totalBytes,
      processedImages,
      totalImages: scan.totalImages,
    });
  };

  try {
    report("Preparando arquivo compactado");
    for (const directory of scan.directories) {
      if (signal.aborted) throw new DOMException("Operação cancelada.", "AbortError");
      await writer.add(`${directory}/`, undefined, { directory: true, signal });
    }

    const batchSize = Math.max(1, Math.min(4, settings.concurrency));
    for (let start = 0; start < scan.entries.length; start += batchSize) {
      if (signal.aborted) throw new DOMException("Operação cancelada.", "AbortError");
      const batch = scan.entries.slice(start, start + batchSize);
      report(settings.mode === "archive-only" ? "Gerando arquivo" : "Otimizando imagens", batch[0]?.relativePath);
      const prepared = await Promise.all(
        batch.map((entry) => prepareEntry(entry, settings, pool, signal)),
      );

      for (const item of prepared) {
        if (signal.aborted) throw new DOMException("Operação cancelada.", "AbortError");
        const extension = extensionOf(item.entry.relativePath);
        const level = COMPRESSIBLE_EXTENSIONS.has(extension) ? 6 : 0;
        await writer.add(item.entry.relativePath, new BlobReader(item.blob), {
          level,
          signal,
          lastModDate: new Date(item.entry.file.lastModified),
        });
        currentFile += 1;
        processedBytes += item.entry.size;
        outputBytes += item.blob.size;
        if (item.entry.kind === "image") processedImages += 1;
        if (item.failed) failedImages += 1;
        report("Gerando arquivo", item.entry.relativePath);
      }
    }

    report("Finalizando");
    const result = await writer.close();
    const blob = result instanceof Blob ? result : destination.writer instanceof BlobWriter
      ? await destination.writer.getData()
      : undefined;
    await destination.finish(blob);
    const finalBytes = blob?.size ?? destination.getWrittenBytes();
    report("Concluído");

    return {
      originalBytes: scan.totalBytes,
      finalBytes,
      processedImages,
      failedImages,
      totalFiles: scan.totalFiles,
      totalDirectories: scan.totalDirectories,
      archiveName: destination.name,
    };
  } catch (error) {
    await destination.abort();
    throw error;
  } finally {
    pool.terminate();
  }
}
