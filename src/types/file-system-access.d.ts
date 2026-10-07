interface FileSystemDirectoryHandle {
  readonly kind: "directory";
  readonly name: string;
  values(): AsyncIterableIterator<FileSystemFileHandle | FileSystemDirectoryHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>;
}

interface FileSystemFileHandle {
  readonly kind: "file";
  readonly name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<FileSystemWritableFileStream>;
}

interface FileSystemWritableFileStream extends WritableStream<Uint8Array> {
  write(data: BufferSource | Blob | string): Promise<void>;
  seek(position: number): Promise<void>;
  truncate(size: number): Promise<void>;
  close(): Promise<void>;
  abort(reason?: unknown): Promise<void>;
}

interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: Array<{
    description?: string;
    accept: Record<string, string[]>;
  }>;
}

interface Window {
  showDirectoryPicker?: (options?: { mode?: "read" | "readwrite" }) => Promise<FileSystemDirectoryHandle>;
  showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>;
}

interface HTMLInputElement {
  webkitdirectory: boolean;
}

interface File {
  readonly webkitRelativePath: string;
}

interface FileSystemEntry {
  readonly isFile: boolean;
  readonly isDirectory: boolean;
  readonly name: string;
}

interface FileSystemFileEntry extends FileSystemEntry {
  file(success: (file: File) => void, error?: (error: DOMException) => void): void;
}

interface FileSystemDirectoryReader {
  readEntries(success: (entries: FileSystemEntry[]) => void, error?: (error: DOMException) => void): void;
}

interface FileSystemDirectoryEntry extends FileSystemEntry {
  createReader(): FileSystemDirectoryReader;
}

interface DataTransferItem {
  webkitGetAsEntry?(): FileSystemEntry | null;
}
