import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Avatar, Card, ErrorBox, Loading, RiskBadge, ScoreBar, Star, StatusBadge } from "../components/ui";
import { Icon } from "../components/Icon";
import { useCompanies } from "../lib/data";
import { downloadCsv, fmtDate } from "../lib/format";
import { useWatchlist } from "../lib/store";

export function Watchlist() {
  const { data, error } = useCompanies();
  const w = useWatchlist();
  const nav = useNavigate();
  const rows = useMemo(() => (data ?? []).filter((c) => w.list.includes(c.t)).sort((a, b) => (b.pct1 ?? -1) - (a.pct1 ?? -1)), [data, w.list]);
  const suggestions = useMemo(
    () => (data ?? []).filter((c) => c.listed && c.band1 === "very_high" && !w.list.includes(c.t)).slice(0, 6),
    [data, w.list],
  );

  if (error) return <ErrorBox msg={error} />;
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Cá nhân</div>
          <h1>Danh sách theo dõi</h1>
          <p>Nhấn biểu tượng ngôi sao ở bất kỳ doanh nghiệp nào để thêm vào đây. Danh sách được lưu trên trình duyệt này.</p>
        </div>
        <div className="row">
          {rows.length > 0 && (
            <>
              <Link className="btn" to={`/compare?t=${rows.slice(0, 4).map((r) => r.t).join(",")}`}>
                <Icon name="compare" /> So sánh
              </Link>
              <button className="btn" onClick={() => downloadCsv("radar_theo_doi.csv", rows.map((c) => ({ ma: c.t, ten: c.name, san: c.ex, diem_tuan_thu: c.pct1, diem_tai_chinh: c.pct2, trang_thai: c.status ?? "" })))}>
                <Icon name="download" /> Xuất CSV
              </button>
            </>
          )}
        </div>
      </div>
      {!data ? (
        <Loading h={300} />
      ) : rows.length === 0 ? (
        <Card>
          <div className="empty">
            <Icon name="star" size={28} />
            <p style={{ color: "var(--text)", fontWeight: 550 }}>Chưa có doanh nghiệp nào trong danh sách</p>
            <p>Gợi ý – các doanh nghiệp có rủi ro tuân thủ rất cao:</p>
            <div className="row wrap" style={{ justifyContent: "center" }}>
              {suggestions.map((c) => (
                <button key={c.t} className="btn" onClick={() => w.toggle(c.t)}>
                  + <span className="ticker">{c.t}</span>
                </button>
              ))}
            </div>
          </div>
        </Card>
      ) : (
        <Card pad={false}>
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: 36 }} />
                  <th>Doanh nghiệp</th>
                  <th>Sàn</th>
                  <th>Rủi ro tuân thủ</th>
                  <th>Rủi ro tài chính</th>
                  <th>Mức rủi ro</th>
                  <th>Trạng thái</th>
                  <th>Sự kiện gần nhất</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.t} className="click" onClick={() => nav(`/c/${c.t}`)}>
                    <td><Star t={c.t} /></td>
                    <td><div className="firm"><Avatar t={c.t} pct={c.pct1} size={30} /><div style={{ minWidth: 0 }}><div className="ticker">{c.t}</div><div className="co-name">{c.name}</div></div></div></td>
                    <td><span className="badge outline">{c.ex}</span></td>
                    <td style={{ minWidth: 140 }}><ScoreBar pct={c.pct1} /></td>
                    <td style={{ minWidth: 140 }}><ScoreBar pct={c.pct2} /></td>
                    <td>{c.listed ? <RiskBadge band={c.band1} /> : <span className="badge outline faint">Đã rời sàn</span>}</td>
                    <td><StatusBadge status={c.status} short /></td>
                    <td className="num small muted">{fmtDate(c.last_ev)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pager">
            <span>{rows.length} doanh nghiệp</span>
            <button className="btn" onClick={() => confirm("Xóa toàn bộ danh sách theo dõi?") && w.clear()}>Xóa danh sách</button>
          </div>
        </Card>
      )}
    </>
  );
}
