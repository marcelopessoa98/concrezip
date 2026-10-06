export function normalizeRelativePath(path: string): string {
  return path
    .replaceAll("\\", "/")
    .split("/")
    .filter((segment) => segment && segment !== "." && segment !== "..")
    .join("/");
}

export function sanitizeArchiveName(name: string): string {
  const safe = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .trim()
    .replace(/\s+/g, "_");
  return `${safe || "laudos"}_compactado.zip`;
}

export function extensionOf(path: string): string {
  const match = /\.([^.\/]+)$/.exec(path);
  return match?.[1]?.toLowerCase() ?? "";
}
