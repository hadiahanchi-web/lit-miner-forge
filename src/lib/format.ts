export function fmtZk(v: number | bigint, digits = 4): string {
  const n = typeof v === "bigint" ? Number(v) / 1e18 : v;
  if (!isFinite(n)) return "0";
  if (n === 0) return "0";
  if (n < 0.0001) {
    return stripTrailingZeros(n.toFixed(18));
  }
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function stripTrailingZeros(s: string): string {
  if (!s.includes(".")) return s;
  return s.replace(/0+$/, "").replace(/\.$/, "");
}


export function shortAddr(a?: string): string {
  if (!a) return "";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
