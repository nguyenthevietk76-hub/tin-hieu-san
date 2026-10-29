import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Chart } from "../components/Chart";
import { ForecastSection } from "../components/ForecastSection";
import { Card, ErrorBox, Loading, Seg, SortTh, sortBy } from "../components/ui";
import { useCompanies, useStats } from "../lib/data";
import { fmtInt, fmtPct } from "../lib/format";

type Row = { industry_l1: string; n: number; firms: number; y1: number; y2: number; yall: number; listed: number; vh: number; status: number };
type K = keyof Row;

export function Industries() {
  const { data: stats, error } = useStats();
  const { data: cos } = useCompanies();
  const nav = useNavigate();
  const [metric, setMetric] = useState<"y1" | "y2" | "yall">("yall");
  const [sort, setSort] = useState<[K, 1 | -1]>(["yall", -1]);

  const rows: Row[] = useMemo(() => {
    if (!stats) return [];
    return stats.industry.map((r) => {
      const c = (cos ?? []).filter((x) => x.ind1 === r.industry_l1 && x.listed);
      return { ...r, listed: c.length, vh: c.filter((x) => x.band1 === "very_high" || x.band2 === "very_high").length, status: c.filter((x) => x.status).length };
    });
  }, [stats, cos]);

  const bar = useMemo(() => {
    const r = [...rows].sort((a, b) => a[metric] - b[metric]);
    return {
      grid: { left: 8, right: 40, top: 8 },
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v: number) => `${(v * 100).toFixed(1)}%` },
      xAxis: { type: "value", axisLabel: { formatter: (v: number) => `${Math.round(v * 100)}%` } },
      yAxis: { type: "category", data: r.map((x) => x.industry_l1), axisLabel: { color: "var(--text-2)", fontSize: 12, interval: 0 } },
      series: [
        {
          type: "bar",
          barWidth: 16,
          itemStyle: { color: "var(--brand)" },
          label: { show: true, position: "right", color: "var(--text-2)", fontSize: 11, formatter: (p: { value: number }) => `${(p.value * 100).toFixed(1)}%` },
          data: r.map((x) => x[metric]),
        },
      ],
    };
  }, [rows, metric]);

  const heat = useMemo(() => {
    if (!stats) return null;
    const inds = [...new Set(stats.industry_year.map((r) => r.industry_l1))].sort();
    const yrs = [...new Set(stats.industry_year.map((r) => r.fiscal_year))].sort();
    const data = stats.industry_year.map((r) => {
      const v = +(r.Y_all * 100).toFixed(1);
      // light text on the darker half of the brand scale
      return { value: [yrs.indexOf(r.fiscal_year), inds.indexOf(r.industry_l1), v], label: v >= 15 ? { color: "#ffffff" } : undefined };
    });
    return {
      grid: { left: 8, right: 8, top: 8, bottom: 50, containLabel: true },
      tooltip: { formatter: (p: { value: number[] }) => `${inds[p.value[1]]} · ${yrs[p.value[0]]}<br/><b>${p.value[2]}%</b> DN-năm có sự kiện` },
      xAxis: { type: "category", data: yrs.map(String), splitLine: { show: false } },
      yAxis: { type: "category", data: inds, splitLine: { show: false }, axisLabel: { color: "var(--text-2)", fontSize: 11.5, interval: 0 } },
      visualMap: {
        min: 0, max: 30, calculable: false, orient: "horizontal", left: "center", bottom: 0, itemWidth: 12, itemHeight: 180,
        text: ["30%+", "0%"], textStyle: { color: "var(--text-3)", fontSize: 11 },
        inRange: { color: ["var(--bg-sunken)", "var(--brand-4)", "var(--brand-2)", "var(--brand)"] },
      },
      series: [{ type: "heatmap", data, itemStyle: { borderColor: "var(--bg-elev)", borderWidth: 2 }, label: { show: true, fontSize: 10, color: "var(--text)", formatter: (p: { value: number[] }) => (p.value[2] ? p.value[2].toFixed(0) : "") } }],
    };
  }, [stats]);

  if (error) return <ErrorBox msg={error} />;
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Ngành</div>
          <h1>Phân tích rủi ro theo ngành</h1>
          <p>Dự báo số doanh nghiệp bị xử lý trong 12 tháng tới và tỷ lệ doanh nghiệp-năm phát sinh sự kiện xử lý trong quá khứ, theo ngành cấp 1.</p>
        </div>
      </div>
      <ForecastSection />
      <div className="row wrap mt" style={{ justifyContent: "space-between", marginTop: 40 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700 }}>Lịch sử theo ngành</h2>
        <Seg value={metric} options={[["yall", "Mọi sự kiện"], ["y1", "Tuân thủ"], ["y2", "Tài chính"]]} onChange={setMetric} />
      </div>
      <div className="grid g-2" style={{ marginTop: 14 }}>
        <Card title="Tỷ lệ phát sinh sự kiện" sub="Bình quân 2015–2024">{stats ? <Chart option={bar} height={360} /> : <Loading h={360} />}</Card>
        <Card title="Bản đồ nhiệt theo năm" sub="% DN-năm có ít nhất một sự kiện E1–E7">{heat ? <Chart option={heat} height={360} /> : <Loading h={360} />}</Card>
      </div>
      <Card title="Bảng tổng hợp ngành" sub="Nhấn vào một ngành để mở bộ sàng lọc" pad={false} className="mt">
        <div className="table-wrap">
          <table className="tbl cards">
            <thead>
              <tr>
                <SortTh k="industry_l1" sort={sort} setSort={setSort}>Ngành</SortTh>
                <SortTh k="firms" sort={sort} setSort={setSort} className="r">Số DN</SortTh>
                <SortTh k="n" sort={sort} setSort={setSort} className="r">DN-năm</SortTh>
                <SortTh k="y1" sort={sort} setSort={setSort} className="r">Tuân thủ</SortTh>
                <SortTh k="y2" sort={sort} setSort={setSort} className="r">Tài chính</SortTh>
                <SortTh k="yall" sort={sort} setSort={setSort} className="r">Mọi sự kiện</SortTh>
                <SortTh k="listed" sort={sort} setSort={setSort} className="r">Đang niêm yết</SortTh>
                <SortTh k="vh" sort={sort} setSort={setSort} className="r">Rủi ro rất cao</SortTh>
                <SortTh k="status" sort={sort} setSort={setSort} className="r">Đang bị xử lý</SortTh>
              </tr>
            </thead>
            <tbody>
              {sortBy(rows, sort[0], sort[1]).map((r) => (
                <tr key={r.industry_l1} className="click" onClick={() => nav(`/screener?ind=${encodeURIComponent(r.industry_l1)}`)}>
                  <td className="full" style={{ fontWeight: 600 }}>{r.industry_l1}</td>
                  <td className="r num" data-label="Số DN">{fmtInt(r.firms)}</td>
                  <td className="r num" data-label="DN-năm">{fmtInt(r.n)}</td>
                  <td className="r num" data-label="Tuân thủ">{fmtPct(r.y1)}</td>
                  <td className="r num" data-label="Tài chính">{fmtPct(r.y2)}</td>
                  <td className="r num" data-label="Mọi sự kiện">{fmtPct(r.yall)}</td>
                  <td className="r num" data-label="Đang niêm yết">{fmtInt(r.listed)}</td>
                  <td className="r num" data-label="Rủi ro rất cao" style={{ fontWeight: r.vh ? 650 : undefined }}>{fmtInt(r.vh)}</td>
                  <td className="r num" data-label="Đang bị xử lý">{fmtInt(r.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
