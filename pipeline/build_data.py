"""
Tín Hiệu Sàn (cảnh báo sớm rủi ro niêm yết) – data pipeline.

Reads the NCKH_EWS project strictly READ-ONLY and writes every output inside
EWS_Radar/app/public/data. Nothing in the source folder is created, changed
or deleted: files are only ever opened in read mode.

    python pipeline/build_data.py                 # default source D:/NCKH_EWS
    python pipeline/build_data.py --src <folder>  # other source copy
    python pipeline/build_data.py --refresh-text  # recompute text cache
"""
from __future__ import annotations

import argparse
import gzip
import json
import math
import re
import time
import unicodedata
from concurrent.futures import ProcessPoolExecutor
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, roc_auc_score

SEED = 42
HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
OUT = ROOT / "app" / "public" / "data"
CACHE = HERE / "cache"
FIN_PATH = HERE / "ext" / "fin_vci.csv"  # written by fetch_fin.py (external source, Vietcap)

COMPLIANCE = ["E1", "E3", "E4", "E7"]
PERFORMANCE = ["E2", "E5", "E6"]
E_DEF = {
    "E1": "Chậm / không công bố báo cáo tài chính",
    "E2": "Ý kiến kiểm toán ngoại trừ, từ chối, trái ngược",
    "E3": "UBCKNN xử phạt về công bố thông tin, quản trị",
    "E4": "Hủy niêm yết bắt buộc vì lý do tuân thủ",
    "E5": "Lỗ lũy kế, vốn chủ âm, lỗ liên tiếp",
    "E6": "Hủy niêm yết bắt buộc vì kết quả kinh doanh",
    "E7": "Vi phạm tuân thủ khác (CBTT, ĐHĐCĐ, quản trị)",
}

# Lexicons for annual-report narrative signals (lower-case, NFC).
LEX = {
    "neg": [
        "thua lỗ", "lỗ lũy kế", "lỗ luỹ kế", "khó khăn", "suy giảm", "sụt giảm", "giảm sút",
        "không đạt", "chưa đạt", "nợ quá hạn", "nợ xấu", "mất khả năng", "phá sản", "giải thể",
        "tranh chấp", "khởi kiện", "vi phạm", "xử phạt", "truy thu", "thanh tra", "ngừng sản xuất",
        "tạm dừng", "đình trệ", "thiếu vốn", "âm vốn", "vốn chủ sở hữu âm", "hoạt động liên tục",
        "ngoại trừ", "chậm nộp", "chậm trả", "phong tỏa", "cưỡng chế",
    ],
    "unc": [
        "rủi ro", "không chắc chắn", "biến động", "có thể", "dự kiến", "tiềm ẩn", "bất ổn",
        "phụ thuộc", "thách thức", "chưa xác định", "chưa rõ",
    ],
    "pos": [
        "tăng trưởng", "hoàn thành", "vượt kế hoạch", "vượt chỉ tiêu", "hiệu quả", "kỷ lục",
        "lợi nhuận tăng", "doanh thu tăng", "phát triển bền vững", "ổn định", "thành công",
    ],
}
_LEX_RE = {
    k: [re.compile(r"(?<!\w)" + re.escape(w) + r"(?!\w)") for w in ws] for k, ws in LEX.items()
}
_WORD_RE = re.compile(r"\w+")


def log(msg: str) -> None:
    print(f"[{datetime.now():%H:%M:%S}] {msg}", flush=True)


# --------------------------------------------------------------------------- text
def _text_features(path: str) -> dict:
    name = Path(path).name.replace(".json.gz", "")
    ticker, fy = name.rsplit("_", 1)
    rec = {"ticker": ticker, "fiscal_year": int(fy)}
    try:
        with gzip.open(path, "rt", encoding="utf-8") as fh:
            d = json.load(fh)
    except Exception as exc:  # unreadable file: leave features empty
        rec["text_error"] = str(exc)[:120]
        return rec
    secs = d.get("sections") or []
    txt = unicodedata.normalize("NFC", "\n".join(s.get("text", "") for s in secs)).lower()
    n_words = len(_WORD_RE.findall(txt))
    rec["n_words"] = n_words
    rec["n_sections"] = int(d.get("n_narrative_sections") or 0)
    rec["section_ok"] = bool(d.get("section_ok_v2", d.get("section_ok")))
    rec["ocr_text_share"] = d.get("ocr_share")
    top = {}
    for k, pats in _LEX_RE.items():
        total = 0
        for w, p in zip(LEX[k], pats):
            c = len(p.findall(txt))
            total += c
            if k == "neg" and c:
                top[w] = c
        rec[f"txt_{k}"] = total / n_words * 10_000 if n_words else None
    rec["top_neg"] = json.dumps(dict(sorted(top.items(), key=lambda x: -x[1])[:6]), ensure_ascii=False)
    rec["sections_list"] = json.dumps(
        [{"n": s.get("name"), "c": s.get("n_chars", len(s.get("text", "")))} for s in secs],
        ensure_ascii=False,
    )
    return rec


def text_table(src: Path, refresh: bool) -> pd.DataFrame:
    CACHE.mkdir(parents=True, exist_ok=True)
    cache = CACHE / "text_features.csv"
    if cache.exists() and not refresh:
        log(f"text features: cache {cache.name}")
        return pd.read_csv(cache)
    files = sorted(str(p) for p in (src / "data/interim/sections").glob("*.json.gz"))
    log(f"text features: scanning {len(files)} section files …")
    t0 = time.time()
    with ProcessPoolExecutor() as ex:
        rows = list(ex.map(_text_features, files, chunksize=16))
    df = pd.DataFrame(rows)
    df.to_csv(cache, index=False, encoding="utf-8")
    log(f"text features: {len(df)} rows in {time.time() - t0:.0f}s")
    return df


# --------------------------------------------------------------------------- events
def load_events(src: Path) -> pd.DataFrame:
    e = pd.read_csv(src / "labels/events_master_final.csv", dtype=str)
    e = e[e["loai_nhan"].isin(["su_kien", "khong"])].copy()
    e["date"] = pd.to_datetime(e["ngay_su_kien"], errors="coerce")
    e = e[e["date"].notna()]
    e["codes"] = e["nhan_cuoi_E"].fillna("").map(
        lambda s: [c for c in s.split(";") if re.fullmatch(r"E[1-7]", c.strip())]
    )
    return e


def history_features(frame: pd.DataFrame, ev: pd.DataFrame, origin_col: str) -> pd.DataFrame:
    """Counts of labelled events strictly before origin (no look-ahead)."""
    lab = ev[ev["codes"].map(len) > 0][["ticker", "date", "codes"]]
    by_t = {t: g for t, g in lab.groupby("ticker")}
    out = []
    for t, o in zip(frame["ticker"], frame[origin_col]):
        g = by_t.get(t)
        if g is None or pd.isna(o):
            out.append((0, 0, 0, 0))
            continue
        past = g[g["date"] < o]
        w3 = past[past["date"] >= o - pd.DateOffset(years=3)]
        w1 = past[past["date"] >= o - pd.DateOffset(years=1)]
        comp = sum(any(c in COMPLIANCE for c in cs) for cs in w3["codes"])
        perf = sum(any(c in PERFORMANCE for c in cs) for cs in w3["codes"])
        out.append((comp, perf, int(len(w1) > 0), len(past)))
    h = pd.DataFrame(out, columns=["ev_comp_3y", "ev_perf_3y", "ev_any_1y", "ev_all_past"], index=frame.index)
    return h


# --------------------------------------------------------------------------- financials
FIN_COLS = ["current_assets", "total_assets", "liabilities", "current_liabilities", "st_borrowings", "lt_borrowings",
            "equity", "paid_in_capital", "retained_earnings", "net_revenue", "gross_profit", "interest_expense",
            "operating_profit", "profit_before_tax", "net_income", "cfo"]


def load_fin() -> pd.DataFrame:
    """Annual statements (fetch_fin.py) plus the ratios used by the model."""
    if not FIN_PATH.exists():
        log(f"financials: {FIN_PATH.name} missing – run pipeline/fetch_fin.py; financial features left empty")
        return pd.DataFrame(columns=["ticker", "fiscal_year", "public_date"] + FIN_COLS)
    f = pd.read_csv(FIN_PATH).sort_values(["ticker", "fiscal_year"]).reset_index(drop=True)
    f["public_date"] = pd.to_datetime(f["public_date"], errors="coerce")
    # a date before the fiscal year even ended is a source error: never treat it as published
    f.loc[f["public_date"] <= pd.to_datetime(f["fiscal_year"].astype(str) + "-12-31"), "public_date"] = pd.NaT
    ta = f["total_assets"].where(f["total_assets"] > 0)
    f["roa"] = (f["net_income"] / ta).clip(-0.5, 0.5)
    f["cfo_ta"] = (f["cfo"] / ta).clip(-0.5, 0.5)
    return f


def fin_features(frame: pd.DataFrame, fin: pd.DataFrame, origin_col: str, expected: pd.Series) -> pd.DataFrame:
    """Latest statements published strictly before origin (no look-ahead).

    `expected` is the fiscal year whose statements should be out by origin; anything
    older than expected-1 counts as missing. Missing values are imputed later with no
    missing flag: VCI lacks some later-delisted firms, so missingness would leak the future."""
    by_t = {t: g for t, g in fin.groupby("ticker")}
    rows = []
    for t, o, exp in zip(frame["ticker"], frame[origin_col], expected):
        rec = dict.fromkeys(FIN_FEAT, np.nan) | {"fin_fy": np.nan}
        g = by_t.get(t)
        if g is not None and not pd.isna(o):
            ok = g[(g["public_date"] <= o) & g["fiscal_year"].between(exp - 1, exp)]
            if len(ok):
                r = ok.iloc[-1]
                rec.update({k: r[k] for k in FIN_FEAT})
                rec["fin_fy"] = r["fiscal_year"]
        rows.append(rec)
    return pd.DataFrame(rows, index=frame.index)


def industry_forecast(df: pd.DataFrame, live: pd.DataFrame, as_of: pd.Timestamp) -> dict:
    """Expected number of listed firms with a new event in the next 12 months, by industry.

    The count is the sum of the firms' model probabilities (a Poisson-binomial mean), with
    a 90% interval from its variance. Walk-forward years 2019–2024 give the backtest: the
    same sum computed from out-of-sample probabilities against the events that happened.
    Its overall actual/predicted ratio (k) recalibrates the live forecast."""
    bt = df[df["fiscal_year"].between(2019, 2024)]
    calib = {t: float(bt[t].sum() / bt[f"p_{t}"].sum()) for t in ["Y1", "Y2"]}
    # Firms are not independent: whole years run hot or cold (2021: twice the expected late
    # filings). The spread of actual/expected across backtest years widens the interval.
    yr = bt.groupby("fiscal_year")[["Y1", "Y2", "p_Y1", "p_Y2"]].sum()
    shock = {t: float((yr[t] / (yr[f"p_{t}"] * calib[t])).std()) for t in ["Y1", "Y2"]}

    def summary(p: pd.Series, k: float, s: float) -> dict:
        p = (p * k).clip(0, 1)
        m = float(p.sum())
        sd = float(np.sqrt((p * (1 - p)).sum() + (s * m) ** 2))
        return {"exp": round(m, 1), "lo": max(0, int(np.floor(m - 1.645 * sd))), "hi": int(np.ceil(m + 1.645 * sd)),
                "rate": round(m / len(p), 4) if len(p) else None}

    def backtest(g: pd.DataFrame) -> list[dict]:
        return [{"fy": int(fy), "n": int(len(x)),
                 "pred_y1": round(float(x["p_Y1"].sum()), 1), "act_y1": int(x["Y1"].sum()),
                 "pred_y2": round(float(x["p_Y2"].sum()), 1), "act_y2": int(x["Y2"].sum())}
                for fy, x in g.groupby("fiscal_year")]

    hist = df.groupby(["industry_l1", "fiscal_year"]).agg(n=("ticker", "size"), y1=("Y1", "mean"), y2=("Y2", "mean"))
    inds = []
    for ind, g in live.groupby("industry_l1"):
        top = g.assign(t=g.index).sort_values("live_p_Y1", ascending=False)
        h = hist.loc[ind] if ind in hist.index.get_level_values(0) else None
        recent = df[(df["industry_l1"] == ind) & df["fiscal_year"].between(2022, 2024)]
        inds.append({
            "ind": ind, "n": int(len(g)),
            "Y1": summary(g["live_p_Y1"], calib["Y1"], shock["Y1"]), "Y2": summary(g["live_p_Y2"], calib["Y2"], shock["Y2"]),
            # actual event rate over the last three labelled years, to read the forecast as a trend
            "base_y1": round(float(recent["Y1"].mean()), 4) if len(recent) else None,
            "base_y2": round(float(recent["Y2"].mean()), 4) if len(recent) else None,
            "hist": [{"fy": int(fy), "n": int(r["n"]), "y1": round(float(r["y1"]), 4), "y2": round(float(r["y2"]), 4)}
                     for fy, r in h.iterrows()] if h is not None else [],
            "top_y1": [{"t": t, "p": round(float(p) * calib["Y1"], 3)} for t, p in zip(top["t"][:5], top["live_p_Y1"][:5])],
            "top_y2": [{"t": t, "p": round(float(p) * calib["Y2"], 3)}
                       for t, p in g["live_p_Y2"].sort_values(ascending=False)[:5].items()],
            "backtest": backtest(bt[bt["industry_l1"] == ind]),
        })
    inds.sort(key=lambda r: -r["Y1"]["exp"] - r["Y2"]["exp"])

    # backtest accuracy at industry level: error of the industry-year counts
    by_iy = bt.groupby(["industry_l1", "fiscal_year"]).agg(p1=("p_Y1", "sum"), a1=("Y1", "sum"), p2=("p_Y2", "sum"), a2=("Y2", "sum"))
    acc = {t: {"mae": round(float((by_iy[f"p{i}"] * calib[t] - by_iy[f"a{i}"]).abs().mean()), 2),
               "corr": round(float(np.corrcoef(by_iy[f"p{i}"], by_iy[f"a{i}"])[0, 1]), 3)}
           for i, t in [(1, "Y1"), (2, "Y2")]}
    return {
        "as_of": as_of.strftime("%Y-%m-%d"),
        "horizon_end": (as_of + pd.DateOffset(months=12)).strftime("%Y-%m-%d"),
        "calib": {t: round(k, 3) for t, k in calib.items()},
        "shock": {t: round(v, 3) for t, v in shock.items()},
        "market": {"n": int(len(live)), "Y1": summary(live["live_p_Y1"], calib["Y1"], shock["Y1"]),
                   "Y2": summary(live["live_p_Y2"], calib["Y2"], shock["Y2"])},
        "backtest": backtest(bt),
        "accuracy": acc,
        "industries": inds,
    }


def finance_summary(fin: pd.DataFrame, companies: list[dict], as_of: pd.Timestamp) -> dict:
    """Latest published annual statements per firm, checked against the mandatory
    delisting thresholds of Decree 155/2020 (negative equity, accumulated losses above
    paid-in capital, three consecutive loss years) and the steps just before them."""
    info = {c["t"]: c for c in companies}
    f = fin[fin["public_date"] <= as_of].sort_values(["ticker", "fiscal_year"]).copy()
    ta = f["total_assets"].where(f["total_assets"] > 0)
    eq_pos = f["equity"].where(f["equity"] > 0)
    # shown as-is: the model's clipped roa / cfo_ta would misreport extreme firms
    f["roa"] = f["net_income"] / ta
    f["cfo_ta"] = f["cfo"] / ta
    f["roe"] = f["net_income"] / eq_pos
    f["lev"] = f["liabilities"] / ta
    f["cr"] = f["current_assets"] / f["current_liabilities"].where(f["current_liabilities"] > 0)
    # accumulated loss as a share of paid-in capital (0 when retained earnings are positive)
    f["accum"] = (-f["retained_earnings"]).clip(lower=0) / f["paid_in_capital"].where(f["paid_in_capital"] > 0)
    f["is_loss"] = f["net_income"] < 0
    streak, prev = [], (None, None)
    for t, fy, lo in zip(f["ticker"], f["fiscal_year"], f["is_loss"]):
        s = streak[-1] if prev == (t, fy - 1) else 0
        streak.append(s + 1 if lo else 0)
        prev = (t, fy)
    f["streak"] = streak
    f["rev_prev"] = f.groupby("ticker")["net_revenue"].shift()
    f.loc[f.groupby("ticker")["fiscal_year"].diff() != 1, "rev_prev"] = np.nan
    f["rev_g"] = (f["net_revenue"] / f["rev_prev"].where(f["rev_prev"] > 0) - 1).clip(-1, 5)

    def check(r) -> tuple[str | None, list[str]]:
        breach, near = [], []
        if r["equity"] < 0:
            breach.append("Vốn chủ sở hữu âm")
        if r["accum"] > 1:
            breach.append("Lỗ lũy kế vượt vốn góp")
        elif r["accum"] >= 0.5:
            near.append("Lỗ lũy kế ≥ 50% vốn góp")
        if r["streak"] >= 3:
            breach.append(f"Lỗ {int(r['streak'])} năm liên tiếp")
        elif r["streak"] == 2:
            near.append("Lỗ 2 năm liên tiếp")
        return ("breach" if breach else "near" if near else None), breach + near

    by_year = []
    for fy, g in f.groupby("fiscal_year"):
        flags = [check(r)[0] for _, r in g.iterrows()]
        by_year.append({
            "fy": int(fy), "n": int(len(g)), "loss": int(g["is_loss"].sum()),
            "neg_eq": int((g["equity"] < 0).sum()), "accum_cap": int((g["accum"] > 1).sum()),
            "streak3": int((g["streak"] >= 3).sum()),
            "breach": flags.count("breach"), "near": flags.count("near"),
        })

    rows = []
    for t, g in f.groupby("ticker"):
        if t not in info:
            continue
        r, c = g.iloc[-1], info[t]
        flag, why = check(r)
        rows.append({k: clean(v) for k, v in {
            "t": t, "name": c["name"], "ex": c["ex"], "ind1": c["ind1"], "ind3": c["ind3"],
            "listed": c["listed"], "status": c["status"], "pct2": c.get("pct2"),
            "fy": r["fiscal_year"], "pub": r["public_date"],
            "rev": r["net_revenue"], "ni": r["net_income"], "ta": r["total_assets"], "eq": r["equity"],
            "cap": r["paid_in_capital"], "re": r["retained_earnings"], "cfo": r["cfo"],
            "rev_g": r["rev_g"], "roa": r["roa"], "roe": r["roe"], "lev": r["lev"], "cr": r["cr"],
            "cfo_ta": r["cfo_ta"], "accum": r["accum"], "streak": r["streak"],
        }.items()} | {"flag": flag, "why": why, "ni_hist": [[int(y), clean(v)] for y, v in zip(g["fiscal_year"], g["net_income"])]})
    return {"as_of": as_of.strftime("%Y-%m-%d"), "rows": rows, "by_year": by_year}


# --------------------------------------------------------------------------- model
FEATURES = {
    "ev_comp_3y": "Số sự kiện tuân thủ (E1/E3/E4/E7) trong 3 năm trước",
    "ev_perf_3y": "Số sự kiện kết quả kinh doanh (E2/E5/E6) trong 3 năm trước",
    "ev_any_1y": "Có sự kiện xử lý trong 12 tháng trước",
    "prior_status": "Đang trong diện cảnh báo/kiểm soát tại thời điểm đánh giá",
    "pub_delay": "Số ngày từ kết thúc niên độ tới khi công bố BCTN",
    "no_pub_date": "Không xác định được ngày công bố BCTN",
    "no_report": "Không có BCTN trong kho dữ liệu",
    "ocr_share": "Tỷ lệ trang scan (cần OCR) của BCTN",
    "log_pages": "Độ dài BCTN (log số trang)",
    "hnx": "Niêm yết trên HNX",
    "txt_neg": "Mật độ từ ngữ tiêu cực trong BCTN (/10.000 từ)",
    "txt_unc": "Mật độ từ ngữ bất định (/10.000 từ)",
    "txt_pos": "Mật độ từ ngữ tích cực (/10.000 từ)",
    "no_text": "Không trích được văn bản thuyết minh",
    # From the latest annual statements published before origin. Other ratios
    # (negative equity, accumulated losses, loss streak, leverage, liquidity, late
    # statements) were tried and lowered walk-forward AUC, so they are left out.
    "roa": "Lợi nhuận sau thuế / tổng tài sản (BCTC năm gần nhất)",
    "cfo_ta": "Lưu chuyển tiền thuần từ HĐKD / tổng tài sản (BCTC năm gần nhất)",
}
FEAT = list(FEATURES)
FIN_FEAT = ["roa", "cfo_ta"]


def design_matrix(df: pd.DataFrame, fill: dict | None = None) -> tuple[pd.DataFrame, dict]:
    X = pd.DataFrame(index=df.index)
    X["ev_comp_3y"] = df["ev_comp_3y"].clip(upper=6)
    X["ev_perf_3y"] = df["ev_perf_3y"].clip(upper=6)
    X["ev_any_1y"] = df["ev_any_1y"]
    X["prior_status"] = df["prior_status"].fillna(0)
    X["no_pub_date"] = df["pub_delay"].isna().astype(int)
    X["pub_delay"] = df["pub_delay"].clip(0, 400)
    X["no_report"] = (~df["has_pdf"].astype(bool)).astype(int)
    X["ocr_share"] = df["ocr_share"]
    X["log_pages"] = np.log1p(df["n_pages"])
    X["hnx"] = (df["exchange"] == "HNX").astype(int)
    X["no_text"] = df["n_words"].fillna(0).lt(500).astype(int)
    for k in ["txt_neg", "txt_unc", "txt_pos"]:
        X[k] = df[k].where(X["no_text"] == 0).clip(upper=df[k].quantile(0.99))
    for k in FIN_FEAT:
        X[k] = df[k]
    if fill is None:
        fill = {c: float(X[c].median()) for c in X.columns}
    X = X.fillna(fill)
    return X[FEAT], fill


# Each model keeps the event-history count of its own group only, so the two
# history counts never offset each other in the explanation shown to users.
TARGET_FEATS = {
    "Y1": [f for f in FEAT if f != "ev_perf_3y"],
    "Y2": [f for f in FEAT if f != "ev_comp_3y"],
}


class Model:
    def __init__(self, X: pd.DataFrame, y: pd.Series, feats: list[str]):
        self.feats = feats
        X = X[feats]
        self.mu = X.mean()
        # a column that is constant in training (e.g. financials before the source starts)
        # can have a float-noise std like 1e-17: treat it as zero, not as a huge scale factor
        self.sd = X.std().mask(lambda s: s < 1e-9, 1)
        self.lr = LogisticRegression(C=0.5, max_iter=2000, random_state=SEED)
        self.lr.fit((X - self.mu) / self.sd, y)

    def proba(self, X):
        return self.lr.predict_proba((X[self.feats] - self.mu) / self.sd)[:, 1]

    def _full(self, arr: np.ndarray) -> np.ndarray:
        """Spread per-model columns back onto FEAT order, NaN where a feature is unused."""
        out = np.full(arr.shape[:-1] + (len(FEAT),), np.nan)
        for j, f in enumerate(self.feats):
            out[..., FEAT.index(f)] = arr[..., j]
        return out

    def contrib(self, X) -> np.ndarray:
        return self._full(((X[self.feats] - self.mu) / self.sd).values * self.lr.coef_[0])

    def coef(self) -> dict:
        return {f: round(float(c), 4) for f, c in zip(self.feats, self.lr.coef_[0])}


def metrics(y, p) -> dict:
    y, p = np.asarray(y), np.asarray(p)
    if y.sum() == 0 or y.sum() == len(y):
        return {"n": int(len(y)), "pos": int(y.sum())}
    k = max(1, int(round(len(p) * 0.1)))
    top = np.argsort(-p)[:k]
    base = y.mean()
    return {
        "n": int(len(y)),
        "pos": int(y.sum()),
        "base_rate": round(float(base), 4),
        "auc": round(float(roc_auc_score(y, p)), 4),
        "pr_auc": round(float(average_precision_score(y, p)), 4),
        "top10_precision": round(float(y[top].mean()), 4),
        "top10_lift": round(float(y[top].mean() / base), 2),
        "top10_recall": round(float(y[top].sum() / y.sum()), 4),
    }


def band(pct: float) -> str:
    if pct >= 90:
        return "very_high"
    if pct >= 75:
        return "high"
    if pct >= 50:
        return "medium"
    return "low"


# --------------------------------------------------------------------------- main
def clean(v):
    if v is pd.NaT:
        return None
    if isinstance(v, (float, np.floating)):
        return None if math.isnan(v) else round(float(v), 4)
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, (np.bool_,)):
        return bool(v)
    if isinstance(v, pd.Timestamp):
        return None if pd.isna(v) else v.strftime("%Y-%m-%d")
    return v


def records(df: pd.DataFrame) -> list[dict]:
    return [{k: clean(v) for k, v in r.items()} for r in df.to_dict("records")]


def dump(obj, rel: str) -> None:
    p = OUT / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    with open(p, "w", encoding="utf-8") as fh:
        json.dump(obj, fh, ensure_ascii=False, separators=(",", ":"))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default="D:/NCKH_EWS")
    ap.add_argument("--refresh-text", action="store_true")
    a = ap.parse_args()
    src = Path(a.src)
    t0 = time.time()
    # Latest listing snapshot (file names end in _YYYYMMDD); the live score is
    # evaluated at the data cut-off, not at the day the pipeline happens to run.
    snaps = sorted((src / "data/raw/listing").glob("vietstock_danh_sach_niem_yet_*.csv"))
    snap = snaps[-1].stem.rsplit("_", 1)[1]
    listing_date = pd.Timestamp(snap)

    # ---- frame
    sf = pd.read_csv(src / "data/processed/sample_frame_v2.csv")
    lab = pd.read_csv(src / "labels/labels_Y1_Y2.csv")
    org = pd.read_csv(src / "data/processed/origin.csv")
    pdf = pd.read_csv(src / "data/processed/pdf_frame_v2.csv")
    df = sf.merge(lab, on=["ticker", "fiscal_year"], how="left", validate="1:1")
    df = df.merge(
        org[["ticker", "fiscal_year", "bctn_published_at", "fye_month", "origin_source"]],
        on=["ticker", "fiscal_year"], how="left", validate="1:1",
    )
    df = df.merge(
        pdf[["ticker", "fiscal_year", "pdf_type", "ocr_share", "n_pages", "pdf_source"]],
        on=["ticker", "fiscal_year"], how="left", validate="1:1",
    )
    df["origin"] = pd.to_datetime(df["origin"])
    pub = pd.to_datetime(df["bctn_published_at"], errors="coerce")
    fye = pd.to_datetime(
        df["fiscal_year"].astype(str) + "-" + df["fye_month"].fillna(12).astype(int).astype(str) + "-01"
    ) + pd.offsets.MonthEnd(0)
    df["fye"] = fye
    df["pub_date"] = pub.dt.normalize()
    df["pub_delay"] = (pub - fye).dt.days
    df.loc[df["pub_delay"] < 0, "pub_delay"] = np.nan
    log(f"frame: {len(df)} firm-years, {df.ticker.nunique()} tickers")

    tx = text_table(src, a.refresh_text)
    df = df.merge(tx, on=["ticker", "fiscal_year"], how="left", validate="1:1")

    ev = load_events(src)
    df = df.join(history_features(df, ev, "origin"))
    events_last = ev["date"].max().normalize()
    as_of = max(listing_date, events_last)
    log(f"events: {len(ev)} usable records; data as of {as_of:%Y-%m-%d}")

    fin = load_fin()
    df = df.join(fin_features(df, fin, "origin", df["fiscal_year"]))
    log(f"financials: {len(fin)} statements, matched to {int(df['fin_fy'].notna().sum())} firm-years")

    X, fill = design_matrix(df)

    # ---- walk-forward scoring: year T scored by a model trained on years <= T-2
    res = {}
    for target in ["Y1", "Y2"]:
        df[f"p_{target}"] = np.nan
        contrib = np.full((len(df), len(FEAT)), np.nan)
        main_mask = pd.Series(True, index=df.index)  # app: train on all firm-years, prior_status is a feature
        for T in range(2017, 2025):
            tr = main_mask & (df["fiscal_year"] <= T - 2)
            m = Model(X[tr], df.loc[tr, target], TARGET_FEATS[target])
            sc = df["fiscal_year"] == T
            df.loc[sc, f"p_{target}"] = m.proba(X[sc])
            contrib[sc.values] = m.contrib(X[sc])
        df[f"c_{target}"] = list(contrib)
        oos = main_mask & df["fiscal_year"].between(2019, 2024)
        per_year = {
            int(T): metrics(df.loc[oos & (df.fiscal_year == T), target], df.loc[oos & (df.fiscal_year == T), f"p_{target}"])
            for T in range(2019, 2025)
        }
        final = Model(X[main_mask], df.loc[main_mask, target], TARGET_FEATS[target])
        res[target] = {
            "oos": metrics(df.loc[oos, target], df.loc[oos, f"p_{target}"]),
            "per_year": per_year,
            "final": final,
        }
        log(f"{target}: walk-forward AUC {res[target]['oos'].get('auc')} (2019–2024)")

    # percentile within year
    for target in ["Y1", "Y2"]:
        df[f"pct_{target}"] = df.groupby("fiscal_year")[f"p_{target}"].rank(pct=True) * 100

    # ---- live now-cast for currently listed HOSE/HNX firms (origin = data cut-off)
    listing = pd.read_csv(src / f"data/raw/listing/vietstock_danh_sach_niem_yet_{snap}.csv", dtype=str)
    listing = listing.rename(columns={"Mã CK": "ticker", "Tên công ty": "name_now", "Sàn": "exchange_now",
                                      "Ngày GDĐT": "first_trade"})
    special = pd.read_csv(src / f"data/raw/listing/vietstock_theo_doi_dac_biet_{snap}.csv", dtype=str)
    special = special.rename(columns={"Mã CK": "ticker", "Trạng thái": "status_now"})[["ticker", "status_now"]]
    delist = pd.read_csv(src / f"data/raw/listing/vietstock_huy_niem_yet_{snap}.csv", dtype=str)
    delist = delist.rename(columns={"Mã CK": "ticker", "Ngày GDCC": "last_trade", "Sàn GD trước khi hủy": "delist_from",
                                    "file_title": "delist_title", "file_url": "delist_url"})
    delist = delist.drop_duplicates("ticker")[["ticker", "last_trade", "delist_from", "delist_title", "delist_url"]]

    latest = df.sort_values("fiscal_year").groupby("ticker").tail(1).copy()
    live = latest.merge(listing[["ticker", "exchange_now", "name_now", "first_trade"]], on="ticker", how="left")
    live = live.merge(special, on="ticker", how="left")
    live = live[live["exchange_now"].isin(["HOSE", "HNX"])].copy()
    live["origin_live"] = as_of
    hl = history_features(live, ev, "origin_live")
    for c in hl:
        live[c] = hl[c].values
    live["prior_status"] = live["status_now"].notna().astype(int)
    live["exchange"] = live["exchange_now"]
    # annual statements of year Y are due by the end of April of Y+1 at the latest
    due_fy = as_of.year - 1 if (as_of.month, as_of.day) > (4, 30) else as_of.year - 2
    fl = fin_features(live, fin, "origin_live", pd.Series(due_fy, index=live.index))
    for c in fl:
        live[c] = fl[c].values
    XL, _ = design_matrix(live, fill)
    for target in ["Y1", "Y2"]:
        live[f"live_p_{target}"] = res[target]["final"].proba(XL)
        live[f"live_c_{target}"] = list(res[target]["final"].contrib(XL))
        live[f"live_pct_{target}"] = live[f"live_p_{target}"].rank(pct=True) * 100
    live = live.set_index("ticker")
    log(f"live now-cast: {len(live)} listed HOSE/HNX firms")

    # ---- financials shown on company pages (external source, see fetch_fin.py)
    fin_show = fin[["ticker", "fiscal_year", "public_date"] + FIN_COLS]

    # ---- per-company files
    ev_pub = ev.copy()
    ev_pub["urls"] = ev_pub["url"].fillna("").map(lambda s: [u.strip() for u in s.split(" ; ") if u.strip()])
    ev_cols = {"event_id": "id", "ticker": "t", "ngay_su_kien": "d", "co_quan": "ag", "bien_phap": "m", "huong": "dir",
               "nhan_cuoi_E": "e", "ly_do_tom_tat": "why", "can_cu_dieu_khoan": "law", "so_van_ban": "doc",
               "tieu_de": "title", "urls": "urls"}
    ev_out = ev_pub[list(ev_cols)].rename(columns=ev_cols).sort_values("d", ascending=False)
    ev_out["e"] = ev_out["e"].where(ev_out["e"] != "KHONG", "")
    ev_out["title"] = ev_out["title"].fillna("").map(lambda s: s.split(" || ")[0][:220])

    names = df.groupby("ticker")["company"].last()
    by_ev = {t: g for t, g in ev_out.groupby("t")}
    companies = []
    year_cols = ["fiscal_year", "exchange", "origin", "pub_date", "pub_delay", "has_pdf", "pdf_type", "n_pages",
                 "ocr_share", "pdf_source", "n_words", "n_sections", "txt_neg", "txt_unc", "txt_pos", "top_neg",
                 "ev_comp_3y", "ev_perf_3y", "ev_any_1y", "prior_status", "Y1", "Y2", "Y_all",
                 "n_E1", "n_E2", "n_E3", "n_E4", "n_E5", "n_E6", "n_E7", "p_Y1", "p_Y2", "pct_Y1", "pct_Y2", "fin_fy"]
    for t, g in df.sort_values("fiscal_year").groupby("ticker"):
        g = g.copy()
        yrs = records(g[year_cols])
        for r, c1, c2, xs in zip(yrs, g["c_Y1"], g["c_Y2"], X.loc[g.index].values):
            r["top_neg"] = json.loads(r["top_neg"]) if r.get("top_neg") else {}
            if not np.isnan(c1).all():
                r["drivers_Y1"] = {f: round(float(v), 3) for f, v in zip(FEAT, c1) if not np.isnan(v)}
                r["drivers_Y2"] = {f: round(float(v), 3) for f, v in zip(FEAT, c2) if not np.isnan(v)}
            r["x"] = {f: round(float(v), 3) for f, v in zip(FEAT, xs)}
        last = g.iloc[-1]
        lv = live.loc[t] if t in live.index else None
        e_t = by_ev.get(t)
        info = {
            "t": t,
            "name": names[t],
            "ex": lv["exchange_now"] if lv is not None else last["exchange"],
            "ind1": last["industry_l1"], "ind2": last["industry_l2"], "ind3": last["industry_l3"],
            "y0": int(g.fiscal_year.min()), "y1": int(g.fiscal_year.max()),
            "listed": lv is not None,
            "status": (lv["status_now"] if lv is not None and isinstance(lv["status_now"], str) else None),
            "n_ev": int(len(e_t)) if e_t is not None else 0,
            "n_lab": int(sum(1 for x in (e_t["e"] if e_t is not None else []) if x)),
            "last_ev": e_t["d"].max() if e_t is not None else None,
            "y1_years": int(g["Y1"].sum()), "y2_years": int(g["Y2"].sum()),
            "reports": int(g["has_pdf"].sum()),
            # score at the latest fiscal year, for "change in risk" lists
            "prev1": last["pct_Y1"], "prev2": last["pct_Y2"],
        }
        if lv is not None:
            info.update({
                "p1": round(float(lv["live_p_Y1"]), 4), "p2": round(float(lv["live_p_Y2"]), 4),
                "pct1": round(float(lv["live_pct_Y1"]), 1), "pct2": round(float(lv["live_pct_Y2"]), 1),
                "band1": band(lv["live_pct_Y1"]), "band2": band(lv["live_pct_Y2"]),
            })
        companies.append({k: clean(v) for k, v in info.items()})
        detail = {
            "info": companies[-1],
            "years": yrs,
            "events": records(e_t) if e_t is not None else [],
            "fin": records(fin_show[fin_show.ticker == t].drop(columns="ticker")),
        }
        if lv is not None:
            detail["live"] = {
                "as_of": as_of.strftime("%Y-%m-%d"),
                "x": {f: round(float(v), 3) for f, v in zip(FEAT, XL.loc[XL.index[list(live.index).index(t)]].values)},
                "drivers_Y1": {f: round(float(v), 3) for f, v in zip(FEAT, lv["live_c_Y1"]) if not np.isnan(v)},
                "drivers_Y2": {f: round(float(v), 3) for f, v in zip(FEAT, lv["live_c_Y2"]) if not np.isnan(v)},
            }
        if t in set(delist.ticker):
            detail["delist"] = {k: clean(v) for k, v in delist[delist.ticker == t].iloc[0].items() if k != "ticker"}
        dump(detail, f"company/{t}.json")
    dump(companies, "companies.json")
    log(f"companies: {len(companies)} files")

    # events feed: attach company name where known (incl. non-sample tickers from listing)
    nm = dict(zip(listing["ticker"], listing["name_now"]))
    nm.update(names.to_dict())
    ev_out["name"] = ev_out["t"].map(nm)
    ev_out["in"] = ev_out["t"].isin(names.index).astype(int)
    dump(records(ev_out), "events.json")

    # ---- dashboard aggregates
    labelled = ev_out[ev_out["e"] != ""].copy()
    labelled["y"] = labelled["d"].str[:4].astype(int)
    rows = []
    for _, r in labelled.iterrows():
        for c in r["e"].split(";"):
            rows.append({"y": r["y"], "e": c, "m": r["m"], "ag": r["ag"]})
    lx = pd.DataFrame(rows)
    ev_year = lx.pivot_table(index="y", columns="e", aggfunc="size", fill_value=0).reset_index()
    by_measure = ev_out.groupby("m").size().sort_values(ascending=False)
    by_agency = ev_out.groupby("ag").size().sort_values(ascending=False)
    cov = df.groupby(["fiscal_year", "exchange"]).agg(n=("ticker", "size"), pdf=("has_pdf", "sum")).reset_index()
    lab_year = df.groupby("fiscal_year").agg(n=("ticker", "size"), y1=("Y1", "sum"), y2=("Y2", "sum"),
                                              yall=("Y_all", "sum"), prior=("prior_status", "sum")).reset_index()
    ind = df.groupby("industry_l1").agg(n=("ticker", "size"), firms=("ticker", "nunique"), y1=("Y1", "mean"),
                                         y2=("Y2", "mean"), yall=("Y_all", "mean")).reset_index()
    ind_year = df.groupby(["industry_l1", "fiscal_year"])["Y_all"].mean().reset_index()
    pdf_types = df["pdf_type"].value_counts().to_dict()
    delay = df.groupby("fiscal_year")["pub_delay"].median().reset_index()

    stats = {
        "events_by_year": records(ev_year),
        "events_by_measure": {k: int(v) for k, v in by_measure.items()},
        "events_by_agency": {k: int(v) for k, v in by_agency.items()},
        "coverage": records(cov),
        "labels_by_year": records(lab_year),
        "industry": records(ind),
        "industry_year": records(ind_year),
        "pdf_types": {k: int(v) for k, v in pdf_types.items()},
        "pub_delay_median": records(delay),
        "special_now": {k: int(v) for k, v in special.merge(listing[["ticker", "exchange_now"]], on="ticker")
                        .query("exchange_now in ['HOSE','HNX']")["status_now"].value_counts().items()},
    }
    dump(stats, "stats.json")

    dump(finance_summary(fin, companies, as_of), "finance.json")

    fc = industry_forecast(df, live, as_of)
    dump(fc, "forecast.json")
    log(f"forecast: Y1 {fc['market']['Y1']['exp']} (k={fc['calib']['Y1']}), Y2 {fc['market']['Y2']['exp']} (k={fc['calib']['Y2']})")
    log("finance.json written")

    meta = {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "as_of": as_of.strftime("%Y-%m-%d"),
        # freshness of each input, so the app can say exactly how recent the data is
        "sources": {
            "listing": listing_date.strftime("%Y-%m-%d"),
            "events_last": events_last.strftime("%Y-%m-%d"),
            "bctn_fy_last": int(df.loc[df["has_pdf"].astype(bool), "fiscal_year"].max()),
            "bctn_pub_last": clean(df["pub_date"].max()),
            "fin_fy_last": int(fin["fiscal_year"].max()) if len(fin) else None,
            "fin_fy_first": int(fin["fiscal_year"].min()) if len(fin) else None,
            "fin_name": "Vietcap (VCI)",
        },
        "counts": {
            "firm_years": int(len(df)), "tickers": int(df.ticker.nunique()), "events": int(len(ev_out)),
            "events_labelled": int(len(labelled)), "reports": int(df.has_pdf.sum()),
            "listed_now": int(len(live)), "years": [int(df.fiscal_year.min()), int(df.fiscal_year.max())],
            "fin_rows": int(len(fin)), "fin_tickers": int(fin["ticker"].nunique()),
            "fin_firm_years": int(df["fin_fy"].notna().sum()),
        },
        "e_def": E_DEF,
        "features": FEATURES,
        "model": {
            t: {
                "oos": res[t]["oos"], "per_year": res[t]["per_year"],
                "coef": res[t]["final"].coef(),
                "intercept": round(float(res[t]["final"].lr.intercept_[0]), 4),
            }
            for t in ["Y1", "Y2"]
        },
        "lexicon": LEX,
    }
    dump(meta, "meta.json")
    log(f"done in {time.time() - t0:.0f}s → {OUT}")


if __name__ == "__main__":
    main()
