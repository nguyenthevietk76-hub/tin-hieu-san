import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "./Icon";
import { ask, EXAMPLES, type Source } from "../lib/assistant";
import { useMeta } from "../lib/data";
import { fmtDate } from "../lib/format";

// Question box over the site's data, answered in the browser by the rule-based
// assistant (lib/assistant.ts). The conversation lives in sessionStorage, so it
// survives page changes and reloads within the tab.
type Msg = { role: "user" | "assistant"; content: string; sources?: Source[]; error?: boolean };
type State = { msgs: Msg[]; ticker: string | null };

const KEY = "tinhieusan.chat";
const MAX_CHARS = 300;
const OPEN_EVENT = "tinhieusan:chat";

/** Open the chat panel from anywhere, optionally with a drafted question about one ticker. */
export function openChat(question?: string, ticker?: string) {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { question, ticker } }));
}

function load(): State {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) ?? "null");
    if (v && Array.isArray(v.msgs)) return v;
  } catch {
    /* storage unavailable */
  }
  return { msgs: [], ticker: null };
}

function save(s: State) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
}

/** **bold** spans inside one line. */
function inline(s: string): ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : <Fragment key={i}>{p}</Fragment>,
  );
}

/** The answers use paragraphs, "- " bullets and **bold** only; render those as React nodes. */
function Answer({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  let ordered = false;
  const flush = () => {
    if (!list.length) return;
    const items = list.map((l, i) => <li key={i}>{inline(l)}</li>);
    blocks.push(ordered ? <ol key={blocks.length}>{items}</ol> : <ul key={blocks.length}>{items}</ul>);
    list = [];
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const bullet = line.match(/^[-*•]\s+(.*)$/);
    const num = line.match(/^\d+[.)]\s+(.*)$/);
    if (bullet || num) {
      if (list.length && ordered !== !!num) flush();
      ordered = !!num;
      list.push((bullet ?? num)![1]);
      continue;
    }
    flush();
    if (line) blocks.push(<p key={blocks.length}>{inline(line.replace(/^#+\s*/, ""))}</p>);
  }
  flush();
  return <div className="chat-md">{blocks}</div>;
}

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State>(load);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const { data: meta } = useMeta();
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const update = useCallback((s: State) => {
    setState(s);
    save(s);
  }, []);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const d = (e as CustomEvent<{ question?: string; ticker?: string }>).detail ?? {};
      setOpen(true);
      if (d.ticker) setState((s) => {
        const next = { ...s, ticker: d.ticker ?? null };
        save(next);
        return next;
      });
      if (d.question) setDraft(d.question);
      setTimeout(() => inputRef.current?.focus(), 50);
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    // the panel covers the page on phones: keep the page behind it from scrolling
    const small = window.matchMedia("(max-width: 640px)").matches;
    if (small) document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [state.msgs.length, busy, open]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy || q.length > MAX_CHARS) return;
    const shown = { ...state, msgs: [...state.msgs, { role: "user" as const, content: q }] };
    update(shown);
    setDraft("");
    setBusy(true);
    try {
      const r = await ask(q, state.ticker);
      update({ ...shown, msgs: [...shown.msgs, { role: "assistant", content: r.text, sources: r.sources }] });
    } catch {
      update({ ...shown, msgs: [...shown.msgs, { role: "assistant", content: "Không tải được dữ liệu để trả lời. Bạn thử lại sau.", error: true }] });
    } finally {
      setBusy(false);
    }
  };


  return (
    <>
      {!open && (
        <button className="chat-fab" onClick={() => setOpen(true)} aria-label="Mở trợ lý tra cứu">
          <Icon name="chat" />
          <span>Hỏi nhanh</span>
        </button>
      )}
      {open && (
        <section className="chat-panel" role="dialog" aria-label="Trợ lý tra cứu Tín Hiệu Sàn">
          <header className="chat-head">
            <div style={{ minWidth: 0 }}>
              <div className="chat-title">Hỏi Tín Hiệu Sàn</div>
              <div className="xs faint">Trợ lý tra cứu tự động · miễn phí</div>
            </div>
            <span className="spacer" />
            {state.msgs.length > 0 && (
              <button className="icon-btn" onClick={() => update({ msgs: [], ticker: null })} title="Cuộc trò chuyện mới" aria-label="Cuộc trò chuyện mới">
                <Icon name="refresh" />
              </button>
            )}
            <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Đóng">
              <Icon name="x" />
            </button>
          </header>

          <div className="chat-list" ref={listRef}>
            {state.msgs.length === 0 && (
              <div className="chat-empty">
                <p className="muted small">
                  Hỏi về một mã (viết hoa, ví dụ HAG), xếp hạng rủi ro, sự kiện xử lý, sức khỏe tài chính hay dự báo 12 tháng tới.
                  Câu trả lời lấy từ dữ liệu của web và ghi nguồn bên dưới.
                </p>
                {EXAMPLES.map((s) => (
                  <button key={s} className="chat-suggest" onClick={() => send(s)} disabled={busy}>
                    {s}
                  </button>
                ))}
              </div>
            )}
            {state.msgs.map((m, i) => (
              <div key={i} className={`chat-msg ${m.role}${m.error ? " err" : ""}`}>
                {m.role === "assistant" && !m.error ? <Answer text={m.content} /> : <p>{m.content}</p>}
                {m.sources && m.sources.length > 0 && (
                  <div className="chat-src">
                    <span className="xs faint">Nguồn:</span>
                    {m.sources.map((s) => (
                      <a key={s.href} href={s.href} {...(s.href.startsWith("http") ? { target: "_blank", rel: "noreferrer noopener" } : {})}
                        onClick={() => !s.href.startsWith("http") && window.matchMedia("(max-width: 640px)").matches && setOpen(false)}>
                        {s.label}
                        {s.href.startsWith("http") && <Icon name="external" size={10} />}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {busy && (
              <div className="chat-msg assistant">
                <p className="faint small chat-typing">Đang tra cứu…</p>
              </div>
            )}
          </div>

          <form
            className="chat-form"
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
          >
            {state.ticker && (
              <div className="chat-ctx">
                Đang hỏi về <strong>{state.ticker}</strong>
                <button type="button" className="star" onClick={() => update({ ...state, ticker: null })} aria-label="Bỏ ngữ cảnh mã">
                  <Icon name="x" size={12} />
                </button>
              </div>
            )}
            <div className="chat-input">
              <textarea
                ref={inputRef}
                value={draft}
                rows={1}
                maxLength={MAX_CHARS}
                placeholder="Nhập câu hỏi…"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    send(draft);
                  }
                }}
              />
              <button className="chat-send" type="submit" disabled={busy || !draft.trim()} aria-label="Gửi">
                <Icon name="send" />
              </button>
            </div>
            <div className="xs faint chat-note">
              Trả lời tự động theo mẫu từ dữ liệu của web{meta ? ` (tới ${fmtDate(meta.as_of)})` : ""}, không dùng AI. Không phải
              khuyến nghị đầu tư.
            </div>
          </form>
        </section>
      )}
    </>
  );
}
