import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Chart } from "../components/Chart";
import { Drivers } from "../components/Drivers";
import { Icon } from "../components/Icon";
import { openChat } from "../components/Chat";
import { Avatar, Card, Delta, ECode, ECodes, Loading, RiskBadge, Seg, Star, StatusBadge } from "../components/ui";
import { useCompany, useMeta } from "../lib/data";
import { fmtBn, fmtDate, fmtInt, fmtPct } from "../lib/format";
import { AGENCY, DIRECTION, E_COLOR, E_SHORT, MEASURE, PDF_TYPE } from "../lib/labels";
import type { CompanyDetail } from "../lib/types";

type Tab = "overview" | "events" | "reports" | "fin";

export function CompanyPage() {
  const { ticker } = useParams();
  const { data, error, loading } = useCompany(ticker);
  const [tab, setTab] = useState<Tab>("overview");

  if (error)
    return (
      <div className="empty">
        <h1 style={{ color: "var(--text)" }}>{ticker?.toUpperCase()}</h1>
        <p>Mã này không thuộc phạm vi theo dõi (doanh nghiệp phi tài chính niêm yết HOSE/HNX giai đoạn 2015–2024).</p>
        <Link className="btn" to="/screener">Về bộ sàng lọc</Link>
      </div>
    );
  if (loading || !data)
    return (
      <div className="stack">
        <Loading h={140} />
        <Loading h={360} />
      </div>
    );

  const { info } = data;
  return (
    <>
      <Link to="/screener" className="small row back-link" style={{ marginBottom: 14, gap: 6, color: "var(--text-2)" }}>
        <Icon name="arrowLeft" size={14} /> Bộ sàng lọc
      </Link>
      <section className="card co-hero">
        <div style={{ minWidth: 0 }}>
          <div className="row" style={{ gap: 16 }}>
            <Avatar t={info.t} pct={info.listed ? info.pct1 : data.years[data.years.length - 1]?.pct_Y1} size={64} />
            <div style={{ minWidth: 0 }}>
              <div className="row" style={{ gap: 10 }}>
                <span className="co-ticker">{info.t}</span>
                <Star t={info.t} />
              </div>
              <div style={{ fontSize: 16, fontWeight: 550, marginTop: 6 }}>{info.name}</div>
            </div>
          </div>
          <div className="co-meta">
            <span className="badge outline">{info.ex}</span>
            <span className="badge">{info.ind1}</span>
            {info.ind3 && info.ind3 !== info.ind1 && <span className="badge">{info.ind3}</span>}
            {info.listed ? <span className="badge b-accent">Đang niêm yết</span> : <span className="badge outline">Đã rời HOSE/HNX</span>}
            <StatusBadge status={info.status} />
          </div>
          <div className="small faint" style={{ marginTop: 12 }}>
            Dữ liệu {info.y0}–{info.y1} · {info.reports} báo cáo thường niên · {info.n_lab} sự kiện E1–E7
            {data.delist?.last_trade && <> · GD cuối {data.delist.last_trade}</>}
          </div>
          <button
            className="btn btn-primary"
            style={{ marginTop: 14 }}
            onClick={() => openChat(`Vì sao ${info.t} có điểm rủi ro như hiện tại, và khả năng bị xử lý trong 12 tháng tới thế nào?`, info.t)}
          >
            <Icon name="chat" />
            Hỏi nhanh về doanh nghiệp này
          </button>
        </div>
        <ScoreTiles d={data} />
      </section>

      <div className="tabs" role="tablist">
        {([
          ["overview", "Tổng quan rủi ro"],
          ["events", `Sự kiện (${data.events.length})`],
          ["reports", "Báo cáo thường niên"],
          ["fin", "Tài chính"],
        ] as Array<[Tab, string]>).map(([k, l]) => (
          <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)} role="tab" aria-selected={tab === k}>
            {l}
          </button>
        ))}
      </div>

      {tab === "overview" && <Overview d={data} />}
      {tab === "events" && <EventTimeline d={data} />}
      {tab === "reports" && <Reports d={data} />}
      {tab === "fin" && <Financials d={data} />}
    </>
  );
}

function ScoreTiles({ d }: { d: CompanyDetail }) {
  const { info } = d;
  const last = d.years[d.years.length - 1];
  const p1 = info.listed ? info.pct1 : last?.pct_Y1;
  const p2 = info.listed ? info.pct2 : last?.pct_Y2;
  const pr1 = info.listed ? info.p1 : last?.p_Y1;
  const pr2 = info.listed ? info.p2 : last?.p_Y2;
  // change against the previous assessment: latest fiscal year for listed firms, the year before otherwise
  const ref = info.listed ? last : d.years[d.years.length - 2];
  const tile = (lbl: string, pct: number | null | undefined, p: number | null | undefined, prev: number | null | undefined) => (
    <div className="score-tile">
      <div className="lbl">{lbl}</div>
      <div className="row" style={{ alignItems: "baseline", gap: 10, marginTop: 8 }}>
        <div className="val" style={{ marginTop: 0 }}>{pct == null ? "—" : Math.round(pct)}</div>
        {pct != null && prev != null && (
          <Delta value={Math.round(pct) - Math.round(prev)} unit="" digits={0} risk title={`So với năm tài chính ${ref?.fiscal_year}`} />
        )}
        <RiskBadge pct={pct} />
      </div>
      <div className="sub">
        Xác suất 12 tháng: {p == null ? "—" : fmtPct(p)}
        {prev != null && ref && <> · năm TC {ref.fiscal_year}: {Math.round(prev)}</>}
      </div>
    </div>
  );
  return (
    <div>
      <div className="score-pair">
        {tile("Rủi ro tuân thủ", p1, pr1, ref?.pct_Y1)}
        {tile("Rủi ro tài chính", p2, pr2, ref?.pct_Y2)}
      </div>
      <div className="xs faint" style={{ marginTop: 8, textAlign: "right" }}>
        {info.listed ? `Đánh giá tại ${fmtDate(d.live?.as_of)}` : `Đánh giá năm tài chính ${last?.fiscal_year}`} · thang 0–100
      </div>
    </div>
  );
}

function Overview({ d }: { d: CompanyDetail }) {
  const [target, setTarget] = useState<"Y1" | "Y2">("Y1");
  const { data: meta } = useMeta();
  const last = d.years[d.years.length - 1];
  const drivers = d.live ? (target === "Y1" ? d.live.drivers_Y1 : d.live.drivers_Y2) : target === "Y1" ? last?.drivers_Y1 : last?.drivers_Y2;
  const x = d.live?.x ?? last?.x;

  const history = useMemo(() => {
    const yrs = d.years.map((y) => String(y.fiscal_year));
    const ev = d.years.map((y) => ({
      comp: (y.n_E1 ?? 0) + (y.n_E3 ?? 0) + (y.n_E4 ?? 0) + (y.n_E7 ?? 0),
      perf: (y.n_E2 ?? 0) + (y.n_E5 ?? 0) + (y.n_E6 ?? 0),
    }));
    return {
      legend: { data: ["Rủi ro tuân thủ", "Rủi ro tài chính", "Sự kiện tuân thủ thực tế", "Sự kiện tài chính thực tế"] },
      grid: { top: 40 },
      tooltip: { trigger: "axis" },
      xAxis: { type: "category", data: yrs },
      yAxis: [
        { type: "value", min: 0, max: 100, name: "Điểm", nameTextStyle: { color: "var(--text-3)", fontSize: 11 } },
        { type: "value", minInterval: 1, splitLine: { show: false }, name: "Sự kiện", nameTextStyle: { color: "var(--text-3)", fontSize: 11 } },
      ],
      series: [
        { name: "Sự kiện tuân thủ thực tế", type: "bar", yAxisIndex: 1, stack: "ev", barMaxWidth: 22, itemStyle: { color: "var(--brand-4)" }, data: ev.map((e) => e.comp) },
        { name: "Sự kiện tài chính thực tế", type: "bar", yAxisIndex: 1, stack: "ev", barMaxWidth: 22, itemStyle: { color: "var(--n3)" }, data: ev.map((e) => e.perf) },
        { name: "Rủi ro tuân thủ", type: "line", symbolSize: 6, lineStyle: { width: 2 }, itemStyle: { color: "var(--brand)" }, data: d.years.map((y) => (y.pct_Y1 == null ? null : Math.round(y.pct_Y1))) },
        { name: "Rủi ro tài chính", type: "line", symbolSize: 6, lineStyle: { width: 2, type: "dashed" }, itemStyle: { color: "var(--n1)" }, data: d.years.map((y) => (y.pct_Y2 == null ? null : Math.round(y.pct_Y2))) },
      ],
    };
  }, [d]);

  const mm = meta?.model[target];
  return (
    <div className="grid g-co">
      <Card
        title="Yếu tố tác động"
        sub={d.live ? "Điểm hiện tại – đóng góp của từng yếu tố" : `Năm tài chính ${last?.fiscal_year}`}
        action={<Seg value={target} options={[["Y1", "Tuân thủ"], ["Y2", "Tài chính"]]} onChange={setTarget} />}
      >
        <Drivers drivers={drivers} x={x} />
        {mm?.oos.auc && (
          <div className="xs faint mt">
            Độ chính xác mô hình kiểm định ngoài mẫu 2019–2024: AUC {mm.oos.auc.toFixed(2)}, nhóm 10% rủi ro cao nhất
            có tỷ lệ vi phạm gấp {mm.oos.top10_lift?.toFixed(1)} lần trung bình. <Link to="/methodology">Chi tiết</Link>
          </div>
        )}
      </Card>
      <div className="stack">
        <Card title="Lịch sử điểm rủi ro" sub="Điểm mỗi năm được tính tại ngày công bố BCTN, so với sự kiện thực tế xảy ra trong 12 tháng sau đó">
          <Chart option={history} height={300} />
        </Card>
        <Card title="Tóm tắt theo năm" pad={false}>
          <div className="table-wrap">
            <table className="tbl sticky1">
              <thead>
                <tr>
                  <th>Năm TC</th>
                  <th>Sàn</th>
                  <th>Thời điểm đánh giá</th>
                  <th className="r">Rủi ro TT</th>
                  <th className="r">Rủi ro TC</th>
                  <th>Sự kiện 12 tháng sau</th>
                </tr>
              </thead>
              <tbody>
                {[...d.years].reverse().map((y) => {
                  const codes = [1, 2, 3, 4, 5, 6, 7].filter((i) => (y[`n_E${i}`] ?? 0) > 0).map((i) => `E${i}`);
                  return (
                    <tr key={y.fiscal_year}>
                      <td className="num">{y.fiscal_year}</td>
                      <td><span className="badge outline">{y.exchange}</span></td>
                      <td className="num small muted">
                        {fmtDate(y.origin)}
                        {y.prior_status ? <span className="badge b-h" style={{ marginLeft: 6 }}>Đang bị xử lý</span> : null}
                      </td>
                      <td className="r num">{y.pct_Y1 == null ? "—" : Math.round(y.pct_Y1)}</td>
                      <td className="r num">{y.pct_Y2 == null ? "—" : Math.round(y.pct_Y2)}</td>
                      <td>
                        {codes.length ? (
                          <span className="row" style={{ gap: 4 }}>{codes.map((c) => <ECode key={c} code={c} />)}</span>
                        ) : (
                          <span className="faint small">Không</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}

function EventTimeline({ d }: { d: CompanyDetail }) {
  if (!d.events.length) return <Card><div className="empty">Doanh nghiệp chưa có sự kiện xử lý nào trong dữ liệu.</div></Card>;
  return (
    <Card title="Dòng thời gian sự kiện" sub="Sắp xếp mới nhất trước · nhấn vào liên kết để mở văn bản gốc">
      <div className="timeline">
        {d.events.map((e) => (
          <div className="tl-item" key={e.id} style={{ ["--tl" as string]: E_COLOR[e.e.split(";")[0]] ?? "var(--text-3)" }}>
            <div className="row wrap" style={{ gap: 8 }}>
              <span className="tl-date">{fmtDate(e.d)}</span>
              <ECodes value={e.e} />
              <span className="badge outline">{MEASURE[e.m] ?? e.m}</span>
              {e.dir !== "dua_vao" && <span className="badge">{DIRECTION[e.dir] ?? e.dir}</span>}
              <span className="xs faint">{AGENCY[e.ag] ?? e.ag}</span>
            </div>
            <div className="tl-title">{e.title}</div>
            {e.why && <div className="tl-body">{e.why}</div>}
            {e.e && <div className="xs faint" style={{ marginTop: 4 }}>{e.e.split(";").map((c) => E_SHORT[c]).join(" · ")}</div>}
            <div className="links">
              {e.doc && <span className="xs mono faint">{e.doc}</span>}
              {e.urls.map((u, i) => (
                <a key={u} href={u} target="_blank" rel="noreferrer noopener">
                  <Icon name="file" size={12} /> Văn bản {e.urls.length > 1 ? i + 1 : "gốc"}
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Reports({ d }: { d: CompanyDetail }) {
  const text = useMemo(
    () => ({
      legend: { data: ["Tiêu cực", "Bất định", "Tích cực"] },
      grid: { top: 36 },
      tooltip: { trigger: "axis", valueFormatter: (v: number) => (v == null ? "—" : v.toFixed(1)) },
      xAxis: { type: "category", data: d.years.map((y) => String(y.fiscal_year)) },
      yAxis: { type: "value", name: "/10.000 từ", nameTextStyle: { color: "var(--text-3)", fontSize: 11 } },
      series: [
        { name: "Tiêu cực", type: "line", symbolSize: 6, itemStyle: { color: "var(--brand)" }, data: d.years.map((y) => y.txt_neg) },
        { name: "Bất định", type: "line", symbolSize: 6, itemStyle: { color: "var(--n1)" }, lineStyle: { type: "dashed" }, data: d.years.map((y) => y.txt_unc) },
        { name: "Tích cực", type: "line", symbolSize: 6, itemStyle: { color: "var(--n2)" }, lineStyle: { type: "dotted" }, data: d.years.map((y) => y.txt_pos) },
      ],
    }),
    [d],
  );
  return (
    <div className="stack">
      <Card title="Tín hiệu ngôn ngữ trong báo cáo thường niên" sub="Mật độ từ ngữ theo từ điển trên phần thuyết minh (đã loại BCTC, báo cáo kiểm toán)">
        <Chart option={text} height={260} />
      </Card>
      <Card title="Hồ sơ báo cáo thường niên" pad={false}>
        <div className="table-wrap">
          <table className="tbl sticky1">
            <thead>
              <tr>
                <th>Năm TC</th>
                <th>Ngày công bố</th>
                <th className="r">Độ trễ</th>
                <th className="r">Số trang</th>
                <th>Định dạng</th>
                <th className="r">Số từ thuyết minh</th>
                <th>Từ khóa tiêu cực nổi bật</th>
              </tr>
            </thead>
            <tbody>
              {[...d.years].reverse().map((y) => (
                <tr key={y.fiscal_year}>
                  <td className="num">{y.fiscal_year}</td>
                  <td className="num small">{y.has_pdf ? fmtDate(y.pub_date) : <span className="faint">Không có BCTN</span>}</td>
                  <td className="r num small" style={{ color: (y.pub_delay ?? 0) > 120 ? "var(--text)" : undefined, fontWeight: (y.pub_delay ?? 0) > 120 ? 650 : undefined }}>
                    {y.pub_delay == null ? "—" : `${Math.round(y.pub_delay)} ngày`}
                  </td>
                  <td className="r num">{fmtInt(y.n_pages)}</td>
                  <td className="small">{y.pdf_type ? <span title={PDF_TYPE[y.pdf_type]}>{y.pdf_type} · {PDF_TYPE[y.pdf_type]}</span> : "—"}</td>
                  <td className="r num">{fmtInt(y.n_words)}</td>
                  <td className="small">
                    <span className="row wrap" style={{ gap: 4 }}>
                      {Object.entries(y.top_neg ?? {}).slice(0, 4).map(([w, c]) => (
                        <span key={w} className="badge">{w} <span className="faint mono">{c}</span></span>
                      ))}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

const FIN_ROWS: Array<[string, string]> = [
  ["net_revenue", "Doanh thu thuần"],
  ["gross_profit", "Lợi nhuận gộp"],
  ["profit_before_tax", "Lợi nhuận trước thuế"],
  ["net_income", "Lợi nhuận sau thuế"],
  ["total_assets", "Tổng tài sản"],
  ["current_assets", "Tài sản ngắn hạn"],
  ["liabilities", "Nợ phải trả"],
  ["current_liabilities", "Nợ ngắn hạn"],
  ["st_borrowings", "Vay ngắn hạn"],
  ["lt_borrowings", "Vay dài hạn"],
  ["equity", "Vốn chủ sở hữu"],
  ["paid_in_capital", "Vốn góp"],
  ["retained_earnings", "LNST chưa phân phối"],
  ["interest_expense", "Chi phí lãi vay"],
  ["cfo", "Lưu chuyển tiền thuần từ HĐKD"],
];

function Financials({ d }: { d: CompanyDetail }) {
  if (!d.fin.length)
    return (
      <Card>
        <div className="empty">
          <Icon name="info" size={22} />
          <p>Nguồn dữ liệu chưa có BCTC năm của doanh nghiệp này.</p>
          <p className="small">Nguồn bên ngoài chỉ có BCTC từ năm 2018 và thiếu số liệu của một số doanh nghiệp đã hủy niêm yết.</p>
        </div>
      </Card>
    );
  const fin = [...d.fin].reverse(); // newest year first, visible without scrolling on phones
  return (
    <Card
      title="Chỉ tiêu tài chính chính"
      sub="Đơn vị: tỷ đồng · nguồn Vietcap (VCI), bên thứ ba, chưa đối chiếu với BCTC gốc · dòng dưới năm là ngày công bố"
      action={<Link className="btn" to="/finance"><Icon name="trend" />So với toàn thị trường</Link>}
      pad={false}
    >
      <div className="table-wrap">
        <table className="tbl sticky1">
          <thead>
            <tr>
              <th>Chỉ tiêu</th>
              {fin.map((f, i) => (
                <th key={i} className="r">
                  {String(f.fiscal_year)}
                  <div className="xs faint" style={{ fontWeight: 400 }}>{fmtDate(f.public_date as string | null)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {FIN_ROWS.map(([k, l]) => (
              <tr key={k}>
                <td>{l}</td>
                {fin.map((f, i) => {
                  // the source books interest expense as a negative number; show it as a cost
                  const v = k === "interest_expense" && f[k] != null ? Math.abs(Number(f[k])) : (f[k] as number);
                  return <td key={i} className="r num" style={{ color: Number(v) < 0 ? "var(--red)" : undefined }}>{fmtBn(v)}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
