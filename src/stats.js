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

export function computeInverseVolWeights(correlationData, selectedTickers) {
  const assets = activeAssetEntries(correlationData, selectedTickers);
  const invVols = assets.map(([id, a]) => [id, 1 / a.vol]);
  const total = invVols.reduce((sum, [, v]) => sum + v, 0);
  return Object.fromEntries(invVols.map(([id, v]) => [id, v / total]));
}

// Historical VaR / CVaR (95%, 1-day) — reconstructed from actual daily return series
function computeHistoricalVarCvar(correlationData, weights, tickers) {
  const dr = correlationData.daily_returns;
  if (!dr) return { var95: NaN, cvar95: NaN };
  const dateArrays = tickers.map(t => dr[t] && dr[t].dates);
  if (dateArrays.some(d => !d)) return { var95: NaN, cvar95: NaN };
  const referenceDates = dateArrays[0];
  const sameLength = dateArrays.every(d => d.length === referenceDates.length);
  if (!sameLength) return { var95: NaN, cvar95: NaN };
  const n = referenceDates.length;
  const portfolioSeries = [];
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
    if (valid) portfolioSeries.push(dayReturn);
  }
  if (portfolioSeries.length < 20) return { var95: NaN, cvar95: NaN };
  portfolioSeries.sort((a, b) => a - b);
  const idx = Math.max(0, Math.floor(0.05 * portfolioSeries.length) - 1);
  const var95 = portfolioSeries[idx];
  const tail = portfolioSeries.slice(0, idx + 1);
  const cvar95 = tail.reduce((sum, v) => sum + v, 0) / tail.length;
  return { var95, cvar95 };
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

  const { var95, cvar95 } = computeHistoricalVarCvar(correlationData, w, tickers);

  return {
    portfolioReturn,
    portfolioVol,
    sharpe,
    sortino,
    avgCorrelation,
    maxDrawdown,
    var95,
    cvar95,
    corrMatrix,
    tickers,
  };
}