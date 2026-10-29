import type Anthropic from "@anthropic-ai/sdk";
import type { Company, CompanyDetail, EventRec, FinSummary, Forecast, Meta, Stats } from "../../src/lib/types.js";
import { loadData } from "./data.js";

export interface Source {
  label: string;
  href: string;
}
export interface ToolOutput {
  content: string;
  sources: Source[];
  isError?: boolean;
}

// Labels shared with the site (src/lib/labels.ts); duplicated so the function has no
// runtime dependency on front-end modules.
const E_SHORT: Record<string, string> = {
  E1: "Chậm công bố BCTC",
  E2: "Ý kiến kiểm toán",
  E3: "Xử phạt CBTT/quản trị",
  E4: "Hủy niêm yết do tuân thủ",
  E5: "Lỗ lũy kế / vốn âm",
  E6: "Hủy niêm yết do kết quả KD",
  E7: "Vi phạm tuân thủ khác",
};
const MEASURE: Record<string, string> = {
  canh_bao: "Cảnh báo",
  kiem_soat: "Kiểm soát",
  kiem_soat_dac_biet: "Kiểm soát đặc biệt",
  han_che_gd: "Hạn chế giao dịch",
  tam_ngung_gd: "Tạm ngừng giao dịch",
  huy_niem_yet: "Hủy niêm yết",
  xu_phat: "Xử phạt hành chính",
};
const BAND: Record<string, string> = { very_high: "Rất cao", high: "Cao", medium: "Trung bình", low: "Thấp" };

const pct = (v: number | null | undefined, d = 1) => (v == null ? null : `${(v * 100).toFixed(d)}%`);
const bn = (v: number | null | undefined) => (v == null ? null : Math.round(v / 1e8) / 10); // tỷ đồng, 1 decimal
const round = (v: number | null | undefined) => (v == null ? null : Math.round(v));
const codes = (e: string) => e.split(";").filter(Boolean).map((c) => `${c} ${E_SHORT[c] ?? ""}`.trim());
const short = (s: string | null | undefined, n = 220) => (!s ? null : s.length > n ? `${s.slice(0, n)}…` : s);
const json = (v: unknown) => JSON.stringify(v);

export interface Ctx {
  origin: string;
}

async function base(ctx: Ctx) {
  const [cos, meta] = await Promise.all([
    loadData<Company[]>("companies.json", ctx.origin),
    loadData<Meta>("meta.json", ctx.origin),
  ]);
  return { cos, meta, byT: new Map(cos.map((c) => [c.t, c])) };
}

export async function industryNames(ctx: Ctx): Promise<string[]> {
  const { cos } = await base(ctx);
  return [...new Set(cos.map((c) => c.ind1).filter(Boolean))].sort((a, b) => a.localeCompare(b, "vi"));
}

/** Tool definitions. Built once per instance; the order and text never vary, so the prefix caches. */
export function toolDefs(industries: string[]): Anthropic.Beta.BetaTool[] {
  const ind = { type: "string", enum: industries, description: "Ngành cấp 1 (ICB)" };
  return [
    {
      name: "get_company",
      description:
        "Hồ sơ rủi ro của một doanh nghiệp theo mã chứng khoán: điểm rủi ro tuân thủ và tài chính hiện tại (thang 0–100, xác suất bị xử lý trong 12 tháng), các yếu tố tác động mạnh nhất, lịch sử điểm theo năm, sự kiện xử lý gần nhất và chỉ tiêu BCTC năm gần nhất. Dùng khi người dùng hỏi về một mã cụ thể.",
      input_schema: {
        type: "object",
        properties: { ticker: { type: "string", description: "Mã chứng khoán, ví dụ HAG" } },
        required: ["ticker"],
      },
    },
    {
      name: "screen_companies",
      description:
        "Lọc và xếp hạng các doanh nghiệp đang niêm yết HOSE/HNX. Dùng cho câu hỏi kiểu 'những mã rủi ro nhất', 'công ty nào đang bị cảnh báo', 'DN ngành X lỗ nhiều nhất'.",
      input_schema: {
        type: "object",
        properties: {
          sort_by: {
            type: "string",
            enum: ["rui_ro_tuan_thu", "rui_ro_tai_chinh", "roa_thap_nhat", "so_su_kien"],
            description: "Tiêu chí xếp hạng (giảm dần mức rủi ro)",
          },
          exchange: { type: "string", enum: ["HOSE", "HNX"] },
          industry: ind,
          filter: {
            type: "string",
            enum: ["dang_bi_xu_ly", "canh_bao_tai_chinh", "dang_lo"],
            description:
              "dang_bi_xu_ly: đang trong diện cảnh báo/kiểm soát/tạm ngừng; canh_bao_tai_chinh: chạm hoặc tiệm cận ngưỡng hủy niêm yết theo BCTC; dang_lo: LNST năm gần nhất âm",
          },
          limit: { type: "integer", minimum: 1, maximum: 15 },
        },
        required: ["sort_by"],
      },
    },
    {
      name: "search_events",
      description:
        "Tìm các quyết định xử lý đã xảy ra (cảnh báo, kiểm soát, hủy niêm yết, xử phạt) với số đếm theo năm và theo nhóm E1–E7. E1 chậm công bố BCTC, E2 ý kiến kiểm toán, E3 xử phạt CBTT/quản trị, E4 hủy niêm yết do tuân thủ, E5 lỗ lũy kế/vốn âm, E6 hủy niêm yết do kết quả kinh doanh, E7 vi phạm tuân thủ khác.",
      input_schema: {
        type: "object",
        properties: {
          ticker: { type: "string" },
          group: { type: "string", enum: ["E1", "E2", "E3", "E4", "E5", "E6", "E7"] },
          year: { type: "integer", minimum: 2015, maximum: 2030 },
          industry: ind,
          limit: { type: "integer", minimum: 1, maximum: 15 },
        },
        required: [],
      },
    },
    {
      name: "industry_overview",
      description:
        "Tổng quan rủi ro theo ngành: tỷ lệ doanh nghiệp bị xử lý theo từng năm (xu hướng quá khứ), tình hình lỗ trong BCTC năm gần nhất và dự báo 12 tháng tới. Bỏ trống industry để so sánh tất cả các ngành.",
      input_schema: { type: "object", properties: { industry: ind }, required: [] },
    },
    {
      name: "forecast",
      description:
        "Dự báo số doanh nghiệp đang niêm yết sẽ bị xử lý trong 12 tháng tới (toàn thị trường hoặc một ngành), kèm khoảng tin cậy 90%, các mã đóng góp nhiều nhất và kết quả kiểm định ngược 2019–2024 (dự báo so với thực tế). Dùng cho mọi câu hỏi về dự đoán, xu hướng tương lai.",
      input_schema: { type: "object", properties: { industry: ind }, required: [] },
    },
  ];
}

export async function runTool(name: string, input: Record<string, unknown>, ctx: Ctx): Promise<ToolOutput> {
  try {
    switch (name) {
      case "get_company":
        return await getCompany(String(input.ticker ?? ""), ctx);
      case "screen_companies":
        return await screen(input, ctx);
      case "search_events":
        return await searchEvents(input, ctx);
      case "industry_overview":
        return await industryOverview(typeof input.industry === "string" ? input.industry : undefined, ctx);
      case "forecast":
        return await forecast(typeof input.industry === "string" ? input.industry : undefined, ctx);
      default:
        return { content: `Công cụ không tồn tại: ${name}`, sources: [], isError: true };
    }
  } catch (e) {
    return { content: `Lỗi khi đọc dữ liệu: ${(e as Error).message}`, sources: [], isError: true };
  }
}

function drivers(d: Record<string, number> | undefined, x: Record<string, number> | undefined, meta: Meta) {
  if (!d) return [];
  return Object.entries(d)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 5)
    .map(([k, v]) => ({ yeu_to: meta.features[k] ?? k, dong_gop: Number(v.toFixed(2)), gia_tri: x?.[k] ?? null }));
}

async function getCompany(raw: string, ctx: Ctx): Promise<ToolOutput> {
  const t = raw.trim().toUpperCase();
  if (!/^[A-Z0-9]{2,5}$/.test(t)) return { content: `Mã không hợp lệ: ${raw}`, sources: [], isError: true };
  const { byT, meta } = await base(ctx);
  const c = byT.get(t);
  if (!c)
    return {
      content: `Không có mã ${t} trong dữ liệu. Phạm vi: doanh nghiệp phi tài chính từng niêm yết HOSE/HNX 2015–2024 (không gồm ngân hàng, bảo hiểm, chứng khoán, UPCoM).`,
      sources: [],
    };
  const [d, fin] = await Promise.all([
    loadData<CompanyDetail>(`company/${t}.json`, ctx.origin),
    loadData<FinSummary>("finance.json", ctx.origin),
  ]);
  const last = d.years[d.years.length - 1];
  const f = fin.rows.find((r) => r.t === t);
  const ev = d.events.filter((e) => e.e).slice(0, 6);
  const out = {
    ma: t,
    ten: c.name,
    san: c.ex,
    nganh: [c.ind1, c.ind3].filter(Boolean).join(" › "),
    dang_niem_yet: c.listed,
    trang_thai_hien_tai: c.status ?? "Bình thường",
    diem_rui_ro: c.listed
      ? {
          danh_gia_tai: d.live?.as_of,
          tuan_thu: { diem: round(c.pct1), xac_suat_12_thang: pct(c.p1), muc: BAND[c.band1 ?? ""] },
          tai_chinh: { diem: round(c.pct2), xac_suat_12_thang: pct(c.p2), muc: BAND[c.band2 ?? ""] },
        }
      : {
          ghi_chu: `Đã rời HOSE/HNX; điểm của năm tài chính ${last?.fiscal_year}`,
          tuan_thu: { diem: round(last?.pct_Y1), xac_suat_12_thang: pct(last?.p_Y1) },
          tai_chinh: { diem: round(last?.pct_Y2), xac_suat_12_thang: pct(last?.p_Y2) },
        },
    yeu_to_tuan_thu: drivers(d.live?.drivers_Y1 ?? last?.drivers_Y1, d.live?.x ?? last?.x, meta),
    yeu_to_tai_chinh: drivers(d.live?.drivers_Y2 ?? last?.drivers_Y2, d.live?.x ?? last?.x, meta),
    lich_su_diem: d.years.slice(-5).map((y) => ({
      nam_tc: y.fiscal_year,
      diem_tuan_thu: round(y.pct_Y1),
      diem_tai_chinh: round(y.pct_Y2),
      su_kien_12_thang_sau: [1, 2, 3, 4, 5, 6, 7].filter((i) => (y[`n_E${i}`] ?? 0) > 0).map((i) => `E${i}`),
    })),
    tong_so_su_kien_E1_E7: c.n_lab,
    su_kien_gan_nhat: ev.map((e) => ({
      ngay: e.d,
      nhom: codes(e.e),
      bien_phap: MEASURE[e.m] ?? e.m,
      ly_do: short(e.why ?? e.title),
      van_ban: e.doc,
    })),
    bctc_gan_nhat: f
      ? {
          nam_tc: f.fy,
          ngay_cong_bo: f.pub,
          doanh_thu_ty: bn(f.rev),
          tang_truong_doanh_thu: pct(f.rev_g),
          lnst_ty: bn(f.ni),
          roa: pct(f.roa),
          roe: pct(f.roe),
          no_tren_tong_tai_san: pct(f.lev),
          lo_luy_ke_tren_von_gop: pct(f.accum),
          so_nam_lo_lien_tiep: f.streak,
          canh_bao_nguong_huy_niem_yet: f.flag ? `${f.flag === "breach" ? "Chạm ngưỡng" : "Tiệm cận"}: ${f.why.join("; ")}` : "Không",
          lnst_cac_nam_ty: f.ni_hist.slice(-5).map(([y, v]) => ({ nam: y, lnst: bn(v) })),
          nguon: "Vietcap (VCI), chưa đối chiếu BCTC gốc",
        }
      : "Không có số liệu BCTC",
  };
  const sources: Source[] = [{ label: `Hồ sơ ${t}`, href: `#/c/${t}` }];
  for (const e of ev.slice(0, 2)) if (e.urls[0]) sources.push({ label: `Văn bản ${e.doc ?? e.d} (${t})`, href: e.urls[0] });
  return { content: json(out), sources };
}

async function screen(input: Record<string, unknown>, ctx: Ctx): Promise<ToolOutput> {
  const { cos } = await base(ctx);
  const fin = await loadData<FinSummary>("finance.json", ctx.origin);
  const fr = new Map(fin.rows.map((r) => [r.t, r]));
  const limit = Math.min(15, Math.max(1, Number(input.limit ?? 10)));
  let rows = cos.filter((c) => c.listed);
  if (input.exchange) rows = rows.filter((c) => c.ex === input.exchange);
  if (input.industry) rows = rows.filter((c) => c.ind1 === input.industry);
  if (input.filter === "dang_bi_xu_ly") rows = rows.filter((c) => c.status);
  if (input.filter === "canh_bao_tai_chinh") rows = rows.filter((c) => fr.get(c.t)?.flag);
  if (input.filter === "dang_lo") rows = rows.filter((c) => (fr.get(c.t)?.ni ?? 0) < 0);
  const key = String(input.sort_by);
  const score = (c: Company) =>
    key === "rui_ro_tai_chinh" ? c.p2 ?? 0 : key === "so_su_kien" ? c.n_lab : key === "roa_thap_nhat" ? -(fr.get(c.t)?.roa ?? 1) : c.p1 ?? 0;
  rows.sort((a, b) => score(b) - score(a));
  const out = {
    tong_so_phu_hop: rows.length,
    danh_sach: rows.slice(0, limit).map((c) => {
      const f = fr.get(c.t);
      return {
        ma: c.t,
        ten: c.name,
        san: c.ex,
        nganh: c.ind1,
        diem_tuan_thu: round(c.pct1),
        xac_suat_tuan_thu: pct(c.p1),
        diem_tai_chinh: round(c.pct2),
        xac_suat_tai_chinh: pct(c.p2),
        trang_thai: c.status ?? "Bình thường",
        so_su_kien: c.n_lab,
        roa: pct(f?.roa),
        lnst_ty: bn(f?.ni),
        canh_bao_bctc: f?.flag ? f.why.join("; ") : null,
      };
    }),
  };
  const fin_ = input.filter === "canh_bao_tai_chinh" || input.filter === "dang_lo" || key === "roa_thap_nhat";
  return {
    content: json(out),
    sources: [fin_ ? { label: "Sức khỏe tài chính", href: "#/finance" } : { label: "Bộ sàng lọc rủi ro", href: "#/screener" }],
  };
}

async function searchEvents(input: Record<string, unknown>, ctx: Ctx): Promise<ToolOutput> {
  const { byT } = await base(ctx);
  const all = await loadData<EventRec[]>("events.json", ctx.origin);
  const t = typeof input.ticker === "string" ? input.ticker.trim().toUpperCase() : null;
  let ev = all.filter((e) => e.e);
  if (t) ev = ev.filter((e) => e.t === t);
  if (input.group) ev = ev.filter((e) => e.e.split(";").includes(String(input.group)));
  if (input.industry) ev = ev.filter((e) => byT.get(e.t)?.ind1 === input.industry);
  const byYear: Record<string, number> = {};
  for (const e of ev) byYear[e.d.slice(0, 4)] = (byYear[e.d.slice(0, 4)] ?? 0) + 1;
  if (input.year) ev = ev.filter((e) => e.d.startsWith(String(input.year)));
  const byGroup: Record<string, number> = {};
  for (const e of ev) for (const c of e.e.split(";")) byGroup[c] = (byGroup[c] ?? 0) + 1;
  const limit = Math.min(15, Math.max(1, Number(input.limit ?? 8)));
  const list = ev.slice(0, limit); // events.json is newest first
  const out = {
    tong_so_su_kien: ev.length,
    theo_nam_truoc_khi_loc_nam: byYear,
    theo_nhom: byGroup,
    ghi_chu: "Năm hiện tại chỉ tính tới ngày dữ liệu; một sự kiện có thể thuộc nhiều nhóm.",
    su_kien_moi_nhat: list.map((e) => ({
      ngay: e.d,
      ma: e.t,
      ten: e.name ?? null,
      nhom: codes(e.e),
      bien_phap: MEASURE[e.m] ?? e.m,
      ly_do: short(e.why ?? e.title, 180),
      so_van_ban: e.doc,
    })),
  };
  const sources: Source[] = [{ label: "Sự kiện xử lý", href: "#/events" }];
  for (const e of list.slice(0, 3)) if (e.urls[0]) sources.push({ label: `Văn bản ${e.doc ?? e.d} (${e.t})`, href: e.urls[0] });
  return { content: json(out), sources };
}

async function industryOverview(ind: string | undefined, ctx: Ctx): Promise<ToolOutput> {
  const [{ cos }, stats, fin, fc] = await Promise.all([
    base(ctx),
    loadData<Stats>("stats.json", ctx.origin),
    loadData<FinSummary>("finance.json", ctx.origin),
    loadData<Forecast>("forecast.json", ctx.origin),
  ]);
  const fy = Math.max(...fin.rows.filter((r) => r.listed).map((r) => r.fy));
  const one = (name: string) => {
    const s = stats.industry.find((r) => r.industry_l1 === name);
    const listed = cos.filter((c) => c.listed && c.ind1 === name);
    const f = fin.rows.filter((r) => r.listed && r.ind1 === name && r.fy === fy);
    const roa = f.map((r) => r.roa).filter((v): v is number => v != null).sort((a, b) => a - b);
    const p = fc.industries.find((r) => r.ind === name);
    return {
      nganh: name,
      so_dn_dang_niem_yet: listed.length,
      dang_bi_xu_ly: listed.filter((c) => c.status).length,
      ty_le_dn_nam_co_su_kien_2015_2024: s ? { tuan_thu: pct(s.y1), tai_chinh: pct(s.y2), moi_loai: pct(s.yall) } : null,
      ty_le_theo_nam: p?.hist.map((h) => ({ nam_tc: h.fy, so_dn: h.n, tuan_thu: pct(h.y1), tai_chinh: pct(h.y2) })),
      bctc_nam_gan_nhat: {
        nam_tc: fy,
        so_dn_co_so_lieu: f.length,
        so_dn_lo: f.filter((r) => (r.ni ?? 0) < 0).length,
        roa_trung_vi: pct(roa.length ? roa[roa.length >> 1] : null),
        cham_hoac_tiem_can_nguong: f.filter((r) => r.flag).length,
      },
      du_bao_12_thang: p
        ? {
            tuan_thu: `${p.Y1.exp} DN (khoảng 90%: ${p.Y1.lo}–${p.Y1.hi})`,
            tai_chinh: `${p.Y2.exp} DN (khoảng 90%: ${p.Y2.lo}–${p.Y2.hi})`,
          }
        : null,
    };
  };
  if (ind) return { content: json(one(ind)), sources: [{ label: "Phân tích ngành", href: "#/industries" }, { label: "Sức khỏe tài chính", href: "#/finance" }] };
  const names = [...new Set(cos.filter((c) => c.listed).map((c) => c.ind1))].filter(Boolean);
  const out = names.map((n) => {
    const r = one(n);
    return { nganh: n, so_dn: r.so_dn_dang_niem_yet, dang_bi_xu_ly: r.dang_bi_xu_ly, ty_le_lich_su: r.ty_le_dn_nam_co_su_kien_2015_2024, dn_lo: r.bctc_nam_gan_nhat.so_dn_lo, du_bao_12_thang: r.du_bao_12_thang };
  });
  return { content: json({ nam_bctc: fy, cac_nganh: out }), sources: [{ label: "Phân tích ngành", href: "#/industries" }] };
}

async function forecast(ind: string | undefined, ctx: Ctx): Promise<ToolOutput> {
  const [fc, { byT }] = await Promise.all([loadData<Forecast>("forecast.json", ctx.origin), base(ctx)]);
  const range = (r: { exp: number; lo: number; hi: number; rate: number | null }) => ({
    so_dn_du_kien: r.exp,
    khoang_tin_cay_90: `${r.lo}–${r.hi}`,
    ty_le: pct(r.rate),
  });
  const top = (xs: Array<{ t: string; p: number }>) => xs.map((x) => ({ ma: x.t, ten: byT.get(x.t)?.name, xac_suat: pct(x.p, 0) }));
  const bt = (xs: Forecast["backtest"]) =>
    xs.map((b) => ({ nam_tc: b.fy, du_bao_tuan_thu: b.pred_y1, thuc_te_tuan_thu: b.act_y1, du_bao_tai_chinh: b.pred_y2, thuc_te_tai_chinh: b.act_y2 }));
  const how =
    "Số DN dự kiến = tổng xác suất bị xử lý trong 12 tháng của từng DN đang niêm yết (mô hình hồi quy logistic, kiểm định walk-forward), hiệu chỉnh theo tỷ lệ thực tế/dự báo 2019–2024. Khoảng 90% gồm cả dao động chung giữa các năm đo từ kiểm định ngược. Đây là ước lượng thống kê, không phải khẳng định.";
  const sources: Source[] = [
    { label: "Dự báo theo ngành", href: "#/industries" },
    { label: "Phương pháp", href: "#/methodology" },
  ];
  if (ind) {
    const r = fc.industries.find((x) => x.ind === ind);
    if (!r) return { content: `Không có dự báo cho ngành ${ind}`, sources: [], isError: true };
    return {
      content: json({
        nganh: ind,
        tu_ngay: fc.as_of,
        den_ngay: fc.horizon_end,
        so_dn_dang_niem_yet: r.n,
        tuan_thu: range(r.Y1),
        tai_chinh: range(r.Y2),
        ty_le_thuc_te_binh_quan_2022_2024: { tuan_thu: pct(r.base_y1), tai_chinh: pct(r.base_y2) },
        ma_dong_gop_nhieu_nhat_tuan_thu: top(r.top_y1),
        ma_dong_gop_nhieu_nhat_tai_chinh: top(r.top_y2),
        kiem_dinh_nguoc_nganh: bt(r.backtest),
        cach_tinh: how,
      }),
      sources,
    };
  }
  return {
    content: json({
      pham_vi: "Toàn bộ DN đang niêm yết HOSE/HNX trong dữ liệu",
      tu_ngay: fc.as_of,
      den_ngay: fc.horizon_end,
      so_dn_dang_niem_yet: fc.market.n,
      tuan_thu: range(fc.market.Y1),
      tai_chinh: range(fc.market.Y2),
      theo_nganh: fc.industries.map((r) => ({ nganh: r.ind, so_dn: r.n, tuan_thu: r.Y1.exp, tai_chinh: r.Y2.exp, ty_le_tuan_thu: pct(r.Y1.rate), ty_le_thuc_te_2022_2024_tuan_thu: pct(r.base_y1) })),
      kiem_dinh_nguoc_toan_thi_truong: bt(fc.backtest),
      sai_so_theo_nganh_nam: {
        tuan_thu: `sai lệch tuyệt đối TB ${fc.accuracy.Y1.mae} DN, tương quan ${fc.accuracy.Y1.corr}`,
        tai_chinh: `sai lệch tuyệt đối TB ${fc.accuracy.Y2.mae} DN, tương quan ${fc.accuracy.Y2.corr}`,
      },
      cach_tinh: how,
    }),
    sources,
  };
}
