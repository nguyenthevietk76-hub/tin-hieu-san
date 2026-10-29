import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Avatar, Card, ErrorBox, Loading, Pager, RiskBadge, ScoreBar, Seg, SortSelect, SortTh, Star, StatusBadge, sortBy } from "../components/ui";
import { Icon } from "../components/Icon";
import { useCompanies } from "../lib/data";
import { downloadCsv, fmtDate, fold } from "../lib/format";
import { BAND } from "../lib/labels";
import type { Band, Company } from "../lib/types";

type Key = "t" | "pct1" | "pct2" | "n_lab" | "last_ev" | "ex";
const PAGE = 50;

export function Screener() {
  const { data, error } = useCompanies();
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [ex, setEx] = useState<"all" | "HOSE" | "HNX">((sp.get("ex") as "HOSE") ?? "all");
  const [ind, setInd] = useState(sp.get("ind") ?? "");
  const [band, setBand] = useState<Band | "">((sp.get("band") as Band) ?? "");
  const [scope, setScope] = useState<"listed" | "all">("listed");
  const [onlyStatus, setOnlyStatus] = useState(false);
  const [sort, setSort] = useState<[Key, 1 | -1]>(["pct1", -1]);
  const [page, setPage] = useState(0);

  const industries = useMemo(() => [...new Set((data ?? []).map((c) => c.ind1))].filter(Boolean).sort(), [data]);

  const rows = useMemo(() => {
    const f = fold(q.trim());
    let r = (data ?? []).filter((c) => {
      if (scope === "listed" && !c.listed) return false;
      if (ex !== "all" && c.ex !== ex) return false;
      if (ind && c.ind1 !== ind) return false;
      if (band && c.band1 !== band) return false;
      if (onlyStatus && !c.status) return false;
      if (f && !fold(c.t).includes(f) && !fold(c.name).includes(f) && !fold(c.ind3 ?? "").includes(f)) return false;
      return true;
    });
    r = sortBy<Company>(r, sort[0], sort[1]);
    return r;
  }, [data, q, ex, ind, band, scope, onlyStatus, sort]);

  const pages = Math.ceil(rows.length / PAGE);
  const view = rows.slice(page * PAGE, (page + 1) * PAGE);
  const reset = () => setPage(0);

  const updateParam = (k: string, v: string) => {
    const n = new URLSearchParams(sp);
    if (v) n.set(k, v);
    else n.delete(k);
    setSp(n, { replace: true });
  };

  if (error) return <ErrorBox msg={error} />;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Sàng lọc</div>
          <h1>Bộ sàng lọc rủi ro</h1>
          <p>
            Điểm rủi ro 0–100, tô màu <strong style={{ color: "var(--red)" }}>đỏ</strong> (cao) · <strong style={{ color: "var(--yellow)" }}>vàng</strong> (trung bình) · <strong style={{ color: "var(--green)" }}>xanh</strong> (thấp): điểm 90 nghĩa là rủi ro cao hơn 90% doanh nghiệp đang niêm yết, xét theo xác suất bị xử lý trong 12 tháng tới. <strong>Tuân thủ</strong>:
            chậm công bố BCTC, xử phạt CBTT, vi phạm khác, hủy niêm yết bắt buộc. <strong>Tài chính</strong>: ý kiến
            kiểm toán, lỗ lũy kế, hủy niêm yết do kết quả kinh doanh.
          </p>
        </div>
        <button
          className="btn"
          onClick={() =>
            downloadCsv(
              "radar_sang_loc.csv",
              rows.map((c) => ({
                ma: c.t, ten: c.name, san: c.ex, nganh: c.ind1, nganh_cap3: c.ind3,
                diem_tuan_thu: c.pct1, xac_suat_tuan_thu: c.p1, muc_tuan_thu: c.band1 ? BAND[c.band1].label : "",
                diem_tai_chinh: c.pct2, xac_suat_tai_chinh: c.p2, trang_thai: c.status ?? "",
                so_su_kien: c.n_lab, su_kien_gan_nhat: c.last_ev ?? "", dang_niem_yet: c.listed ? "co" : "khong",
              })),
            )
          }
        >
          <Icon name="download" />
          Xuất CSV
        </button>
      </div>

      <Card pad={false}>
        <div className="toolbar">
          <input
            className="input input-search"
            style={{ width: 260 }}
            placeholder="Mã, tên, ngành cấp 3…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              updateParam("q", e.target.value);
              reset();
            }}
          />
          <Seg value={ex} options={[["all", "Tất cả sàn"], ["HOSE", "HOSE"], ["HNX", "HNX"]]} onChange={(v) => { setEx(v); updateParam("ex", v === "all" ? "" : v); reset(); }} />
          <select className="select" value={ind} onChange={(e) => { setInd(e.target.value); updateParam("ind", e.target.value); reset(); }}>
            <option value="">Mọi ngành</option>
            {industries.map((i) => <option key={i} value={i}>{i}</option>)}
          </select>
          <select className="select" value={band} onChange={(e) => { setBand(e.target.value as Band); updateParam("band", e.target.value); reset(); }}>
            <option value="">Mọi mức rủi ro</option>
            {(Object.keys(BAND) as Band[]).map((b) => <option key={b} value={b}>{BAND[b].label}</option>)}
          </select>
          <button className={`btn ${onlyStatus ? "on" : ""}`} onClick={() => { setOnlyStatus(!onlyStatus); reset(); }}>
            <Icon name="alert" />
            Đang bị cảnh báo/kiểm soát
          </button>
          <span className="spacer" />
          <Seg value={scope} options={[["listed", "Đang niêm yết"], ["all", "Gồm DN đã rời sàn"]]} onChange={(v) => { setScope(v); reset(); }} />
          <SortSelect
            options={[["pct1", "Rủi ro tuân thủ"], ["pct2", "Rủi ro tài chính"], ["n_lab", "Số sự kiện"], ["last_ev", "Sự kiện gần nhất"], ["t", "Mã"]]}
            sort={sort}
            setSort={(s) => { setSort(s); reset(); }}
          />
        </div>
        {!data ? (
          <div className="card-body"><Loading h={480} /></div>
        ) : (
          <>
            <div className="table-wrap">
              <table className="tbl cards compact">
                <thead>
                  <tr>
                    <th style={{ width: 36 }} />
                    <SortTh k="t" sort={sort} setSort={setSort}>Doanh nghiệp</SortTh>
                    <SortTh k="ex" sort={sort} setSort={setSort}>Sàn</SortTh>
                    <th>Ngành</th>
                    <SortTh k="pct1" sort={sort} setSort={setSort}>Rủi ro tuân thủ</SortTh>
                    <SortTh k="pct2" sort={sort} setSort={setSort}>Rủi ro tài chính</SortTh>
                    <th>Mức rủi ro</th>
                    <th>Trạng thái hiện tại</th>
                    <SortTh k="n_lab" sort={sort} setSort={setSort} className="r">Sự kiện</SortTh>
                    <SortTh k="last_ev" sort={sort} setSort={setSort}>Gần nhất</SortTh>
                  </tr>
                </thead>
                <tbody>
                  {view.map((c) => (
                    <tr key={c.t} className="click" onClick={() => nav(`/c/${c.t}`)}>
                      <td className="hide-sm"><Star t={c.t} /></td>
                      <td className="full">
                        <div className="firm">
                          <Avatar t={c.t} pct={c.pct1} size={30} />
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div className="ticker">{c.t} <span className="badge outline only-sm" style={{ height: 18, fontSize: 10.5 }}>{c.ex}</span></div>
                            <div className="co-name" style={{ maxWidth: 240 }}>{c.name}</div>
                          </div>
                          <span className="only-sm"><Star t={c.t} /></span>
                        </div>
                      </td>
                      <td className="hide-sm"><span className="badge outline">{c.ex}</span></td>
                      <td className="small muted hide-sm" title={`${c.ind1} › ${c.ind3}`}><div className="co-name" style={{ maxWidth: 180, minWidth: 120 }}>{c.ind3 || c.ind1}</div></td>
                      <td className="wide" data-label="Rủi ro tuân thủ" style={{ minWidth: 130 }}><ScoreBar pct={c.pct1} /></td>
                      <td className="wide" data-label="Rủi ro tài chính" style={{ minWidth: 130 }}><ScoreBar pct={c.pct2} /></td>
                      <td data-label="Mức">{c.listed ? <RiskBadge band={c.band1} /> : <span className="badge outline faint">Đã rời sàn</span>}</td>
                      <td data-label="Trạng thái" className={c.status ? "wide" : "hide-sm"}><StatusBadge status={c.status} short /></td>
                      <td className="r num" data-label="Sự kiện">{c.n_lab || <span className="faint">0</span>}</td>
                      <td className="num small muted" data-label="Gần nhất">{fmtDate(c.last_ev)}</td>
                    </tr>
                  ))}
                  {view.length === 0 && (
                    <tr><td colSpan={10} className="empty">Không có doanh nghiệp phù hợp bộ lọc.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <Pager page={page} pages={pages} total={rows.length} setPage={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
