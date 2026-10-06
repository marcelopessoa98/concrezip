import type { FileEntry, ScanResult } from "../types";
import { extensionOf, normalizeRelativePath } from "../utils/pathUtils";

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);

function classify(path: string): FileEntry["kind"] {
  const extension = extensionOf(path);
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  if (extension === "pdf") return "pdf";
  return "other";
}

function toEntry(file: File, relativePath: string): FileEntry {
  const normalized = normalizeRelativePath(relativePath);
  return {
    file,
    relativePath: normalized,
    size: file.size,
    type: file.type,
    kind: classify(normalized),
  };
}

function buildResult(rootName: string, entries: FileEntry[], directories: Set<string>): ScanResult {
  let totalBytes = 0;
  let totalImages = 0;
  let totalPdfs = 0;
  let imageBytes = 0;

  for (const entry of entries) {
    totalBytes += entry.size;
    if (entry.kind === "image") {
      totalImages += 1;
      imageBytes += entry.size;
    } else if (entry.kind === "pdf") {
      totalPdfs += 1;
    }
  }

  return {
    rootName,
    entries,
    directories: [...directories].sort(),
    totalBytes,
    totalFiles: entries.length,
    totalImages,
    totalDirectories: directories.size,
    totalPdfs,
    totalOther: entries.length - totalImages - totalPdfs,
    imageBytes,
    otherBytes: totalBytes - imageBytes,
  };
}

function collectParentDirectories(path: string, target: Set<string>): void {
  const parts = normalizeRelativePath(path).split("/");
  parts.pop();
  for (let index = 1; index <= parts.length; index += 1) {
    target.add(parts.slice(0, index).join("/"));
  }
}

async function yieldToBrowser(): Promise<void> {
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
}

export async function scanDirectoryHandle(
  root: FileSystemDirectoryHandle,
  signal?: AbortSignal,
  onCount?: (count: number) => void,
): Promise<ScanResult> {
  const entries: FileEntry[] = [];
  const directories = new Set<string>([root.name]);
  let visited = 0;

  async function walk(handle: FileSystemDirectoryHandle, path: string): Promise<void> {
    for await (const child of handle.values()) {
      if (signal?.aborted) throw new DOMException("Operação cancelada.", "AbortError");
      const childPath = `${path}/${child.name}`;
      if (child.kind === "directory") {
        directories.add(normalizeRelativePath(childPath));
        await walk(child, childPath);
      } else {
        entries.push(toEntry(await child.getFile(), childPath));
        visited += 1;
        if (visited % 100 === 0) {
          onCount?.(visited);
          await yieldToBrowser();
        }
      }
    }
  }

  await walk(root, root.name);
  onCount?.(visited);
  return buildResult(root.name, entries, directories);
}

export async function scanFileList(
  files: FileList | File[],
  signal?: AbortSignal,
  onCount?: (count: number) => void,
): Promise<ScanResult> {
  const entries: FileEntry[] = [];
  const directories = new Set<string>();
  const fileArray = Array.from(files);
  const firstPath = normalizeRelativePath(fileArray[0]?.webkitRelativePath || fileArray[0]?.name || "Obra");
  const rootName = firstPath.split("/")[0] || "Obra";

  for (let index = 0; index < fileArray.length; index += 1) {
    if (signal?.aborted) throw new DOMException("Operação cancelada.", "AbortError");
    const file = fileArray[index];
    if (!file) continue;
    const path = file.webkitRelativePath || `${rootName}/${file.name}`;
    entries.push(toEntry(file, path));
    collectParentDirectories(path, directories);
    if ((index + 1) % 200 === 0) {
      onCount?.(index + 1);
      await yieldToBrowser();
    }
  }

  directories.add(rootName);
  onCount?.(entries.length);
  return buildResult(rootName, entries, directories);
}

function readFileEntry(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

function readDirectoryBatch(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => reader.readEntries(resolve, reject));
}

export async function scanDroppedItems(
  items: DataTransferItemList,
  signal?: AbortSignal,
): Promise<ScanResult> {
  const roots = Array.from(items)
    .map((item) => item.webkitGetAsEntry?.())
    .filter((entry): entry is FileSystemEntry => Boolean(entry));

  if (roots.length !== 1 || !roots[0]?.isDirectory) {
    throw new Error("Arraste uma única pasta da obra.");
  }

  const root = roots[0] as FileSystemDirectoryEntry;
  const entries: FileEntry[] = [];
  const directories = new Set<string>([root.name]);

  async function walk(directory: FileSystemDirectoryEntry, path: string): Promise<void> {
    const reader = directory.createReader();
    for (;;) {
      const batch = await readDirectoryBatch(reader);
      if (batch.length === 0) break;
      for (const child of batch) {
        if (signal?.aborted) throw new DOMException("Operação cancelada.", "AbortError");
        const childPath = `${path}/${child.name}`;
        if (child.isDirectory) {
          directories.add(normalizeRelativePath(childPath));
          await walk(child as FileSystemDirectoryEntry, childPath);
        } else {
          const file = await readFileEntry(child as FileSystemFileEntry);
          entries.push(toEntry(file, childPath));
        }
      }
      await yieldToBrowser();
    }
  }

  await walk(root, root.name);
  return buildResult(root.name, entries, directories);
}
