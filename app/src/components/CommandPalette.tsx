import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCompanies } from "../lib/data";
import { fold } from "../lib/format";
import { RiskBadge } from "./ui";
import { Icon } from "./Icon";

const PAGES = [
  { to: "/", label: "Tổng quan thị trường", icon: "dashboard" },
  { to: "/screener", label: "Sàng lọc rủi ro", icon: "radar" },
  { to: "/events", label: "Sự kiện xử lý", icon: "bell" },
  { to: "/industries", label: "Phân tích ngành", icon: "layers" },
  { to: "/compare", label: "So sánh doanh nghiệp", icon: "compare" },
  { to: "/watchlist", label: "Danh sách theo dõi", icon: "star" },
  { to: "/methodology", label: "Phương pháp & dữ liệu", icon: "book" },
];

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data } = useCompanies();
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setI(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  const items = useMemo(() => {
    const f = fold(q.trim());
    const pages = PAGES.filter((p) => !f || fold(p.label).includes(f)).map((p) => ({ kind: "page" as const, ...p }));
    let cos = (data ?? []).filter((c) => !f || fold(c.t).startsWith(f) || fold(c.name).includes(f));
    cos = cos.sort((a, b) => {
      const ea = fold(a.t) === f ? 0 : fold(a.t).startsWith(f) ? 1 : 2;
      const eb = fold(b.t) === f ? 0 : fold(b.t).startsWith(f) ? 1 : 2;
      return ea - eb || (b.pct1 ?? -1) - (a.pct1 ?? -1);
    });
    return [...cos.slice(0, f ? 30 : 8).map((c) => ({ kind: "co" as const, c })), ...pages];
  }, [q, data]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${i}"]`)?.scrollIntoView({ block: "nearest" });
  }, [i]);

  if (!open) return null;

  const go = (k: number) => {
    const it = items[k];
    if (!it) return;
    nav(it.kind === "co" ? `/c/${it.c.t}` : it.to);
    onClose();
  };

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Tìm kiếm">
        <input
          ref={inputRef}
          value={q}
          placeholder="Tìm mã chứng khoán, tên doanh nghiệp hoặc trang…"
          onChange={(e) => {
            setQ(e.target.value);
            setI(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setI((x) => Math.min(items.length - 1, x + 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setI((x) => Math.max(0, x - 1)); }
            if (e.key === "Enter") go(i);
            if (e.key === "Escape") onClose();
          }}
        />
        <div className="palette-list" ref={listRef}>
          {items.length === 0 && <div className="empty">Không tìm thấy kết quả.</div>}
          {items.map((it, k) => {
            const head =
              k === 0 || items[k - 1].kind !== it.kind ? (
                <div className="palette-group">{it.kind === "co" ? "Doanh nghiệp" : "Trang"}</div>
              ) : null;
            return (
              <div key={it.kind === "co" ? it.c.t : it.to}>
                {head}
                <div
                  data-i={k}
                  className={`palette-item ${k === i ? "on" : ""}`}
                  onMouseEnter={() => setI(k)}
                  onClick={() => go(k)}
                >
                  {it.kind === "co" ? (
                    <>
                      <span className="ticker" style={{ width: 44 }}>{it.c.t}</span>
                      <span className="co-name" style={{ flex: 1 }}>{it.c.name}</span>
                      <span className="badge outline">{it.c.ex}</span>
                      {it.c.listed ? <RiskBadge band={it.c.band1} /> : <span className="badge outline faint">Đã rời sàn</span>}
                    </>
                  ) : (
                    <>
                      <Icon name={it.icon} size={16} />
                      <span>{it.label}</span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="palette-foot">
          <span><kbd>↑</kbd> <kbd>↓</kbd> di chuyển</span>
          <span><kbd>Enter</kbd> mở</span>
          <span><kbd>Esc</kbd> đóng</span>
        </div>
      </div>
    </div>
  );
}
