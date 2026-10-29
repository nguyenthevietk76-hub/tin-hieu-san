import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Chart } from "../components/Chart";
import { Card, Loading, RiskBadge, Seg, StatusBadge } from "../components/ui";
import { Icon } from "../components/Icon";
import { load, useCompanies } from "../lib/data";
import { fmtBn, fmtDate, fmtInt, fmtPct, fold } from "../lib/format";
import type { CompanyDetail } from "../lib/types";

// one brand colour plus neutrals; line style keeps the series apart
const COLORS = ["var(--brand)", "var(--n1)", "var(--brand-3)", "var(--n2)"];
const DASH = ["solid", "solid", "dashed", "dashed"];

export function Compare() {
  const [sp, setSp] = useSearchParams();
  const { data: cos } = useCompanies();
  const tickers = (sp.get("t") ?? "").split(",").filter(Boolean).slice(0, 4);
  const [details, setDetails] = useState<Record<string, CompanyDetail>>({});
  const [q, setQ] = useState("");
  const [target, setTarget] = useState<"Y1" | "Y2">("Y1");

  useEffect(() => {
    tickers.forEach((t) => {
      if (!details[t]) load<CompanyDetail>(`company/${t}.json`).then((d) => setDetails((x) => ({ ...x, [t]: d }))).catch(() => {});
    });
  }, [sp]);

  const setTickers = (ts: string[]) => setSp(ts.length ? { t: ts.join(",") } : {}, { replace: true });
  const matches = useMemo(() => {
    const f = fold(q.trim());
    if (!f) return [];
    return (cos ?? []).filter((c) => !tickers.includes(c.t) && (fold(c.t).startsWith(f) || fold(c.name).includes(f))).slice(0, 6);
  }, [q, cos, tickers]);

  const chart = useMemo(() => {
    const ds = tickers.map((t) => details[t]).filter(Boolean);
    const yrs = [...new Set(ds.flatMap((d) => d.years.map((y) => y.fiscal_year)))].sort();
    return {
      legend: { data: ds.map((d) => d.info.t) },
      grid: { top: 36 },
      tooltip: { trigger: "axis" },
      xAxis: { type: "category", data: yrs.map(String) },
      yAxis: { type: "value", min: 0, max: 100 },
      series: ds.map((d, i) => ({
        name: d.info.t,
        type: "line",
        symbolSize: 6,
        lineStyle: { width: 2, type: DASH[i] },
        itemStyle: { color: COLORS[i] },
        data: yrs.map((y) => {
          const r = d.years.find((x) => x.fiscal_year === y);
          const v = r ? (target === "Y1" ? r.pct_Y1 : r.pct_Y2) : null;
          return v == null ? null : Math.round(v);
        }),
      })),
    };
  }, [details, tickers.join(","), target]);

  const ready = tickers.every((t) => details[t]);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">So sánh</div>
          <h1>So sánh doanh nghiệp</h1>
          <p>Đặt tối đa 4 doanh nghiệp cạnh nhau để so sánh điểm rủi ro, lịch sử sự kiện và chất lượng công bố thông tin.</p>
        </div>
      </div>
      <Card>
        <div className="row wrap">
          {tickers.map((t, i) => (
            <span key={t} className="badge" style={{ height: 30, fontSize: 13, paddingRight: 4 }}>
              <span className="dot" style={{ background: COLORS[i] }} />
              <span className="ticker">{t}</span>
              <button className="star" onClick={() => setTickers(tickers.filter((x) => x !== t))} aria-label={`Bỏ ${t}`}>
                <Icon name="x" size={14} />
              </button>
            </span>
          ))}
          {tickers.length < 4 && (
            <div style={{ position: "relative", flex: "1 1 220px", maxWidth: 260 }}>
              <input className="input input-search" placeholder="Thêm mã…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 220, maxWidth: "100%" }}
                onKeyDown={(e) => { if (e.key === "Enter" && matches[0]) { setTickers([...tickers, matches[0].t]); setQ(""); } }} />
              {matches.length > 0 && (
                <div className="card" style={{ position: "absolute", top: 44, left: 0, zIndex: 10, width: "min(340px, calc(100vw - 32px))", padding: 6, background: "var(--bg-elev)", border: "1px solid var(--border-strong)", borderRadius: 8 }}>
                  {matches.map((c) => (
                    <div key={c.t} className="palette-item" onClick={() => { setTickers([...tickers, c.t]); setQ(""); }}>
                      <span className="ticker" style={{ width: 44 }}>{c.t}</span>
                      <span className="co-name">{c.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <span className="spacer" />
          <Seg value={target} options={[["Y1", "Tuân thủ"], ["Y2", "Tài chính"]]} onChange={setTarget} />
        </div>
      </Card>

      {tickers.length === 0 ? (
        <Card className="mt"><div className="empty">Thêm mã chứng khoán để bắt đầu so sánh.</div></Card>
      ) : !ready ? (
        <div className="mt"><Loading h={320} /></div>
      ) : (
        <>
          <Card title="Điểm rủi ro theo năm" className="mt"><Chart option={chart} height={300} /></Card>
          <Card pad={false} className="mt">
            <div className="table-wrap">
              <table className="tbl sticky1">
                <thead>
                  <tr>
                    <th>Chỉ tiêu</th>
                    {tickers.map((t, i) => (
                      <th key={t}><span className="dot" style={{ background: COLORS[i], marginRight: 6 }} /><Link to={`/c/${t}`}>{t}</Link></th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {compareRows.map(([label, fn]) => (
                    <tr key={label}>
                      <td className="muted">{label}</td>
                      {tickers.map((t) => <td key={t}>{fn(details[t])}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </>
  );
}

const lastYear = (d: CompanyDetail) => d.years[d.years.length - 1];
const compareRows: Array<[string, (d: CompanyDetail) => ReactNode]> = [
  ["Tên", (d) => <span className="small">{d.info.name}</span>],
  ["Sàn · Ngành", (d) => <span className="small">{d.info.ex} · {d.info.ind1}</span>],
  ["Rủi ro tuân thủ", (d) => <span className="row"><span className="num">{d.info.pct1 != null ? Math.round(d.info.pct1) : "—"}</span><RiskBadge pct={d.info.pct1 ?? lastYear(d)?.pct_Y1} /></span>],
  ["Rủi ro tài chính", (d) => <span className="row"><span className="num">{d.info.pct2 != null ? Math.round(d.info.pct2) : "—"}</span><RiskBadge pct={d.info.pct2 ?? lastYear(d)?.pct_Y2} /></span>],
  ["Trạng thái", (d) => (d.info.status ? <StatusBadge status={d.info.status} /> : <span className="faint">Bình thường</span>)],
  ["Số sự kiện E1–E7", (d) => <span className="num">{d.info.n_lab}</span>],
  ["Sự kiện gần nhất", (d) => <span className="num small">{fmtDate(d.info.last_ev)}</span>],
  ["Năm có vi phạm tuân thủ", (d) => <span className="num">{d.info.y1_years} / {d.years.length}</span>],
  ["Năm có sự kiện tài chính", (d) => <span className="num">{d.info.y2_years} / {d.years.length}</span>],
  ["Độ trễ công bố BCTN gần nhất", (d) => <span className="num">{lastYear(d)?.pub_delay != null ? `${Math.round(lastYear(d).pub_delay!)} ngày` : "—"}</span>],
  ["Số trang BCTN gần nhất", (d) => <span className="num">{fmtInt(lastYear(d)?.n_pages)}</span>],
  ["Ngôn ngữ tiêu cực (/10.000 từ)", (d) => <span className="num">{lastYear(d)?.txt_neg?.toFixed(1) ?? "—"}</span>],
  ["Doanh thu BCTC gần nhất (tỷ)", (d) => <span className="num">{fmtBn(lastFin(d)?.net_revenue)}{finYear(d)}</span>],
  ["LNST BCTC gần nhất (tỷ)", (d) => <span className="num" style={Number(lastFin(d)?.net_income) < 0 ? { color: "var(--red)" } : undefined}>{fmtBn(lastFin(d)?.net_income)}</span>],
  ["ROA", (d) => <span className="num">{ratio(lastFin(d)?.net_income, lastFin(d)?.total_assets)}</span>],
  ["Nợ / tổng tài sản", (d) => <span className="num">{ratio(lastFin(d)?.liabilities, lastFin(d)?.total_assets)}</span>],
];

const lastFin = (d: CompanyDetail) => d.fin[d.fin.length - 1];
const finYear = (d: CompanyDetail) => (lastFin(d) ? <span className="xs faint"> · {String(lastFin(d).fiscal_year)}</span> : null);
function ratio(a: unknown, b: unknown) {
  const x = Number(a), y = Number(b);
  return a == null || b == null || !(y > 0) ? "—" : fmtPct(x / y);
}
