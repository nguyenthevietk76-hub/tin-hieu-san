import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Chart } from "./Chart";
import { Icon } from "./Icon";
import { openChat } from "./Chat";
import { Card, Kpi, Loading } from "./ui";
import { useForecast } from "../lib/data";
import { fmtDate, fmtNum, fmtPct } from "../lib/format";
import type { FcRange } from "../lib/types";

const range = (r: FcRange) => `${fmtNum(r.exp, 1)}`;

/** Forecast rate against the actual rate of the last three labelled years. */
function Trend({ rate, base }: { rate: number | null; base: number | null }) {
  if (rate == null || base == null) return <span className="faint">—</span>;
  const d = rate - base;
  const label = d > 0.01 ? "▲ Tăng" : d < -0.01 ? "▼ Giảm" : "≈ Tương đương";
  const color = d > 0.01 ? "var(--red)" : d < -0.01 ? "var(--green)" : "var(--text-2)";
  return (
    <span className="small" title={`Dự báo ${fmtPct(rate)} so với thực tế bình quân 2022–2024 ${fmtPct(base)}`}>
      <span style={{ color, fontWeight: 650 }}>{label}</span> <span className="faint">{fmtPct(rate)} vs {fmtPct(base)}</span>
    </span>
  );
}

export function ForecastSection() {
  const { data: fc } = useForecast();

  const backtest = useMemo(() => {
    if (!fc) return null;
    const b = fc.backtest;
    return {
      grid: { left: 8, right: 8, top: 56, bottom: 4, containLabel: true },
      legend: { top: 0, left: 0, itemWidth: 12, itemHeight: 8, textStyle: { color: "var(--text-2)", fontSize: 11.5 } },
      tooltip: { trigger: "axis" },
      xAxis: { type: "category", data: b.map((r) => String(r.fy)) },
      yAxis: { type: "value", minInterval: 1 },
      series: [
        { name: "Thực tế – tuân thủ", type: "bar", barMaxWidth: 16, itemStyle: { color: "var(--brand)" }, data: b.map((r) => r.act_y1) },
        { name: "Dự báo – tuân thủ", type: "line", symbolSize: 6, itemStyle: { color: "var(--brand-text)" }, lineStyle: { type: "dashed" }, data: b.map((r) => r.pred_y1) },
        { name: "Thực tế – tài chính", type: "bar", barMaxWidth: 16, itemStyle: { color: "var(--n2)" }, data: b.map((r) => r.act_y2) },
        { name: "Dự báo – tài chính", type: "line", symbolSize: 6, itemStyle: { color: "var(--n1)" }, lineStyle: { type: "dashed" }, data: b.map((r) => r.pred_y2) },
      ],
    };
  }, [fc]);

  if (!fc) return <Loading h={260} />;
  return (
    <section className="mt" id="du-bao">
      <div className="card-head">
        <div>
          <h2>Dự báo 12 tháng tới</h2>
          <p>
            Số doanh nghiệp đang niêm yết dự kiến bị xử lý từ {fmtDate(fc.as_of)} đến {fmtDate(fc.horizon_end)}, theo mô hình rủi ro
            của web. Khoảng 90% đã tính dao động chung giữa các năm.
          </p>
        </div>
        <button className="btn" onClick={() => openChat("Dự báo 12 tháng tới ngành nào có nhiều doanh nghiệp bị xử lý nhất, và dự báo này đáng tin đến đâu?")}>
          <Icon name="chat" />
          Hỏi AI về dự báo
        </button>
      </div>

      <div className="kpi-strip mt" style={{ marginTop: 14 }}>
        <Kpi card={false} label="Bị xử lý về tuân thủ" value={range(fc.market.Y1)} foot={`Khoảng 90%: ${fc.market.Y1.lo}–${fc.market.Y1.hi} DN · ${fmtPct(fc.market.Y1.rate)}`} />
        <Kpi card={false} label="Bị xử lý về tài chính" value={range(fc.market.Y2)} foot={`Khoảng 90%: ${fc.market.Y2.lo}–${fc.market.Y2.hi} DN · ${fmtPct(fc.market.Y2.rate)}`} />
        <Kpi card={false} label="Doanh nghiệp đang niêm yết" value={fc.market.n} foot="HOSE, HNX · phi tài chính" />
        <Kpi
          card={false}
          label="Độ khớp theo ngành (2019–2024)"
          value={fmtNum(fc.accuracy.Y2.corr, 2)}
          foot={`Tương quan dự báo – thực tế: tài chính ${fmtNum(fc.accuracy.Y2.corr, 2)}, tuân thủ ${fmtNum(fc.accuracy.Y1.corr, 2)}`}
        />
      </div>

      <div className="grid g-12 mt">
        <Card title="Kiểm định ngược" sub="Số DN bị xử lý: thực tế (cột) và dự báo (đường), mỗi năm do mô hình chỉ học từ các năm trước đó">
          {backtest && <Chart option={backtest} height={300} />}
        </Card>
        <Card title="Dự báo theo ngành" sub="So với tỷ lệ thực tế bình quân 2022–2024 của ngành" pad={false}>
          <div className="table-wrap">
            <table className="tbl cards">
              <thead>
                <tr>
                  <th>Ngành</th>
                  <th className="r">Số DN</th>
                  <th className="r">Tuân thủ</th>
                  <th>Xu hướng</th>
                  <th className="r">Tài chính</th>
                  <th>Xu hướng</th>
                  <th>Đóng góp nhiều nhất</th>
                </tr>
              </thead>
              <tbody>
                {fc.industries.map((r) => (
                  <tr key={r.ind}>
                    <td className="full" style={{ fontWeight: 600 }}>{r.ind}<span className="xs faint only-sm" style={{ marginLeft: 6, fontWeight: 400 }}>{r.n} DN</span></td>
                    <td className="r num hide-sm">{r.n}</td>
                    <td className="r num fc-1" data-label="Tuân thủ" title={`Khoảng 90%: ${r.Y1.lo}–${r.Y1.hi}`}>
                      {fmtNum(r.Y1.exp, 1)} <span className="xs faint">({r.Y1.lo}–{r.Y1.hi})</span>
                    </td>
                    <td className="wide fc-3" data-label="Xu hướng tuân thủ"><Trend rate={r.Y1.rate} base={r.base_y1} /></td>
                    <td className="r num fc-2" data-label="Tài chính" title={`Khoảng 90%: ${r.Y2.lo}–${r.Y2.hi}`}>
                      {fmtNum(r.Y2.exp, 1)} <span className="xs faint">({r.Y2.lo}–{r.Y2.hi})</span>
                    </td>
                    <td className="wide fc-4" data-label="Xu hướng tài chính"><Trend rate={r.Y2.rate} base={r.base_y2} /></td>
                    <td className="wide fc-5" data-label="Đóng góp nhiều nhất">
                      <span className="row wrap" style={{ gap: 6, justifyContent: "flex-end" }}>
                        {r.top_y1.slice(0, 3).map((x) => (
                          <Link key={x.t} className="tk" to={`/c/${x.t}`} title={`Xác suất tuân thủ ${fmtPct(x.p, 0)}`}>{x.t}</Link>
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
    </section>
  );
}
