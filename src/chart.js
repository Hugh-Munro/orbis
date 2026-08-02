import { GROUP_COLORS } from "./constants.js";
import { computeRollingCorrelation } from "./stats.js";

const WINDOW = 30;
const TRADING_DAYS = 252;

function rollingVol(values, window = WINDOW) {
  const result = [];
  for (let i = 0; i < values.length; i++) {
    if (i < window - 1) { result.push(null); continue; }
    const slice = values.slice(i - window + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / (slice.length - 1);
    result.push(Math.sqrt(variance * TRADING_DAYS));
  }
  return result;
}

function portfolioRollingVol(correlationData, weights) {
  const tickers = Object.keys(weights);
  const allDates = correlationData.daily_returns[tickers[0]].dates;
  const portReturns = allDates.map((d, i) => {
    return tickers.reduce((sum, t) => {
      const w = weights[t] || 0;
      const v = correlationData.daily_returns[t].values[i] || 0;
      return sum + w * v;
    }, 0);
  });
  return { dates: allDates, values: rollingVol(portReturns) };
}

// ── Shared hover + click interactivity ───────────────────────────────────────

let lockedSeries = null;

function attachChartInteractivity(area, newSvg, W, PAD, innerW, dates, allSeries, xScale, formatValue) {
  const tooltip = document.getElementById("chart-tooltip");
  const hoverRect = newSvg.getElementById("chart-hover-rect");
  const crosshair = newSvg.getElementById("chart-crosshair");
  const polylines = newSvg.querySelectorAll("polyline[data-label]");

  function applyFocus(label) {
    polylines.forEach(pl => {
      if (pl.dataset.label === label) {
        pl.setAttribute("opacity", "1");
        pl.setAttribute("stroke-width", parseFloat(pl.dataset.width) + 1);
      } else {
        pl.setAttribute("opacity", "0.1");
      }
    });
  }

  function clearFocus() {
    polylines.forEach(pl => {
      pl.setAttribute("opacity", "0.85");
      pl.setAttribute("stroke-width", pl.dataset.width);
    });
  }

  // Click on polyline to lock focus
  polylines.forEach(pl => {
    pl.style.cursor = "pointer";
    pl.addEventListener("click", () => {
      if (lockedSeries === pl.dataset.label) {
        lockedSeries = null;
        clearFocus();
      } else {
        lockedSeries = pl.dataset.label;
        applyFocus(lockedSeries);
      }
    });
  });

  hoverRect.addEventListener("mousemove", e => {
    const rect = newSvg.getBoundingClientRect();
    const scaleX = W / rect.width;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const idx = Math.round(((mouseX - PAD.left) / innerW) * (dates.length - 1));
    if (idx < 0 || idx >= dates.length) return;

    const x = xScale(idx);
    crosshair.setAttribute("x1", x);
    crosshair.setAttribute("x2", x);
    crosshair.setAttribute("display", "inline");

    // Hover focus (only if nothing locked)
    if (!lockedSeries) {
      // Find closest series by value proximity at this idx
      let closest = null;
      let closestDist = Infinity;
      allSeries.forEach(s => {
        const v = s.values[idx];
        if (v == null) return;
        const screenY = newSvg.getBoundingClientRect().top + (rect.height * ((v - 0) / 1));
        const dist = Math.abs(e.clientY - screenY);
        if (dist < closestDist) { closestDist = dist; closest = s.label; }
      });
    }

    const date = dates[idx];
    let html = `<div style="font-size:10px;color:#a0a8b0;margin-bottom:5px;">${date}</div>`;
    allSeries.forEach(s => {
      const v = s.values[idx];
      if (v == null) return;
      const formatted = formatValue(v, s);
      html += `<div style="display:flex;justify-content:space-between;gap:16px;margin-bottom:2px;">
        <span style="color:${s.color};font-weight:600;">${s.label}</span>
        <span>${formatted}</span>
      </div>`;
    });

    tooltip.innerHTML = html;
    tooltip.style.display = "block";

    const areaRect = area.getBoundingClientRect();
    const tipX = e.clientX - areaRect.left + 12;
    const tipY = e.clientY - areaRect.top - 20;
    const flipLeft = tipX + 180 > areaRect.width;
    tooltip.style.left = flipLeft ? `${tipX - 200}px` : `${tipX}px`;
    tooltip.style.top = `${Math.max(8, tipY)}px`;
  });

  hoverRect.addEventListener("mouseleave", () => {
    crosshair.setAttribute("display", "none");
    tooltip.style.display = "none";
  });

  // Click background to clear lock
  hoverRect.addEventListener("click", () => {
    lockedSeries = null;
    clearFocus();
  });
}

// ── Shared SVG scaffolding ────────────────────────────────────────────────────

function buildSVGScaffold(W, H, PAD, innerW, innerH, yTickVals, yScale, xScale, filteredXTicks, formatYLabel) {
  let markup = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;

  yTickVals.forEach(v => {
    const y = yScale(v);
    const isBase = formatYLabel(v) === "0%" || formatYLabel(v) === "+0%";
    markup += `<line x1="${PAD.left}" y1="${y}" x2="${PAD.left + innerW}" y2="${y}"
      stroke="#e8e8e0" stroke-width="${isBase ? 1.5 : 1}" stroke-dasharray="${isBase ? "none" : "3,4"}"/>`;
  });

  yTickVals.forEach(v => {
    const y = yScale(v);
    markup += `<text x="${PAD.left - 8}" y="${y + 4}" text-anchor="end"
      font-family="Inter, sans-serif" font-size="10" fill="#a0a8b0">${formatYLabel(v)}</text>`;
  });

  filteredXTicks.forEach(({ i, label }) => {
    const x = xScale(i);
    markup += `<text x="${x}" y="${PAD.top + innerH + 20}" text-anchor="middle"
      font-family="Inter, sans-serif" font-size="10" fill="#5a6472">${label}</text>`;
    markup += `<line x1="${x}" y1="${PAD.top}" x2="${x}" y2="${PAD.top + innerH}"
      stroke="#e8e8e0" stroke-width="1"/>`;
  });

  markup += `<line x1="${PAD.left}" y1="${PAD.top}" x2="${PAD.left}" y2="${PAD.top + innerH}" stroke="#dde0e4" stroke-width="1"/>`;
  markup += `<line x1="${PAD.left}" y1="${PAD.top + innerH}" x2="${PAD.left + innerW}" y2="${PAD.top + innerH}" stroke="#dde0e4" stroke-width="1"/>`;

  return markup;
}

function buildXTicks(dates) {
  const xTicks = [];
  let lastYear = null;
  dates.forEach((d, i) => {
    const year = d.slice(0, 4);
    if ((d.endsWith("-01-01") || d.endsWith("-01-02") || d.endsWith("-01-03")) && year !== lastYear) {
      xTicks.push({ i, label: year });
      lastYear = year;
    }
  });
  return xTicks.length > 6 ? xTicks.filter((_, i) => i % 2 === 0) : xTicks;
}

// ── Volatility chart ──────────────────────────────────────────────────────────

function drawChart(port, assetSeries, correlationData, showSigma) {
  lockedSeries = null;
  const area = document.getElementById("chart-area");
  const W = area.clientWidth || 800;
  const H = area.clientHeight || 500;
  const PAD = { top: 24, right: 56, bottom: 48, left: 62 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const allSeries = [
    { dates: port.dates, values: port.values, color: "#0f1b2d", width: 2, label: "Portfolio" },
    ...Object.entries(assetSeries).map(([t, s]) => ({
      dates: s.dates, values: s.values, color: s.color, width: 1.5, label: s.name,
    })),
  ];

  const dates = port.dates;
  const validVals = allSeries.flatMap(s => s.values.filter(v => v !== null));
  const minY = 0;
  const maxY = Math.max(...validVals) * 1.08;

  const xScale = i => PAD.left + (i / (dates.length - 1)) * innerW;
  const yScale = v => PAD.top + innerH - ((v - minY) / (maxY - minY)) * innerH;

  const portValid = port.values.filter(v => v !== null);
  const avgVol = portValid.reduce((a, b) => a + b, 0) / portValid.length;

  const yTicks = 5;
  const yTickVals = Array.from({ length: yTicks + 1 }, (_, i) => minY + (maxY - minY) * (i / yTicks));

  let markup = buildSVGScaffold(W, H, PAD, innerW, innerH, yTickVals, yScale, xScale,
    buildXTicks(dates), v => `${(v * 100).toFixed(0)}%`);

  // Avg line
  const avgY = yScale(avgVol);
  markup += `<line x1="${PAD.left}" y1="${avgY}" x2="${PAD.left + innerW}" y2="${avgY}"
    stroke="#0f1b2d" stroke-width="1" stroke-dasharray="6,4" opacity="0.25"/>`;
  markup += `<text x="${PAD.left + innerW + 6}" y="${avgY + 4}"
    font-family="Inter, sans-serif" font-size="9" fill="#0f1b2d" opacity="0.4">avg</text>`;

  // 2σ vol-spike bands — full chart height, spans every contiguous stretch
  // where realised vol is more than 2 standard deviations above its own mean.
  if (showSigma && portValid.length > 1) {
    const volMean = avgVol;
    const volStd = Math.sqrt(portValid.reduce((s, v) => s + (v - volMean) ** 2, 0) / (portValid.length - 1));
    const sigmaThreshold = volMean + 2 * volStd;
    const regions = computeBreachRegions(port.values, sigmaThreshold, true);
    regions.forEach(([s, e]) => {
      const x1 = xScale(s);
      const x2 = Math.max(xScale(e), x1 + 1.5);
      markup += `<rect x="${x1.toFixed(1)}" y="${PAD.top}" width="${(x2 - x1).toFixed(1)}" height="${innerH}"
        fill="#c96a1f" opacity="0.18"/>`;
    });

    const sigmaY = yScale(sigmaThreshold);
    markup += `<line x1="${PAD.left}" y1="${sigmaY.toFixed(1)}" x2="${PAD.left + innerW}" y2="${sigmaY.toFixed(1)}"
      stroke="#c96a1f" stroke-width="1.5" stroke-dasharray="5,4"/>`;
    markup += `<text x="${PAD.left + innerW - 4}" y="${sigmaY - 6}" text-anchor="end"
      font-family="Inter, sans-serif" font-size="10" font-weight="600" fill="#c96a1f">2σ (${(sigmaThreshold * 100).toFixed(1)}%)</text>`;
  }

  // Series
  allSeries.forEach(series => {
    let segments = [];
    let current = [];
    series.values.forEach((v, i) => {
      if (v === null) { if (current.length) { segments.push(current); current = []; } }
      else current.push(`${xScale(i).toFixed(1)},${yScale(v).toFixed(1)}`);
    });
    if (current.length) segments.push(current);
    segments.forEach(seg => {
      markup += `<polyline data-label="${series.label}" data-width="${series.width}" points="${seg.join(" ")}"
        fill="none" stroke="${series.color}" stroke-width="${series.width}"
        stroke-linejoin="round" stroke-linecap="round" opacity="0.85"/>`;
    });
  });

  markup += `<rect id="chart-hover-rect" x="${PAD.left}" y="${PAD.top}" width="${innerW}" height="${innerH}" fill="transparent" style="cursor:crosshair"/>`;
  markup += `<line id="chart-crosshair" x1="0" y1="${PAD.top}" x2="0" y2="${PAD.top + innerH}"
    stroke="#0f1b2d" stroke-width="1" stroke-dasharray="3,3" opacity="0.3" display="none"/>`;
  markup += `</svg>`;

  area.innerHTML = markup;
  const newSvg = area.querySelector("svg");
  newSvg.id = "chart-svg";
  newSvg.style.width = "100%";
  newSvg.style.height = "100%";

  attachChartInteractivity(area, newSvg, W, PAD, innerW, dates, allSeries, xScale,
    (v) => v === null ? "—" : `${(v * 100).toFixed(1)}%`);
}

// ── Cumulative returns chart ──────────────────────────────────────────────────

function drawCumulativeReturns(correlationData, weights, activeSeries) {
  lockedSeries = null;
  const area = document.getElementById("chart-area");
  const W = area.clientWidth || 800;
  const H = area.clientHeight || 500;
  const PAD = { top: 24, right: 48, bottom: 48, left: 68 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const tickers = Object.keys(weights);
  const dates = correlationData.daily_returns[tickers[0]].dates;

  const assetCumulative = {};
  tickers.forEach(t => {
    let cum = 1;
    assetCumulative[t] = correlationData.daily_returns[t].values.map(v => { cum *= (1 + v); return cum; });
  });

  const portCumulative = [];
  let portCum = 1;
  dates.forEach((d, i) => {
    const portRet = tickers.reduce((sum, t) => sum + (weights[t] || 0) * correlationData.daily_returns[t].values[i], 0);
    portCum *= (1 + portRet);
    portCumulative.push(portCum);
  });

  const allSeries = [
    { values: portCumulative, color: "#0f1b2d", width: 2, label: "Portfolio" },
    ...tickers
      .filter(t => activeSeries && activeSeries[t])
      .map(t => ({
        values: assetCumulative[t],
        color: GROUP_COLORS[correlationData.assets[t].class?.toLowerCase()]?.border || "#888",
        width: 1.5,
        label: correlationData.assets[t].name,
      })),
  ];

  const allVals = allSeries.flatMap(s => s.values);
  const minY = Math.min(...allVals);
  const maxY = Math.max(...allVals);
  const padY = (maxY - minY) * 0.06;
  const lo = minY - padY;
  const hi = maxY + padY;

  const xScale = i => PAD.left + (i / (dates.length - 1)) * innerW;
  const yScale = v => PAD.top + innerH - ((v - lo) / (hi - lo)) * innerH;

  const yTicks = 5;
  const yTickVals = Array.from({ length: yTicks + 1 }, (_, i) => lo + (hi - lo) * (i / yTicks));

  const formatYLabel = v => {
    const pct = ((v - 1) * 100).toFixed(0);
    return pct >= 0 ? `+${pct}%` : `${pct}%`;
  };

  let markup = buildSVGScaffold(W, H, PAD, innerW, innerH, yTickVals, yScale, xScale,
    buildXTicks(dates), formatYLabel);

  allSeries.forEach(series => {
    const points = series.values.map((v, i) => `${xScale(i).toFixed(1)},${yScale(v).toFixed(1)}`).join(" ");
    markup += `<polyline data-label="${series.label}" data-width="${series.width}" points="${points}"
      fill="none" stroke="${series.color}" stroke-width="${series.width}"
      stroke-linejoin="round" stroke-linecap="round" opacity="0.85"/>`;
  });

  markup += `<rect id="chart-hover-rect" x="${PAD.left}" y="${PAD.top}" width="${innerW}" height="${innerH}" fill="transparent" style="cursor:crosshair"/>`;
  markup += `<line id="chart-crosshair" x1="0" y1="${PAD.top}" x2="0" y2="${PAD.top + innerH}"
    stroke="#0f1b2d" stroke-width="1" stroke-dasharray="3,3" opacity="0.3" display="none"/>`;
  markup += `</svg>`;

  area.innerHTML = markup;
  const newSvg = area.querySelector("svg");
  newSvg.id = "chart-svg";
  newSvg.style.width = "100%";
  newSvg.style.height = "100%";

  attachChartInteractivity(area, newSvg, W, PAD, innerW, dates, allSeries, xScale, (v) => {
    const pct = ((v - 1) * 100).toFixed(1);
    return `<span style="color:${pct >= 0 ? "#2d8a5e" : "#c0385a"}">${pct >= 0 ? "+" : ""}${pct}%</span>`;
  });
}

function computeBreachRegions(values, threshold, above = false) {
  const regions = [];
  let start = null;
  values.forEach((v, i) => {
    const breached = v !== null && (above ? v >= threshold : v <= threshold);
    if (breached && start === null) start = i;
    if (!breached && start !== null) { regions.push([start, i - 1]); start = null; }
  });
  if (start !== null) regions.push([start, values.length - 1]);
  return regions;
}

function drawDrawdown(correlationData, weights, activeSeries, threshold) {
  lockedSeries = null;
  const area = document.getElementById("chart-area");
  const W = area.clientWidth || 800;
  const H = area.clientHeight || 500;
  const PAD = { top: 24, right: 48, bottom: 48, left: 68 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const tickers = Object.keys(weights);
  const dates = correlationData.daily_returns[tickers[0]].dates;

  function computeDrawdown(cumValues) {
    let peak = cumValues[0];
    return cumValues.map(v => {
      if (v > peak) peak = v;
      return (v - peak) / peak;
    });
  }

  // Portfolio cumulative then drawdown
  const portCumulative = [];
  let portCum = 1;
  dates.forEach((d, i) => {
    const portRet = tickers.reduce((sum, t) => sum + (weights[t] || 0) * correlationData.daily_returns[t].values[i], 0);
    portCum *= (1 + portRet);
    portCumulative.push(portCum);
  });
  const portDrawdown = computeDrawdown(portCumulative);

  // Per-asset drawdown
  const assetDrawdowns = {};
  tickers.forEach(t => {
    let cum = 1;
    const cumVals = correlationData.daily_returns[t].values.map(v => { cum *= (1 + v); return cum; });
    assetDrawdowns[t] = computeDrawdown(cumVals);
  });

  const allSeries = [
    { values: portDrawdown, color: "#0f1b2d", width: 2, label: "Portfolio" },
    ...tickers
      .filter(t => activeSeries && activeSeries[t])
      .map(t => ({
        values: assetDrawdowns[t],
        color: GROUP_COLORS[correlationData.assets[t].class?.toLowerCase()]?.border || "#888",
        width: 1.5,
        label: correlationData.assets[t].name,
      })),
  ];

  const allVals = allSeries.flatMap(s => s.values);
  const minY = Math.min(...allVals) * 1.08;
  const maxY = 0;

  const xScale = i => PAD.left + (i / (dates.length - 1)) * innerW;
  const yScale = v => PAD.top + innerH - ((v - minY) / (maxY - minY)) * innerH;

  const yTicks = 5;
  const yTickVals = Array.from({ length: yTicks + 1 }, (_, i) => minY + (maxY - minY) * (i / yTicks));

  const formatYLabel = v => {
    const pct = (v * 100).toFixed(0);
    return pct >= 0 ? `${pct}%` : `${pct}%`;
  };

  let markup = buildSVGScaffold(W, H, PAD, innerW, innerH, yTickVals, yScale, xScale,
    buildXTicks(dates), formatYLabel);

  // Threshold breach bands — full chart height, spans every contiguous
  // stretch where the portfolio drawdown is at or beyond the threshold.
  if (Number.isFinite(threshold)) {
    const regions = computeBreachRegions(portDrawdown, threshold);
    regions.forEach(([s, e]) => {
      const x1 = xScale(s);
      const x2 = Math.max(xScale(e), x1 + 1.5);
      markup += `<rect x="${x1.toFixed(1)}" y="${PAD.top}" width="${(x2 - x1).toFixed(1)}" height="${innerH}"
        fill="#e0435a" opacity="0.16"/>`;
    });

    const threshY = yScale(threshold);
    markup += `<line x1="${PAD.left}" y1="${threshY.toFixed(1)}" x2="${PAD.left + innerW}" y2="${threshY.toFixed(1)}"
      stroke="#c0385a" stroke-width="1.5" stroke-dasharray="5,4"/>`;
    markup += `<text x="${PAD.left + innerW - 4}" y="${threshY - 6}" text-anchor="end"
      font-family="Inter, sans-serif" font-size="10" font-weight="600" fill="#c0385a">${(threshold * 100).toFixed(0)}% threshold</text>`;
  }

  // Shaded area under portfolio drawdown
  const portPoints = portDrawdown.map((v, i) => `${xScale(i).toFixed(1)},${yScale(v).toFixed(1)}`).join(" ");
  const zeroY = yScale(0).toFixed(1);
  markup += `<polygon points="${PAD.left},${zeroY} ${portPoints} ${PAD.left + innerW},${zeroY}"
    fill="#0f1b2d" opacity="0.04"/>`;

  // Series lines
  allSeries.forEach(series => {
    const points = series.values.map((v, i) => `${xScale(i).toFixed(1)},${yScale(v).toFixed(1)}`).join(" ");
    markup += `<polyline data-label="${series.label}" data-width="${series.width}" points="${points}"
      fill="none" stroke="${series.color}" stroke-width="${series.width}"
      stroke-linejoin="round" stroke-linecap="round" opacity="0.85"/>`;
  });

  markup += `<rect id="chart-hover-rect" x="${PAD.left}" y="${PAD.top}" width="${innerW}" height="${innerH}" fill="transparent" style="cursor:crosshair"/>`;
  markup += `<line id="chart-crosshair" x1="0" y1="${PAD.top}" x2="0" y2="${PAD.top + innerH}"
    stroke="#0f1b2d" stroke-width="1" stroke-dasharray="3,3" opacity="0.3" display="none"/>`;
  markup += `</svg>`;

  area.innerHTML = markup;
  const newSvg = area.querySelector("svg");
  newSvg.id = "chart-svg";
  newSvg.style.width = "100%";
  newSvg.style.height = "100%";

  attachChartInteractivity(area, newSvg, W, PAD, innerW, dates, allSeries, xScale, (v) => {
    const pct = (v * 100).toFixed(1);
    return `<span style="color:#c0385a">${pct}%</span>`;
  });
}

function drawRollingSharpe(correlationData, weights, activeSeries) {
  lockedSeries = null;
  const area = document.getElementById("chart-area");
  const W = area.clientWidth || 800;
  const H = area.clientHeight || 500;
  const PAD = { top: 24, right: 48, bottom: 48, left: 68 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const SHARPE_WINDOW = 90;
  const RF_DAILY = 0.026 / 252;
  const tickers = Object.keys(weights);
  const dates = correlationData.daily_returns[tickers[0]].dates;

  function rollingSharpe(values, window = SHARPE_WINDOW) {
    return values.map((_, i) => {
      if (i < window - 1) return null;
      const slice = values.slice(i - window + 1, i + 1);
      const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
      const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / (slice.length - 1);
      const vol = Math.sqrt(variance * TRADING_DAYS);
      const annRet = (mean - RF_DAILY) * TRADING_DAYS;
      return vol === 0 ? null : annRet / vol;
    });
  }

  // Portfolio daily returns then rolling sharpe
  const portReturns = dates.map((d, i) =>
    tickers.reduce((sum, t) => sum + (weights[t] || 0) * correlationData.daily_returns[t].values[i], 0)
  );
  const portSharpe = rollingSharpe(portReturns);

  // Per-asset rolling sharpe
  const assetSharpes = {};
  tickers.forEach(t => {
    assetSharpes[t] = rollingSharpe(correlationData.daily_returns[t].values);
  });

  const allSeries = [
    { values: portSharpe, color: "#0f1b2d", width: 2, label: "Portfolio" },
    ...tickers
      .filter(t => activeSeries && activeSeries[t])
      .map(t => ({
        values: assetSharpes[t],
        color: GROUP_COLORS[correlationData.assets[t].class?.toLowerCase()]?.border || "#888",
        width: 1.5,
        label: correlationData.assets[t].name,
      })),
  ];

  const validVals = allSeries.flatMap(s => s.values.filter(v => v !== null));
  const rawMin = Math.min(...validVals);
  const rawMax = Math.max(...validVals);
  const padY = (rawMax - rawMin) * 0.08;
  const minY = rawMin - padY;
  const maxY = rawMax + padY;

  const xScale = i => PAD.left + (i / (dates.length - 1)) * innerW;
  const yScale = v => PAD.top + innerH - ((v - minY) / (maxY - minY)) * innerH;

  const yTicks = 5;
  const yTickVals = Array.from({ length: yTicks + 1 }, (_, i) => minY + (maxY - minY) * (i / yTicks));

  let markup = buildSVGScaffold(W, H, PAD, innerW, innerH, yTickVals, yScale, xScale,
    buildXTicks(dates), v => v.toFixed(1));

  // Zero line
  if (minY < 0 && maxY > 0) {
    const zeroY = yScale(0);
    markup += `<line x1="${PAD.left}" y1="${zeroY}" x2="${PAD.left + innerW}" y2="${zeroY}"
      stroke="#0f1b2d" stroke-width="1" opacity="0.15"/>`;
  }

  // Series lines — split at nulls
  allSeries.forEach(series => {
    let segments = [];
    let current = [];
    series.values.forEach((v, i) => {
      if (v === null) {
        if (current.length) { segments.push(current); current = []; }
      } else {
        current.push(`${xScale(i).toFixed(1)},${yScale(v).toFixed(1)}`);
      }
    });
    if (current.length) segments.push(current);

    segments.forEach(seg => {
      markup += `<polyline data-label="${series.label}" data-width="${series.width}" points="${seg.join(" ")}"
        fill="none" stroke="${series.color}" stroke-width="${series.width}"
        stroke-linejoin="round" stroke-linecap="round" opacity="0.85"/>`;
    });
  });

  markup += `<rect id="chart-hover-rect" x="${PAD.left}" y="${PAD.top}" width="${innerW}" height="${innerH}" fill="transparent" style="cursor:crosshair"/>`;
  markup += `<line id="chart-crosshair" x1="0" y1="${PAD.top}" x2="0" y2="${PAD.top + innerH}"
    stroke="#0f1b2d" stroke-width="1" stroke-dasharray="3,3" opacity="0.3" display="none"/>`;
  markup += `</svg>`;

  area.innerHTML = markup;
  const newSvg = area.querySelector("svg");
  newSvg.id = "chart-svg";
  newSvg.style.width = "100%";
  newSvg.style.height = "100%";

  attachChartInteractivity(area, newSvg, W, PAD, innerW, dates, allSeries, xScale, (v) => {
    if (v === null) return "—";
    const col = v >= 1 ? "#2d8a5e" : v >= 0 ? "#888" : "#c0385a";
    return `<span style="color:${col}">${v.toFixed(2)}</span>`;
  });
}

// ── Correlation matrix ────────────────────────────────────────────────────────

function drawCorrelationMatrix(correlationData, windowMode = "full") {
  const area = document.getElementById("chart-area");
  const tickers = Object.keys(correlationData.assets);
  const tickerLabels = tickers.map(t => t.split(".")[0].split("-")[0]);

  const fullCorr = {};
  tickers.forEach(t => {
    fullCorr[t] = {};
    tickers.forEach(u => { fullCorr[t][u] = t === u ? null : 0; });
  });
  correlationData.edges.forEach(({ source, target, correlation }) => {
    if (fullCorr[source]) fullCorr[source][target] = correlation;
    if (fullCorr[target]) fullCorr[target][source] = correlation;
  });

  // 90D mode swaps every cell for the rolling value — a real recompute per
  // pair, not just an annotation on top of the full-sample number.
  const corr = windowMode === "90d"
    ? Object.fromEntries(tickers.map(t => [t, Object.fromEntries(tickers.map(u =>
        [u, t === u ? null : computeRollingCorrelation(correlationData, t, u, 90)]
      ))]))
    : fullCorr;

  function cellColor(val) {
    if (val >= 0.5)  return { bg: "#f2dbd8", text: "#7a2318" };
    if (val >= 0.2)  return { bg: "#f5e8e6", text: "#9c3d2e" };
    if (val >= 0)    return { bg: "#eeecea", text: "#888" };
    if (val >= -0.2) return { bg: "#e8f0e8", text: "#2f7a52" };
    return                  { bg: "#dceae0", text: "#1c4a32" };
  }

  const cols = tickers.length;
  let html = `<div style="display:grid;grid-template-columns:44px repeat(${cols},1fr);grid-template-rows:28px repeat(${cols},1fr);gap:4px;padding:24px 28px;width:100%;height:100%;box-sizing:border-box;">`;
  html += `<div></div>`;
  tickerLabels.forEach(l => {
    html += `<div style="display:flex;align-items:center;justify-content:center;font-size:10px;color:#a0a8b0;font-family:Inter,sans-serif;">${l}</div>`;
  });
  tickers.forEach((rowT, i) => {
    html += `<div style="display:flex;align-items:center;justify-content:flex-end;padding-right:8px;font-size:10px;color:#a0a8b0;font-family:Inter,sans-serif;">${tickerLabels[i]}</div>`;
    tickers.forEach(colT => {
      const val = corr[rowT][colT];
      if (val === null || !Number.isFinite(val)) {
        html += `<div style="display:flex;align-items:center;justify-content:center;border-radius:6px;background:#f0ede6;font-size:12px;font-weight:600;color:#c8c0b4;font-family:Inter,sans-serif;">—</div>`;
      } else {
        const { bg, text } = cellColor(val);
        const sign = val >= 0 ? "+" : "";
        html += `<div style="display:flex;align-items:center;justify-content:center;border-radius:6px;background:${bg};font-size:12px;font-weight:600;color:${text};font-family:Inter,sans-serif;" title="${rowT} / ${colT}: ${sign}${val.toFixed(2)}">${sign}${val.toFixed(2)}</div>`;
      }
    });
  });
  html += `</div>`;
  area.innerHTML = html;
}

// ── Toggles ───────────────────────────────────────────────────────────────────

let activeAssets = new Set();

function buildToggles(assetSeries, getCurrentChart, redraw) {
  activeAssets = new Set();
  const wrap = document.getElementById("chart-toggles");
  wrap.innerHTML = "";

  const portBtn = document.createElement("button");
  portBtn.className = "chart-toggle active";
  portBtn.dataset.ticker = "portfolio";
  portBtn.innerHTML = `<span class="toggle-dot" style="background:#0f1b2d"></span>Portfolio`;
  portBtn.style.borderColor = "#0f1b2d";
  portBtn.style.color = "var(--ink)";
  wrap.appendChild(portBtn);

  Object.entries(assetSeries).forEach(([ticker, series]) => {
    const btn = document.createElement("button");
    btn.className = "chart-toggle";
    btn.dataset.ticker = ticker;
    btn.innerHTML = `<span class="toggle-dot" style="background:${series.color}"></span>${series.name}`;
    btn.addEventListener("click", () => {
      if (activeAssets.has(ticker)) {
        activeAssets.delete(ticker);
        btn.classList.remove("active");
        btn.style.borderColor = "";
      } else {
        activeAssets.add(ticker);
        btn.classList.add("active");
        btn.style.borderColor = series.color;
      }
      redraw();
    });
    wrap.appendChild(btn);
  });
}

// ── Main export ───────────────────────────────────────────────────────────────

export function openChartView(correlationData, weights, setView, initialTab = "vol") {
  setView("chart");

  document.fonts.ready.then(() => {
    const port = portfolioRollingVol(correlationData, weights);
    const assetSeries = {};
    Object.keys(correlationData.assets).forEach(t => {
      const dr = correlationData.daily_returns[t];
      assetSeries[t] = {
        name: correlationData.assets[t].name,
        dates: dr.dates,
        values: rollingVol(dr.values),
        color: GROUP_COLORS[correlationData.assets[t].class?.toLowerCase()]?.border || "#888",
      };
    });

    let currentChart = initialTab;

    const ddToggle = document.getElementById("dd-threshold-toggle");
    const ddSlider = document.getElementById("dd-threshold-slider");
    const ddValue = document.getElementById("dd-threshold-value");
    const ddWrap = document.getElementById("drawdown-threshold-wrap");
    const ddControls = document.getElementById("dd-threshold-controls");
    const sigmaToggle = document.getElementById("vol-sigma-toggle");
    const sigmaWrap = document.getElementById("vol-sigma-wrap");
    const corrWindowWrap = document.getElementById("corr-window-wrap");
    const corrWindowBtns = document.querySelectorAll(".corr-window-btn");
    let corrWindow = "full";

    function getActiveSeries() {
      const s = {};
      activeAssets.forEach(t => { s[t] = assetSeries[t]; });
      return s;
    }

    function getDrawdownThreshold() {
      return ddToggle.checked ? -Number(ddSlider.value) / 100 : null;
    }

    function redraw() {
      if (currentChart === "vol") drawChart(port, getActiveSeries(), correlationData, sigmaToggle.checked);
      else if (currentChart === "returns") drawCumulativeReturns(correlationData, weights, getActiveSeries());
      else if (currentChart === "drawdown") drawDrawdown(correlationData, weights, getActiveSeries(), getDrawdownThreshold());
      else if (currentChart === "corr") drawCorrelationMatrix(correlationData, corrWindow);
      else if (currentChart === "sharpe") drawRollingSharpe(correlationData, weights, getActiveSeries());
    }

    sigmaToggle.addEventListener("change", redraw);

    corrWindowBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        corrWindowBtns.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        corrWindow = btn.dataset.window;
        redraw();
      });
    });

    ddToggle.addEventListener("change", () => {
      ddControls.classList.toggle("visible", ddToggle.checked);
      redraw();
    });
    ddSlider.addEventListener("input", () => {
      ddValue.textContent = `-${ddSlider.value}%`;
      if (ddToggle.checked) redraw();
    });

    buildToggles(assetSeries, () => currentChart, redraw);

    const tabs = document.querySelectorAll(".chart-tab");
    const indicator = document.getElementById("chart-tab-indicator");
    const togglesWrap = document.getElementById("chart-toggles");

    function moveIndicator(tab) {
      indicator.style.left = tab.offsetLeft + "px";
      indicator.style.width = tab.offsetWidth + "px";
    }

    const titles = {
      vol:      "Realised Volatility (30D)",
      corr:     "Correlation Heatmap",
      returns:  "Cumulative Returns",
      drawdown: "Maximum Drawdown",
      sharpe:   "Rolling Sharpe (90D)",
    };

    tabs.forEach(tab => {
      tab.addEventListener("click", () => {
        tabs.forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        moveIndicator(tab);
        currentChart = tab.dataset.chart;
        document.getElementById("chart-title").textContent = titles[currentChart];
        togglesWrap.style.display = currentChart === "corr" ? "none" : "flex";
        ddWrap.classList.toggle("visible", currentChart === "drawdown");
        sigmaWrap.classList.toggle("visible", currentChart === "vol");
        corrWindowWrap.classList.toggle("visible", currentChart === "corr");
        redraw();
      });
    });

    // Init — opens on whichever tab the caller asked for (e.g. clicking the
    // "Max drawdown" stat jumps straight to the Drawdown tab), defaulting
    // to Realised Vol when there's no specific match.
    tabs.forEach(t => t.classList.remove("active"));
    const initTab = document.querySelector(`.chart-tab[data-chart="${currentChart}"]`)
      || document.querySelector('.chart-tab[data-chart="vol"]');
    if (initTab) {
      initTab.classList.add("active");
      currentChart = initTab.dataset.chart;
      requestAnimationFrame(() => moveIndicator(initTab));
    }
    togglesWrap.style.display = currentChart === "corr" ? "none" : "flex";
    ddWrap.classList.toggle("visible", currentChart === "drawdown");
    sigmaWrap.classList.toggle("visible", currentChart === "vol");
    corrWindowWrap.classList.toggle("visible", currentChart === "corr");
    document.getElementById("chart-title").textContent = titles[currentChart];
    redraw();
  });
}