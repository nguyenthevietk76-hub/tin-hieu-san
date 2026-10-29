import { Fragment, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Avatar, Card, ECode, ECodes, ErrorBox, Loading, Pager } from "../components/ui";
import { Icon } from "../components/Icon";
import { useEvents } from "../lib/data";
import { downloadCsv, fmtDate, fold } from "../lib/format";
import { AGENCY, DIRECTION, E_SHORT, MEASURE } from "../lib/labels";

const PAGE = 40;
const host = (u: string) => {
  try {
    return new URL(u).hostname.replace("www.", "");
  } catch {
    return "liên kết";
  }
};
const CODES = ["E1", "E2", "E3", "E4", "E5", "E6", "E7"];

export function Events() {
  const { data, error } = useEvents();
  const [sp] = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [codes, setCodes] = useState<string[]>(sp.get("e") ? sp.get("e")!.split(",") : []);
  const [m, setM] = useState("");
  const [ag, setAg] = useState("");
  const [year, setYear] = useState("");
  const [other, setOther] = useState(false);
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<string | null>(null);

  const years = useMemo(() => [...new Set((data ?? []).map((e) => e.d.slice(0, 4)))].sort().reverse(), [data]);

  const rows = useMemo(() => {
    const f = fold(q.trim());
    return (data ?? []).filter((e) => {
      if (!other && !e.e) return false;
      if (codes.length && !codes.some((c) => e.e.split(";").includes(c))) return false;
      if (m && e.m !== m) return false;
      if (ag && e.ag !== ag) return false;
      if (year && !e.d.startsWith(year)) return false;
      if (f && !fold(`${e.t} ${e.name ?? ""} ${e.why ?? ""} ${e.title} ${e.doc ?? ""}`).includes(f)) return false;
      return true;
    });
  }, [data, q, codes, m, ag, year, other]);

  if (error) return <ErrorBox msg={error} />;
  const pages = Math.ceil(rows.length / PAGE);
  const view = rows.slice(page * PAGE, (page + 1) * PAGE);
  const toggle = (c: string) => {
    setCodes(codes.includes(c) ? codes.filter((x) => x !== c) : [...codes, c]);
    setPage(0);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Nguồn sự kiện</div>
          <h1>Sự kiện xử lý</h1>
          <p>
            Quyết định cảnh báo, kiểm soát, hạn chế, tạm ngừng giao dịch, xử phạt và hủy niêm yết – mỗi sự kiện kèm số
            văn bản, cơ quan ban hành, lý do và liên kết tới văn bản gốc trên HOSE/HNX.
          </p>
        </div>
        <button
          className="btn"
          onClick={() =>
            downloadCsv(
              "radar_su_kien.csv",
              rows.map((e) => ({
                ma_su_kien: e.id, ma: e.t, ten: e.name ?? "", ngay: e.d, co_quan: AGENCY[e.ag] ?? e.ag,
                bien_phap: MEASURE[e.m] ?? e.m, nhom: e.e, ly_do: e.why ?? "", can_cu: e.law ?? "",
                so_van_ban: e.doc ?? "", url: e.urls.join(" ; "),
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
            placeholder="Mã, lý do, số văn bản…"
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(0); }}
          />
          <select className="select" value={year} onChange={(e) => { setYear(e.target.value); setPage(0); }}>
            <option value="">Mọi năm</option>
            {years.map((y) => <option key={y}>{y}</option>)}
          </select>
          <select className="select" value={m} onChange={(e) => { setM(e.target.value); setPage(0); }}>
            <option value="">Mọi biện pháp</option>
            {Object.entries(MEASURE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select className="select" value={ag} onChange={(e) => { setAg(e.target.value); setPage(0); }}>
            <option value="">Mọi cơ quan</option>
            {Object.entries(AGENCY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button className={`btn ${other ? "on" : ""}`} onClick={() => { setOther(!other); setPage(0); }} title="Gồm cả sự kiện không thuộc nhóm E1–E7 (VD: hủy niêm yết tự nguyện để chuyển sàn)">
            Gồm sự kiện khác
          </button>
        </div>
        <div className="toolbar" style={{ gap: 6 }}>
          <span className="xs faint" style={{ marginRight: 4 }}>NHÓM</span>
          {CODES.map((c) => (
            <button key={c} className={`btn ${codes.includes(c) ? "on" : ""}`} style={{ height: 30, padding: "0 10px" }} onClick={() => toggle(c)}>
              <ECode code={c} /> <span className="small">{E_SHORT[c]}</span>
            </button>
          ))}
          {codes.length > 0 && <button className="btn" style={{ height: 30 }} onClick={() => setCodes([])}>Bỏ chọn</button>}
        </div>
        {!data ? (
          <div className="card-body"><Loading h={480} /></div>
        ) : (
          <>
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Ngày</th>
                    <th>Mã</th>
                    <th>Nhóm</th>
                    <th>Biện pháp</th>
                    <th>Lý do</th>
                    <th>Cơ quan</th>
                    <th>Văn bản</th>
                  </tr>
                </thead>
                <tbody>
                  {view.map((e) => (
                    <Fragment key={e.id}>
                      <tr className="click" onClick={() => setOpen(open === e.id ? null : e.id)}>
                        <td className="num small" style={{ whiteSpace: "nowrap" }}>{fmtDate(e.d)}</td>
                        <td>
                          <div className="firm">
                            <Avatar t={e.t} size={30} />
                            <div style={{ minWidth: 0 }}>
                              {e.in ? (
                                <Link className="ticker" to={`/c/${e.t}`} onClick={(x) => x.stopPropagation()}>{e.t}</Link>
                              ) : (
                                <span className="ticker">{e.t}</span>
                              )}
                              <div className="co-name" style={{ maxWidth: 180 }}>{e.name}</div>
                            </div>
                          </div>
                        </td>
                        <td><ECodes value={e.e} /></td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          {MEASURE[e.m] ?? e.m}
                          {e.dir === "nang_cap" && <div className="xs faint">{DIRECTION[e.dir]}</div>}
                        </td>
                        <td className="small" style={{ maxWidth: 440, minWidth: 260 }}><div className={open === e.id ? "" : "clamp3"}>{e.why || <span className="faint">{e.title}</span>}</div></td>
                        <td className="small muted">{AGENCY[e.ag] ?? e.ag}</td>
                        <td className="small num" style={{ whiteSpace: "nowrap" }}>
                          {e.urls[0] ? (
                            <a href={e.urls[0]} target="_blank" rel="noreferrer noopener" onClick={(x) => x.stopPropagation()}>
                              {(e.doc ?? "Văn bản").split(" ; ")[0]} <Icon name="external" size={11} />
                            </a>
                          ) : (
                            e.doc ?? "—"
                          )}
                        </td>
                      </tr>
                      {open === e.id && (
                        <tr>
                          <td colSpan={7} style={{ background: "var(--bg-sunken)" }}>
                            <dl className="kv">
                              <dt>Mã sự kiện</dt><dd className="mono">{e.id}</dd>
                              <dt>Tiêu đề</dt><dd>{e.title}</dd>
                              {e.law && (<><dt>Căn cứ</dt><dd>{e.law}</dd></>)}
                              <dt>Số văn bản</dt><dd className="mono">{e.doc ?? "—"}</dd>
                              <dt>Văn bản gốc</dt>
                              <dd className="links">
                                {e.urls.map((u, i) => (
                                  <a key={u} href={u} target="_blank" rel="noreferrer noopener">
                                    <Icon name="file" size={12} /> Tệp {i + 1} ({host(u)})
                                  </a>
                                ))}
                              </dd>
                            </dl>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                  {view.length === 0 && <tr><td colSpan={7} className="empty">Không có sự kiện phù hợp.</td></tr>}
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
