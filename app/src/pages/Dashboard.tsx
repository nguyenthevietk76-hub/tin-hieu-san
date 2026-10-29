import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Carousel } from "../components/Carousel";
import { Chart } from "../components/Chart";
import { Icon } from "../components/Icon";
import { Avatar, ChangePill, Delta, ECodes, ErrorBox, Loading, RiskBadge, Seg, StatusBadge } from "../components/ui";
import { useCompanies, useCompany, useEvents, useMeta, useStats } from "../lib/data";
import { fmtDate, fmtInt } from "../lib/format";
import { AGENCY, BAND, E_COLOR, E_GROUP, E_SHORT, MEASURE, bandOf } from "../lib/labels";
import type { Company, EventRec } from "../lib/types";

type Ex = "all" | "HOSE" | "HNX";
type Range = "1" | "3" | "5" | "all";

const SECTIONS: Array<[string, string]> = [
  ["chi-so", "Chỉ số rủi ro"],
  ["nganh", "Nhóm ngành"],
  ["ma-noi-bat", "Mã nổi bật"],
  ["bien-dong", "Biến động gần đây"],
  ["xep-hang", "Xếp hạng rủi ro"],
  ["thay-doi", "Thay đổi rủi ro"],
  ["lich", "Lịch sự kiện"],
  ["danh-sach", "Danh sách"],
  ["co-cau", "Cơ cấu"],
];

const scoreColor = (pct?: number | null) => {
  const b = bandOf(pct);
  return b ? BAND[b].color : "var(--text-3)";
};

// ------------------------------------------------------------------ small building blocks
function SectionHead({ id, title, to, extra }: { id: string; title: string; to?: string; extra?: ReactNode }) {
  return (
    <div className="mk-head" id={id}>
      {to ? (
        <Link to={to} className="mk-h">
          {title}
          <Icon name="chevronRight" />
        </Link>
      ) : (
        <h2 className="mk-h">{title}</h2>
      )}
      {extra}
    </div>
  );
}

function SeeAll({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="mk-link">
      {children} ›
    </Link>
  );
}

function FirmRow({ c, right, onClick }: { c: Company; right: ReactNode; onClick: () => void }) {
  return (
    <div className="mk-row" onClick={onClick} role="link" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onClick()}>
      <Avatar t={c.t} pct={c.pct1} />
      <div className="mk-row-main">
        <div className="mk-row-name">{c.name}</div>
        <div className="row" style={{ gap: 6 }}>
          <span className="tk">{c.t}</span>
          <span className="xs faint">{c.ex}</span>
          {!c.listed && <span className="xs faint">· đã rời sàn</span>}
        </div>
      </div>
      <div className="mk-row-right">{right}</div>
    </div>
  );
}

// ------------------------------------------------------------------ page
export function Dashboard() {
  const { data: cos, error } = useCompanies();
  const { data: stats } = useStats();
  const { data: meta } = useMeta();
  const { data: events } = useEvents();
  const nav = useNavigate();
  const [ex, setEx] = useState<Ex>("all");

  const byT = useMemo(() => new Map((cos ?? []).map((c) => [c.t, c])), [cos]);
  const inEx = (t: string) => ex === "all" || byT.get(t)?.ex === ex;
  const listed = useMemo(() => (cos ?? []).filter((c) => c.listed && (ex === "all" || c.ex === ex)), [cos, ex]);
  const labelled = useMemo(() => (events ?? []).filter((e) => e.e), [events]);

  if (error) return <ErrorBox msg={error} />;
  const ready = cos && events && meta && stats;

  return (
    <>
      <div className="mk-hero">
        <h1>Rủi ro niêm yết, toàn cảnh</h1>
        <p className="muted">
          {meta ? `${fmtInt(meta.counts.tickers)} doanh nghiệp · ${fmtInt(meta.counts.events)} sự kiện xử lý · cập nhật ${fmtDate(meta.as_of)}` : "…"}
        </p>
        <Seg value={ex} options={[["all", "Tất cả sàn"], ["HOSE", "HOSE"], ["HNX", "HNX"]]} onChange={setEx} />
      </div>

      <nav className="secnav" aria-label="Các mục">
        {SECTIONS.map(([id, label]) => (
          <button key={id} onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })}>
            {label}
          </button>
        ))}
      </nav>

      {!ready ? (
        <div className="stack mt">
          <Loading h={360} />
          <Loading h={200} />
        </div>
      ) : (
        <>
          <RiskIndices events={labelled} byT={byT} asOf={meta.as_of} />
          <IndustryStrip events={labelled} listed={listed} byT={byT} asOf={meta.as_of} inEx={inEx} />
          <TopTickers listed={listed} />
          <RecentMoves events={labelled} byT={byT} inEx={inEx} asOf={meta.as_of} />

          <section className="mk-section grid g-2" id="xep-hang">
            <div>
              <SectionHead id="xep-hang-tt" title="Rủi ro tuân thủ cao nhất" to="/screener" />
              {[...listed].sort((a, b) => (b.p1 ?? 0) - (a.p1 ?? 0)).slice(0, 6).map((c) => (
                <FirmRow key={c.t} c={c} onClick={() => nav(`/c/${c.t}`)} right={<ScoreCell pct={c.pct1} p={c.p1} />} />
              ))}
              <SeeAll to="/screener">Xem toàn bộ bảng xếp hạng</SeeAll>
            </div>
            <div>
              <SectionHead id="xep-hang-tc" title="Rủi ro tài chính cao nhất" to="/screener" />
              {[...listed].sort((a, b) => (b.p2 ?? 0) - (a.p2 ?? 0)).slice(0, 6).map((c) => (
                <FirmRow key={c.t} c={c} onClick={() => nav(`/c/${c.t}`)} right={<ScoreCell pct={c.pct2} p={c.p2} />} />
              ))}
              <SeeAll to="/screener">Xem toàn bộ bảng xếp hạng</SeeAll>
            </div>
          </section>

          <Movers listed={listed} />
          <EventCalendar events={labelled} byT={byT} inEx={inEx} />

          <section className="mk-section grid g-2" id="danh-sach">
            <div>
              <SectionHead id="ds-canh-bao" title="Đang bị cảnh báo / kiểm soát" to="/screener" />
              <table className="tbl mk-tbl">
                <thead>
                  <tr><th>Mã</th><th>Trạng thái</th><th className="r">Rủi ro tuân thủ</th></tr>
                </thead>
                <tbody>
                  {listed.filter((c) => c.status).sort((a, b) => (b.pct1 ?? 0) - (a.pct1 ?? 0)).slice(0, 6).map((c) => (
                    <tr key={c.t} className="click" onClick={() => nav(`/c/${c.t}`)}>
                      <td><div className="row"><Avatar t={c.t} pct={c.pct1} size={28} /><div><div className="tk">{c.t}</div><div className="co-name" style={{ maxWidth: 180 }}>{c.name}</div></div></div></td>
                      <td><StatusBadge status={c.status} short /></td>
                      <td className="r num" style={{ color: scoreColor(c.pct1), fontWeight: 650 }}>{Math.round(c.pct1 ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <SeeAll to="/screener">Xem tất cả doanh nghiệp đang bị xử lý</SeeAll>
            </div>
            <div>
              <SectionHead id="ds-nhieu-nhat" title="Bị xử lý nhiều nhất" to="/events" />
              <table className="tbl mk-tbl">
                <thead>
                  <tr><th>Mã</th><th className="r">Số sự kiện</th><th className="r">Gần nhất</th></tr>
                </thead>
                <tbody>
                  {(cos ?? []).filter((c) => ex === "all" || c.ex === ex).sort((a, b) => b.n_lab - a.n_lab).slice(0, 6).map((c) => (
                    <tr key={c.t} className="click" onClick={() => nav(`/c/${c.t}`)}>
                      <td><div className="row"><Avatar t={c.t} pct={c.pct1} size={28} /><div><div className="tk">{c.t}</div><div className="co-name" style={{ maxWidth: 180 }}>{c.name}</div></div></div></td>
                      <td className="r num" style={{ fontWeight: 650 }}>{c.n_lab}</td>
                      <td className="r num small muted">{fmtDate(c.last_ev)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <SeeAll to="/events">Xem toàn bộ sự kiện</SeeAll>
            </div>
          </section>

          <Structure />
        </>
      )}
    </>
  );
}

function ScoreCell({ pct, p }: { pct?: number | null; p?: number | null }) {
  return (
    <div style={{ textAlign: "right" }}>
      <div className="num" style={{ color: scoreColor(pct), fontWeight: 700 }}>{pct == null ? "—" : Math.round(pct)}</div>
      <div className="xs faint num">{p == null ? "" : `${(p * 100).toFixed(1)}% / 12T`}</div>
    </div>
  );
}

// ------------------------------------------------------------------ 1. risk "indices" with a big chart
function monthKey(d: string) {
  return d.slice(0, 7);
}

function RiskIndices({ events, byT, asOf }: { events: EventRec[]; byT: Map<string, Company>; asOf: string }) {
  const [sel, setSel] = useState("all");
  const [range, setRange] = useState<Range>("5");

  const months = useMemo(() => {
    const out: string[] = [];
    const end = monthKey(asOf);
    for (let y = 2013, m = 1; ; m++) {
      if (m > 12) { m = 1; y++; }
      const k = `${y}-${String(m).padStart(2, "0")}`;
      out.push(k);
      if (k >= end) break;
    }
    return out;
  }, [asOf]);

  const defs = useMemo(() => {
    const grp = (e: EventRec, g: "comp" | "perf") => e.e.split(";").some((c) => E_GROUP[c] === g);
    const list: Array<{ k: string; label: string; code: string; f: (e: EventRec) => boolean }> = [
      { k: "all", label: "Toàn thị trường", code: "ALL", f: () => true },
      { k: "HOSE", label: "Sàn HOSE", code: "HSX", f: (e) => byT.get(e.t)?.ex === "HOSE" },
      { k: "HNX", label: "Sàn HNX", code: "HNX", f: (e) => byT.get(e.t)?.ex === "HNX" },
      { k: "comp", label: "Vi phạm tuân thủ", code: "TT", f: (e) => grp(e, "comp") },
      { k: "perf", label: "Sự kiện tài chính", code: "TC", f: (e) => grp(e, "perf") },
      { k: "ubck", label: "Xử phạt UBCKNN", code: "UB", f: (e) => e.ag === "UBCKNN" },
    ];
    return list.map((d) => {
      const per = new Array(months.length).fill(0);
      const idx = new Map(months.map((m, i) => [m, i]));
      events.forEach((e) => {
        const i = idx.get(monthKey(e.d));
        if (i != null && d.f(e)) per[i]++;
      });
      // rolling 12-month total, so every point reads like the headline number
      const roll = per.map((_, i) => per.slice(Math.max(0, i - 11), i + 1).reduce((a, b) => a + b, 0));
      const now = roll[roll.length - 1];
      const before = roll[roll.length - 13];
      return { ...d, roll, now, chg: before ? ((now - before) / before) * 100 : null };
    });
  }, [events, byT, months]);

  const cur = defs.find((d) => d.k === sel)!;
  const n = range === "all" ? months.length : Math.min(months.length, Number(range) * 12 + 1);
  const xs = months.slice(-n);
  const ys = cur.roll.slice(-n);
  const rising = ys[ys.length - 1] >= ys[0];
  const color = rising ? "var(--red)" : "var(--green)";

  const option = useMemo(
    () => ({
      grid: { left: 8, right: 8, top: 16, bottom: 4, containLabel: true },
      tooltip: { trigger: "axis", valueFormatter: (v: number) => `${v} sự kiện / 12 tháng` },
      xAxis: { type: "category", boundaryGap: false, data: xs.map((m) => `${m.slice(5)}/${m.slice(0, 4)}`) },
      yAxis: { type: "value", position: "right", scale: true },
      series: [
        {
          type: "line",
          data: ys,
          symbol: "none",
          lineStyle: { width: 2, color },
          itemStyle: { color },
          areaStyle: { color, opacity: 0.1 },
        },
      ],
    }),
    [xs.join(), ys.join(), color],
  );

  return (
    <section className="mk-section">
      <SectionHead id="chi-so" title="Chỉ số rủi ro" to="/events" />
      <div className="pills">
        {defs.map((d) => (
          <button key={d.k} className={`pill ${sel === d.k ? "on" : ""}`} onClick={() => setSel(d.k)}>
            <span className="pill-ico">{d.code}</span>
            <span>
              <span className="pill-name">{d.label}</span>
              <span className="pill-val">
                <span className="num">{fmtInt(d.now)}</span> <span className="faint xs">sự kiện</span>{" "}
                <Delta value={d.chg} risk title="So với 12 tháng trước" />
              </span>
            </span>
          </button>
        ))}
      </div>
      <div className="mk-chart">
        <Chart option={option} height={320} />
        <div className="row wrap" style={{ marginTop: 10 }}>
          <div className="seg">
            {([["1", "1N"], ["3", "3N"], ["5", "5N"], ["all", "Tất cả"]] as Array<[Range, string]>).map(([k, l]) => (
              <button key={k} className={range === k ? "on" : ""} onClick={() => setRange(k)}>{l}</button>
            ))}
          </div>
          <span className="xs faint">Số sự kiện cộng dồn 12 tháng, tính theo tháng · đường đỏ: đang tăng, xanh: đang giảm</span>
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ 2. industry cards
function IndustryStrip({ events, listed, byT, asOf, inEx }: {
  events: EventRec[]; listed: Company[]; byT: Map<string, Company>; asOf: string; inEx: (t: string) => boolean;
}) {
  const nav = useNavigate();
  const cards = useMemo(() => {
    const y1 = new Date(asOf); y1.setFullYear(y1.getFullYear() - 1);
    const y2 = new Date(asOf); y2.setFullYear(y2.getFullYear() - 2);
    const [c1, c2] = [y1.toISOString().slice(0, 10), y2.toISOString().slice(0, 10)];
    const inds = [...new Set(listed.map((c) => c.ind1))].filter(Boolean);
    return inds
      .map((ind) => {
        const firms = listed.filter((c) => c.ind1 === ind);
        const evs = events.filter((e) => byT.get(e.t)?.ind1 === ind && inEx(e.t));
        const now = evs.filter((e) => e.d >= c1).length;
        const before = evs.filter((e) => e.d >= c2 && e.d < c1).length;
        const avg = firms.reduce((s, c) => s + (c.pct1 ?? 0), 0) / Math.max(1, firms.length);
        return {
          ind, n: firms.length, now, chg: before ? ((now - before) / before) * 100 : null, avg,
          high: firms.filter((c) => c.band1 === "very_high" || c.band1 === "high").length,
        };
      })
      .sort((a, b) => b.avg - a.avg);
  }, [events, listed, byT, asOf, inEx]);

  return (
    <section className="mk-section">
      <SectionHead id="nganh" title="Nhóm ngành" to="/industries" />
      <Carousel>
        {cards.map((c) => (
          <div key={c.ind} className="mk-card" onClick={() => nav(`/screener?ind=${encodeURIComponent(c.ind)}`)}>
            <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
              <span className="pill-ico" style={{ background: scoreColor(c.avg), color: "#fff" }}>{Math.round(c.avg)}</span>
              <div style={{ minWidth: 0 }}>
                <div className="mk-card-title">{c.ind}</div>
                <div className="xs faint">{c.n} DN · {c.high} rủi ro cao</div>
              </div>
            </div>
            <div className="mk-card-val">
              <span className="num">{fmtInt(c.now)}</span> <span className="xs faint">sự kiện 12T</span>
            </div>
            <Delta value={c.chg} risk title="So với 12 tháng trước" />
          </div>
        ))}
      </Carousel>
      <div className="xs faint" style={{ marginTop: 8 }}>Số tròn: điểm rủi ro tuân thủ bình quân của ngành (0–100)</div>
    </section>
  );
}

// ------------------------------------------------------------------ 3. featured tickers with a history chart
function TopTickers({ listed }: { listed: Company[] }) {
  const top = useMemo(() => [...listed].sort((a, b) => (b.p1 ?? 0) - (a.p1 ?? 0)).slice(0, 8), [listed]);
  const [sel, setSel] = useState<string | null>(null);
  const t = sel && top.some((c) => c.t === sel) ? sel : top[0]?.t;
  const { data: d } = useCompany(t);

  const option = useMemo(() => {
    if (!d) return null;
    const yrs = d.years.map((y) => String(y.fiscal_year));
    const s1 = d.years.map((y) => (y.pct_Y1 == null ? null : Math.round(y.pct_Y1)));
    const s2 = d.years.map((y) => (y.pct_Y2 == null ? null : Math.round(y.pct_Y2)));
    if (d.info.listed) {
      yrs.push("Hiện tại");
      s1.push(d.info.pct1 == null ? null : Math.round(d.info.pct1));
      s2.push(d.info.pct2 == null ? null : Math.round(d.info.pct2));
    }
    const nums = s1.filter((v): v is number => v != null);
    const color = nums.length > 1 && nums[nums.length - 1] < nums[nums.length - 2] ? "var(--green)" : "var(--red)";
    return {
      legend: { data: ["Rủi ro tuân thủ", "Rủi ro tài chính"] },
      grid: { left: 8, right: 8, top: 34, bottom: 4, containLabel: true },
      tooltip: { trigger: "axis" },
      xAxis: { type: "category", boundaryGap: false, data: yrs },
      yAxis: { type: "value", min: 0, max: 100, position: "right" },
      series: [
        { name: "Rủi ro tuân thủ", type: "line", data: s1, symbolSize: 6, lineStyle: { width: 2, color }, itemStyle: { color }, areaStyle: { color, opacity: 0.1 } },
        { name: "Rủi ro tài chính", type: "line", data: s2, symbolSize: 5, lineStyle: { width: 1.5, type: "dashed", color: "var(--n1)" }, itemStyle: { color: "var(--n1)" } },
      ],
    };
  }, [d]);

  return (
    <section className="mk-section">
      <SectionHead id="ma-noi-bat" title="Mã nổi bật" to="/screener" />
      <div className="pills">
        {top.map((c) => (
          <button key={c.t} className={`pill ${t === c.t ? "on" : ""}`} onClick={() => setSel(c.t)}>
            <Avatar t={c.t} pct={c.pct1} />
            <span>
              <span className="pill-name">{c.t} <span className="faint xs" style={{ fontWeight: 500 }}>{c.ex}</span></span>
              <span className="pill-val">
                <span className="num" style={{ color: scoreColor(c.pct1), fontWeight: 650 }}>{Math.round(c.pct1 ?? 0)}</span>{" "}
                {c.prev1 != null && c.pct1 != null && <Delta value={Math.round(c.pct1) - Math.round(c.prev1)} unit="" digits={0} risk title="So với năm tài chính gần nhất" />}
              </span>
            </span>
          </button>
        ))}
      </div>
      <div className="mk-chart">
        {d && option ? (
          <>
            <div className="row wrap" style={{ marginBottom: 6 }}>
              <Link to={`/c/${d.info.t}`} className="tk" style={{ fontSize: 15 }}>{d.info.t}</Link>
              <span className="muted small">{d.info.name}</span>
              <RiskBadge pct={d.info.pct1} />
              <StatusBadge status={d.info.status} />
              <span className="spacer" />
              <Link to={`/c/${d.info.t}`} className="mk-link" style={{ marginTop: 0 }}>Mở hồ sơ ›</Link>
            </div>
            <Chart option={option} height={300} />
          </>
        ) : (
          <Loading h={330} />
        )}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ 4. recent moves (cards)
function RecentMoves({ events, byT, inEx, asOf }: { events: EventRec[]; byT: Map<string, Company>; inEx: (t: string) => boolean; asOf: string }) {
  const nav = useNavigate();
  const cut = new Date(asOf); cut.setDate(cut.getDate() - 120);
  const iso = cut.toISOString().slice(0, 10);
  const seen = new Set<string>();
  const items = events.filter((e) => e.d >= iso && inEx(e.t) && !seen.has(e.t) && seen.add(e.t)).slice(0, 16);
  return (
    <section className="mk-section">
      <SectionHead id="bien-dong" title="Biến động gần đây" to="/events" />
      <Carousel>
        {items.map((e) => {
          const c = byT.get(e.t);
          return (
            <div key={e.id} className="mk-card" onClick={() => (c ? nav(`/c/${e.t}`) : nav(`/events`))}>
              <div className="row" style={{ gap: 10 }}>
                <Avatar t={e.t} pct={c?.pct1} />
                <div style={{ minWidth: 0 }}>
                  <div className="tk">{e.t}</div>
                  <div className="co-name" style={{ maxWidth: 150 }}>{e.name ?? c?.name ?? ""}</div>
                </div>
              </div>
              <div className="mk-card-val small" style={{ fontWeight: 600 }}>{MEASURE[e.m] ?? e.m}</div>
              <div className="row" style={{ gap: 6 }}>
                <ECodes value={e.e} />
                <span className="xs faint num">{fmtDate(e.d)}</span>
              </div>
            </div>
          );
        })}
      </Carousel>
    </section>
  );
}

// ------------------------------------------------------------------ 5. biggest changes in risk (gainers / losers)
function Movers({ listed }: { listed: Company[] }) {
  const nav = useNavigate();
  const [m, setM] = useState<"1" | "2">("1");
  const rows = listed
    .map((c) => {
      const now = m === "1" ? c.pct1 : c.pct2;
      const prev = m === "1" ? c.prev1 : c.prev2;
      return { c, now, chg: now != null && prev != null ? Math.round(now) - Math.round(prev) : null };
    })
    .filter((r) => r.chg != null);
  const up = [...rows].sort((a, b) => b.chg! - a.chg!).slice(0, 6);
  const down = [...rows].sort((a, b) => a.chg! - b.chg!).slice(0, 6);
  const tabs = <Seg value={m} options={[["1", "Tuân thủ"], ["2", "Tài chính"]]} onChange={setM} />;
  const list = (rs: typeof rows) =>
    rs.map(({ c, now, chg }) => (
      <FirmRow
        key={c.t}
        c={c}
        onClick={() => nav(`/c/${c.t}`)}
        right={
          <div className="row" style={{ gap: 14 }}>
            <span className="num" style={{ color: scoreColor(now), fontWeight: 650 }}>{now == null ? "—" : Math.round(now)}</span>
            <ChangePill value={chg} />
          </div>
        }
      />
    ));
  return (
    <section className="mk-section grid g-2" id="thay-doi">
      <div>
        <SectionHead id="thay-doi-tang" title="Rủi ro tăng mạnh nhất" to="/screener" extra={tabs} />
        {list(up)}
        <div className="xs faint" style={{ marginTop: 8 }}>Điểm hiện tại so với điểm tại năm tài chính gần nhất</div>
      </div>
      <div>
        <SectionHead id="thay-doi-giam" title="Rủi ro giảm mạnh nhất" to="/screener" extra={tabs} />
        {list(down)}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ 6. event calendar
function EventCalendar({ events, byT, inEx }: { events: EventRec[]; byT: Map<string, Company>; inEx: (t: string) => boolean }) {
  const nav = useNavigate();
  const items = events.filter((e) => inEx(e.t)).slice(0, 18);
  return (
    <section className="mk-section">
      <SectionHead id="lich" title="Lịch sự kiện" to="/events" />
      <Carousel>
        {items.map((e) => (
          <div key={e.id} className="mk-card cal" onClick={() => (byT.has(e.t) ? nav(`/c/${e.t}`) : nav("/events"))}>
            <div className="xs faint num">{fmtDate(e.d)}</div>
            <div className="row" style={{ gap: 8, marginTop: 8 }}>
              <span className="dot" style={{ background: E_COLOR[e.e.split(";")[0]] ?? "var(--n2)" }} />
              <span className="tk">{e.t}</span>
            </div>
            <div className="co-name" style={{ maxWidth: 180 }}>{e.name ?? byT.get(e.t)?.name ?? ""}</div>
            <div className="cal-grid">
              <span className="faint">Biện pháp</span>
              <span>{MEASURE[e.m] ?? e.m}</span>
              <span className="faint">Cơ quan</span>
              <span>{AGENCY[e.ag] ?? e.ag}</span>
              <span className="faint">Nhóm</span>
              <span>{e.e.split(";").map((c) => E_SHORT[c] ?? c).join(", ")}</span>
            </div>
          </div>
        ))}
      </Carousel>
      <SeeAll to="/events">Xem tất cả sự kiện</SeeAll>
    </section>
  );
}

// ------------------------------------------------------------------ 7. composition charts
function Structure() {
  const { data: stats } = useStats();
  const { data: meta } = useMeta();

  const eventsYear = useMemo(() => {
    if (!stats) return null;
    const rows = stats.events_by_year.filter((r) => r.y >= 2014);
    const codes = ["E1", "E2", "E3", "E4", "E5", "E6", "E7"];
    return {
      legend: { data: codes.map((c) => `${c} ${E_SHORT[c]}`), type: "scroll" },
      grid: { left: 8, right: 8, top: 40, bottom: 4, containLabel: true },
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      xAxis: { type: "category", data: rows.map((r) => String(r.y)) },
      yAxis: { type: "value" },
      series: codes.map((c) => ({
        name: `${c} ${E_SHORT[c]}`,
        type: "bar",
        stack: "e",
        barMaxWidth: 28,
        itemStyle: { color: E_COLOR[c] },
        emphasis: { focus: "series" },
        data: rows.map((r) => r[c] ?? 0),
      })),
    };
  }, [stats]);

  const measures = useMemo(() => {
    if (!stats) return null;
    const rows = Object.entries(stats.events_by_measure).sort((a, b) => a[1] - b[1]);
    const total = rows.reduce((s, [, v]) => s + v, 0);
    return {
      grid: { left: 4, right: 64, top: 4, bottom: 4, containLabel: true },
      tooltip: { trigger: "axis", axisPointer: { type: "none" } },
      xAxis: { type: "value", show: false },
      yAxis: { type: "category", data: rows.map(([k]) => MEASURE[k] ?? k), axisLabel: { color: "var(--text-2)", fontSize: 12 } },
      series: [
        {
          type: "bar",
          barWidth: 14,
          itemStyle: { color: "var(--brand)" },
          label: { show: true, position: "right", color: "var(--text-2)", fontSize: 11.5, formatter: (p: { value: number }) => `${p.value}  ${((p.value / total) * 100).toFixed(0)}%` },
          data: rows.map(([, v]) => v),
        },
      ],
    };
  }, [stats]);

  return (
    <section className="mk-section grid g-21" id="co-cau">
      <div>
        <SectionHead id="co-cau-nam" title="Sự kiện theo năm và nhóm" />
        <div className="mk-chart">
          <div className="xs faint" style={{ marginBottom: 6 }}>Năm {new Date().getFullYear()} tính tới {fmtDate(meta?.as_of)} · một sự kiện có thể thuộc nhiều nhóm</div>
          {eventsYear ? <Chart option={eventsYear} height={300} /> : <Loading h={300} />}
        </div>
      </div>
      <div>
        <SectionHead id="co-cau-bp" title="Biện pháp áp dụng" />
        <div className="mk-chart">{measures ? <Chart option={measures} height={322} /> : <Loading h={322} />}</div>
      </div>
    </section>
  );
}
