import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { Chart } from "../components/Chart";
import { Card, ECode, ErrorBox, Kpi, Loading, Seg } from "../components/ui";
import { useMeta, useStats } from "../lib/data";
import { fmtDate, fmtInt, fmtPct } from "../lib/format";
import { FEATURE_SHORT } from "../lib/features";
import { PDF_TYPE } from "../lib/labels";

export function Methodology() {
  const { data: meta, error } = useMeta();
  const { data: stats } = useStats();
  const [target, setTarget] = useState<"Y1" | "Y2">("Y1");

  const coef = useMemo(() => {
    if (!meta) return null;
    const c = Object.entries(meta.model[target].coef).sort((a, b) => a[1] - b[1]);
    return {
      grid: { left: 8, right: 30, top: 8 },
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      xAxis: { type: "value" },
      yAxis: { type: "category", data: c.map(([k]) => FEATURE_SHORT[k] ?? k), axisLabel: { color: "var(--text-2)", fontSize: 11.5 } },
      series: [{ type: "bar", barWidth: 12, data: c.map(([, v]) => ({ value: v, itemStyle: { color: v > 0 ? "var(--red)" : "var(--green)" } })) }],
    };
  }, [meta, target]);

  const perYear = useMemo(() => {
    if (!meta) return null;
    const py = meta.model[target].per_year;
    const yrs = Object.keys(py);
    return {
      legend: { data: ["AUC", "Độ nâng nhóm 10% cao nhất"] },
      grid: { top: 36 },
      tooltip: { trigger: "axis" },
      xAxis: { type: "category", data: yrs },
      yAxis: [{ type: "value", min: 0.4, max: 1 }, { type: "value", splitLine: { show: false } }],
      series: [
        { name: "AUC", type: "line", symbolSize: 6, itemStyle: { color: "var(--brand)" }, data: yrs.map((y) => py[y].auc ?? null), markLine: { silent: true, symbol: "none", lineStyle: { color: "var(--text-3)", type: "dashed" }, data: [{ yAxis: 0.5 }], label: { formatter: "Ngẫu nhiên", color: "var(--text-3)" } } },
        { name: "Độ nâng nhóm 10% cao nhất", type: "bar", yAxisIndex: 1, barMaxWidth: 26, itemStyle: { color: "var(--n3)" }, data: yrs.map((y) => py[y].top10_lift ?? null) },
      ],
    };
  }, [meta, target]);

  const coverage = useMemo(() => {
    if (!stats) return null;
    const yrs = [...new Set(stats.coverage.map((c) => c.fiscal_year))].sort();
    const s = (ex: string, k: "n" | "pdf") => yrs.map((y) => stats.coverage.find((c) => c.fiscal_year === y && c.exchange === ex)?.[k] ?? 0);
    return {
      legend: { data: ["HOSE – có BCTN", "HOSE – thiếu", "HNX – có BCTN", "HNX – thiếu"] },
      grid: { top: 40 },
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      xAxis: { type: "category", data: yrs.map(String) },
      yAxis: { type: "value" },
      series: [
        { name: "HOSE – có BCTN", type: "bar", stack: "h", itemStyle: { color: "var(--brand)" }, data: s("HOSE", "pdf") },
        { name: "HOSE – thiếu", type: "bar", stack: "h", itemStyle: { color: "var(--brand-4)" }, data: s("HOSE", "n").map((v, i) => v - s("HOSE", "pdf")[i]) },
        { name: "HNX – có BCTN", type: "bar", stack: "x", itemStyle: { color: "var(--n1)" }, data: s("HNX", "pdf") },
        { name: "HNX – thiếu", type: "bar", stack: "x", itemStyle: { color: "var(--n3)" }, data: s("HNX", "n").map((v, i) => v - s("HNX", "pdf")[i]) },
      ],
    };
  }, [stats]);

  if (error) return <ErrorBox msg={error} />;
  if (!meta) return <Loading h={500} />;
  const m = meta.model[target].oos;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Tài liệu</div>
          <h1>Phương pháp & dữ liệu</h1>
          <p>Cách hệ thống thu thập sự kiện, xây dựng điểm rủi ro và kiểm định độ chính xác. Dữ liệu tới {fmtDate(meta.as_of)} · xây dựng lúc {fmtDate(meta.generated_at)}.</p>
        </div>
        <Seg value={target} options={[["Y1", "Mô hình tuân thủ"], ["Y2", "Mô hình tài chính"]]} onChange={setTarget} />
      </div>

      <div className="kpi-strip">
        <Kpi card={false} label="AUC ngoài mẫu (2019–2024)" value={m.auc?.toFixed(3) ?? "—"} foot="0,5 = ngẫu nhiên · 1,0 = hoàn hảo" />
        <Kpi card={false} label="Độ chính xác nhóm 10% cao nhất" value={fmtPct(m.top10_precision)} foot={`Tỷ lệ nền ${fmtPct(m.base_rate)}`} />
        <Kpi card={false} label="Độ nâng (lift) nhóm 10%" value={`${m.top10_lift?.toFixed(1)}×`} foot="So với chọn ngẫu nhiên" />
        <Kpi card={false} label="Bắt được sự kiện" value={fmtPct(m.top10_recall)} foot={`Trong ${fmtInt(m.pos)} ca thực tế, chỉ xem 10% DN`} />
      </div>

      <div className="grid g-2 mt">
        <Card title="Kiểm định theo năm" sub="Mỗi năm được chấm bởi mô hình chỉ huấn luyện trên dữ liệu ≥ 2 năm trước đó">
          {perYear && <Chart option={perYear} height={280} />}
        </Card>
        <Card title="Trọng số các yếu tố" sub="Hệ số hồi quy logistic trên biến chuẩn hóa">
          {coef && <Chart option={coef} height={280} />}
        </Card>
      </div>

      <div className="grid g-12 mt">
        <Card title="Nhóm sự kiện">
          <div className="stack" style={{ gap: 10 }}>
            {Object.entries(meta.e_def).map(([k, v]) => (
              <div key={k} className="row" style={{ alignItems: "flex-start" }}>
                <ECode code={k} />
                <div className="small">
                  {v}
                  <div className="xs faint">{["E1", "E3", "E4", "E7"].includes(k) ? "Tuân thủ" : "Tài chính"}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Độ phủ báo cáo thường niên" sub="Số doanh nghiệp-năm trong phạm vi theo dõi">
          {coverage ? <Chart option={coverage} height={300} /> : <Loading h={300} />}
        </Card>
      </div>

      <Card className="mt">
        <div className="prose">
          <h2 style={{ marginTop: 0 }}>Phạm vi</h2>
          <p>
            <strong>{fmtInt(meta.counts.tickers)} doanh nghiệp phi tài chính</strong> từng niêm yết trên HOSE hoặc HNX giai đoạn{" "}
            {meta.counts.years[0]}–{meta.counts.years[1]} ({fmtInt(meta.counts.firm_years)} doanh nghiệp-năm). Loại trừ ngân hàng,
            bảo hiểm, công ty chứng khoán, quỹ và UPCoM. Sàn được xác định theo từng năm, không theo danh sách hiện tại.
          </p>
          {meta.sources && (
            <>
              <h2>Độ mới của dữ liệu</h2>
              <p>
                Dữ liệu không cập nhật tự động; mỗi nguồn có mốc riêng. Danh sách niêm yết và diện cảnh báo/kiểm soát: chụp ngày{" "}
                <strong>{fmtDate(meta.sources.listing)}</strong>. Sự kiện xử lý: mới nhất ngày{" "}
                <strong>{fmtDate(meta.sources.events_last)}</strong>. Báo cáo thường niên: tới năm tài chính{" "}
                <strong>{meta.sources.bctn_fy_last}</strong> (công bố gần nhất {fmtDate(meta.sources.bctn_pub_last)}).
                {meta.sources.fin_name && meta.sources.fin_fy_last && (
                  <>
                    {" "}BCTC năm: năm tài chính <strong>{meta.sources.fin_fy_first}–{meta.sources.fin_fy_last}</strong>.
                  </>
                )}{" "}
                Điểm hiện tại được tính tại mốc {fmtDate(meta.as_of)}.
              </p>
            </>
          )}
          {meta.sources?.fin_name && (
            <>
              <h2>Số liệu báo cáo tài chính</h2>
              <p>
                BCTC năm ({fmtInt(meta.counts.fin_rows)} báo cáo của {fmtInt(meta.counts.fin_tickers ?? 0)} doanh nghiệp) lấy từ nguồn
                công khai bên ngoài <strong>{meta.sources.fin_name}</strong>, kèm ngày công bố của từng báo cáo. Đây là dữ liệu bên thứ
                ba, chưa đối chiếu với BCTC gốc. Nguồn chỉ có số liệu từ năm tài chính {meta.sources.fin_fy_first} và thiếu một số
                doanh nghiệp đã hủy niêm yết, nên {fmtInt(meta.counts.fin_firm_years ?? 0)}/{fmtInt(meta.counts.firm_years)}{" "}
                doanh nghiệp-năm có số liệu; phần còn thiếu được điền bằng trung vị. Mô hình không dùng cờ "thiếu số liệu" vì việc thiếu
                gắn với việc bị hủy niêm yết về sau, tức là thông tin của tương lai.
              </p>
            </>
          )}
          <h2>Sự kiện</h2>
          <p>
            {fmtInt(meta.counts.events)} sự kiện được tổng hợp từ thông báo, quyết định của Sở Giao dịch Chứng khoán và UBCKNN. Mỗi
            sự kiện có số văn bản, ngày, cơ quan, lý do, căn cứ điều khoản và liên kết tới văn bản gốc. Nhóm E1–E7 được gán theo bộ
            quy tắc và được rà soát thủ công.
          </p>
          <h2>Thời điểm đánh giá & chống rò rỉ</h2>
          <p>
            Điểm của năm tài chính <em>t</em> được tính tại <strong>ngày công bố báo cáo thường niên năm t</strong> (nếu không xác
            định được: 30/06 năm t+1). Mọi đặc trưng chỉ dùng thông tin công bố trước thời điểm này; sự kiện được đếm trong 12 tháng
            kế tiếp. Điểm hiện tại của doanh nghiệp đang niêm yết dùng thời điểm đánh giá là mốc dữ liệu, lịch sử sự kiện tới mốc đó,
            trạng thái cảnh báo/kiểm soát hiện hành và báo cáo thường niên gần nhất.
          </p>
          <h2>Mô hình</h2>
          <p>
            Hồi quy logistic có điều chuẩn trên {Object.keys(meta.features).length} yếu tố: lịch sử xử lý, trạng thái hiện hành, độ
            trễ và định dạng công bố BCTN, tín hiệu ngôn ngữ trích từ phần thuyết minh của BCTN (đã loại BCTC, báo cáo kiểm toán
            và câu nhắc tới tình trạng cảnh báo), cùng hai chỉ tiêu từ BCTC năm gần nhất đã công bố trước thời điểm đánh giá: ROA
            và dòng tiền thuần từ HĐKD trên tổng tài sản. Các chỉ tiêu khác (vốn chủ âm, lỗ lũy kế, số năm lỗ liên tiếp, đòn bẩy,
            thanh toán hiện hành, chậm công bố BCTC) đã được thử nhưng làm giảm độ chính xác ngoài mẫu nên không dùng. Kiểm định theo kiểu <em>walk-forward</em>: năm T chỉ được chấm bởi mô hình
            học từ các năm ≤ T−2. Điểm 0–100 là phân vị xác suất trong cùng kỳ; mức <strong>Rất cao</strong> ≥ 90, <strong>Cao</strong>{" "}
            75–90, <strong>Trung bình</strong> 50–75.
          </p>
          <h2>Dự báo theo ngành</h2>
          <p>
            Số doanh nghiệp dự kiến bị xử lý trong 12 tháng tới là tổng xác suất của từng doanh nghiệp đang niêm yết, hiệu chỉnh theo
            tỷ lệ thực tế/dự báo của kiểm định ngược 2019–2024. Các doanh nghiệp không độc lập với nhau (có năm cả thị trường bị xử
            lý nhiều hơn hẳn), nên khoảng 90% được nới thêm theo mức dao động giữa các năm quan sát được. Xem{" "}
            <Link to="/industries">Phân tích ngành</Link>.
          </p>
          <h2>Trợ lý AI</h2>
          <p>
            Nút <strong>Hỏi AI</strong> dùng mô hình Claude Sonnet 5.5 của Anthropic. Trợ lý chỉ đọc dữ liệu của web qua các công cụ
            tra cứu (hồ sơ doanh nghiệp, bộ lọc, sự kiện, ngành, dự báo) và ghi nguồn dưới mỗi câu trả lời; nó không tự đưa ra dự báo
            ngoài các con số của mô hình. Mỗi người được hỏi 6 câu mỗi ngày. Câu hỏi được gửi tới Anthropic để xử lý; không nhập thông
            tin cá nhân vào khung chat.
          </p>
          <h2>Văn bản báo cáo</h2>
          <p>
            {fmtInt(meta.counts.reports)} báo cáo thường niên được đối chiếu SHA256 và phân loại:{" "}
            {stats && Object.entries(stats.pdf_types).map(([k, v]) => `${k} – ${PDF_TYPE[k]} (${fmtInt(v)})`).join("; ")}. File
            scan được OCR; dữ liệu cá nhân (số giấy tờ, ngày sinh, địa chỉ) đã được xóa trước khi phân tích.
          </p>
          <h2>Từ điển ngôn ngữ</h2>
          {Object.entries(meta.lexicon).map(([k, ws]) => (
            <p key={k}>
              <strong>{k === "neg" ? "Tiêu cực" : k === "unc" ? "Bất định" : "Tích cực"}:</strong> {ws.join(", ")}.
            </p>
          ))}
          <h2>Giới hạn sử dụng</h2>
          <div className="callout warn">
            Điểm rủi ro là ước lượng thống kê từ dữ liệu công khai, phục vụ sàng lọc và ưu tiên rà soát. Đây không phải khuyến nghị
            đầu tư và không thay thế văn bản chính thức của cơ quan quản lý. Doanh nghiệp thiếu báo cáo trong kho dữ liệu không đồng
            nghĩa với vi phạm.
          </div>
        </div>
      </Card>
    </>
  );
}
