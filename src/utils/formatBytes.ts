const units = ["B", "KB", "MB", "GB", "TB"];

export function formatBytes(bytes: number, decimals = 2): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value.toLocaleString("pt-BR", {
    minimumFractionDigits: index === 0 ? 0 : decimals,
    maximumFractionDigits: index === 0 ? 0 : decimals,
  })} ${units[index]}`;
}
