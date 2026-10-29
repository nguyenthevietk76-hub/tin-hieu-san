import { load } from "./data";
import { FEATURE_SHORT, fmtFeature } from "./features";
import { fmtBn, fmtDate, fmtNum, fmtPct, fold } from "./format";
import { BAND, E_SHORT, MEASURE } from "./labels";
import type { Company, CompanyDetail, EventRec, FinRow, FinSummary, Forecast, Meta } from "./types";

// Rule-based assistant: recognises the common question types and answers them with
// templated sentences filled from the site's own JSON. Runs in the browser, costs
// nothing, and never states a number that is not in the data.
export interface Source {
  label: string;
  href: string;
}
export interface Reply {
  text: string;
  sources: Source[];
}

const INDUSTRY_ALIASES: Array<[RegExp, string]> = [
  [/khong thiet yeu|ban le|det may|o to|du lich|khach san/, "Tiêu dùng không thiết yếu"],
  [/thiet yeu|thuc pham|do uong|nong nghiep|thuy san/, "Tiêu dùng thiết yếu"],
  [/bat dong san|\bbds\b|dia oc/, "Bất động sản"],
  [/cong nghe|phan mem|\bit\b/, "Công nghệ thông tin"],
  [/cham soc suc khoe|\by te\b|duoc|benh vien/, "Chăm sóc sức khỏe"],
  [/truyen thong|vien thong|quang cao/, "Dịch vụ truyền thông"],
  [/tien ich|dien nuoc|cap nuoc|\bdien\b/, "Tiện ích"],
  [/nang luong|dau khi|xang dau|than\b/, "Năng lượng"],
  [/nguyen vat lieu|vat lieu|thep|hoa chat|xi mang|nhua|giay\b/, "Nguyên vật liệu"],
  [/cong nghiep|xay dung|van tai|logistics|co khi/, "Công nghiệp"],
];

const E_PATTERNS: Array<[RegExp, string]> = [
  [/\be([1-7])\b/, ""],
  [/cham (cong bo|nop)|bctc cham/, "E1"],
  [/kiem toan|ngoai tru/, "E2"],
  [/xu phat/, "E3"],
  [/lo luy ke|von (chu so huu )?am/, "E5"],
];

const has = (q: string, re: RegExp) => re.test(q);
const n0 = (v: number | null | undefined) => (v == null ? "—" : Math.round(v).toString());

async function data() {
  const [cos, fin, fc, meta] = await Promise.all([
    load<Company[]>("companies.json"),
    load<FinSummary>("finance.json"),
    load<Forecast>("forecast.json"),
    load<Meta>("meta.json"),
  ]);
  return { cos, fin, fc, meta, byT: new Map(cos.map((c) => [c.t, c])), finT: new Map(fin.rows.map((r) => [r.t, r])) };
}
type Data = Awaited<ReturnType<typeof data>>;

/** Ticker from the question: written in capitals ("HAG"), or after "mã"/"cổ phiếu" in any case. */
function findTicker(raw: string, d: Data): string | null {
  for (const m of raw.matchAll(/(?<![\p{L}\d])([A-Z][A-Z0-9]{2})(?![\p{L}\d])/gu)) if (d.byT.has(m[1])) return m[1];
  const f = fold(raw);
  const m = f.match(/\b(?:ma|co phieu|cp|cong ty|doanh nghiep)\s+([a-z0-9]{3})\b/);
  if (m && d.byT.has(m[1].toUpperCase())) return m[1].toUpperCase();
  const only = raw.trim().toUpperCase();
  return d.byT.has(only) ? only : null;
}

function findIndustry(f: string): string | null {
  for (const [re, name] of INDUSTRY_ALIASES) if (re.test(f)) return name;
  return null;
}

function findGroup(f: string): string | null {
  for (const [re, code] of E_PATTERNS) {
    const m = f.match(re);
    if (m) return code || `E${m[1]}`;
  }
  return null;
}

function findExchange(f: string): "HOSE" | "HNX" | null {
  return has(f, /\bhose\b|\bhsx\b/) ? "HOSE" : has(f, /\bhnx\b/) ? "HNX" : null;
}

const firm = (c: Company) => `**${c.t}** – ${c.name}`;
const asOf = (d: Data) => `Dữ liệu tới ${fmtDate(d.meta.as_of)}.`;

export async function ask(question: string, contextTicker: string | null): Promise<Reply> {
  const d = await data();
  const f = fold(question);
  const ticker = findTicker(question, d) ?? (has(f, /\b(no|ma nay|cong ty nay|doanh nghiep nay)\b|vi sao|tai sao|giai thich/) ? contextTicker : null);
  const ind = findIndustry(f);

  if (has(f, /nen mua|nen ban|co nen (mua|ban|dau tu|giu)|gia co phieu|khuyen nghi|dinh gia|muc tieu gia/))
    return {
      text: "Tín Hiệu Sàn chỉ đánh giá **rủi ro vi phạm quy định niêm yết**, không khuyến nghị mua, bán hay dự đoán giá cổ phiếu. Bạn có thể hỏi về điểm rủi ro, sự kiện xử lý, sức khỏe tài chính hoặc dự báo của một mã hay một ngành.",
      sources: [],
    };
  if (has(f, /ngan hang|bao hiem|chung khoan|cong ty quan ly quy/) && !ticker)
    return {
      text: "Dữ liệu chỉ gồm **doanh nghiệp phi tài chính** niêm yết trên HOSE và HNX; ngân hàng, bảo hiểm, công ty chứng khoán, quỹ và UPCoM nằm ngoài phạm vi.",
      sources: [{ label: "Phương pháp", href: "#/methodology" }],
    };

  const wantsForecast = has(f, /du bao|du doan|12 thang|sap toi|tuong lai|nam toi|nam sau|se bi|kha nang|xac suat/);
  if (ticker) return company(ticker, d);
  if (has(f, /auc|do chinh xac|chinh xac|tin cay|mo hinh|phuong phap|cach tinh/) && !wantsForecast) return method(d);
  if (wantsForecast || has(f, /xu huong/)) return forecast(ind, d);
  if (has(f, /nguong|huy niem yet bat buoc|tiem can|cham nguong|von (chu so huu )?am|lo luy ke/)) return thresholds(ind, findExchange(f), d);
  if (has(f, /canh bao|kiem soat|tam ngung|dang bi xu ly|bi dua vao dien/) && !has(f, /su kien|quyet dinh|gan day|moi nhat/))
    return status(ind, findExchange(f), d);
  if (has(f, /su kien|quyet dinh|xu phat|bi xu ly|gan day|moi nhat|vi pham/)) return events(f, ind, d);
  if (has(f, /dang lo|thua lo|\blo\b|lo nhieu|roa/)) return losses(ind, findExchange(f), d);
  if (has(f, /rui ro|top|nhung ma|ma nao|cong ty nao|doanh nghiep nao|nguy hiem|xep hang/)) return ranking(f, ind, findExchange(f), d);
  if (ind) return industry(ind, d);
  return help();
}

async function company(t: string, d: Data): Promise<Reply> {
  const c = d.byT.get(t)!;
  const det = await load<CompanyDetail>(`company/${t}.json`);
  const last = det.years[det.years.length - 1];
  const lines: string[] = [`${firm(c)} (${c.ex}, ${c.ind3 || c.ind1})`, ""];
  const score = (lbl: string, pct?: number | null, p?: number | null) => {
    const b = pct == null ? null : pct >= 90 ? "very_high" : pct >= 75 ? "high" : pct >= 50 ? "medium" : "low";
    return `- ${lbl}: **${n0(pct)}/100**${b ? ` (${BAND[b].label})` : ""}, xác suất bị xử lý trong 12 tháng khoảng **${fmtPct(p)}**.`;
  };
  if (c.listed) {
    lines.push(score("Rủi ro tuân thủ", c.pct1, c.p1), score("Rủi ro tài chính", c.pct2, c.p2));
    lines.push(`- Trạng thái hiện tại: ${c.status ?? "bình thường (không trong diện cảnh báo/kiểm soát)"}.`);
  } else {
    lines.push(`- Đã rời HOSE/HNX. Điểm của năm tài chính ${last?.fiscal_year}:`);
    lines.push(score("Rủi ro tuân thủ", last?.pct_Y1, last?.p_Y1), score("Rủi ro tài chính", last?.pct_Y2, last?.p_Y2));
  }
  const drv = det.live?.drivers_Y1 ?? last?.drivers_Y1;
  const x = det.live?.x ?? last?.x;
  // yes/no inputs that are "no" only push the score through the model's baseline; listing
  // them ("Niêm yết HNX: Không") as a cause reads as nonsense, so keep the ones that are present
  const FLAGS = new Set(["hnx", "no_pub_date", "no_report", "no_text", "prior_status", "ev_any_1y"]);
  const up = Object.entries(drv ?? {})
    .filter(([k, v]) => v > 0.05 && !(FLAGS.has(k) && !(x?.[k] ?? 0)))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  if (up.length) {
    lines.push("", "Yếu tố đẩy điểm tuân thủ lên nhiều nhất:");
    for (const [k] of up) lines.push(`- ${FEATURE_SHORT[k] ?? k}: ${fmtFeature(k, x?.[k])}`);
  }
  const ev = det.events.filter((e) => e.e);
  if (ev.length) {
    const e = ev[0];
    lines.push(
      "",
      `Có **${ev.length} sự kiện** xử lý nhóm E1–E7; gần nhất ngày ${fmtDate(e.d)}: ${MEASURE[e.m] ?? e.m} (${e.e
        .split(";")
        .map((k) => `${k} ${E_SHORT[k]}`)
        .join(", ")}).`,
    );
  } else lines.push("", "Chưa có sự kiện xử lý nhóm E1–E7 trong dữ liệu.");
  const fr = d.finT.get(t);
  if (fr) {
    lines.push(
      `BCTC năm ${fr.fy}: doanh thu ${fmtBn(fr.rev)} tỷ, LNST **${fmtBn(fr.ni)} tỷ**, ROA ${fmtPct(fr.roa)}${fr.streak >= 2 ? `, lỗ ${fr.streak} năm liên tiếp` : ""}.`,
    );
    if (fr.flag) lines.push(`Cảnh báo ngưỡng hủy niêm yết: **${fr.flag === "breach" ? "chạm ngưỡng" : "tiệm cận"}** (${fr.why.join("; ")}).`);
  }
  lines.push("", `${c.listed ? `Điểm tính tại ${fmtDate(det.live?.as_of)}. ` : ""}Đây là ước lượng thống kê, không phải khuyến nghị đầu tư.`);
  const sources: Source[] = [{ label: `Hồ sơ ${t}`, href: `#/c/${t}` }];
  if (ev[0]?.urls[0]) sources.push({ label: `Văn bản ${ev[0].doc ?? fmtDate(ev[0].d)}`, href: ev[0].urls[0] });
  return { text: lines.join("\n"), sources };
}

function forecast(ind: string | null, d: Data): Reply {
  const fc = d.fc;
  const period = `từ ${fmtDate(fc.as_of)} đến ${fmtDate(fc.horizon_end)}`;
  const sources = [
    { label: "Dự báo theo ngành", href: "#/industries" },
    { label: "Phương pháp", href: "#/methodology" },
  ];
  if (ind) {
    const r = fc.industries.find((x) => x.ind === ind);
    if (!r) return { text: `Chưa có dự báo cho ngành ${ind}.`, sources };
    const trend = (rate: number | null, base: number | null) =>
      rate == null || base == null ? "" : rate - base > 0.01 ? " – **cao hơn** mức 2022–2024" : rate - base < -0.01 ? " – **thấp hơn** mức 2022–2024" : " – tương đương mức 2022–2024";
    return {
      text: [
        `Ngành **${ind}** (${r.n} DN đang niêm yết), ${period}, mô hình dự kiến:`,
        `- Bị xử lý về tuân thủ: **${fmtNum(r.Y1.exp, 1)} DN** (khoảng 90%: ${r.Y1.lo}–${r.Y1.hi}), tỷ lệ ${fmtPct(r.Y1.rate)} so với thực tế ${fmtPct(r.base_y1)} giai đoạn 2022–2024${trend(r.Y1.rate, r.base_y1)}.`,
        `- Bị xử lý về tài chính: **${fmtNum(r.Y2.exp, 1)} DN** (khoảng 90%: ${r.Y2.lo}–${r.Y2.hi}), tỷ lệ ${fmtPct(r.Y2.rate)} so với ${fmtPct(r.base_y2)}${trend(r.Y2.rate, r.base_y2)}.`,
        `- Các mã có xác suất tuân thủ cao nhất: ${r.top_y1.slice(0, 3).map((x) => `${x.t} (${fmtPct(x.p, 0)})`).join(", ")}.`,
        "",
        "Đây là ước lượng thống kê từ mô hình rủi ro của web; số thực tế có thể lệch, nhất là trong năm cả thị trường biến động.",
      ].join("\n"),
      sources,
    };
  }
  const top = [...fc.industries].sort((a, b) => b.Y1.exp + b.Y2.exp - a.Y1.exp - a.Y2.exp).slice(0, 3);
  const bt = fc.backtest.slice(-3).map((b) => `${b.fy}: dự báo ${fmtNum(b.pred_y2, 0)} – thực tế ${b.act_y2}`).join("; ");
  return {
    text: [
      `Trong 12 tháng ${period}, trên ${fc.market.n} doanh nghiệp đang niêm yết, mô hình dự kiến:`,
      `- Khoảng **${fmtNum(fc.market.Y1.exp, 0)} DN** bị xử lý về tuân thủ (khoảng 90%: ${fc.market.Y1.lo}–${fc.market.Y1.hi}).`,
      `- Khoảng **${fmtNum(fc.market.Y2.exp, 0)} DN** bị xử lý về tài chính (khoảng 90%: ${fc.market.Y2.lo}–${fc.market.Y2.hi}).`,
      `- Ngành dự kiến nhiều nhất: ${top.map((r) => `${r.ind} (${fmtNum(r.Y1.exp + r.Y2.exp, 0)})`).join(", ")}.`,
      "",
      `Kiểm định ngược với nhóm tài chính (${bt}); tương quan dự báo – thực tế theo ngành là ${fmtNum(fc.accuracy.Y2.corr, 2)} (tài chính) và ${fmtNum(fc.accuracy.Y1.corr, 2)} (tuân thủ). Khoảng tuân thủ rộng vì có năm lệch mạnh như 2021.`,
    ].join("\n"),
    sources,
  };
}

function listLines(rows: Company[], val: (c: Company) => string) {
  return rows.map((c, i) => `${i + 1}. ${firm(c)}: ${val(c)}`);
}

function scope(ind: string | null, ex: string | null) {
  return [ind ? `ngành ${ind}` : "", ex ? `sàn ${ex}` : ""].filter(Boolean).join(", ");
}

function listed(d: Data, ind: string | null, ex: string | null) {
  return d.cos.filter((c) => c.listed && (!ind || c.ind1 === ind) && (!ex || c.ex === ex));
}

function ranking(f: string, ind: string | null, ex: string | null, d: Data): Reply {
  const fin = has(f, /tai chinh/);
  const rows = listed(d, ind, ex).sort((a, b) => ((fin ? b.p2 : b.p1) ?? 0) - ((fin ? a.p2 : a.p1) ?? 0)).slice(0, 8);
  const sc = scope(ind, ex);
  return {
    text: [
      `Các doanh nghiệp đang niêm yết có **rủi ro ${fin ? "tài chính" : "tuân thủ"}** cao nhất${sc ? ` (${sc})` : ""}:`,
      ...listLines(rows, (c) => `${n0(fin ? c.pct2 : c.pct1)} điểm, xác suất 12 tháng ${fmtPct(fin ? c.p2 : c.p1)}${c.status ? `, ${c.status.toLowerCase()}` : ""}`),
      "",
      `${asOf(d)} ${fin ? "" : 'Hỏi thêm "rủi ro tài chính cao nhất" để xem nhóm tài chính.'}`.trim(),
    ].join("\n"),
    sources: [{ label: "Bộ sàng lọc rủi ro", href: "#/screener" }],
  };
}

function status(ind: string | null, ex: string | null, d: Data): Reply {
  const rows = listed(d, ind, ex).filter((c) => c.status);
  const by: Record<string, number> = {};
  for (const c of rows) by[c.status!] = (by[c.status!] ?? 0) + 1;
  const sc = scope(ind, ex);
  return {
    text: [
      `Hiện có **${rows.length} doanh nghiệp**${sc ? ` (${sc})` : ""} đang bị xử lý: ${Object.entries(by).map(([k, v]) => `${k.toLowerCase()} ${v}`).join(", ")}.`,
      "Rủi ro tuân thủ cao nhất trong nhóm này:",
      ...listLines([...rows].sort((a, b) => (b.p1 ?? 0) - (a.p1 ?? 0)).slice(0, 8), (c) => `${c.status}, ${n0(c.pct1)} điểm`),
      "",
      `Danh sách diện cảnh báo/kiểm soát chụp ngày ${fmtDate(d.meta.sources?.listing)}.`,
    ].join("\n"),
    sources: [{ label: "Bộ sàng lọc rủi ro", href: "#/screener" }],
  };
}

function thresholds(ind: string | null, ex: string | null, d: Data): Reply {
  const ok = new Set(listed(d, ind, ex).map((c) => c.t));
  const rows = d.fin.rows.filter((r) => ok.has(r.t) && r.flag).sort((a, b) => (a.flag === b.flag ? (a.roa ?? 0) - (b.roa ?? 0) : a.flag === "breach" ? -1 : 1));
  const sc = scope(ind, ex);
  const line = (r: FinRow, i: number) => `${i + 1}. **${r.t}** – ${r.name}: ${r.flag === "breach" ? "chạm ngưỡng" : "tiệm cận"} (${r.why.join("; ")}), BCTC ${r.fy}`;
  return {
    text: rows.length
      ? [
          `Có **${rows.length} doanh nghiệp đang niêm yết**${sc ? ` (${sc})` : ""} chạm hoặc tiệm cận ngưỡng hủy niêm yết bắt buộc theo Nghị định 155/2020 (vốn chủ âm, lỗ lũy kế vượt vốn góp, lỗ 3 năm liên tiếp):`,
          ...rows.slice(0, 10).map(line),
          "",
          "Tính trên BCTC năm gần nhất theo số liệu Vietcap, chưa đối chiếu BCTC kiểm toán gốc.",
        ].join("\n")
      : `Không có doanh nghiệp đang niêm yết nào${sc ? ` (${sc})` : ""} chạm hoặc tiệm cận ngưỡng hủy niêm yết theo BCTC năm gần nhất.`,
    sources: [{ label: "Sức khỏe tài chính", href: "#/finance" }],
  };
}

function losses(ind: string | null, ex: string | null, d: Data): Reply {
  const ok = new Set(listed(d, ind, ex).map((c) => c.t));
  const fy = Math.max(...d.fin.rows.filter((r) => ok.has(r.t)).map((r) => r.fy));
  const cur = d.fin.rows.filter((r) => ok.has(r.t) && r.fy === fy);
  const lossy = cur.filter((r) => (r.ni ?? 0) < 0).sort((a, b) => (a.ni ?? 0) - (b.ni ?? 0));
  const sc = scope(ind, ex);
  return {
    text: [
      `Theo BCTC năm ${fy}, **${lossy.length}/${cur.length} doanh nghiệp đang niêm yết**${sc ? ` (${sc})` : ""} có lợi nhuận sau thuế âm (${fmtPct(cur.length ? lossy.length / cur.length : null)}). Lỗ nhiều nhất:`,
      ...lossy.slice(0, 8).map((r, i) => `${i + 1}. **${r.t}** – ${r.name}: LNST ${fmtBn(r.ni)} tỷ, ROA ${fmtPct(r.roa)}${r.streak >= 2 ? `, lỗ ${r.streak} năm liền` : ""}`),
    ].join("\n"),
    sources: [{ label: "Sức khỏe tài chính", href: "#/finance" }],
  };
}

async function events(f: string, ind: string | null, d: Data): Promise<Reply> {
  const all = await load<EventRec[]>("events.json");
  const group = findGroup(f);
  const year = f.match(/\b(20(?:1[5-9]|2\d))\b/)?.[1];
  let ev = all.filter((e) => e.e);
  if (group) ev = ev.filter((e) => e.e.split(";").includes(group));
  if (ind) ev = ev.filter((e) => d.byT.get(e.t)?.ind1 === ind);
  const byYear: Record<string, number> = {};
  for (const e of ev) byYear[e.d.slice(0, 4)] = (byYear[e.d.slice(0, 4)] ?? 0) + 1;
  if (year) ev = ev.filter((e) => e.d.startsWith(year));
  const sc = [group ? `nhóm ${group} ${E_SHORT[group]}` : "", ind ? `ngành ${ind}` : "", year ? `năm ${year}` : ""].filter(Boolean).join(", ");
  const years = Object.keys(byYear).sort().slice(-5);
  const list = ev.slice(0, 6);
  return {
    text: [
      `Có **${ev.length} sự kiện xử lý**${sc ? ` (${sc})` : ""}.${year ? "" : ` Theo năm: ${years.map((y) => `${y}: ${byYear[y]}`).join(", ")} (năm hiện tại tính tới ${fmtDate(d.meta.as_of)}).`}`,
      list.length ? "Gần nhất:" : "",
      ...list.map((e) => `- ${fmtDate(e.d)} · **${e.t}**: ${MEASURE[e.m] ?? e.m} – ${e.e.split(";").map((k) => E_SHORT[k]).join(", ")}${e.why ? `. ${e.why.length > 140 ? `${e.why.slice(0, 140)}…` : e.why}` : ""}`),
    ]
      .filter((l) => l !== "")
      .join("\n"),
    sources: [
      { label: "Sự kiện xử lý", href: "#/events" },
      ...list.slice(0, 2).filter((e) => e.urls[0]).map((e) => ({ label: `Văn bản ${e.doc ?? fmtDate(e.d)} (${e.t})`, href: e.urls[0] })),
    ],
  };
}

function industry(ind: string, d: Data): Reply {
  const r = d.fc.industries.find((x) => x.ind === ind);
  const cos = listed(d, ind, null);
  const fy = Math.max(...d.fin.rows.map((x) => x.fy));
  const cur = d.fin.rows.filter((x) => x.listed && x.ind1 === ind && x.fy === fy);
  const recent = r?.hist.filter((h) => h.fy >= 2022) ?? [];
  const early = r?.hist.filter((h) => h.fy <= 2021) ?? [];
  const avg = (xs: typeof recent, k: "y1" | "y2") => (xs.length ? xs.reduce((s, h) => s + h[k], 0) / xs.length : null);
  return {
    text: [
      `Ngành **${ind}**: ${cos.length} doanh nghiệp đang niêm yết, ${cos.filter((c) => c.status).length} đang bị cảnh báo/kiểm soát/tạm ngừng.`,
      `- Tỷ lệ DN bị xử lý về tuân thủ: ${fmtPct(avg(recent, "y1"))} (2022–2024) so với ${fmtPct(avg(early, "y1"))} (2015–2021).`,
      `- Tỷ lệ DN bị xử lý về tài chính: ${fmtPct(avg(recent, "y2"))} (2022–2024) so với ${fmtPct(avg(early, "y2"))} (2015–2021).`,
      `- BCTC năm ${fy}: ${cur.filter((x) => (x.ni ?? 0) < 0).length}/${cur.length} DN lỗ, ${cur.filter((x) => x.flag).length} DN chạm hoặc tiệm cận ngưỡng hủy niêm yết.`,
      r ? `- Dự báo 12 tháng tới: khoảng ${fmtNum(r.Y1.exp, 1)} DN bị xử lý về tuân thủ và ${fmtNum(r.Y2.exp, 1)} DN về tài chính.` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    sources: [
      { label: "Phân tích ngành", href: "#/industries" },
      { label: "Sức khỏe tài chính", href: "#/finance" },
    ],
  };
}

function method(d: Data): Reply {
  const m = d.meta.model;
  return {
    text: [
      "Điểm rủi ro đến từ hai mô hình hồi quy logistic, kiểm định walk-forward 2019–2024 (mỗi năm chỉ học từ dữ liệu trước đó):",
      `- Tuân thủ: AUC **${fmtNum(m.Y1.oos.auc, 2)}**; nhóm 10% điểm cao nhất có tỷ lệ vi phạm gấp ${fmtNum(m.Y1.oos.top10_lift, 1)} lần trung bình.`,
      `- Tài chính: AUC **${fmtNum(m.Y2.oos.auc, 2)}**; gấp ${fmtNum(m.Y2.oos.top10_lift, 1)} lần.`,
      "AUC 0,5 là đoán ngẫu nhiên, 1,0 là hoàn hảo. Điểm phù hợp để sàng lọc và ưu tiên rà soát, không phải kết luận chắc chắn.",
    ].join("\n"),
    sources: [{ label: "Phương pháp", href: "#/methodology" }],
  };
}

export const EXAMPLES = [
  "Dự báo 12 tháng tới có bao nhiêu doanh nghiệp bị xử lý?",
  "Những mã nào có rủi ro tài chính cao nhất?",
  "Ngành bất động sản đang thế nào?",
  "Doanh nghiệp nào tiệm cận ngưỡng hủy niêm yết?",
];

function help(): Reply {
  return {
    text: [
      "Mình là trợ lý tra cứu tự động của Tín Hiệu Sàn, trả lời từ dữ liệu của web theo các dạng câu hỏi sau:",
      "- Một mã cụ thể, viết hoa: **HAG** rủi ro thế nào?",
      "- Xếp hạng: mã nào rủi ro tài chính cao nhất (có thể thêm ngành, sàn HOSE/HNX)",
      "- Dự báo 12 tháng tới, toàn thị trường hoặc một ngành",
      "- Doanh nghiệp đang bị cảnh báo/kiểm soát, đang lỗ, tiệm cận ngưỡng hủy niêm yết",
      "- Sự kiện xử lý gần đây (có thể lọc theo ngành, năm, ví dụ: chậm công bố BCTC năm 2025)",
      "- Tình hình một ngành, độ chính xác của mô hình",
    ].join("\n"),
    sources: [],
  };
}
