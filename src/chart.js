import { GROUP_COLORS } from "./constants.js";

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
  return {
    dates: allDates,
    values: rollingVol(portReturns),
  };
}

export function openChartView(correlationData, weights, setView) {
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

    buildToggles(correlationData, assetSeries, port);
    drawChart(port, {}, correlationData);
  });
}

let activeAssets = new Set();

function buildToggles(correlationData, assetSeries, port) {
  activeAssets = new Set();
  const wrap = document.getElementById("chart-toggles");
  wrap.innerHTML = "";

  const portBtn = document.createElement("button");
  portBtn.className = "chart-toggle active";
  portBtn.dataset.ticker = "portfolio";
  portBtn.innerHTML = `<span class="toggle-dot" style="background:#0f1b2d"></span>Portfolio`;
  portBtn.style.borderColor = "#0f1b2d";
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
      const activeSeries = {};
      activeAssets.forEach(t => { activeSeries[t] = assetSeries[t]; });
      drawChart(port, activeSeries, correlationData);
    });
    wrap.appendChild(btn);
  });
}

function drawChart(port, assetSeries, correlationData) {
  const area = document.getElementById("chart-area");
  const W = area.clientWidth || 800;
  const H = area.clientHeight || 500;
  const PAD = { top: 24, right: 48, bottom: 48, left: 62 };
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
  const yTickVals = Array.from({ length: yTicks + 1 }, (_, i) =>
    minY + (maxY - minY) * (i / yTicks)
  );

  const xTicks = [];
  let lastYear = null;
  dates.forEach((d, i) => {
    const year = d.slice(0, 4);
    if (
      (d.endsWith("-01-01") || d.endsWith("-01-02") || d.endsWith("-01-03")) &&
      year !== lastYear
    ) {
      xTicks.push({ i, label: year });
      lastYear = year;
    }
  });

  const filteredXTicks = xTicks.length > 6
    ? xTicks.filter((_, i) => i % 2 === 0)
    : xTicks;

  let markup = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;

  // Y grid lines
  yTickVals.forEach(v => {
    const y = yScale(v);
    const isZero = Math.abs(v) < 0.0001;
    markup += `<line x1="${PAD.left}" y1="${y}" x2="${PAD.left + innerW}" y2="${y}"
      stroke="#e8e8e0" stroke-width="${isZero ? 1.5 : 1}" stroke-dasharray="${isZero ? "none" : "3,4"}"/>`;
  });

  // Avg vol overlay
  const avgY = yScale(avgVol);
  markup += `<line x1="${PAD.left}" y1="${avgY}" x2="${PAD.left + innerW}" y2="${avgY}"
    stroke="#0f1b2d" stroke-width="1" stroke-dasharray="6,4" opacity="0.25"/>`;
  markup += `<text x="${PAD.left + innerW + 6}" y="${avgY + 4}"
    font-family="IBM Plex Mono, monospace" font-size="9" fill="#0f1b2d" opacity="0.4">avg</text>`;

  // Y-axis labels
  yTickVals.forEach(v => {
    const y = yScale(v);
    markup += `<text x="${PAD.left - 8}" y="${y + 4}" text-anchor="end"
      font-family="IBM Plex Mono, monospace" font-size="10" fill="#a0a8b0">
      ${(v * 100).toFixed(0)}%
    </text>`;
  });

  // X-axis labels + vertical guides
  filteredXTicks.forEach(({ i, label }) => {
    const x = xScale(i);
    markup += `<text x="${x}" y="${PAD.top + innerH + 20}" text-anchor="middle"
      font-family="IBM Plex Mono, monospace" font-size="10" fill="#a0a8b0">${label}</text>`;
    markup += `<line x1="${x}" y1="${PAD.top}" x2="${x}" y2="${PAD.top + innerH}"
      stroke="#e8e8e0" stroke-width="1"/>`;
  });

  // Series lines
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
      markup += `<polyline points="${seg.join(" ")}"
        fill="none" stroke="${series.color}" stroke-width="${series.width}"
        stroke-linejoin="round" stroke-linecap="round" opacity="0.85"/>`;
    });
  });

  // Axes
  markup += `<line x1="${PAD.left}" y1="${PAD.top}" x2="${PAD.left}" y2="${PAD.top + innerH}"
    stroke="#dde0e4" stroke-width="1"/>`;
  markup += `<line x1="${PAD.left}" y1="${PAD.top + innerH}" x2="${PAD.left + innerW}" y2="${PAD.top + innerH}"
    stroke="#dde0e4" stroke-width="1"/>`;

  // Hover hit area
  markup += `<rect id="chart-hover-rect" x="${PAD.left}" y="${PAD.top}"
    width="${innerW}" height="${innerH}" fill="transparent" style="cursor:crosshair"/>`;

  // Crosshair
  markup += `<line id="chart-crosshair" x1="0" y1="${PAD.top}" x2="0" y2="${PAD.top + innerH}"
    stroke="#0f1b2d" stroke-width="1" stroke-dasharray="3,3" opacity="0.3" display="none"/>`;

  markup += `</svg>`;

  area.querySelector("svg").outerHTML = markup;
  const newSvg = area.querySelector("svg");
  newSvg.id = "chart-svg";
  newSvg.style.width = "100%";
  newSvg.style.height = "100%";

  // Hover interactivity
  const tooltip = document.getElementById("chart-tooltip");
  const hoverRect = newSvg.getElementById("chart-hover-rect");
  const crosshair = newSvg.getElementById("chart-crosshair");

  hoverRect.addEventListener("mousemove", e => {
    const rect = newSvg.getBoundingClientRect();
    const scaleX = W / rect.width;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const relX = mouseX - PAD.left;
    const idx = Math.round((relX / innerW) * (dates.length - 1));
    if (idx < 0 || idx >= dates.length) return;

    const x = xScale(idx);
    crosshair.setAttribute("x1", x);
    crosshair.setAttribute("x2", x);
    crosshair.setAttribute("display", "inline");

    const date = dates[idx];
    let html = `<div style="font-size:10px;color:#a0a8b0;margin-bottom:5px;">${date}</div>`;
    allSeries.forEach(s => {
      const v = s.values[idx];
      if (v === null) return;
      html += `<div style="display:flex;justify-content:space-between;gap:16px;margin-bottom:2px;">
        <span style="color:${s.color};font-weight:600;">${s.label}</span>
        <span>${(v * 100).toFixed(1)}%</span>
      </div>`;
    });

    tooltip.innerHTML = html;
    tooltip.style.display = "block";

    const areaRect = area.getBoundingClientRect();
    const tipX = e.clientX - areaRect.left + 12;
    const tipY = e.clientY - areaRect.top - 20;
    const flipLeft = tipX + 160 > areaRect.width;
    tooltip.style.left = flipLeft ? `${tipX - 180}px` : `${tipX}px`;
    tooltip.style.top = `${Math.max(8, tipY)}px`;
  });

  hoverRect.addEventListener("mouseleave", () => {
    crosshair.setAttribute("display", "none");
    tooltip.style.display = "none";
  });
}