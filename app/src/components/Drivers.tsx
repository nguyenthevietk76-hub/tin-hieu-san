import { FEATURE_SHORT, fmtFeature } from "../lib/features";
import type { Drivers as D } from "../lib/types";

/** Contribution of each input to the log-odds, relative to the market-average firm. */
export function Drivers({ drivers, x, limit = 7 }: { drivers?: D; x?: D; limit?: number }) {
  if (!drivers) return <div className="empty">Chưa đủ lịch sử để giải thích điểm năm này.</div>;
  const items = Object.entries(drivers)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, limit);
  const max = Math.max(0.5, ...items.map(([, v]) => Math.abs(v)));
  return (
    <div>
      {items.map(([k, v]) => {
        const w = (Math.abs(v) / max) * 50;
        const up = v > 0;
        return (
          <div className="driver" key={k}>
            <div>
              <div className="lbl">{FEATURE_SHORT[k] ?? k}</div>
              <div className="val">{fmtFeature(k, x?.[k])}</div>
            </div>
            <div className="dbar" aria-hidden="true">
              <span
                style={{
                  left: up ? "50%" : `${50 - w}%`,
                  width: `${w}%`,
                  background: up ? "var(--red)" : "var(--green)",
                }}
              />
            </div>
            <div className="num small" style={{ textAlign: "right", color: up ? "var(--red)" : "var(--green)" }}>
              {up ? "+" : "−"}
              {Math.abs(v).toFixed(2)}
            </div>
          </div>
        );
      })}
      <div className="legend mt">
        <span><span className="dot" style={{ background: "var(--red)" }} /> Làm tăng rủi ro</span>
        <span><span className="dot" style={{ background: "var(--green)" }} /> Làm giảm rủi ro</span>
        <span className="faint">Đơn vị: log-odds so với doanh nghiệp trung bình</span>
      </div>
    </div>
  );
}
