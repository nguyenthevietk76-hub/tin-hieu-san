import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { Icon } from "./Icon";
import { CommandPalette } from "./CommandPalette";
import { useMeta } from "../lib/data";
import { useTheme, useWatchlist } from "../lib/store";
import { fmtDate } from "../lib/format";

// Navigation lives in a drop-down behind the menu button so pages get the full width.
const NAV: Array<Array<{ to: string; label: string; icon: string; end?: boolean }>> = [
  [
    { to: "/", label: "Tổng quan", icon: "dashboard", end: true },
    { to: "/screener", label: "Sàng lọc rủi ro", icon: "radar" },
    { to: "/events", label: "Sự kiện xử lý", icon: "bell" },
    { to: "/industries", label: "Phân tích ngành", icon: "layers" },
    { to: "/compare", label: "So sánh", icon: "compare" },
  ],
  [{ to: "/watchlist", label: "Theo dõi", icon: "star" }],
  [{ to: "/methodology", label: "Phương pháp & dữ liệu", icon: "book" }],
];

/** Tín Hiệu Sàn mark: a lighthouse whose beam is the early-warning signal. */
export function Logo() {
  return (
    <svg className="brand-mark" viewBox="0 0 38 34" fill="currentColor" aria-hidden="true">
      <path d="M9 30.5 L11.2 12 H16.8 L19 30.5 Z" />
      <path d="M10 10.5 L14 5 L18 10.5 Z" />
      <path d="M20.5 11.2 L35 5.5 A13 13 0 0 1 35 21.5 L20.5 15.8 Z" fill="var(--brand)" />
      <rect x="6" y="29" width="16" height="2.5" rx="1" />
    </svg>
  );
}

export function Layout() {
  const [palette, setPalette] = useState(false);
  const [menu, setMenu] = useState(false);
  const { theme, set } = useTheme();
  const { list } = useWatchlist();
  const { data: meta } = useMeta();
  const loc = useLocation();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setMenu(false);
        setPalette((p) => !p);
      }
      if (e.key === "/" && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        setMenu(false);
        setPalette(true);
      }
      if (e.key === "Escape") setMenu(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // close the menu on any click outside it
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menu]);

  useEffect(() => {
    setMenu(false);
    window.scrollTo(0, 0);
  }, [loc.pathname]);

  const isDark = theme !== "light";

  return (
    <div className="shell">
      <header className="topbar">
        <div className="menu-anchor" ref={menuRef}>
          <button
            className={`menu-btn ${menu ? "on" : ""}`}
            onClick={() => setMenu((m) => !m)}
            aria-label="Mở menu điều hướng"
            aria-expanded={menu}
            aria-haspopup="menu"
          >
            <Icon name={menu ? "x" : "menu"} />
          </button>
          {menu && (
            <nav className="menu" role="menu">
              {NAV.map((group, gi) => (
                <div className="menu-group" key={gi}>
                  {group.map((n) => (
                    <NavLink key={n.to} to={n.to} end={n.end} role="menuitem" className="menu-item">
                      <Icon name={n.icon} />
                      <span>{n.label}</span>
                      {n.to === "/watchlist" && list.length > 0 && <span className="menu-count">{list.length}</span>}
                      <Icon name="chevronRight" />
                    </NavLink>
                  ))}
                </div>
              ))}
              {meta && (
                <div className="menu-foot">
                  Dữ liệu tới {fmtDate(meta.as_of)} · {meta.counts.tickers} DN · HOSE, HNX {meta.counts.years[0]}–{meta.counts.years[1]}
                </div>
              )}
            </nav>
          )}
        </div>
        <Link to="/" className="brand" aria-label="Tín Hiệu Sàn – trang chủ">
          <Logo />
          <span className="brand-name">Tín Hiệu Sàn</span>
        </Link>
        <button className="search-trigger" onClick={() => setPalette(true)}>
          <Icon name="search" />
          <span>Tìm mã hoặc doanh nghiệp…</span>
          <kbd>Ctrl K</kbd>
        </button>
        <div className="topbar-right">
          <button
            className="icon-btn"
            onClick={() => set(isDark ? "light" : "dark")}
            aria-label="Đổi giao diện sáng/tối"
            title="Đổi giao diện sáng/tối"
          >
            <Icon name={isDark ? "sun" : "moon"} />
          </button>
        </div>
      </header>
      <main className="content">
        <Outlet />
      </main>
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
    </div>
  );
}
