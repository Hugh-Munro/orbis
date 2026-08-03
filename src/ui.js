import { GROUP_COLORS, GROUP_LABELS } from "./constants.js";
import { computeCorrelationSignificance, computeRollingCorrelation, computeAssetDaysToLiquidate } from "./stats.js";

export function formatGroupName(group) {
  return GROUP_LABELS[group] || group;
}

function formatDollars(amount) {
  if (amount == null || Number.isNaN(amount)) return "—";
  return "$" + Math.round(amount).toLocaleString("en-US");
}

export function buildLegend(app) {
  const container = document.getElementById("legend-items");
  container.innerHTML = "";
  Object.entries(GROUP_COLORS).forEach(([group, c]) => {
    const item = document.createElement("div");
    item.className = "legend-item";
    item.dataset.group = group;
    const dot = document.createElement("div");
    dot.className = "legend-dot";
    dot.style.background = c.bg;
    dot.style.border = `2px solid ${c.border}`;
    item.append(dot, document.createTextNode(formatGroupName(group)));
    item.addEventListener("click", () => {
      const turningOn = !item.classList.contains("active");
      setClassFilter(app, turningOn ? group : null, item);
    });
    container.appendChild(item);
  });
}

export function buildPortfolioValuePanel(app, onValueChange) {
  const input = document.getElementById("portfolio-value-input");
  if (!input) return;

  function parseValue(raw) {
    const cleaned = raw.replace(/[^0-9.]/g, "");
    const num = parseFloat(cleaned);
    return Number.isFinite(num) && num > 0 ? num : 0;
  }

  function commit() {
    if (app.valueMode === "shares") return;
    const value = parseValue(input.value);
    app.portfolioValue = value;
    input.value = value ? Math.round(value).toLocaleString("en-US") : "";
    onValueChange(value);
  }

  app.portfolioValue = parseValue(input.value);
  input.addEventListener("blur", commit);
  input.addEventListener("keydown", e => {
    if (e.key === "Enter") input.blur();
  });
}

export function setPortfolioValueDisplay(value, readOnly) {
  const input = document.getElementById("portfolio-value-input");
  if (!input) return;
  input.value = value ? Math.round(value).toLocaleString("en-US") : "0";
  input.readOnly = !!readOnly;
  input.classList.toggle("pv-readonly", !!readOnly);
}

export function buildUniversePanel(app, nodes, onUniverseChange) {
  const container = document.getElementById("universe-list");
  const header = document.getElementById("universe-header");
  const panel = document.getElementById("universe-panel");

  app.selectedTickers = new Set(nodes.map(n => n.id));

  container.innerHTML = nodes.map(n => `
    <label class="universe-row" data-ticker="${n.id}">
      <input type="checkbox" class="universe-checkbox" data-ticker="${n.id}" checked>
      <span class="universe-name">${n.label}</span>
      <span class="universe-class">${n.id}</span>
    </label>
  `).join("");

  container.querySelectorAll(".universe-checkbox").forEach(cb => {
    cb.addEventListener("change", () => {
      const ticker = cb.dataset.ticker;
      const row = cb.closest(".universe-row");
      if (cb.checked) {
        app.selectedTickers.add(ticker);
        row.classList.remove("unchecked");
      } else {
        if (app.selectedTickers.size <= 1) {
          cb.checked = true;
          return;
        }
        app.selectedTickers.delete(ticker);
        row.classList.add("unchecked");
      }
      onUniverseChange(app.selectedTickers);
    });
  });

  if (header) {
    header.addEventListener("click", () => {
      panel.classList.toggle("collapsed");
    });
  }
}

import { savePortfolio, getSavedPortfolios, deletePortfolio } from "./savedPortfolios.js";

export function buildWeightingPanel(app, correlationData, onWeightsChange) {
  const tabs = document.querySelectorAll(".wt-tab");
  const customWrap = document.getElementById("custom-weights-wrap");
  const savedWrap = document.getElementById("saved-portfolios-wrap");
  const indicator = document.getElementById("weight-tab-indicator");
  const allTickers = Object.keys(correlationData.assets);

  let customMode = "weights";

  function moveIndicator(tab) {
    if (!indicator) return;
    indicator.style.left = tab.offsetLeft + "px";
    indicator.style.width = tab.offsetWidth + "px";
  }

  requestAnimationFrame(() => {
    const activeTab = document.querySelector(".wt-tab.active");
    if (activeTab) moveIndicator(activeTab);
  });

  // Google Fonts loads async — an initial measurement can land before Inter
  // swaps in, leaving the pill sized to fallback-font metrics. Re-measure
  // once webfonts are actually ready.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      const activeTab = document.querySelector(".wt-tab.active");
      if (activeTab) moveIndicator(activeTab);
    });
  }

  function activeTickers() {
    return allTickers.filter(t => !app.selectedTickers || app.selectedTickers.has(t));
  }

  // Normalises any raw (possibly non-summing-to-1) weight map to sum to 1
  // across exactly the active tickers. Missing tickers default to 0.
  function normaliseWeights(rawWeights, tickers) {
    let total = 0;
    tickers.forEach(t => { total += rawWeights[t] || 0; });
    const safeTotal = total || 1;
    return Object.fromEntries(tickers.map(t => [t, (rawWeights[t] || 0) / safeTotal]));
  }

  // Single source of truth for the custom tab: always reads from app.weights,
  // never resets. Switching between % and Shares is a pure display transform —
  // both views represent the exact same underlying weights until the person
  // actually edits something.
  function renderCustomTab() {
    const tickers = activeTickers();
    // If app.weights doesn't yet cover the active universe (e.g. just switched
    // schemes), fall back to equal split as a starting point — but this only
    // happens once, not on every tab click.
    const baseWeights = tickers.every(t => app.weights && Number.isFinite(app.weights[t]))
      ? app.weights
      : Object.fromEntries(tickers.map(t => [t, 1 / tickers.length]));

    if (customMode === "shares") {
      renderShareInputs(baseWeights, tickers);
    } else {
      renderWeightSliders(baseWeights, tickers);
    }
  }

  function renderWeightSliders(weights, tickers) {
    customWrap.innerHTML = `
      <div class="mode-toggle" id="custom-mode-toggle">
        <button type="button" class="mode-btn active" data-mode="weights">% Weights</button>
        <button type="button" class="mode-btn" data-mode="shares">Shares</button>
      </div>
      <div id="custom-sliders-wrap"></div>
      <button type="button" id="save-portfolio-btn" class="save-portfolio-btn">
        <i class="ti ti-device-floppy" style="font-size:13px;vertical-align:-1px;margin-right:5px"></i>Save current
      </button>
    `;
    attachModeToggleListeners();
    attachSaveButtonListener();

    const slidersWrap = document.getElementById("custom-sliders-wrap");
    slidersWrap.innerHTML = tickers.map(t => {
      const name = correlationData.assets[t].name;
      const pct = Math.round((weights[t] || 0) * 100);
      return `
        <div class="weight-row" data-ticker="${t}">
          <div class="weight-row-label">
            <span>${name}</span>
            <span class="weight-row-value">${pct}%</span>
          </div>
          <input type="range" min="0" max="100" value="${pct}" class="weight-slider" data-ticker="${t}">
        </div>
      `;
    }).join("");

    slidersWrap.querySelectorAll(".weight-slider").forEach(slider => {
      slider.addEventListener("input", () => {
        const row = slider.closest(".weight-row");
        row.querySelector(".weight-row-value").textContent = `${slider.value}%`;
        emitCustomWeights();
      });
    });
  }

  function emitCustomWeights() {
    const tickers = activeTickers();
    const raw = {};
    document.querySelectorAll("#custom-sliders-wrap .weight-slider").forEach(slider => {
      if (!tickers.includes(slider.dataset.ticker)) return;
      raw[slider.dataset.ticker] = Number(slider.value);
    });
    onWeightsChange(normaliseWeights(raw, tickers));
  }

  function renderShareInputs(weights, tickers) {
    const portfolioValue = app.portfolioValue || 0;
    customWrap.innerHTML = `
      <div class="mode-toggle" id="custom-mode-toggle">
        <button type="button" class="mode-btn" data-mode="weights">% Weights</button>
        <button type="button" class="mode-btn active" data-mode="shares">Shares</button>
      </div>
      <div id="custom-shares-wrap"></div>
      <button type="button" id="save-portfolio-btn" class="save-portfolio-btn">
        <i class="ti ti-device-floppy" style="font-size:13px;vertical-align:-1px;margin-right:5px"></i>Save current
      </button>
    `;
    attachModeToggleListeners();
    attachSaveButtonListener();

    const sharesWrap = document.getElementById("custom-shares-wrap");
    sharesWrap.innerHTML = tickers.map(t => {
      const name = correlationData.assets[t].name;
      const price = correlationData.assets[t].price || 0;
      const dollarValue = (weights[t] || 0) * portfolioValue;
      const shares = price > 0 ? dollarValue / price : 0;
      return `
        <div class="shares-row" data-ticker="${t}">
          <div class="shares-row-label">
            <span>${name}</span>
            <span class="shares-row-value">$${Math.round(dollarValue).toLocaleString("en-US")}</span>
          </div>
          <input type="number" min="0" step="1" value="${Math.round(shares)}" class="shares-input" data-ticker="${t}">
        </div>
      `;
    }).join("");

    sharesWrap.querySelectorAll(".shares-input").forEach(input => {
      input.addEventListener("input", () => {
        const row = input.closest(".shares-row");
        const ticker = input.dataset.ticker;
        const price = correlationData.assets[ticker].price || 0;
        const shares = Number(input.value) || 0;
        row.querySelector(".shares-row-value").textContent = `$${Math.round(shares * price).toLocaleString("en-US")}`;
        emitSharesWeights();
      });
    });
  }

  function emitSharesWeights() {
    const tickers = activeTickers();
    const dollarValues = {};
    document.querySelectorAll("#custom-shares-wrap .shares-input").forEach(input => {
      if (!tickers.includes(input.dataset.ticker)) return;
      const ticker = input.dataset.ticker;
      const price = correlationData.assets[ticker].price || 0;
      const shares = Number(input.value) || 0;
      dollarValues[ticker] = shares * price;
    });
    onWeightsChange(normaliseWeights(dollarValues, tickers));
  }

  function attachModeToggleListeners() {
    document.querySelectorAll(".mode-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        customMode = btn.dataset.mode;
        renderCustomTab(); // pure re-render of the current app.weights — nothing resets
      });
    });
  }

  function attachSaveButtonListener() {
    const btn = document.getElementById("save-portfolio-btn");
    if (!btn) return;
    btn.addEventListener("click", () => {
      const name = prompt("Name this portfolio:");
      if (!name || !name.trim()) return;
      savePortfolio(name.trim(), app.weights, app.selectedTickers);
      if (document.querySelector('.wt-tab[data-scheme="saved"]').classList.contains("active")) {
        renderSavedTab();
      }

      // Quiet confirmation on the button itself — no popup, just a brief
      // state flip so the action reads as having happened.
      const originalHtml = btn.innerHTML;
      btn.classList.add("just-saved");
      btn.innerHTML = `<i class="ti ti-check" style="font-size:13px;vertical-align:-1px;margin-right:5px"></i>Saved`;
      setTimeout(() => {
        btn.classList.remove("just-saved");
        btn.innerHTML = originalHtml;
      }, 1300);
    });
  }

  function renderSavedTab() {
    const portfolios = getSavedPortfolios();
    if (!portfolios.length) {
      savedWrap.innerHTML = `<p class="saved-empty">No saved portfolios yet. Build one in the Custom tab and hit Save.</p>`;
      return;
    }
    savedWrap.innerHTML = portfolios.map(p => `
      <div class="saved-portfolio-row" data-id="${p.id}">
        <span class="saved-portfolio-name">${p.name}</span>
        <button type="button" class="saved-load-btn" data-id="${p.id}">Load</button>
        <button type="button" class="saved-delete-btn" data-id="${p.id}" title="Delete">
          <i class="ti ti-trash"></i>
        </button>
      </div>
    `).join("");

    savedWrap.querySelectorAll(".saved-load-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const portfolio = portfolios.find(p => p.id === btn.dataset.id);
        if (!portfolio) return;
        // Restore ticker selection, then weights, matching the same path as
        // any other scheme change.
        app.selectedTickers = new Set(portfolio.selectedTickers);
        document.querySelectorAll(".universe-checkbox").forEach(cb => {
          const inSet = app.selectedTickers.has(cb.dataset.ticker);
          cb.checked = inSet;
          cb.closest(".universe-row").classList.toggle("unchecked", !inSet);
        });
        onWeightsChange(normaliseWeights(portfolio.weights, [...app.selectedTickers]));

        // Quiet confirmation — the row and button flash the "ink" state
        // briefly so loading a portfolio reads as an action, not silence.
        const row = btn.closest(".saved-portfolio-row");
        const originalLabel = btn.textContent;
        row.classList.add("just-loaded");
        btn.classList.add("just-loaded");
        btn.textContent = "Loaded";
        setTimeout(() => {
          row.classList.remove("just-loaded");
          btn.classList.remove("just-loaded");
          btn.textContent = originalLabel;
        }, 1100);
      });
    });

    savedWrap.querySelectorAll(".saved-delete-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const row = btn.closest(".saved-portfolio-row");
        row.classList.add("removing");
        row.addEventListener("transitionend", () => {
          deletePortfolio(btn.dataset.id);
          renderSavedTab();
        }, { once: true });
      });
    });
  }

  app.onUniverseChangeForCustom = () => {
    if (document.querySelector('.wt-tab[data-scheme="custom"]').classList.contains("active")) {
      renderCustomTab();
    }
  };

  // Custom tab re-renders (in current display mode) whenever portfolio value
  // changes, since shares mode depends on it for the $ ↔ share conversion.
  app.onPortfolioValueChangeForCustom = () => {
    if (document.querySelector('.wt-tab[data-scheme="custom"]').classList.contains("active")) {
      renderCustomTab();
    }
  };

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(b => b.classList.remove("active"));
      tab.classList.add("active");
      moveIndicator(tab);
      const scheme = tab.dataset.scheme;

      customWrap.classList.toggle("visible", scheme === "custom");
      savedWrap.classList.toggle("visible", scheme === "saved");

      if (scheme === "custom") {
        renderCustomTab();
      } else if (scheme === "saved") {
        savedWrap.innerHTML = "";
        renderSavedTab();
      } else {
        customWrap.innerHTML = "";
        onWeightsChange(scheme);
      }
    });
  });
}

export function clearSearch(app) {
  const input = document.getElementById("search-input");
  if (input) input.value = "";
  if (app.cy) app.cy.elements().removeClass("search-match search-dimmed");
}

export function clearFilterClasses(app) {
  if (!app.cy) return;
  app.cy.elements().removeClass("highlighted dimmed");
  app.cy.nodes().forEach(n => { n.removeData("hl_border"); n.removeData("hl_bg"); });
  app.cy.edges().forEach(e => { e.removeData("hl_edge"); });
}

export function clearSelectionClasses(app) {
  if (!app.cy) return;
  app.cy.elements().removeClass("selected-node selected-edge neighbour-node");
}

function clearLegendActive() {
  document.querySelectorAll(".legend-item.active").forEach(el => el.classList.remove("active"));
}

export function hideEdgeCard(app) {
  app.selectedEdge = null;
  document.getElementById("fc-edge").classList.remove("visible");
}

export function positionCardForEdge(app, edge) {
  if (!edge) return;
  const wrap = document.getElementById("cy-wrap");
  const card = document.getElementById("fc-edge");
  if (!card.classList.contains("visible")) return;
  const mid = edge.midpoint();
  const zoom = app.cy.zoom();
  const pan = app.cy.pan();
  const pos = { x: mid.x * zoom + pan.x, y: mid.y * zoom + pan.y };
  const wrapRect = wrap.getBoundingClientRect();
  const cardRect = card.getBoundingClientRect();
  const margin = 16;
  let left = pos.x + margin;
  let top = pos.y + margin;
  if (left + cardRect.width + margin > wrapRect.width) left = pos.x - cardRect.width - margin;
  if (top + cardRect.height + margin > wrapRect.height) top = pos.y - cardRect.height - margin;
  card.style.left = `${Math.max(margin, left)}px`;
  card.style.top = `${Math.max(margin, top)}px`;
}

export function showEdgeCard(edge, app) {
  const corr = edge.data("correlation");
  const source = edge.source().data("label");
  const target = edge.target().data("label");
  const sign = corr >= 0 ? "+" : "";

  const { n, ciLow, ciHigh, pValue } = computeCorrelationSignificance(
    app.correlationData, edge.source().id(), edge.target().id(), corr
  );
  const rolling = computeRollingCorrelation(app.correlationData, edge.source().id(), edge.target().id(), 90);
  const fmtP = p => !Number.isFinite(p) ? "—" : p < 0.001 ? "< .001" : ("= " + p.toFixed(3).replace(/^0/, ""));
  const fmtCi = v => Number.isFinite(v) ? (v >= 0 ? "+" : "") + v.toFixed(2) : "—";

  const drift = Number.isFinite(rolling) ? rolling - corr : NaN;
  const driftRow = Number.isFinite(rolling)
    ? `<div class="fc-edge-row">
        <span>90D rolling</span>
        <span class="fc-edge-row-val">${fmtCi(rolling)}<span style="color:${Math.abs(drift) >= 0.15 ? "#c96a1f" : "#a0a8b0"};font-weight:600;margin-left:6px">${drift >= 0 ? "+" : ""}${drift.toFixed(2)}</span></span>
      </div>`
    : "";

  document.getElementById("fc-edge-name").textContent = `${source} / ${target}`;
  document.getElementById("fc-edge-value").innerHTML =
    `<span style="color:${corr >= 0 ? "#1a1a1a" : "#a8391f"}">${sign}${corr.toFixed(2)}</span>`;
  document.getElementById("fc-edge-stats").innerHTML = `
    ${driftRow}
    <div class="fc-edge-row"><span>n</span><span class="fc-edge-row-val">${n || "—"}</span></div>
    <div class="fc-edge-row"><span>95% CI</span><span class="fc-edge-row-val">[${fmtCi(ciLow)}, ${fmtCi(ciHigh)}]</span></div>
    <div class="fc-edge-row"><span>p-value (H0: ρ=0)</span><span class="fc-edge-row-val">${fmtP(pValue)}</span></div>
  `;
  document.getElementById("fc-edge").classList.add("visible");
  positionCardForEdge(app, edge);
}

export function hideCard(app) {
  app.selectedNode = null;
  document.getElementById("fc").classList.remove("visible");
}

export function resetView(app) {
  if (!app.cy) return;
  clearSearch(app);
  clearFilterClasses(app);
  clearSelectionClasses(app);
  hideCard(app);
  hideEdgeCard(app);
  clearLegendActive();
  app.cy.animate({ fit: { padding: 40 }, duration: 400, easing: "ease-in-out" });
}

export function setClassFilter(app, group, item) {
  if (!app.cy) return;
  clearSearch(app);
  clearFilterClasses(app);
  clearSelectionClasses(app);
  hideCard(app);
  hideEdgeCard(app);
  clearLegendActive();

  if (group === null) return;

  item.classList.add("active");
  const c = GROUP_COLORS[group] || GROUP_COLORS.equity;

  app.cy.nodes().forEach(node => {
    if (node.data("group") === group) {
      node.data("hl_border", c.border);
      node.addClass("highlighted");
    } else {
      node.addClass("dimmed");
    }
  });

  app.cy.edges().forEach(edge => {
    if (edge.source().data("group") === group && edge.target().data("group") === group) {
      edge.addClass("highlighted");
    } else {
      edge.addClass("dimmed");
    }
  });
}

export function switchToAllNodesWithoutClearingSearch(app) {
  clearFilterClasses(app);
  clearSelectionClasses(app);
  hideCard(app);
  hideEdgeCard(app);
  clearLegendActive();
}

export function positionCardForNode(app, node) {
  if (!node) return;
  const wrap = document.getElementById("cy-wrap");
  const card = document.getElementById("fc");
  if (!card.classList.contains("visible")) return;
  const pos = node.renderedPosition();
  const wrapRect = wrap.getBoundingClientRect();
  const cardRect = card.getBoundingClientRect();
  const margin = 16;
  let left = pos.x + margin;
  let top = pos.y + margin;
  if (left + cardRect.width + margin > wrapRect.width) left = pos.x - cardRect.width - margin;
  if (top + cardRect.height + margin > wrapRect.height) top = pos.y - cardRect.height - margin;
  card.style.left = `${Math.max(margin, left)}px`;
  card.style.top = `${Math.max(margin, top)}px`;
}

export function showCard(app, data, node) {
  const card = document.getElementById("fc");
  const colors = GROUP_COLORS[data.group] || GROUP_COLORS.equity;

  document.getElementById("fc-name").textContent = data.label;
  document.getElementById("fc-ticker").textContent = data.id;

  const pill = document.getElementById("fc-pill");
  pill.textContent = data.paradigm;
  pill.style.background = colors.bg;
  pill.style.color = colors.text;
  pill.style.borderColor = colors.border;

  const weight = (app.weights && app.weights[data.id]) || 0;
  const dollarAmount = (app.portfolioValue || 0) * weight;
  document.getElementById("fc-allocation").innerHTML =
    `<span class="fc-alloc-amount">${formatDollars(dollarAmount)}</span>` +
    `<span class="fc-alloc-pct">${(weight * 100).toFixed(1)}%</span>`;

  const asset = app.correlationData?.assets?.[data.id];
  const miniGrid = document.getElementById("fc-mini-grid");
  if (asset) {
    const fmt = v => Number.isFinite(v) ? (v * 100).toFixed(1) + "%" : "—";
    const fmtRatio = v => Number.isFinite(v) ? v.toFixed(2) : "—";
    const fmtCompactDollars = v => {
      if (!Number.isFinite(v) || v <= 0) return "—";
      if (v >= 1e9) return "$" + (v / 1e9).toFixed(1) + "B";
      if (v >= 1e6) return "$" + (v / 1e6).toFixed(1) + "M";
      if (v >= 1e3) return "$" + (v / 1e3).toFixed(0) + "K";
      return "$" + v.toFixed(0);
    };
    const pos = "#2d8a5e";
    const neg = "#c0385a";
    const neu = "#888";
    miniGrid.innerHTML = `
      <div class="fc-stat">
        <div class="fc-stat-label">Ann. return</div>
        <div class="fc-stat-val" style="color:${asset.return >= 0 ? pos : neg}">
          ${asset.return >= 0 ? "+" : ""}${fmt(asset.return)}
        </div>
      </div>
      <div class="fc-stat">
        <div class="fc-stat-label">Volatility</div>
        <div class="fc-stat-val" style="color:${neu}">${fmt(asset.vol)}</div>
      </div>
      <div class="fc-stat">
        <div class="fc-stat-label">Max drawdown</div>
        <div class="fc-stat-val" style="color:${neg}">${fmt(asset.maxDrawdown)}</div>
      </div>
      <div class="fc-stat">
        <div class="fc-stat-label">Sharpe</div>
        <div class="fc-stat-val" style="color:${(asset.sharpe || 0) >= 1 ? pos : neg}">
          ${fmtRatio(asset.sharpe)}
        </div>
      </div>
      <div class="fc-stat" title="Time to unwind this position at 20% of its 20-day average daily dollar volume">
        <div class="fc-stat-label">Days to liquidate</div>
        <div class="fc-stat-val" style="color:${neu}">
          ${fmtRatio(computeAssetDaysToLiquidate(app.correlationData, data.id, dollarAmount))}
        </div>
      </div>
      <div class="fc-stat" title="20-day average daily dollar volume traded">
        <div class="fc-stat-label">ADTV</div>
        <div class="fc-stat-val" style="color:${neu}">${fmtCompactDollars(asset.adtv)}</div>
      </div>
    `;
  } else {
    miniGrid.innerHTML = "";
  }

  const corrSection = document.getElementById("fc-corr-section");
  const edges = app.cy.edges().filter(e =>
    e.source().id() === data.id || e.target().id() === data.id
  );
  if (edges.length) {
    const rows = edges.map(e => {
      const other = e.source().id() === data.id ? e.target() : e.source();
      const corr = e.data("correlation");
      const sign = corr >= 0 ? "+" : "";
      const col = corr >= 0.5 ? "#9c3d2e" : corr >= 0 ? "#b8b4a8" : "#2f7a52";
      return `<div class="fc-corr-row">
        <span class="fc-corr-name">${other.data("label")}</span>
        <span class="fc-corr-val" style="color:${col}">${sign}${corr.toFixed(2)}</span>
      </div>`;
    }).join("");
    corrSection.innerHTML = `<div class="fc-corr-label">Correlations</div>${rows}`;
  } else {
    corrSection.innerHTML = "";
  }

  card.classList.add("visible");
  positionCardForNode(app, node);
}

export function buildStatsPanel(stats) {
  const container = document.getElementById("stats-panel-body");
  if (!container) return;

  function fmtPercent(val, decimals = 2) {
    if (!Number.isFinite(val)) return "—";
    return (val >= 0 ? "+" : "") + (val * 100).toFixed(decimals) + "%";
  }

  function fmtRatio(val) {
    return Number.isFinite(val) ? val.toFixed(2) : "—";
  }

  function color(val) {
    if (!Number.isFinite(val)) return "#a0a8b0";
    return val >= 0 ? "#2d8a5e" : "#c0385a";
  }

  function renderHistogram(hist) {
    if (!hist) return `<div class="hist-empty">Not enough daily history to plot a distribution</div>`;
    const W = 300, chartH = 160, axisY = chartH, labelY = axisY + 15, svgH = labelY + 4;
    const maxVal = Math.max(...hist.counts, ...hist.normalCounts, 1);
    const binCount = hist.counts.length;
    const barW = W / binCount;
    const pct = v => (v >= 0 ? "+" : "") + (v * 100).toFixed(1) + "%";

    const bars = hist.counts.map((c, i) => {
      const h = (c / maxVal) * chartH;
      const binLo = hist.min + i * hist.binWidth;
      const binHi = binLo + hist.binWidth;
      return `<rect class="hist-bar" x="${(i * barW).toFixed(1)}" y="${(chartH - h).toFixed(1)}" width="${Math.max(0, barW - 1.2).toFixed(1)}" height="${h.toFixed(1)}" rx="1.5"><title>${pct(binLo)} to ${pct(binHi)}: ${c} day${c === 1 ? "" : "s"}</title></rect>`;
    }).join("");

    const points = hist.normalCounts.map((c, i) => {
      const x = (i + 0.5) * barW;
      const y = chartH - (c / maxVal) * chartH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");

    const zeroX = ((0 - hist.min) / (hist.max - hist.min)) * W;
    const zeroLine = zeroX >= 0 && zeroX <= W
      ? `<line x1="${zeroX.toFixed(1)}" y1="0" x2="${zeroX.toFixed(1)}" y2="${chartH}" class="hist-zero-line" />`
      : "";

    const tickCount = 5;
    const ticks = Array.from({ length: tickCount }, (_, i) => {
      const frac = i / (tickCount - 1);
      const x = frac * W;
      const val = hist.min + frac * (hist.max - hist.min);
      const anchor = i === 0 ? "start" : i === tickCount - 1 ? "end" : "middle";
      return `
        <line x1="${x.toFixed(1)}" y1="${axisY}" x2="${x.toFixed(1)}" y2="${axisY + 3}" class="hist-tick" />
        <text x="${x.toFixed(1)}" y="${labelY}" text-anchor="${anchor}" class="hist-axis-label">${pct(val)}</text>
      `;
    }).join("");

    return `
      <svg viewBox="0 0 ${W} ${svgH}" class="hist-svg">
        ${bars}
        ${zeroLine}
        <polyline points="${points}" class="hist-normal-curve" />
        <line x1="0" y1="${axisY}" x2="${W}" y2="${axisY}" class="hist-axis-line" />
        ${ticks}
      </svg>
    `;
  }

  function renderDistStats() {
    const hist = stats.histogram;
    const rows = [
      {
        label: "Vol (ann.)",
        value: Number.isFinite(stats.portfolioVol) ? (stats.portfolioVol * 100).toFixed(1) + "%" : "—",
        color: "#1a1a1a",
        tooltip: "Annualised realised volatility of the portfolio.",
        chartTab: "vol",
      },
      {
        label: "Skew",
        value: fmtRatio(stats.skew),
        color: Number.isFinite(stats.skew) ? (stats.skew >= 0 ? "#2d8a5e" : "#c0385a") : "#a0a8b0",
        tooltip: "Skewness of daily returns. Positive: fatter right tail. Negative: fatter left tail.",
      },
      {
        label: "Excess kurtosis",
        value: fmtRatio(stats.kurtosis),
        color: Number.isFinite(stats.kurtosis) ? (stats.kurtosis > 0 ? "#c0385a" : "#2d8a5e") : "#a0a8b0",
        tooltip: "Excess kurtosis of daily returns. Positive values mean fatter tails than a normal distribution.",
      },
      {
        label: "Max 1D gain",
        value: hist && Number.isFinite(hist.bestDay) ? "+" + (hist.bestDay * 100).toFixed(2) + "%" : "—",
        color: "#2d8a5e",
        tooltip: "Largest single-day portfolio gain in the sample.",
      },
      {
        label: "Max 1D loss",
        value: hist && Number.isFinite(hist.worstDay) ? (hist.worstDay * 100).toFixed(2) + "%" : "—",
        color: "#c0385a",
        tooltip: "Largest single-day portfolio loss in the sample.",
      },
    ];
    return rows.map(r => `
      <div class="dist-stat-row${r.chartTab ? " dist-stat-row-clickable" : ""}" title="${r.tooltip}" data-chart-tab="${r.chartTab || ""}">
        <span class="dist-stat-label">${r.label}</span>
        <span class="dist-stat-value" style="color:${r.color}">${r.value}</span>
      </div>
    `).join("");
  }

  const groups = [
    {
      name: "Performance",
      cols: 2,
      rows: [
        {
          label: "CAGR",
          value: fmtPercent(stats.portfolioReturn),
          color: color(stats.portfolioReturn),
          tooltip: "Compound Annual Growth Rate: geometric annualised return for the current weighting.",
          chartTab: "returns",
        },
        {
          label: "Sharpe ratio",
          value: fmtRatio(stats.sharpe),
          color: color(Number.isFinite(stats.sharpe) ? stats.sharpe - 1 : NaN),
          tooltip: "Sharpe = (CAGR − Rf) / Realised Vol. Rf = 2.6%.",
          chartTab: "sharpe",
        },
        {
          label: "Sortino ratio",
          value: fmtRatio(stats.sortino),
          color: color(Number.isFinite(stats.sortino) ? stats.sortino - 1 : NaN),
          tooltip: "Sortino = (CAGR − Rf) / Downside Vol. Rf = 2.6%.",
          chartTab: "sharpe",
        },
        {
          label: "Calmar ratio",
          value: fmtRatio(stats.calmar),
          color: color(Number.isFinite(stats.calmar) ? stats.calmar - 1 : NaN),
          tooltip: "CAGR / |Max Drawdown|. Return per unit of the worst pain actually experienced, not volatility.",
          chartTab: "drawdown",
        },
        {
          label: "PSR",
          value: Number.isFinite(stats.psr) ? (stats.psr * 100).toFixed(1) + "%" : "—",
          color: Number.isFinite(stats.psr)
            ? (stats.psr >= 0.95 ? "#2d8a5e" : "#c0385a")
            : "#a0a8b0",
          tooltip: "Probabilistic Sharpe Ratio (Bailey and Lopez de Prado). Confidence that true daily Sharpe exceeds 0, adjusted for skew, kurtosis and sample size (n=" + stats.psrObs + ").",
        },
        {
          label: "Information ratio",
          value: fmtRatio(stats.informationRatio),
          color: color(stats.informationRatio),
          tooltip: "Excess annualised return over the S&P 500 (US Large-Cap Equity ETF) per unit of tracking error.",
        },
      ],
    },
    {
      name: "Risk",
      cols: 2,
      rows: [
        {
          label: "Max drawdown",
          value: Number.isFinite(stats.maxDrawdown) ? (stats.maxDrawdown * 100).toFixed(1) + "%" : "—",
          color: "#c0385a",
          tooltip: "Weighted average of individual asset maximum drawdowns.",
          chartTab: "drawdown",
        },
        {
          label: "VaR",
          value: Number.isFinite(stats.var95) ? (stats.var95 * 100).toFixed(1) + "%" : "—",
          color: "#c0385a",
          tooltip: "Value at Risk, 95% confidence, 1-day horizon. 5% chance of a daily loss exceeding this level.",
        },
        {
          label: "CVaR",
          value: Number.isFinite(stats.cvar95) ? (stats.cvar95 * 100).toFixed(1) + "%" : "—",
          color: "#c0385a",
          tooltip: "Conditional Value at Risk (Expected Shortfall), 95% confidence, 1-day horizon. Average loss on the worst 5% of days.",
        },
        {
          label: "Mean Corr",
          value: fmtRatio(stats.avgCorrelation),
          color: Number.isFinite(stats.avgCorrelation)
            ? (stats.avgCorrelation > 0.5 ? "#c0385a" : "#2d8a5e")
            : "#a0a8b0",
          tooltip: "Mean pairwise correlation across all asset pairs in the portfolio.",
          chartTab: "corr",
        },
        {
          label: "Effective N",
          value: Number.isFinite(stats.effectiveN) ? stats.effectiveN.toFixed(2) : "—",
          color: "#1a1a1a",
          tooltip: "Effective number of independent bets (Meucci), from the entropy of the correlation matrix's eigenvalue spectrum. Lower than the asset count means the book is driven by fewer independent factors than it looks like on paper.",
          chartTab: "corr",
        },
        {
          label: "Days to liquidate",
          value: Number.isFinite(stats.daysToLiquidate) ? stats.daysToLiquidate.toFixed(1) : "—",
          color: "#1a1a1a",
          tooltip: "Time to fully unwind the portfolio at 20% of each position's 20-day average daily dollar volume. Gated by the slowest position, not an average.",
        },
      ],
    },
  ];

  const distributionBlock = `
    <div class="stats-group">
      <div class="stats-group-label">Distribution</div>
      <div class="hist-wrap">${renderHistogram(stats.histogram)}</div>
      <div class="dist-stats">${renderDistStats()}</div>
    </div>
  `;

  const groupBlock = group => `
    <div class="stats-group">
      <div class="stats-group-label">${group.name}</div>
      <div class="stats-grid stats-grid-${group.cols}">
        ${group.rows.map(row => `
          <div class="stat-item${row.wide ? " stat-item-wide" : ""}" title="${row.tooltip}" data-chart-tab="${row.chartTab || ""}">
            <div class="stat-label">${row.label}</div>
            <div class="stat-value" style="color:${row.color}">${row.value}</div>
          </div>
        `).join("")}
      </div>
    </div>
  `;

  container.innerHTML = groupBlock(groups[0]) + distributionBlock + groupBlock(groups[1]);
}