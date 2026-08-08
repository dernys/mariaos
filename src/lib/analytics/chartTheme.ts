// Paleta y utilidades comunes para todas las gráficas de BI (tokens semánticos).

export const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(var(--chart-6))",
];

export const AXIS_TICK = { fill: "hsl(var(--muted-foreground))", fontSize: 11 };
export const GRID_STROKE = "hsl(var(--chart-grid))";

export const TOOLTIP_STYLE = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "0.5rem",
  fontSize: "11px",
  color: "hsl(var(--card-foreground))",
  boxShadow: "var(--shadow-elevated)",
};

export function colorAt(i: number) {
  return CHART_COLORS[i % CHART_COLORS.length];
}

export function formatMoney(value: number, currency = "CUP", locale = "es-CU") {
  const n = Number(value || 0);
  const symbol = currency === "USD" ? "$" : currency === "EUR" ? "€" : "$";
  return `${symbol}${n.toLocaleString(locale, { maximumFractionDigits: 2 })}`;
}

export function compactMoney(value: number) {
  const n = Number(value || 0);
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toFixed(0);
}

export function deltaPct(current: number, previous: number) {
  if (!previous) return current > 0 ? 100 : 0;
  return ((current - previous) / Math.abs(previous)) * 100;
}
