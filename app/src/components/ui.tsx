import type { ReactNode } from "react";
import { BAND, E_COLOR, E_SHORT, STATUS_CLS, bandOf } from "../lib/labels";
import type { Band } from "../lib/types";
import { useWatchlist } from "../lib/store";
import { Icon } from "./Icon";

export function Card({ title, sub, action, children, pad = true, className = "" }: {
  title?: ReactNode; sub?: ReactNode; action?: ReactNode; children: ReactNode; pad?: boolean; className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <div className="card-head">
          <div>
            {title && <h2>{title}</h2>}
            {sub && <p>{sub}</p>}
          </div>
          {action}
        </div>
      )}
      {pad ? <div className="card-body">{children}</div> : children}
    </section>
  );
}

/** Signed change: green = tăng, red = giảm; `risk` flips it, since more risk/violations is bad news. */
export function Delta({ value, unit = "%", digits = 1, risk = false, title }: {
  value: number | null | undefined; unit?: string; digits?: number; risk?: boolean; title?: string;
}) {
  if (value == null || !isFinite(value)) return null;
  if (Math.abs(value) < 10 ** -digits / 2) return <span className="kpi-delta faint">0{unit}</span>;
  const up = value > 0;
  return (
    <span className={`kpi-delta ${up !== risk ? "pos" : "neg"}`} title={title}>
      {up ? "▲" : "▼"} {Math.abs(value).toLocaleString("vi-VN", { maximumFractionDigits: digits })}
      {unit}
    </span>
  );
}

export function Kpi({ label, value, foot, delta, card = true }: {
  label: ReactNode; value: ReactNode; foot?: ReactNode; delta?: ReactNode; card?: boolean;
}) {
  return (
    <div className={`${card ? "card " : ""}kpi`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">
        {value}
        {delta}
      </div>
      {foot && <div className="kpi-foot">{foot}</div>}
    </div>
  );
}

export function RiskBadge({ band, pct }: { band?: Band | null; pct?: number | null }) {
  const b = band ?? bandOf(pct);
  if (!b) return <span className="badge outline faint">Không xếp hạng</span>;
  return <span className={`badge ${BAND[b].cls}`}>{BAND[b].label}</span>;
}

export function ECode({ code }: { code: string }) {
  return (
    <span className="ecode" style={{ ["--ec" as string]: E_COLOR[code] ?? "var(--n2)" }} title={E_SHORT[code]}>
      {code}
    </span>
  );
}

export function ECodes({ value }: { value: string }) {
  if (!value) return <span className="badge outline">Khác</span>;
  return (
    <span className="row" style={{ gap: 4 }}>
      {value.split(";").map((c) => (
        <ECode key={c} code={c} />
      ))}
    </span>
  );
}

const STATUS_SHORT: Record<string, string> = {
  "Đang bị cảnh báo": "Cảnh báo",
  "Đang bị kiểm soát": "Kiểm soát",
  "Tạm ngừng giao dịch": "Tạm ngừng GD",
};

export function StatusBadge({ status, short = false }: { status: string | null | undefined; short?: boolean }) {
  if (!status) return null;
  return (
    <span className={`badge ${STATUS_CLS[status] ?? "b-status"}`} title={status}>
      {short ? STATUS_SHORT[status] ?? status : status}
    </span>
  );
}

export function ScoreBar({ pct }: { pct: number | null | undefined }) {
  if (pct == null) return <span className="faint">—</span>;
  const b = bandOf(pct)!;
  return (
    <div className="scorebar" title={`${BAND[b].label} · rủi ro cao hơn ${Math.round(pct)}% doanh nghiệp đang niêm yết`}>
      <div className="track">
        <div className="fill" style={{ width: `${Math.max(3, pct)}%`, background: BAND[b].color }} />
      </div>
      <span className="v" style={{ color: BAND[b].color }}>{Math.round(pct)}</span>
    </div>
  );
}

/** Round ticker mark with a ring in the firm's risk colour. */
export function Avatar({ t, pct, size = 32 }: { t: string; pct?: number | null; size?: number }) {
  const b = bandOf(pct);
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, fontSize: size * 0.3, boxShadow: b ? `inset 0 0 0 2px ${BAND[b].color}` : undefined }}
      aria-hidden="true"
    >
      {t.slice(0, 3)}
    </span>
  );
}

/** Filled change pill (TradingView style); a rise in risk is red, a fall is green. */
export function ChangePill({ value, unit = "", digits = 0 }: { value: number | null | undefined; unit?: string; digits?: number }) {
  if (value == null || !isFinite(value)) return <span className="chg-pill flat">—</span>;
  const v = +value.toFixed(digits);
  const cls = v > 0 ? "up" : v < 0 ? "down" : "flat";
  return (
    <span className={`chg-pill ${cls}`}>
      {v > 0 ? "+" : v < 0 ? "−" : ""}
      {Math.abs(v).toLocaleString("vi-VN", { maximumFractionDigits: digits })}
      {unit}
    </span>
  );
}

export function Star({ t }: { t: string }) {
  const w = useWatchlist();
  const on = w.has(t);
  return (
    <button
      className={`star ${on ? "on" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        w.toggle(t);
      }}
      title={on ? "Bỏ khỏi danh sách theo dõi" : "Thêm vào danh sách theo dõi"}
      aria-pressed={on}
    >
      {on ? (
        <Icon name="star" />
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z" />
        </svg>
      )}
    </button>
  );
}

export function Loading({ h = 240 }: { h?: number }) {
  return <div className="skeleton" style={{ height: h }} />;
}

export function ErrorBox({ msg }: { msg: string }) {
  return <div className="callout warn">Không tải được dữ liệu: {msg}</div>;
}

export function Seg<T extends string>({ value, options, onChange }: {
  value: T; options: Array<[T, string]>; onChange: (v: T) => void;
}) {
  return (
    <div className="seg" role="tablist">
      {options.map(([v, l]) => (
        <button key={v} className={v === value ? "on" : ""} onClick={() => onChange(v)} role="tab" aria-selected={v === value}>
          {l}
        </button>
      ))}
    </div>
  );
}

export function SortTh<K extends string>({ k, sort, setSort, children, className = "" }: {
  k: K; sort: [K, 1 | -1]; setSort: (s: [K, 1 | -1]) => void; children: ReactNode; className?: string;
}) {
  const on = sort[0] === k;
  return (
    <th
      className={`sortable ${className}`}
      onClick={() => setSort([k, on ? ((-sort[1]) as 1 | -1) : -1])}
      aria-sort={on ? (sort[1] === 1 ? "ascending" : "descending") : "none"}
    >
      {children}
      <span style={{ opacity: on ? 1 : 0.25, marginLeft: 4 }}>{on && sort[1] === 1 ? "↑" : "↓"}</span>
    </th>
  );
}

export function sortBy<T>(rows: T[], key: keyof T, dir: 1 | -1) {
  return [...rows].sort((a, b) => {
    const x = a[key] as unknown, y = b[key] as unknown;
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    if (typeof x === "number" && typeof y === "number") return (x - y) * dir;
    return String(x).localeCompare(String(y), "vi") * dir;
  });
}

export function Pager({ page, pages, total, setPage }: { page: number; pages: number; total: number; setPage: (p: number) => void }) {
  return (
    <div className="pager">
      <span>
        {total.toLocaleString("vi-VN")} kết quả · trang {page + 1}/{Math.max(1, pages)}
      </span>
      <div className="row">
        <button className="btn" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Trang trước">
          <Icon name="chevronLeft" />
        </button>
        <button className="btn" disabled={page >= pages - 1} onClick={() => setPage(page + 1)} aria-label="Trang sau">
          <Icon name="chevronRight" />
        </button>
      </div>
    </div>
  );
}
