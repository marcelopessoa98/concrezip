export type OptimizationMode = "maximum" | "balanced" | "archive-only" | "custom";

export interface FileEntry {
  file: File;
  relativePath: string;
  size: number;
  type: string;
  kind: "image" | "pdf" | "other";
}

export interface ScanResult {
  rootName: string;
  entries: FileEntry[];
  directories: string[];
  totalBytes: number;
  totalFiles: number;
  totalImages: number;
  totalDirectories: number;
  totalPdfs: number;
  totalOther: number;
  imageBytes: number;
  otherBytes: number;
}

export interface OptimizationSettings {
  mode: OptimizationMode;
  maxDimension: number | null;
  jpegQuality: number;
  concurrency: number;
}

export type ProcessingStage =
  | "Lendo pasta"
  | "Analisando arquivos"
  | "Otimizando imagens"
  | "Preparando arquivo compactado"
  | "Gerando arquivo"
  | "Finalizando"
  | "Concluído";

export interface ProcessingProgress {
  stage: ProcessingStage;
  currentFile: number;
  totalFiles: number;
  currentPath: string;
  processedBytes: number;
  outputBytes: number;
  originalBytes: number;
  processedImages: number;
  totalImages: number;
}

export interface CompressionResult {
  originalBytes: number;
  finalBytes: number;
  processedImages: number;
  failedImages: number;
  totalFiles: number;
  totalDirectories: number;
  archiveName: string;
}

export interface EstimateResult {
  estimatedBytes: number;
  sampledImages: number;
  imageRatio: number;
}

export interface WorkerRequest {
  id: number;
  file: File;
  maxDimension: number;
  quality: number;
}

export interface WorkerResponse {
  id: number;
  blob?: Blob;
  error?: string;
}

export interface LogEntry {
  time: string;
  message: string;
  level: "info" | "warning" | "error";
}
