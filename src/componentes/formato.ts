export function pct(x: number, decimales = 0): string {
  if (!Number.isFinite(x)) return '—'
  return `${(x * 100).toFixed(decimales)}%`
}
