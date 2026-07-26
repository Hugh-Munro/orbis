"""
generate_correlation.py
Run from the project root: python generate_correlation.py
Writes data/correlation.json with real data from Yahoo Finance.
"""

import json
import numpy as np
import pandas as pd
from pathlib import Path
from datetime import datetime

try:
    from curl_cffi import requests as curl_requests
    import yfinance as yf
    yf.utils.get_json = lambda url, proxy=None: curl_requests.get(url, impersonate="chrome110").json()
except ImportError:
    import yfinance as yf

# ── Config ────────────────────────────────────────────────────────────────────

START = "2021-01-01"
END   = "2026-01-01"
RF    = 0.0525  # risk-free rate (annualised)

ASSETS = {
    "VWRL.L":  {"name": "Global Equity ETF",  "class": "Equity",    "paradigm": "Risk-On"},
    "IBC1.MU": {"name": "Corp Bond ETC",       "class": "Bond",      "paradigm": "Risk-Off"},
    "IGLN.L":  {"name": "Gold ETF",            "class": "Commodity", "paradigm": "Real Assets"},
    "BTC-USD": {"name": "Bitcoin",             "class": "Crypto",    "paradigm": "Risk-On"},
}

TICKERS = list(ASSETS.keys())

# ── Fetch ─────────────────────────────────────────────────────────────────────

print("Fetching prices...")
raw = yf.download(TICKERS, start=START, end=END, auto_adjust=True)["Close"]

# Drop rows where every column is NaN, then forward-fill gaps up to 3 days
raw = raw.dropna(how="all").ffill(limit=3)
# Remove rows where any asset has an implausible single-day move (bad ticks)
pct = raw.pct_change().abs()
raw = raw[~(pct > 0.5).any(axis=1)]

print(f"Got {len(raw)} rows from {raw.index[0].date()} to {raw.index[-1].date()}")
print("Missingness:\n", raw.isnull().sum())

# ── Returns (shared trading days only) ───────────────────────────────────────

returns = raw.pct_change().dropna()
# Remove any single-day return beyond ±50% (bad ticks, not real moves)
returns = returns[returns.abs() < 0.5]
print(f"\n{len(returns)} shared return observations")

# ── Per-asset stats ───────────────────────────────────────────────────────────

TRADING_DAYS = 252

def annualised_return(r):
    """Geometric annualised return."""
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

# Latest price per ticker
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

# Build edge list (upper triangle only)
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
}

# ── Write ─────────────────────────────────────────────────────────────────────

out_path = Path("data/correlation.json")
out_path.parent.mkdir(exist_ok=True)
with open(out_path, "w") as f:
    json.dump(output, f, indent=2)

print(f"\nWrote {out_path}")