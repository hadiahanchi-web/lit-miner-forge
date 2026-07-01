export function fmtBig(v: bigint | undefined, digits = 4): string {
  if (v === undefined) return "—";
  const n = Number(v) / 1e18;
  if (!isFinite(n)) return "0";
  if (n === 0) return "0";
  if (Math.abs(n) < 0.0001) return n.toExponential(2);
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export function bigMax(a: bigint, b: bigint) {
  return a > b ? a : b;
}
export function bigMin(a: bigint, b: bigint) {
  return a < b ? a : b;
}
