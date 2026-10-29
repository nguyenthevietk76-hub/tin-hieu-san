import type { Band } from "./types";

// Compliance groups take steps of the brand colour, financial groups take neutral steps.
export const E_COLOR: Record<string, string> = {
  E1: "var(--brand)",
  E3: "var(--brand-2)",
  E4: "var(--brand-3)",
  E7: "var(--brand-4)",
  E2: "var(--n1)",
  E5: "var(--n2)",
  E6: "var(--n3)",
};

export const E_SHORT: Record<string, string> = {
  E1: "Chậm công bố BCTC",
  E2: "Ý kiến kiểm toán",
  E3: "Xử phạt CBTT/quản trị",
  E4: "Hủy NY do tuân thủ",
  E5: "Lỗ lũy kế / vốn âm",
  E6: "Hủy NY do kết quả KD",
  E7: "Vi phạm tuân thủ khác",
};

export const E_GROUP: Record<string, "comp" | "perf"> = {
  E1: "comp", E3: "comp", E4: "comp", E7: "comp", E2: "perf", E5: "perf", E6: "perf",
};

export const MEASURE: Record<string, string> = {
  canh_bao: "Cảnh báo",
  kiem_soat: "Kiểm soát",
  kiem_soat_dac_biet: "Kiểm soát đặc biệt",
  han_che_gd: "Hạn chế giao dịch",
  tam_ngung_gd: "Tạm ngừng giao dịch",
  huy_niem_yet: "Hủy niêm yết",
  xu_phat: "Xử phạt hành chính",
};

export const AGENCY: Record<string, string> = {
  SGDCK: "Sở GDCK",
  UBCKNN: "UBCKNN",
  DN_cong_bo: "DN tự công bố",
};

export const DIRECTION: Record<string, string> = {
  dua_vao: "Đưa vào diện",
  nang_cap: "Nâng mức",
  thong_bao_truoc: "Thông báo trước",
};

export const BAND: Record<Band, { label: string; cls: string; color: string }> = {
  very_high: { label: "Rất cao", cls: "b-vh", color: "var(--red)" },
  high: { label: "Cao", cls: "b-h", color: "var(--red-2)" },
  medium: { label: "Trung bình", cls: "b-m", color: "var(--yellow)" },
  low: { label: "Thấp", cls: "b-l", color: "var(--green)" },
};

export function bandOf(pct: number | null | undefined): Band | null {
  if (pct == null) return null;
  if (pct >= 90) return "very_high";
  if (pct >= 75) return "high";
  if (pct >= 50) return "medium";
  return "low";
}

export const PDF_TYPE: Record<string, string> = {
  A: "Văn bản số (Unicode)",
  B: "Font cũ (VNI/TCVN3)",
  C: "Scan, lớp OCR cũ",
  D: "Scan thuần",
};

export const SECTION: Record<string, string> = {
  dau_tai_lieu: "Phần mở đầu",
  thong_tin_chung: "Thông tin chung",
  tinh_hinh_hoat_dong: "Tình hình hoạt động",
  bao_cao_bgd: "Báo cáo Ban Giám đốc",
  danh_gia_hdqt: "Đánh giá của HĐQT",
  quan_tri: "Quản trị công ty",
  phat_trien_ben_vung: "Phát triển bền vững",
};

export const STATUS_CLS: Record<string, string> = {
  "Đang bị cảnh báo": "b-status",
  "Đang bị kiểm soát": "b-status",
  "Tạm ngừng giao dịch": "b-status",
};
