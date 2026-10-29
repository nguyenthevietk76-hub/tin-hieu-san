import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Chart } from "../components/Chart";
import { Icon } from "../components/Icon";
import { Avatar, Card, ErrorBox, Kpi, Loading, Pager, ScoreBar, Seg, SortSelect, SortTh, Star, sortBy } from "../components/ui";
import { useFinance } from "../lib/data";
import { downloadCsv, fmtBn, fmtDate, fmtInt, fmtNum, fmtPct, fold } from "../lib/format";
import type { FinFlag, FinRow } from "../lib/types";

type Row = FinRow & { sev: number };
type Key = "t" | "ex" | "rev" | "rev_g" | "ni" | "roa" | "roe" | "lev" | "cr" | "cfo_ta" | "accum" | "streak" | "sev" | "pct2";
type Focus = "all" | "watch" | "loss";
const PAGE = 50;

const FLAG: Record<Exclude<FinFlag, null>, { label: string; cls: string }> = {
  breach: { label: "Chạm ngưỡng", cls: "b-vh" },
  near: { label: "Tiệm cận", cls: "b-m" },
};

/** Net income by year as tiny bars: green profit, red loss. */
function NiBars({ hist }: { hist: Array<[number, number | null]> }) {
  const v = hist.slice(-6);
  const max = Math.max(1, ...v.map(([, x]) => Math.abs(x ?? 0)));
  const w = 7, gap = 3, h = 26, mid = h / 2;
  return (
    <svg width={v.length * (w + gap)} height={h} aria-hidden="true" style={{ display: "block" }}>
      <line x1={0} x2={v.length * (w + gap)} y1={mid} y2={mid} stroke="var(--border-strong)" strokeWidth={1} />
      {v.map(([y, x], i) => {
        const len = x == null ? 0 : Math.max(1, (Math.abs(x) / max) * (mid - 1));
        return (
          <rect key={y} x={i * (w + gap)} width={w} y={(x ?? 0) >= 0 ? mid - len : mid} height={len} rx={1}
            fill={(x ?? 0) >= 0 ? "var(--green)" : "var(--red)"}>
            <title>{`${y}: ${fmtBn(x)} tỷ`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

const neg = (v: number | null | undefined) => (v != null && v < 0 ? { color: "var(--red)" } : undefined);

export function Finance() {
  const { data, error } = useFinance();
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [ex, setEx] = useState<"all" | "HOSE" | "HNX">("all");
  const [ind, setInd] = useState("");
  const [focus, setFocus] = useState<Focus>("all");
  const [scope, setScope] = useState<"listed" | "all">("listed");
  const [sort, setSort] = useState<[Key, 1 | -1]>(["sev", -1]);
  const [page, setPage] = useState(0);
  const reset = () => setPage(0);

  const base: Row[] = useMemo(
    () => (data?.rows ?? []).filter((r) => scope === "all" || r.listed).map((r) => ({ ...r, sev: r.flag === "breach" ? 2 : r.flag === "near" ? 1 : 0 })),
    [data, scope],
  );
  const industries = useMemo(() => [...new Set(base.map((r) => r.ind1))].filter(Boolean).sort(), [base]);
  const fy = useMemo(() => Math.max(0, ...base.map((r) => r.fy)), [base]);

  const rows = useMemo(() => {
    const f = fold(q.trim());
    const r = base.filter((c) => {
      if (ex !== "all" && c.ex !== ex) return false;
      if (ind && c.ind1 !== ind) return false;
      if (focus === "watch" && !c.flag) return false;
      if (focus === "loss" && !((c.ni ?? 0) < 0)) return false;
      if (f && !fold(c.t).includes(f) && !fold(c.name).includes(f) && !fold(c.ind3 ?? "").includes(f)) return false;
      return true;
    });
    // ties on severity: weakest profitability first
    const s = sortBy<Row>(sortBy<Row>(r, "roa", 1), sort[0], sort[1]);
    return s;
  }, [base, q, ex, ind, focus, sort]);

  const kpi = useMemo(() => {
    const cur = base.filter((r) => r.fy === fy);
    return {
      n: cur.length,
      loss: cur.filter((r) => (r.ni ?? 0) < 0).length,
      near: base.filter((r) => r.flag === "near").length,
      breach: base.filter((r) => r.flag === "breach").length,
      roa: median(cur.map((r) => r.roa)),
    };
  }, [base, fy]);

  const trend = useMemo(() => {
    if (!data) return null;
    const y = data.by_year;
    return {
      grid: { left: 8, right: 8, top: 36, bottom: 4, containLabel: true },
      legend: { top: 0, left: 0, itemWidth: 12, itemHeight: 8, textStyle: { color: "var(--text-2)", fontSize: 11.5 } },
      tooltip: { trigger: "axis" },
      xAxis: { type: "category", data: y.map((r) => String(r.fy)) },
      yAxis: { type: "value" },
      series: [
        { name: "Lỗ trong năm", type: "bar", barWidth: 18, itemStyle: { color: "var(--brand-4)" }, data: y.map((r) => r.loss) },
        { name: "Tiệm cận ngưỡng", type: "line", symbolSize: 6, itemStyle: { color: "var(--yellow)" }, data: y.map((r) => r.near) },
        { name: "Chạm ngưỡng hủy niêm yết", type: "line", symbolSize: 6, itemStyle: { color: "var(--red)" }, data: y.map((r) => r.breach) },
      ],
    };
  }, [data]);

  const byInd = useMemo(() => {
    const m = new Map<string, { n: number; loss: number }>();
    for (const r of base) {
      if (r.fy !== fy) continue;
      const e = m.get(r.ind1) ?? { n: 0, loss: 0 };
      e.n++;
      if ((r.ni ?? 0) < 0) e.loss++;
      m.set(r.ind1, e);
    }
    const v = [...m.entries()].filter(([, e]) => e.n >= 5).map(([k, e]) => ({ k, s: e.loss / e.n, ...e })).sort((a, b) => a.s - b.s);
    return {
      grid: { left: 8, right: 44, top: 8, bottom: 4, containLabel: true },
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, formatter: (p: Array<{ dataIndex: number }>) => { const e = v[p[0].dataIndex]; return `${e.k}<br/><b>${e.loss}/${e.n}</b> DN lỗ (${(e.s * 100).toFixed(1)}%)`; } },
      xAxis: { type: "value", axisLabel: { formatter: (x: number) => `${Math.round(x * 100)}%` } },
      yAxis: { type: "category", data: v.map((e) => e.k), axisLabel: { color: "var(--text-2)", fontSize: 11.5, interval: 0 } },
      series: [{
        type: "bar", barWidth: 14, itemStyle: { color: "var(--brand)" }, data: v.map((e) => e.s),
        label: { show: true, position: "right", color: "var(--text-2)", fontSize: 11, formatter: (p: { value: number }) => `${(p.value * 100).toFixed(0)}%` },
      }],
    };
  }, [base, fy]);

  if (error) return <ErrorBox msg={error} />;
  const pages = Math.ceil(rows.length / PAGE);
  const view = rows.slice(page * PAGE, (page + 1) * PAGE);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Tài chính</div>
          <h1>Sức khỏe tài chính</h1>
          <p>
            BCTC năm gần nhất đã công bố của từng doanh nghiệp, đối chiếu với ngưỡng <strong>hủy niêm yết bắt buộc</strong> theo
            Nghị định 155/2020/NĐ-CP: vốn chủ sở hữu âm, lỗ lũy kế vượt vốn góp, hoặc lỗ 3 năm liên tiếp.{" "}
            <strong style={{ color: "var(--yellow)" }}>Tiệm cận</strong>: lỗ 2 năm liên tiếp hoặc lỗ lũy kế từ 50% vốn góp.
            Số liệu từ Vietcap (VCI), chưa đối chiếu với BCTC kiểm toán gốc; chỉ dùng để sàng lọc.
          </p>
        </div>
        <button
          className="btn"
          onClick={() =>
            downloadCsv(
              "suc_khoe_tai_chinh.csv",
              rows.map((r) => ({
                ma: r.t, ten: r.name, san: r.ex, nganh: r.ind1, nam_bctc: r.fy, ngay_cong_bo: r.pub ?? "",
                doanh_thu_ty: r.rev == null ? "" : +(r.rev / 1e9).toFixed(1), tang_truong_dt: r.rev_g ?? "",
                lnst_ty: r.ni == null ? "" : +(r.ni / 1e9).toFixed(1), roa: r.roa ?? "", roe: r.roe ?? "", no_tren_tai_san: r.lev ?? "",
                thanh_toan_hien_hanh: r.cr ?? "", cfo_tren_tai_san: r.cfo_ta ?? "", lo_luy_ke_tren_von_gop: r.accum ?? "",
                so_nam_lo_lien_tiep: r.streak, canh_bao: r.flag ? FLAG[r.flag].label : "", ly_do: r.why.join("; "),
                diem_rui_ro_tai_chinh: r.pct2 ?? "", dang_niem_yet: r.listed ? "co" : "khong",
              })),
            )
          }
        >
          <Icon name="download" />
          Xuất CSV
        </button>
      </div>

      <div className="kpi-strip">
        <Kpi card={false} label={`DN có BCTC năm ${fy || "—"}`} value={fmtInt(kpi.n)} foot={scope === "listed" ? "Đang niêm yết HOSE, HNX" : "Gồm DN đã rời sàn"} />
        <Kpi card={false} label={`Lỗ năm ${fy || "—"}`} value={fmtInt(kpi.loss)} foot={kpi.n ? `${fmtPct(kpi.loss / kpi.n)} số doanh nghiệp · ROA trung vị ${fmtPct(kpi.roa)}` : undefined} />
        <Kpi card={false} label="Tiệm cận ngưỡng" value={fmtInt(kpi.near)} foot="Lỗ 2 năm liên tiếp / lỗ lũy kế ≥ 50% vốn góp" />
        <Kpi card={false} label="Chạm ngưỡng hủy niêm yết" value={fmtInt(kpi.breach)} foot="Theo BCTC năm gần nhất" />
      </div>

      <div className="grid g-2 mt">
        <Card title="Doanh nghiệp gặp khó khăn tài chính theo năm" sub="Mọi DN có số liệu, kể cả DN đã rời sàn · số năm lỗ liên tiếp tính từ 2018">
          {trend ? <Chart option={trend} height={300} /> : <Loading h={300} />}
        </Card>
        <Card title={`Tỷ lệ doanh nghiệp lỗ năm ${fy || "—"} theo ngành`} sub="Ngành có từ 5 doanh nghiệp, theo phạm vi đang chọn">
          {data ? <Chart option={byInd} height={300} /> : <Loading h={300} />}
        </Card>
      </div>

      <Card pad={false} className="mt">
        <div className="toolbar">
          <input
            className="input input-search"
            style={{ width: 240 }}
            placeholder="Mã, tên, ngành cấp 3…"
            value={q}
            onChange={(e) => { setQ(e.target.value); reset(); }}
          />
          <Seg value={focus} options={[["all", "Tất cả"], ["watch", "Cần chú ý"], ["loss", "Đang lỗ"]]} onChange={(v) => { setFocus(v); reset(); }} />
          <Seg value={ex} options={[["all", "Tất cả sàn"], ["HOSE", "HOSE"], ["HNX", "HNX"]]} onChange={(v) => { setEx(v); reset(); }} />
          <select className="select" value={ind} onChange={(e) => { setInd(e.target.value); reset(); }}>
            <option value="">Mọi ngành</option>
            {industries.map((i) => <option key={i} value={i}>{i}</option>)}
          </select>
          <span className="spacer" />
          <Seg value={scope} options={[["listed", "Đang niêm yết"], ["all", "Gồm DN đã rời sàn"]]} onChange={(v) => { setScope(v); reset(); }} />
          <SortSelect
            options={[["sev", "Mức cảnh báo"], ["roa", "ROA"], ["ni", "LNST"], ["rev", "Doanh thu"], ["rev_g", "Tăng trưởng"], ["lev", "Nợ / TS"], ["accum", "Lỗ lũy kế / vốn góp"], ["streak", "Năm lỗ liền"], ["pct2", "Rủi ro tài chính"]]}
            sort={sort}
            setSort={(s) => { setSort(s); reset(); }}
          />
        </div>
        {!data ? (
          <div className="card-body"><Loading h={480} /></div>
        ) : (
          <>
            <div className="table-wrap">
              <table className="tbl cards compact">
                <thead>
                  <tr>
                    <th style={{ width: 36 }} />
                    <SortTh k="t" sort={sort} setSort={setSort}>Doanh nghiệp</SortTh>
                    <SortTh k="sev" sort={sort} setSort={setSort}>Cảnh báo</SortTh>
                    <SortTh k="rev" sort={sort} setSort={setSort} className="r">Doanh thu</SortTh>
                    <SortTh k="rev_g" sort={sort} setSort={setSort} className="r">Tăng trưởng</SortTh>
                    <SortTh k="ni" sort={sort} setSort={setSort} className="r">LNST</SortTh>
                    <th>LNST các năm</th>
                    <SortTh k="roa" sort={sort} setSort={setSort} className="r">ROA</SortTh>
                    <SortTh k="roe" sort={sort} setSort={setSort} className="r">ROE</SortTh>
                    <SortTh k="lev" sort={sort} setSort={setSort} className="r">Nợ / TS</SortTh>
                    <SortTh k="cr" sort={sort} setSort={setSort} className="r">TT hiện hành</SortTh>
                    <SortTh k="cfo_ta" sort={sort} setSort={setSort} className="r">CFO / TS</SortTh>
                    <SortTh k="accum" sort={sort} setSort={setSort} className="r">Lỗ lũy kế / vốn góp</SortTh>
                    <SortTh k="streak" sort={sort} setSort={setSort} className="r">Năm lỗ liền</SortTh>
                    <SortTh k="pct2" sort={sort} setSort={setSort}>Rủi ro tài chính</SortTh>
                  </tr>
                </thead>
                <tbody>
                  {view.map((r) => (
                    <tr key={r.t} className="click" onClick={() => nav(`/c/${r.t}`)}>
                      <td className="hide-sm"><Star t={r.t} /></td>
                      <td className="full">
                        <div className="firm">
                          <Avatar t={r.t} pct={r.pct2} size={30} />
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div className="ticker">{r.t} <span className="badge outline" style={{ height: 18, fontSize: 10.5 }}>{r.ex}</span><span className="xs faint" style={{ marginLeft: 6, fontWeight: 500 }} title={`Công bố ${fmtDate(r.pub)}`}>BCTC {r.fy}</span></div>
                            <div className="co-name" style={{ maxWidth: 190 }} title={`${r.name} · ${r.ind3 || r.ind1}`}>{r.name}</div>
                          </div>
                          <span className="only-sm"><Star t={r.t} /></span>
                        </div>
                      </td>
                      <td className={`full ${r.flag ? "" : "hide-sm"}`} style={{ minWidth: 150 }}>
                        {r.flag ? (
                          <span className={`badge ${FLAG[r.flag].cls}`} title={r.why.join(" · ")}>{FLAG[r.flag].label}</span>
                        ) : (
                          <span className="faint small">—</span>
                        )}
                        {r.why.length > 0 && <div className="xs muted fin-why">{r.why.join(" · ")}</div>}
                      </td>
                      <td className="r num" data-label="Doanh thu">{fmtBn(r.rev)}</td>
                      <td className="r num" data-label="Tăng trưởng" style={neg(r.rev_g)}>{fmtPct(r.rev_g, 0)}</td>
                      <td className="r num" data-label="LNST" style={neg(r.ni)}>{fmtBn(r.ni)}</td>
                      <td data-label="LNST các năm"><NiBars hist={r.ni_hist} /></td>
                      <td className="r num" data-label="ROA" style={neg(r.roa)}>{fmtPct(r.roa)}</td>
                      <td className="r num" data-label="ROE" style={neg(r.roe)}>{fmtPct(r.roe)}</td>
                      <td className="r num" data-label="Nợ / TS">{fmtPct(r.lev, 0)}</td>
                      <td className="r num hide-sm">{fmtNum(r.cr)}</td>
                      <td className="r num hide-sm" style={neg(r.cfo_ta)}>{fmtPct(r.cfo_ta)}</td>
                      <td className="r num" data-label="Lỗ lũy kế / vốn" style={(r.accum ?? 0) >= 0.5 ? { color: "var(--red)", fontWeight: 650 } : undefined}>
                        {r.accum ? fmtPct(r.accum, 0) : <span className="faint">0</span>}
                      </td>
                      <td className="r num" data-label="Năm lỗ liền" style={r.streak >= 2 ? { color: "var(--red)", fontWeight: 650 } : undefined}>
                        {r.streak || <span className="faint">0</span>}
                      </td>
                      <td className="wide" data-label="Rủi ro tài chính" style={{ minWidth: 120 }}>{r.listed ? <ScoreBar pct={r.pct2} /> : <span className="badge outline faint">Đã rời sàn</span>}</td>
                    </tr>
                  ))}
                  {view.length === 0 && (
                    <tr><td colSpan={16} className="empty">Không có doanh nghiệp phù hợp bộ lọc.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <Pager page={page} pages={pages} total={rows.length} setPage={setPage} />
          </>
        )}
      </Card>
      <p className="xs faint mt">
        Đơn vị: tỷ đồng. LNST là lợi nhuận sau thuế hợp nhất theo nguồn; quy định xét lỗ trên BCTC kiểm toán, nên kết quả ở
        đây có thể khác kết luận chính thức của Sở Giao dịch. Số năm lỗ liên tiếp chỉ đếm từ năm tài chính 2018.
      </p>
    </>
  );
}

function median(v: Array<number | null>) {
  const s = v.filter((x): x is number => x != null).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
