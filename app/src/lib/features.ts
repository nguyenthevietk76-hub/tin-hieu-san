/** Human-readable value of a model input (raw design-matrix value). */
export function fmtFeature(k: string, v: number | undefined): string {
  if (v == null) return "—";
  switch (k) {
    case "prior_status":
    case "ev_any_1y":
    case "no_pub_date":
    case "no_report":
    case "no_text":
    case "hnx":
      return v >= 0.5 ? "Có" : "Không";
    case "pub_delay":
      return `${Math.round(v)} ngày`;
    case "ocr_share":
      return `${Math.round(v * 100)}%`;
    case "log_pages":
      return `${Math.round(Math.expm1(v))} trang`;
    case "txt_neg":
    case "txt_unc":
    case "txt_pos":
      return v.toFixed(1);
    default:
      return String(Math.round(v));
  }
}

export const FEATURE_SHORT: Record<string, string> = {
  ev_comp_3y: "Sự kiện tuân thủ 3 năm qua",
  ev_perf_3y: "Sự kiện tài chính 3 năm qua",
  ev_any_1y: "Có sự kiện trong 12 tháng qua",
  prior_status: "Đang trong diện xử lý",
  pub_delay: "Độ trễ công bố BCTN",
  no_pub_date: "Không rõ ngày công bố BCTN",
  no_report: "Không có BCTN",
  ocr_share: "Tỷ lệ trang scan",
  log_pages: "Độ dài BCTN",
  hnx: "Niêm yết HNX",
  txt_neg: "Ngôn ngữ tiêu cực trong BCTN",
  txt_unc: "Ngôn ngữ bất định trong BCTN",
  txt_pos: "Ngôn ngữ tích cực trong BCTN",
  no_text: "Không trích được văn bản",
};
