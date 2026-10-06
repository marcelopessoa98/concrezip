export function formatPercent(value: number): string {
  const safeValue = Number.isFinite(value) ? Math.max(0, value) : 0;
  return `${safeValue.toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}
