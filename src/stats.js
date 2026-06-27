const RISK_FREE_RATE = 0.0525; // US 3M T-bill average 2021-2024

export function computePortfolioStats(correlationData) {
  const assets = Object.entries(correlationData.assets);
  const n = assets.length;
  const w = 1 / n; // equal weight

  const tickers = assets.map(([id]) => id);
  const returns = Object.fromEntries(assets.map(([id, a]) => [id, a.return]));
  const vols    = Object.fromEntries(assets.map(([id, a]) => [id, a.vol]));

  // Build correlation matrix as nested object
  const corrMatrix = {};
  tickers.forEach(t => {
    corrMatrix[t] = {};
    tickers.forEach(u => {
      corrMatrix[t][u] = t === u ? 1 : 0;
    });
  });
  correlationData.edges.forEach(({ source, target, correlation }) => {
    corrMatrix[source][target] = correlation;
    corrMatrix[target][source] = correlation;
  });

  // Portfolio return — weighted average
  const portfolioReturn = tickers.reduce((sum, t) => sum + w * returns[t], 0);

  // Portfolio variance — wᵀΣw where Σ_ij = corr_ij * vol_i * vol_j
  let portfolioVariance = 0;
  tickers.forEach(t => {
    tickers.forEach(u => {
      const cov = corrMatrix[t][u] * vols[t] * vols[u];
      portfolioVariance += w * w * cov;
    });
  });
  const portfolioVol = Math.sqrt(portfolioVariance);

  // Sharpe ratio
  const sharpe = (portfolioReturn - RISK_FREE_RATE) / portfolioVol;

  // Sortino — downside vol approximation: vol * sqrt(0.5)
  // Valid under assumption of roughly symmetric return distribution
  const downsideVol = portfolioVol * Math.sqrt(0.5);
  const sortino = (portfolioReturn - RISK_FREE_RATE) / downsideVol;

  // Weighted average pairwise correlation
  // All unique pairs, equal weight per pair
  const pairs = [];
  tickers.forEach((t, i) => {
    tickers.slice(i + 1).forEach(u => {
      pairs.push(corrMatrix[t][u]);
    });
  });
  const avgCorrelation = pairs.reduce((sum, c) => sum + c, 0) / pairs.length;

  // remove diversificationRatio, add:
  const maxDrawdown = tickers.reduce((sum, t) => sum + w * assets.find(([id]) => id === t)[1].maxDrawdown, 0);

  return {
    portfolioReturn,
    portfolioVol,
    sharpe,
    sortino,
    avgCorrelation,
    maxDrawdown,
  };
}