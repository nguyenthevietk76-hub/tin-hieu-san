"""
Tín Hiệu Sàn – annual financial statements from a public external source.

Downloads yearly balance sheet, income statement and cash flow for every ticker
in the sample from Vietcap (VCI, via the vnstock library) and writes

    pipeline/ext/vci_raw/{ticker}.json.gz   raw API rows (resumable cache)
    pipeline/ext/fin_vci.csv                one row per ticker × fiscal year

Reads the NCKH_EWS folder strictly READ-ONLY (ticker list only). External data:
VCI covers fiscal years from 2018 and lacks some delisted firms (784 of 810
sample tickers on 29/10/2026). Each row keeps VCI's publication date
(public_date) so build_data.py never uses figures before they were published.

    python pipeline/fetch_fin.py            # fetch missing tickers, rebuild CSV
    python pipeline/fetch_fin.py --refresh  # re-download everything
    python pipeline/fetch_fin.py --only-csv # rebuild CSV from the raw cache
"""
from __future__ import annotations

import argparse
import contextlib
import gzip
import io
import json
import time
from datetime import datetime
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent
EXT = HERE / "ext"
RAW = EXT / "vci_raw"
OUT_CSV = EXT / "fin_vci.csv"

SECTIONS = ["balance_sheet", "income_statement", "cash_flow"]
PAUSE = 0.6  # seconds between requests, to stay polite with the source

# VCI field codes (non-financial companies) → our column names
FIELDS = {
    "bsa1": "current_assets",
    "bsa53": "total_assets",
    "bsa54": "liabilities",
    "bsa55": "current_liabilities",
    "bsa56": "st_borrowings",
    "bsa71": "lt_borrowings",
    "bsa78": "equity",
    "bsa80": "paid_in_capital",
    "bsa90": "retained_earnings",
    "isa3": "net_revenue",
    "isa5": "gross_profit",
    "isa8": "interest_expense",
    "isa11": "operating_profit",
    "isa16": "profit_before_tax",
    "isa20": "net_income",
    "cfa18": "cfo",
}


def log(msg: str) -> None:
    print(f"[{datetime.now():%H:%M:%S}] {msg}", flush=True)


_client = None


def fetch_ticker(ticker: str) -> dict:
    global _client
    from vnstock.explorer.vci.financial import Finance

    out = {}
    # vnstock prints banners on stdout; keep the log readable
    with contextlib.redirect_stdout(io.StringIO()):
        # one client for all tickers: creating it costs a handshake and a full listing download
        if _client is None:
            _client = Finance(symbol=ticker, period="year")
        f = _client
        f.symbol = ticker
        for sec in SECTIONS:
            time.sleep(PAUSE)
            df = f._get_report(report_type=sec, mode="raw", period="year", limit=100)
            out[sec] = json.loads(df.to_json(orient="records")) if len(df) else []
    return out


def build_csv() -> pd.DataFrame:
    rows = {}
    for p in sorted(RAW.glob("*.json.gz")):
        ticker = p.name.split(".")[0]  # the API's own ticker field is sometimes empty
        with gzip.open(p, "rt", encoding="utf-8") as fh:
            d = json.load(fh)
        for sec in SECTIONS:
            for r in d.get(sec) or []:
                if r.get("lengthReport") != 5:  # 5 = full year
                    continue
                key = (ticker, int(r["yearReport"]))
                row = rows.setdefault(key, {"ticker": key[0], "fiscal_year": key[1]})
                pub = (r.get("publicDate") or "")[:10] or None
                # a firm-year counts as published once its last statement is out
                if pub and (row.get("public_date") is None or pub > row["public_date"]):
                    row["public_date"] = pub
                for code, name in FIELDS.items():
                    if code in r and r[code] is not None:
                        row[name] = r[code]
    df = pd.DataFrame(rows.values()).sort_values(["ticker", "fiscal_year"])
    cols = ["ticker", "fiscal_year", "public_date"] + list(FIELDS.values())
    df = df.reindex(columns=cols)
    df.to_csv(OUT_CSV, index=False, encoding="utf-8")
    return df


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default="D:/NCKH_EWS")
    ap.add_argument("--refresh", action="store_true")
    ap.add_argument("--only-csv", action="store_true")
    a = ap.parse_args()
    RAW.mkdir(parents=True, exist_ok=True)

    if not a.only_csv:
        tickers = sorted(pd.read_csv(Path(a.src) / "data/processed/sample_frame_v2.csv", usecols=["ticker"])
                         ["ticker"].unique())
        todo = [t for t in tickers if a.refresh or not (RAW / f"{t}.json.gz").exists()]
        log(f"{len(tickers)} tickers, {len(todo)} to fetch")
        failed = []
        for i, t in enumerate(todo, 1):
            try:
                d = fetch_ticker(t)
            except Exception as exc:  # network / source error: retry on the next run
                failed.append(t)
                log(f"{t}: {str(exc)[:120]}")
                time.sleep(5)
                continue
            d["fetched_at"] = datetime.now().isoformat(timespec="seconds")
            with gzip.open(RAW / f"{t}.json.gz", "wt", encoding="utf-8") as fh:
                json.dump(d, fh, ensure_ascii=False)
            if i % 25 == 0:
                log(f"{i}/{len(todo)}")
        if failed:
            log(f"failed ({len(failed)}), rerun to retry: {' '.join(failed)}")

    df = build_csv()
    log(f"{OUT_CSV.name}: {len(df)} firm-years, {df.ticker.nunique()} tickers, "
        f"years {df.fiscal_year.min()}–{df.fiscal_year.max()}")


if __name__ == "__main__":
    main()
