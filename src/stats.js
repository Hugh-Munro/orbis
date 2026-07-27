const RISK_FREE_RATE = 0.026; // US 3M T-bill average 2021-2024

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

export function computePortfolioStats(correlationData, weights) {
  // weights is authoritative for which tickers are "in" — only score what has a weight
  const tickers = Object.keys(weights);
  const assets = tickers.map(t => [t, correlationData.assets[t]]);
  const w = weights;

  const returns = Object.fromEntries(assets.map(([id, a]) => [id, a.return]));
  const vols    = Object.fromEntries(assets.map(([id, a]) => [id, a.vol]));

  // Build correlation matrix as nested object (restricted to active tickers)
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

  // Portfolio return — weighted average
  const portfolioReturn = tickers.reduce((sum, t) => sum + w[t] * returns[t], 0);

  // Portfolio variance — wᵀΣw where Σ_ij = corr_ij * vol_i * vol_j
  let portfolioVariance = 0;
  tickers.forEach(t => {
    tickers.forEach(u => {
      const cov = corrMatrix[t][u] * vols[t] * vols[u];
      portfolioVariance += w[t] * w[u] * cov;
    });
  });
  const portfolioVol = Math.sqrt(portfolioVariance);

  // Sharpe ratio
  const sharpe = (portfolioReturn - RISK_FREE_RATE) / portfolioVol;

  // Sortino — downside vol approximation: vol * sqrt(0.5)
  const downsideVol = portfolioVol * Math.sqrt(0.5);
  const sortino = (portfolioReturn - RISK_FREE_RATE) / downsideVol;

  // Weighted average pairwise correlation (descriptive, restricted to active tickers)
  const pairs = [];
  tickers.forEach((t, i) => {
    tickers.slice(i + 1).forEach(u => {
      pairs.push(corrMatrix[t][u]);
    });
  });
  const avgCorrelation = pairs.length
    ? pairs.reduce((sum, c) => sum + c, 0) / pairs.length
    : 0; // single-asset universe has no pairs

  const maxDrawdown = tickers.reduce((sum, t) => sum + w[t] * correlationData.assets[t].maxDrawdown, 0);

  return {
    portfolioReturn,
    portfolioVol,
    sharpe,
    sortino,
    avgCorrelation,
    maxDrawdown,
    corrMatrix,
    tickers,
  };
}