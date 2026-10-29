import Anthropic from "@anthropic-ai/sdk";
import type { Meta } from "../src/lib/types.js";
import { loadData } from "./_lib/data.js";
import { DAILY_LIMIT, LimitNotConfigured, clientId, peek, refund, take } from "./_lib/limit.js";
import { industryNames, runTool, toolDefs, type Source } from "./_lib/tools.js";

// Chat endpoint of Tín Hiệu Sàn: Claude answers from the site's own data through
// read-only tools. Each answer carries the pages and documents the tools read.
const MODEL = "claude-sonnet-5-5";
const MAX_STEPS = 6; // model calls per question (tool rounds + final answer)
const MAX_HISTORY = 8; // earlier turns resent as plain text
const MAX_CHARS = 600; // per question

// ANTHROPIC_API_KEY from the Vercel environment; created on first use so a missing key
// fails one request (refunded) instead of the whole function
let client: Anthropic | null = null;

type Turn = { role: "user" | "assistant"; content: string };

function systemPrompt(meta: Meta): string {
  const m = meta.model;
  return `Bạn là trợ lý của Tín Hiệu Sàn, web cảnh báo sớm rủi ro vi phạm quy định niêm yết của doanh nghiệp phi tài chính trên HOSE và HNX.

Dữ liệu: ${meta.counts.tickers} doanh nghiệp, ${meta.counts.events} sự kiện xử lý, dữ liệu tới ngày ${meta.as_of} (danh sách niêm yết chụp ${meta.sources?.listing}, BCTN tới năm tài chính ${meta.sources?.bctn_fy_last}, BCTC năm tới ${meta.sources?.fin_fy_last} theo Vietcap).

Hai mô hình hồi quy logistic dự báo xác suất doanh nghiệp bị xử lý trong 12 tháng:
- Rủi ro tuân thủ (E1 chậm công bố BCTC, E3 xử phạt CBTT/quản trị, E4 hủy niêm yết do tuân thủ, E7 vi phạm khác): AUC ngoài mẫu 2019–2024 là ${m.Y1.oos.auc?.toFixed(2)}, nhóm 10% điểm cao nhất có tỷ lệ vi phạm gấp ${m.Y1.oos.top10_lift?.toFixed(1)} lần trung bình.
- Rủi ro tài chính (E2 ý kiến kiểm toán, E5 lỗ lũy kế/vốn âm, E6 hủy niêm yết do kết quả kinh doanh): AUC ${m.Y2.oos.auc?.toFixed(2)}, gấp ${m.Y2.oos.top10_lift?.toFixed(1)} lần.
Điểm 0–100 là thứ hạng phần trăm trong các doanh nghiệp đang niêm yết (90 = rủi ro cao hơn 90% doanh nghiệp). Mức: Rất cao ≥ 90, Cao 75–90, Trung bình 50–75, Thấp < 50.

Cách trả lời:
- Mọi con số về doanh nghiệp, ngành, sự kiện hay dự báo phải lấy từ công cụ trong lượt này. Không dùng hiểu biết riêng về doanh nghiệp; nếu công cụ không có dữ liệu, nói rõ là không có.
- Câu hỏi về dự đoán, xu hướng tương lai: dùng công cụ forecast (và get_company cho một mã). Nêu số dự kiến kèm khoảng tin cậy và kết quả kiểm định ngược, nói rõ đây là ước lượng thống kê. Không tự đưa ra con số dự báo nào khác.
- Không khuyến nghị mua, bán hay nắm giữ cổ phiếu, không dự đoán giá. Nếu được hỏi, nói web chỉ đánh giá rủi ro vi phạm quy định niêm yết.
- Câu hỏi ngoài phạm vi (không liên quan doanh nghiệp niêm yết, rủi ro, sự kiện, BCTC): từ chối ngắn gọn.
- Trả lời bằng tiếng Việt, ngắn gọn (thường dưới 200 từ), đi thẳng vào câu trả lời. Chỉ dùng **in đậm** và gạch đầu dòng "- ", không dùng bảng hay tiêu đề. Ghi mốc dữ liệu khi nêu điểm hoặc dự báo. Không cần liệt kê nguồn, web tự hiển thị nguồn dưới câu trả lời.`;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function parseTurns(body: unknown): Turn[] | null {
  const raw = (body as { messages?: unknown })?.messages;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const turns = raw.slice(-(MAX_HISTORY + 1)).map((t) => ({
    role: (t as Turn)?.role === "assistant" ? ("assistant" as const) : ("user" as const),
    content: String((t as Turn)?.content ?? "").slice(0, 2000),
  }));
  while (turns.length && turns[0].role !== "user") turns.shift(); // the API wants a user turn first
  const q = turns[turns.length - 1];
  if (!q || q.role !== "user" || !q.content.trim() || q.content.length > MAX_CHARS) return null;
  return turns;
}

async function answer(turns: Turn[], ticker: string | null, origin: string) {
  const ctx = { origin };
  const [meta, industries] = await Promise.all([loadData<Meta>("meta.json", origin), industryNames(ctx)]);
  const tools = toolDefs(industries);
  const messages: Anthropic.Beta.BetaMessageParam[] = turns.map((t) => ({ role: t.role, content: t.content }));
  if (ticker) {
    const last = messages[messages.length - 1];
    last.content = `[Người dùng đang xem hồ sơ mã ${ticker}]\n${last.content as string}`;
  }
  const sources = new Map<string, Source>();
  const usage = { input: 0, output: 0, cached: 0 };

  for (let step = 0; step < MAX_STEPS; step++) {
    client ??= new Anthropic();
    const res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 8000,
      output_config: { effort: "medium" },
      // a declined request is retried server-side on Anthropic's recommended model
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [{ type: "text", text: systemPrompt(meta), cache_control: { type: "ephemeral" } }],
      tools,
      // the last round must answer with what it has
      tool_choice: step === MAX_STEPS - 1 ? { type: "none" } : { type: "auto" },
      messages,
    });
    usage.input += res.usage.input_tokens;
    usage.output += res.usage.output_tokens;
    usage.cached += res.usage.cache_read_input_tokens ?? 0;

    if (res.stop_reason === "refusal") {
      return { text: "Xin lỗi, tôi không thể trả lời câu hỏi này.", sources: [], usage };
    }
    const uses = res.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (res.stop_reason !== "tool_use" || uses.length === 0) {
      const text = res.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return { text: text || "Xin lỗi, chưa có câu trả lời. Bạn thử hỏi lại theo cách khác nhé.", sources: [...sources.values()], usage };
    }
    messages.push({ role: "assistant", content: res.content });
    const results = await Promise.all(
      uses.map(async (u) => {
        const out = await runTool(u.name, (u.input ?? {}) as Record<string, unknown>, ctx);
        for (const s of out.sources) sources.set(s.href, s);
        return { type: "tool_result" as const, tool_use_id: u.id, content: out.content, is_error: out.isError };
      }),
    );
    messages.push({ role: "user", content: results });
  }
  return { text: "Xin lỗi, câu hỏi cần tra cứu quá nhiều bước. Bạn thử hỏi cụ thể hơn nhé.", sources: [...sources.values()], usage };
}

export async function GET(request: Request): Promise<Response> {
  try {
    return json({ limit: DAILY_LIMIT, remaining: await peek(clientId(request)) });
  } catch (e) {
    if (e instanceof LimitNotConfigured) return json({ limit: DAILY_LIMIT, remaining: 0, error: "not_configured" }, 503);
    return json({ limit: DAILY_LIMIT, remaining: null }, 200);
  }
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  const turns = parseTurns(body);
  if (!turns) return json({ error: "bad_request", message: `Câu hỏi trống hoặc dài quá ${MAX_CHARS} ký tự.` }, 400);
  const tk = String((body as { ticker?: unknown }).ticker ?? "").toUpperCase();
  const ticker = /^[A-Z0-9]{2,5}$/.test(tk) ? tk : null;

  const id = clientId(request);
  let quota;
  try {
    quota = await take(id);
  } catch (e) {
    if (e instanceof LimitNotConfigured)
      return json({ error: "not_configured", message: "Chatbot chưa được cấu hình giới hạn lượt hỏi nên đang tạm tắt." }, 503);
    return json({ error: "quota_error", message: "Không kiểm tra được lượt hỏi, bạn thử lại sau." }, 503);
  }
  if (!quota.ok)
    return json(
      {
        error: "limit",
        remaining: quota.remaining,
        message:
          quota.reason === "user"
            ? `Bạn đã dùng hết ${DAILY_LIMIT} câu hỏi hôm nay. Lượt hỏi được làm mới lúc 0 giờ (giờ Việt Nam).`
            : "Chatbot đã đạt giới hạn câu hỏi chung trong ngày. Bạn quay lại vào ngày mai nhé.",
      },
      429,
    );

  try {
    const out = await answer(turns, ticker, new URL(request.url).origin);
    console.log(JSON.stringify({ chat: "ok", in: out.usage.input, out: out.usage.output, cached: out.usage.cached }));
    return json({ answer: out.text, sources: out.sources, remaining: quota.remaining });
  } catch (e) {
    await refund(id).catch(() => undefined);
    if (e instanceof Anthropic.RateLimitError)
      return json({ error: "busy", message: "Hệ thống đang bận, bạn thử lại sau ít phút. Lượt hỏi này không bị tính." }, 503);
    if (e instanceof Anthropic.APIError) console.error("claude", e.status, e.message);
    else console.error("chat", e);
    // a short cause code (no message text) so a failing deployment can be diagnosed from the browser
    const code = e instanceof Anthropic.APIError ? `claude_${e.status ?? "conn"}` : e instanceof Anthropic.AnthropicError ? "claude_config" : "server";
    return json({ error: "failed", code, message: "Không trả lời được lúc này. Lượt hỏi này không bị tính." }, 502);
  }
}
