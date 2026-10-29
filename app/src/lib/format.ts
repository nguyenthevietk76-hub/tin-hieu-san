const nf = new Intl.NumberFormat("vi-VN");

export const fmtInt = (v: number | null | undefined) => (v == null ? "—" : nf.format(Math.round(v)));
export const fmtPct = (v: number | null | undefined, d = 1) =>
  v == null ? "—" : `${(v * 100).toLocaleString("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d })}%`;
export const fmtNum = (v: number | null | undefined, d = 2) =>
  v == null ? "—" : v.toLocaleString("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d });

export function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  const [y, m, d] = s.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/** VND in billions (tỷ đồng). */
export function fmtBn(v: number | string | null | undefined) {
  if (v == null || v === "") return "—";
  const n = Number(v) / 1e9;
  return n.toLocaleString("vi-VN", { maximumFractionDigits: Math.abs(n) >= 100 ? 0 : 1 });
}

/** Strip Vietnamese diacritics for search. */
export function fold(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

export function downloadCsv(filename: string, rows: Array<Record<string, unknown>>) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
  const blob = new Blob(["﻿" + body], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
