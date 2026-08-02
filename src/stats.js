function activeAssetEntries(correlationData, selectedTickers) {
  const all = Object.entries(correlationData.assets);
  if (!selectedTickers) return all;
  return all.filter(([id]) => selectedTickers.has(id));
}

// Build weight maps from a correlation dataset, restricted to selectedTickers if given
export function computeEqualWeights(correlationData, selectedTickers) {
  const tickers = activeAssetEntries(correlationData, selectedTickers).map(([id]) => id);
  const w = 1 / tickers.length;
  return Object.fromEntries(tickers.map(t => [t, w]));
}

// Fisher z-transform significance test for a single pairwise correlation:
// 95% CI on rho, and a two-tailed p-value against H0: rho = 0. n is the
// actual overlapping valid-observation count for that specific pair, not
// the whole-portfolio sample size — two assets can have different history
// lengths.
export function computeCorrelationSignificance(correlationData, sourceId, targetId, r) {
  const dr = correlationData.daily_returns;
  if (!dr || !dr[sourceId] || !dr[targetId]) {
    return { n: 0, ciLow: NaN, ciHigh: NaN, pValue: NaN };
  }
  const a = dr[sourceId].values;
  const b = dr[targetId].values;
  const len = Math.min(a.length, b.length);
  let n = 0;
  for (let i = 0; i < len; i++) {
    if (Number.isFinite(a[i]) && Number.isFinite(b[i])) n++;
  }
  if (n < 4) return { n, ciLow: NaN, ciHigh: NaN, pValue: NaN };

  const rClamped = Math.max(-0.999999, Math.min(0.999999, r));
  const z = Math.atanh(rClamped);
  const se = 1 / Math.sqrt(n - 3);
  const ciLow = Math.tanh(z - 1.96 * se);
  const ciHigh = Math.tanh(z + 1.96 * se);
  const pValue = 2 * (1 - normalCdf(Math.abs(z / se)));

  return { n, ciLow, ciHigh, pValue };
}

export function computeInverseVolWeights(correlationData, selectedTickers) {
  const assets = activeAssetEntries(correlationData, selectedTickers);
  const invVols = assets.map(([id, a]) => [id, 1 / a.vol]);
  const total = invVols.reduce((sum, [, v]) => sum + v, 0);
  return Object.fromEntries(invVols.map(([id, v]) => [id, v / total]));
}

// Reconstructs the actual portfolio daily-return series from the underlying
// asset series, restricted to days where every selected ticker has data.
// Shared by VaR/CVaR, the distribution stats, and PSR so they all agree on
// exactly which sample they're estimating from.
function getPortfolioDailySeries(correlationData, weights, tickers) {
  const dr = correlationData.daily_returns;
  if (!dr) return null;
  const dateArrays = tickers.map(t => dr[t] && dr[t].dates);
  if (dateArrays.some(d => !d)) return null;
  const referenceDates = dateArrays[0];
  const sameLength = dateArrays.every(d => d.length === referenceDates.length);
  if (!sameLength) return null;
  const n = referenceDates.length;
  const series = [];
  for (let i = 0; i < n; i++) {
    let dayReturn = 0;
    let valid = true;
    for (const t of tickers) {
      const v = dr[t].values[i];
      if (v === null || v === undefined || Number.isNaN(v)) {
        valid = false;
        break;
      }
      dayReturn += weights[t] * v;
    }
    if (valid) series.push(dayReturn);
  }
  return series;
}

// Historical VaR / CVaR (95%, 1-day) from the actual portfolio return series
function computeHistoricalVarCvar(series) {
  if (!series || series.length < 20) return { var95: NaN, cvar95: NaN };
  const sorted = [...series].sort((a, b) => a - b);
  const idx = Math.max(0, Math.floor(0.05 * sorted.length) - 1);
  const var95 = sorted[idx];
  const tail = sorted.slice(0, idx + 1);
  const cvar95 = tail.reduce((sum, v) => sum + v, 0) / tail.length;
  return { var95, cvar95 };
}

function normalPdf(x, mean, std) {
  return Math.exp(-0.5 * ((x - mean) / std) ** 2) / (std * Math.sqrt(2 * Math.PI));
}

// Bins the daily portfolio return series for a histogram, clipped to ±3σ so
// a single extreme day doesn't blow out the scale, plus the expected count
// per bin under a fitted normal — the overlay that makes skew/kurtosis
// visually legible rather than just abstract numbers.
function computeReturnHistogram(series, binCount = 22) {
  const n = series ? series.length : 0;
  if (n < 20) return null;
  const mean = series.reduce((s, v) => s + v, 0) / n;
  const variance = series.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1);
  const std = Math.sqrt(variance);
  if (!std) return null;

  const range = 3 * std;
  const min = mean - range;
  const max = mean + range;
  const binWidth = (max - min) / binCount;

  const counts = new Array(binCount).fill(0);
  series.forEach(v => {
    const clamped = Math.min(max - 1e-12, Math.max(min, v));
    const idx = Math.min(binCount - 1, Math.max(0, Math.floor((clamped - min) / binWidth)));
    counts[idx]++;
  });

  const normalCounts = counts.map((_, i) => {
    const center = min + (i + 0.5) * binWidth;
    return normalPdf(center, mean, std) * n * binWidth;
  });

  const bestDay = Math.max(...series);
  const worstDay = Math.min(...series);

  return { min, max, binWidth, counts, normalCounts, mean, std, n, bestDay, worstDay };
}

function erf(x) {
  // Abramowitz-Stegun 7.1.26 approximation, max error ~1.5e-7
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741,
        a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}

function normalCdf(x) {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

// Skew, excess kurtosis, and the Probabilistic Sharpe Ratio (Bailey & Lopez
// de Prado), all estimated from the same daily portfolio return series —
// mixing an annualised Sharpe with daily moments would give a meaningless
// PSR, so this deliberately works entirely in daily units.
function computeDistributionStats(series, dailyRf) {
  const n = series ? series.length : 0;
  if (n < 20) return { skew: NaN, kurtosis: NaN, psr: NaN };
  const mean = series.reduce((s, v) => s + v, 0) / n;
  const variance = series.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1);
  const std = Math.sqrt(variance);
  if (!std) return { skew: NaN, kurtosis: NaN, psr: NaN };

  const skew = (series.reduce((s, v) => s + (v - mean) ** 3, 0) / n) / std ** 3;
  const kurtosis = (series.reduce((s, v) => s + (v - mean) ** 4, 0) / n) / std ** 4; // non-excess
  const excessKurtosis = kurtosis - 3;

  // Per-period (daily) Sharpe — the PSR formula operates at the same
  // frequency as the skew/kurtosis estimates, not the annualised Sharpe.
  const srHat = (mean - dailyRf) / std;
  const psrDenom = Math.sqrt(1 - skew * srHat + ((kurtosis - 1) / 4) * srHat ** 2);
  const psr = psrDenom > 0
    ? normalCdf((srHat * Math.sqrt(n - 1)) / psrDenom)
    : NaN;

  return { skew, kurtosis: excessKurtosis, psr };
}

export function computePortfolioStats(correlationData, weights) {
  // Risk-free rate now comes from the data pipeline (FRED DTB3), not a hardcoded
  // constant. Falls back to the old static value only if the field is missing
  // (e.g. an older correlation.json generated before this change).
  const RISK_FREE_RATE = correlationData.riskFreeRate ?? 0.026;

  // weights is authoritative for which tickers are "in" — only score what has a weight
  const tickers = Object.keys(weights);
  const assets = tickers.map(t => [t, correlationData.assets[t]]);
  const w = weights;

  const returns = Object.fromEntries(assets.map(([id, a]) => [id, a.return]));
  const vols    = Object.fromEntries(assets.map(([id, a]) => [id, a.vol]));

  const corrMatrix = {};
  tickers.forEach(t => {
    corrMatrix[t] = {};
    tickers.forEach(u => {
      corrMatrix[t][u] = t === u ? 1 : 0;
    });
  });
  correlationData.edges.forEach(({ source, target, correlation }) => {
    if (corrMatrix[source] && corrMatrix[source][target] !== undefined) {
      corrMatrix[source][target] = correlation;
      corrMatrix[target][source] = correlation;
    }
  });

  const portfolioReturn = tickers.reduce((sum, t) => sum + w[t] * returns[t], 0);

  let portfolioVariance = 0;
  tickers.forEach(t => {
    tickers.forEach(u => {
      const cov = corrMatrix[t][u] * vols[t] * vols[u];
      portfolioVariance += w[t] * w[u] * cov;
    });
  });
  const portfolioVol = Math.sqrt(portfolioVariance);

  const sharpe = (portfolioReturn - RISK_FREE_RATE) / portfolioVol;

  const downsideVol = portfolioVol * Math.sqrt(0.5);
  const sortino = (portfolioReturn - RISK_FREE_RATE) / downsideVol;

  const pairs = [];
  tickers.forEach((t, i) => {
    tickers.slice(i + 1).forEach(u => {
      pairs.push(corrMatrix[t][u]);
    });
  });
  const avgCorrelation = pairs.length
    ? pairs.reduce((sum, c) => sum + c, 0) / pairs.length
    : 0;

  const maxDrawdown = tickers.reduce((sum, t) => sum + w[t] * correlationData.assets[t].maxDrawdown, 0);

  const dailySeries = getPortfolioDailySeries(correlationData, w, tickers);
  const { var95, cvar95 } = computeHistoricalVarCvar(dailySeries);
  const { skew, kurtosis, psr } = computeDistributionStats(dailySeries, RISK_FREE_RATE / 252);
  const histogram = computeReturnHistogram(dailySeries);

  return {
    portfolioReturn,
    portfolioVol,
    sharpe,
    sortino,
    avgCorrelation,
    maxDrawdown,
    var95,
    cvar95,
    skew,
    kurtosis,
    psr,
    psrObs: dailySeries ? dailySeries.length : 0,
    histogram,
    corrMatrix,
    tickers,
  };
}