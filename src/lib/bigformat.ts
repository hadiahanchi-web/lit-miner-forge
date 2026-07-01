export function fmtBig(v: bigint | undefined, digits = 4): string {
  if (v === undefined) return "—";
  const n = Number(v) / 1e18;
  if (!isFinite(n)) return "0";
  if (n === 0) return "0";
  if (Math.abs(n) < 0.0001) {
    // show all leading zeros instead of scientific notation (e.g. 3.54e-5 -> 0.0000354)
    return stripTrailingZeros(n.toFixed(18));
  }
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function stripTrailingZeros(s: string): string {
  if (!s.includes(".")) return s;
  return s.replace(/0+$/, "").replace(/\.$/, "");
}


export function bigMax(a: bigint, b: bigint) {
  return a > b ? a : b;
}
export function bigMin(a: bigint, b: bigint) {
  return a < b ? a : b;
}
