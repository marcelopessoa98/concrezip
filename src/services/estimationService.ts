import type { EstimateResult, OptimizationSettings, ScanResult } from "../types";
import { extensionOf } from "../utils/pathUtils";
import { ImageOptimizerPool } from "./imageOptimizer";

export async function estimateResult(
  scan: ScanResult,
  settings: OptimizationSettings,
  signal?: AbortSignal,
): Promise<EstimateResult> {
  if (settings.mode === "archive-only" || settings.maxDimension === null) {
    return { estimatedBytes: scan.totalBytes * 0.98, sampledImages: 0, imageRatio: 1 };
  }

  const candidates = scan.entries.filter((entry) => ["jpg", "jpeg"].includes(extensionOf(entry.relativePath)));
  if (candidates.length === 0) {
    return { estimatedBytes: scan.totalBytes, sampledImages: 0, imageRatio: 1 };
  }

  const sampleCount = Math.min(12, candidates.length);
  const sample = Array.from({ length: sampleCount }, (_, index) => {
    const position = Math.min(candidates.length - 1, Math.floor((index * candidates.length) / sampleCount));
    return candidates[position];
  }).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  const pool = new ImageOptimizerPool(Math.min(2, settings.concurrency));
  let sourceBytes = 0;
  let optimizedBytes = 0;

  try {
    for (const entry of sample) {
      if (signal?.aborted) throw new DOMException("Operação cancelada.", "AbortError");
      sourceBytes += entry.size;
      try {
        const result = await pool.optimize(entry.file, settings.maxDimension, settings.jpegQuality, signal);
        optimizedBytes += Math.min(entry.size, result.size);
      } catch {
        optimizedBytes += entry.size;
      }
    }
  } finally {
    pool.terminate();
  }

  const ratio = sourceBytes > 0 ? optimizedBytes / sourceBytes : 1;
  const jpegBytes = candidates.reduce((total, entry) => total + entry.size, 0);
  const estimatedBytes = scan.totalBytes - jpegBytes + jpegBytes * ratio;
  return { estimatedBytes, sampledImages: sample.length, imageRatio: ratio };
}
