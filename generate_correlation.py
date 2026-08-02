"""
generate_correlation.py
Run from the project root: python generate_correlation.py
Writes data/correlation.json with up-to-date data from Yahoo Finance,
and appends confirmed daily closes to data/price_history.csv (never overwritten).

Designed to be run daily (e.g. via GitHub Actions) with no manual intervention.
"""
import json
import numpy as np
import pandas as pd
from pathlib import Path
from datetime import datetime
import urllib.request
import io

try:
    from curl_cffi import requests as curl_requests
    import yfinance as yf
    yf.utils.get_json = lambda url, proxy=None: curl_requests.get(url, impersonate="chrome110").json()
except ImportError:
    import yfinance as yf

# ── Config ────────────────────────────────────────────────────────────────────

# Rolling window: START stays fixed (earliest data we care about), END is
# always "today" so every run extends the window forward instead of
# regenerating the same fixed historical slice.
START = "2021-01-01"
END = datetime.today().strftime("%Y-%m-%d")

ASSETS = {
    "VWRL.L":  {"name": "Global Equity ETF",      "class": "Equity",    "paradigm": "Risk-On"},
    "IBC1.MU": {"name": "Corp Bond ETC",           "class": "Bond",      "paradigm": "Risk-Off"},
    "IGLN.L":  {"name": "Gold ETF",                "class": "Commodity", "paradigm": "Real Assets"},
    "BTC-USD": {"name": "Bitcoin",                 "class": "Crypto",    "paradigm": "Risk-On"},
    "CSPX.L":  {"name": "US Large-Cap Equity ETF", "class": "Equity",    "paradigm": "Risk-On"},
    "EIMI.L":  {"name": "EM Equity ETF",           "class": "Equity",    "paradigm": "Risk-On"},
    "AGGH.MI": {"name": "Global Agg Bond ETF",     "class": "Bond",      "paradigm": "Risk-Off"},
    "IWDP.L":  {"name": "Global REIT ETF",         "class": "Real Estate", "paradigm": "Risk-On"},
}

TICKERS = list(ASSETS.keys())

HISTORY_PATH = Path("data/price_history.csv")
OUTPUT_PATH = Path("data/correlation.json")

TRADING_DAYS = 252

# ── Risk-free rate from FRED ─────────────────────────────────────────────────

def fetch_fred_risk_free_rate(series_id="DTB3", fallback=0.026):
    """
    Pulls the latest 3-Month Treasury Bill secondary market rate from FRED.
    No API key required — FRED serves plain CSV via fredgraph.csv.
    Returns (annualised decimal rate, as-of date string).
    Falls back to `fallback` if the request fails for any reason so the
    whole pipeline doesn't break over a rate lookup.
    """
    url = f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={series_id}"
    try:
        with urllib.request.urlopen(url, timeout=15) as resp:
            raw_csv = resp.read().decode("utf-8")
        df = pd.read_csv(io.StringIO(raw_csv))
        df.columns = ["date", "value"]
        df["value"] = pd.to_numeric(df["value"], errors="coerce")
        df = df.dropna(subset=["value"])
        if df.empty:
            raise ValueError("FRED series returned no usable rows")
        latest_row = df.iloc[-1]
        rate_pct = float(latest_row["value"])
        rate_decimal = rate_pct / 100.0
        print(f"FRED {series_id}: {rate_pct:.2f}% as of {latest_row['date']} -> using {rate_decimal:.4f}")
        return rate_decimal, str(latest_row["date"])
    except Exception as e:
        print(f"WARNING: FRED fetch failed ({e}); falling back to RF={fallback}")
        return fallback, None

RF, RF_AS_OF = fetch_fred_risk_free_rate()

# ── Fetch prices ──────────────────────────────────────────────────────────────

print("Fetching prices...")
raw = yf.download(TICKERS, start=START, end=END, auto_adjust=True)["Close"]

raw = raw.dropna(how="all").ffill(limit=3)

pct = raw.pct_change().abs()
raw = raw[~(pct > 0.5).any(axis=1)]

print(f"Got {len(raw)} rows from {raw.index[0].date()} to {raw.index[-1].date()}")
print("Missingness:\n", raw.isnull().sum())

# ── Append to permanent price history archive (never overwritten) ───────────
#
# Each run, we merge today's fetch into whatever's already on disk, keyed by
# date. Existing rows are only updated if Yahoo revises a value (rare) —
# nothing is ever deleted, so the file only grows over time.

HISTORY_PATH.parent.mkdir(exist_ok=True)

new_data = raw.copy()
new_data.index.name = "date"
new_data = new_data.reset_index()
new_data["date"] = new_data["date"].dt.strftime("%Y-%m-%d")

if HISTORY_PATH.exists():
    existing = pd.read_csv(HISTORY_PATH)
    combined = pd.concat([existing, new_data], ignore_index=True)
    combined = combined.drop_duplicates(subset="date", keep="last")
else:
    combined = new_data

combined = combined.sort_values("date").reset_index(drop=True)
combined.to_csv(HISTORY_PATH, index=False)
print(f"Price history archive: {len(combined)} total rows -> {HISTORY_PATH}")

# ── Returns (shared trading days only) ───────────────────────────────────────

returns = raw.pct_change().dropna()
returns = returns[returns.abs() < 0.5]

print(f"\n{len(returns)} shared return observations")

# ── Per-asset stats ───────────────────────────────────────────────────────────

def annualised_return(r):
    total = (1 + r).prod()
    n_years = len(r) / TRADING_DAYS
    return float(total ** (1 / n_years) - 1)

def annualised_vol(r):
    return float(r.std() * np.sqrt(TRADING_DAYS))

def max_drawdown(prices):
    prices = prices.dropna()
    roll_max = prices.cummax()
    drawdown = (prices - roll_max) / roll_max
    return float(drawdown.min())

def sharpe(ret, vol):
    if vol == 0:
        return None
    return (ret - RF) / vol

def sortino(r):
    ann_ret = annualised_return(r)
    downside = r[r < 0].std() * np.sqrt(TRADING_DAYS)
    if downside == 0:
        return None
    return (ann_ret - RF) / downside

latest_prices = {t: float(raw[t].dropna().iloc[-1]) for t in TICKERS}

asset_stats = {}
for t in TICKERS:
    r = returns[t].dropna()
    p = raw[t].dropna()
    ret = annualised_return(r)
    vol = annualised_vol(r)
    asset_stats[t] = {
        "return": round(ret, 4),
        "vol":    round(vol, 4),
        "maxDrawdown": round(max_drawdown(p), 4),
        "sharpe":  round(sharpe(ret, vol), 4) if sharpe(ret, vol) is not None else None,
        "sortino": round(sortino(r), 4) if sortino(r) is not None else None,
        "price":   round(latest_prices[t], 4),
    }
    print(f"{t:12s}  ret={ret:+.1%}  vol={vol:.1%}  mdd={max_drawdown(p):.1%}  price={latest_prices[t]:.2f}")

# ── Correlation matrix ────────────────────────────────────────────────────────

corr_matrix = returns.corr()
print("\nCorrelation matrix:")
print(corr_matrix.round(3))

edges = []
for i, src in enumerate(TICKERS):
    for j, tgt in enumerate(TICKERS):
        if j <= i:
            continue
        corr_val = corr_matrix.loc[src, tgt]
        if pd.isna(corr_val):
            continue
        edges.append({
            "source": src,
            "target": tgt,
            "correlation": round(float(corr_val), 4),
        })

# ── Assemble output ───────────────────────────────────────────────────────────

output = {
    "assets": {
        t: {
            **ASSETS[t],
            **asset_stats[t],
        }
        for t in TICKERS
    },
    "edges": edges,
    "window": f"Daily returns {START} to {END}",
    "computed_at": datetime.today().strftime("%Y-%m-%d"),
    "riskFreeRate": round(RF, 4),
    "riskFreeRateSource": "FRED DTB3 (3-Month Treasury Bill, secondary market)",
    "riskFreeRateAsOf": RF_AS_OF,
    "daily_returns": {
        t: {
            "dates": [d.strftime("%Y-%m-%d") for d in returns.index],
            "values": [round(float(v), 6) for v in returns[t]]
        }
        for t in TICKERS
    },
}

# ── Write ─────────────────────────────────────────────────────────────────────

OUTPUT_PATH.parent.mkdir(exist_ok=True)
with open(OUTPUT_PATH, "w") as f:
    json.dump(output, f, indent=2)

print(f"\nWrote {OUTPUT_PATH}")