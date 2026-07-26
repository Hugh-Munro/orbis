import { GROUP_COLORS, GROUP_LABELS, PARADIGM_COLORS } from "./constants.js";

export function formatGroupName(group) {
  return GROUP_LABELS[group] || group;
}

function formatDollars(amount) {
  if (amount == null || Number.isNaN(amount)) return "—";
  return "$" + Math.round(amount).toLocaleString("en-US");
}

// Build paradigm filter buttons from live node data
export function buildSidebar(app, nodes) {
  const container = document.getElementById("filters");
  container.querySelectorAll(".pf-btn:not([data-filter='none'])").forEach(b => b.remove());

  const paradigms = [...new Set(nodes.map(n => n.paradigm))].sort();

  paradigms.forEach(paradigm => {
    const c = PARADIGM_COLORS[paradigm] || { bg: "#f0f0f0", border: "#999", text: "#333" };
    const btn = document.createElement("button");
    btn.className = "pf-btn";
    btn.dataset.filter = paradigm;
    btn.type = "button";
    const swatch = document.createElement("span");
    swatch.className = "btn-swatch";
    swatch.style.background = c.border;
    btn.append(swatch, document.createTextNode(paradigm));
    btn.addEventListener("click", () => setFilter(app, paradigm, btn));
    container.appendChild(btn);
  });
}

export function buildLegend() {
  const container = document.getElementById("legend-items");
  container.innerHTML = "";
  Object.entries(GROUP_COLORS).forEach(([group, c]) => {
    const item = document.createElement("div");
    item.className = "legend-item";
    const dot = document.createElement("div");
    dot.className = "legend-dot";
    dot.style.background = c.bg;
    dot.style.border = `2px solid ${c.border}`;
    item.append(dot, document.createTextNode(formatGroupName(group)));
    container.appendChild(item);
  });
}

// Total portfolio value input — parses "$" and commas, stores a clean number on app.portfolioValue.
// In "shares" mode this field becomes read-only and shows the emergent total instead.
export function buildPortfolioValuePanel(app, onValueChange) {
  const input = document.getElementById("portfolio-value-input");
  if (!input) return;

  function parseValue(raw) {
    const cleaned = raw.replace(/[^0-9.]/g, "");
    const num = parseFloat(cleaned);
    return Number.isFinite(num) && num > 0 ? num : 0;
  }

  function commit() {
    if (app.valueMode === "shares") return; // read-only while shares drive value
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

// Reflect an emergent total (from shares mode) into the portfolio value input, read-only
export function setPortfolioValueDisplay(value, readOnly) {
  const input = document.getElementById("portfolio-value-input");
  if (!input) return;
  input.value = value ? Math.round(value).toLocaleString("en-US") : "0";
  input.readOnly = !!readOnly;
  input.classList.toggle("pv-readonly", !!readOnly);
}

// Investable universe checklist — controls which assets are eligible for allocation.
// Collapsible: header click toggles the list open/closed.
export function buildUniversePanel(app, nodes, onUniverseChange) {
  const container = document.getElementById("universe-list");
  const header = document.getElementById("universe-header");
  const panel = document.getElementById("universe-panel");

  app.selectedTickers = new Set(nodes.map(n => n.id));

  container.innerHTML = nodes.map(n => `
    <label class="universe-row" data-ticker="${n.id}">
      <input type="checkbox" class="universe-checkbox" data-ticker="${n.id}" checked>
      <span class="universe-name">${n.label}</span>
      <span class="universe-class">${n.assetClass}</span>
    </label>
  `).join("");

  container.querySelectorAll(".universe-checkbox").forEach(cb => {
    cb.addEventListener("change", () => {
      const ticker = cb.dataset.ticker;
      if (cb.checked) {
        app.selectedTickers.add(ticker);
      } else {
        if (app.selectedTickers.size <= 1) {
          cb.checked = true;
          return;
        }
        app.selectedTickers.delete(ticker);
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

// Weighting scheme tabs + custom weight sliders + shares mode.
// Custom tab now has two sub-modes: "weights" (drag % sliders) and "shares" (enter share counts).
export function buildWeightingPanel(app, correlationData, onWeightsChange) {
  const tabs = document.querySelectorAll(".wt-tab");
  const customWrap = document.getElementById("custom-weights-wrap");
  const modeToggle = document.getElementById("custom-mode-toggle");
  const allTickers = Object.keys(correlationData.assets);

  app.valueMode = "value"; // "value" (weights drive $) or "shares" (share counts drive $)
  let customMode = "weights"; // "weights" | "shares"

  function activeTickers() {
    return allTickers.filter(t => !app.selectedTickers || app.selectedTickers.has(t));
  }

  function renderCustomWeightSliders(initialWeights) {
    const tickers = activeTickers();
    customWrap.innerHTML = tickers.map(t => {
      const name = correlationData.assets[t].name;
      const pct = Math.round((initialWeights[t] || 0) * 100);
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

    customWrap.querySelectorAll(".weight-slider").forEach(slider => {
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
    let total = 0;
    customWrap.querySelectorAll(".weight-slider").forEach(slider => {
      if (!tickers.includes(slider.dataset.ticker)) return; // ignore stale sliders
      const v = Number(slider.value);
      raw[slider.dataset.ticker] = v;
      total += v;
    });
    const safeTotal = total || 1;
    const normalised = Object.fromEntries(
      tickers.map(t => [t, (raw[t] || 0) / safeTotal])
    );
    app.valueMode = "value";
    onWeightsChange(normalised);
  }

  function renderShareInputs(initialShares) {
    const tickers = activeTickers();
    customWrap.innerHTML = `
      <div class="mode-toggle" id="custom-mode-toggle">
        <button type="button" class="mode-btn ${customMode === "weights" ? "active" : ""}" data-mode="weights">% Weights</button>
        <button type="button" class="mode-btn ${customMode === "shares" ? "active" : ""}" data-mode="shares">Shares</button>
      </div>
    ` + tickers.map(t => {
      const name = correlationData.assets[t].name;
      const price = correlationData.assets[t].price || 0;
      const shares = initialShares[t] || 0;
      const value = shares * price;
      return `
        <div class="shares-row" data-ticker="${t}">
          <div class="shares-row-label">
            <span>${name}</span>
            <span class="shares-row-value">$${Math.round(value).toLocaleString("en-US")}</span>
          </div>
          <input type="number" min="0" step="1" value="${shares}" class="shares-input" data-ticker="${t}">
        </div>
      `;
    }).join("");

    attachModeToggleListeners();

    customWrap.querySelectorAll(".shares-input").forEach(input => {
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
    const values = {};
    let total = 0;
    customWrap.querySelectorAll(".shares-input").forEach(input => {
      if (!tickers.includes(input.dataset.ticker)) return;
      const ticker = input.dataset.ticker;
      const price = correlationData.assets[ticker].price || 0;
      const shares = Number(input.value) || 0;
      const value = shares * price;
      values[ticker] = value;
      total += value;
    });
    const safeTotal = total || 1;
    const weights = Object.fromEntries(
      tickers.map(t => [t, (values[t] || 0) / safeTotal])
    );
    app.valueMode = "shares";
    app.emergentPortfolioValue = total;
    onWeightsChange(weights);
  }

  function attachModeToggleListeners() {
    customWrap.querySelectorAll(".mode-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        customMode = btn.dataset.mode;
        renderCustomTab();
      });
    });
  }

  function renderCustomTab() {
    const tickers = activeTickers();
    if (customMode === "shares") {
      const initialShares = Object.fromEntries(tickers.map(t => [t, 0]));
      renderShareInputs(initialShares);
      emitSharesWeights();
    } else {
      customWrap.innerHTML = `
        <div class="mode-toggle" id="custom-mode-toggle">
          <button type="button" class="mode-btn active" data-mode="weights">% Weights</button>
          <button type="button" class="mode-btn" data-mode="shares">Shares</button>
        </div>
        <div id="custom-sliders-wrap"></div>
      `;
      attachModeToggleListeners();
      const slidersWrap = document.getElementById("custom-sliders-wrap");
      const equalStart = Object.fromEntries(tickers.map(t => [t, 1 / tickers.length]));
      const originalWrap = customWrap;
      // Render sliders into the nested wrap so the mode-toggle header persists above them
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = tickers.map(t => {
        const name = correlationData.assets[t].name;
        const pct = Math.round(equalStart[t] * 100);
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
      slidersWrap.innerHTML = tempDiv.innerHTML;
      slidersWrap.querySelectorAll(".weight-slider").forEach(slider => {
        slider.addEventListener("input", () => {
          const row = slider.closest(".weight-row");
          row.querySelector(".weight-row-value").textContent = `${slider.value}%`;
          emitCustomWeights();
        });
      });
      emitCustomWeights();
    }
  }

  // Re-render whichever custom sub-view is active whenever the universe changes,
  // so deselected assets disappear from the list instead of producing stale/NaN rows.
  app.onUniverseChangeForCustom = () => {
    if (document.querySelector('.wt-tab[data-scheme="custom"]').classList.contains("active")) {
      renderCustomTab();
    }
  };

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(b => b.classList.remove("active"));
      tab.classList.add("active");
      const scheme = tab.dataset.scheme;

      if (scheme === "custom") {
        customWrap.classList.add("visible");
        customMode = "weights";
        renderCustomTab();
      } else {
        customWrap.classList.remove("visible");
        customWrap.innerHTML = "";
        app.valueMode = "value";
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

export function setActiveFilterButton(activeBtn) {
  document.querySelectorAll(".pf-btn").forEach(btn => {
    btn.classList.remove("active");
    btn.style.color = "";
    btn.style.borderColor = "";
    btn.style.background = "";
  });
  activeBtn.classList.add("active");
}

export function resetInfoPanel() {
  document.getElementById("info-content").textContent = "Select a node to explore.";
}

export function updateInfoPanel(data, node, app) {
  const edges = node.connectedEdges();

  let correlationRows = "";
  edges.forEach(edge => {
    const otherId = edge.source().id() === data.id
      ? edge.target().id()
      : edge.source().id();
    const otherNode = app.cy.getElementById(otherId);
    const otherName = otherNode.data("label");
    const corr = edge.data("correlation");
    const sign = corr >= 0 ? "+" : "";
    correlationRows += `
      <div style="display:flex;justify-content:space-between;padding:2px 0;font-size:11px;">
        <span style="color:#666">${otherName}</span>
        <span style="font-weight:600;color:${corr >= 0 ? "#1a1a1a" : "#a8391f"}">${sign}${corr.toFixed(2)}</span>
      </div>`;
  });

  const weight = (app.weights && app.weights[data.id]) || 0;
  const dollarAmount = (app.portfolioValue || 0) * weight;

  document.getElementById("info-content").innerHTML = `
    <strong style="font-size:13px">${data.label}</strong><br>
    <span style="font-size:11px;color:#888">${data.assetClass} · ${data.paradigm}</span>
    <div style="margin-top:8px;font-size:13px;font-weight:700;color:#1a1a1a">${formatDollars(dollarAmount)}</div>
    <div style="font-size:11px;color:#888">${(weight * 100).toFixed(1)}% allocation</div>
    <div style="margin-top:10px;border-top:1px solid #e8e8e0;padding-top:8px">
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.06em;color:#aaa;margin-bottom:4px">Correlations</div>
      ${correlationRows}
    </div>
  `;
}

export function updateEdgeInfoPanel(edge) {
  const corr = edge.data("correlation");
  const source = edge.source().data("label");
  const target = edge.target().data("label");
  const sign = corr >= 0 ? "+" : "";
  const abs = Math.abs(corr);

  let interpretation = "";
  if (abs >= 0.7)      interpretation = corr > 0 ? "Strong positive — these assets move together closely." : "Strong negative — these assets move in opposite directions.";
  else if (abs >= 0.4) interpretation = corr > 0 ? "Moderate positive correlation." : "Moderate negative — useful diversification.";
  else if (abs >= 0.2) interpretation = "Weak correlation — largely independent.";
  else                 interpretation = "Near-zero correlation — effectively uncorrelated.";

  document.getElementById("info-content").innerHTML = `
    <strong style="font-size:13px">${source} / ${target}</strong>
    <div style="margin-top:8px">
      <span style="font-size:22px;font-weight:700;color:${corr >= 0 ? "#1a1a1a" : "#a8391f"}">${sign}${corr.toFixed(2)}</span>
    </div>
    <div style="font-size:11px;color:#666;margin-top:6px;line-height:1.5">${interpretation}</div>
  `;
}

export function updateSearchInfo(rawQuery, resultCount) {
  if (resultCount === 0) {
    document.getElementById("info-content").textContent = `No node found for "${rawQuery}".`;
    return;
  }
  document.getElementById("info-content").textContent =
    `${resultCount} node${resultCount === 1 ? "" : "s"} found. Press Enter to fit.`;
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
  resetInfoPanel();
  const allBtn = document.querySelector('.pf-btn[data-filter="none"]');
  if (allBtn) setActiveFilterButton(allBtn);
  app.cy.animate({ fit: { padding: 40 }, duration: 400, easing: "ease-in-out" });
}

export function setFilter(app, key, btn) {
  if (!app.cy) return;
  clearSearch(app);
  clearFilterClasses(app);
  clearSelectionClasses(app);
  hideCard(app);
  resetInfoPanel();
  setActiveFilterButton(btn);

  if (key === "none") return;

  const c = PARADIGM_COLORS[key] || { border: "#999", bg: "#f0f0f0", text: "#333" };
  btn.style.color = c.text;
  btn.style.borderColor = c.border;
  btn.style.background = c.bg;

  app.cy.nodes().forEach(node => {
    if (node.data("paradigm") === key) {
      node.data("hl_border", c.border);
      node.addClass("highlighted");
    } else {
      node.addClass("dimmed");
    }
  });

  app.cy.edges().forEach(edge => {
    const srcParadigm = edge.source().data("paradigm");
    const tgtParadigm = edge.target().data("paradigm");
    if (srcParadigm === key && tgtParadigm === key) {
      edge.addClass("highlighted");
    } else {
      edge.addClass("dimmed");
    }
  });
}

export function switchToAllNodesWithoutClearingSearch(app) {
  const allBtn = document.querySelector('.pf-btn[data-filter="none"]');
  if (!allBtn) return;
  clearFilterClasses(app);
  clearSelectionClasses(app);
  hideCard(app);
  setActiveFilterButton(allBtn);
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
  document.getElementById("fc-name").textContent = data.label;
  document.getElementById("fc-group").textContent = `${data.assetClass} · ${data.paradigm}`;
  document.getElementById("fc-desc").textContent = "";
  document.getElementById("fc-origin").textContent = data.id;
  document.getElementById("fc-year").textContent = "—";
  const weight = (app.weights && app.weights[data.id]) || 0;
  const dollarAmount = (app.portfolioValue || 0) * weight;
  document.getElementById("fc-figures").textContent = formatDollars(dollarAmount);
  card.classList.add("visible");
  positionCardForNode(app, node);
}

export function buildStatsPanel(stats) {
  const container = document.querySelector("#stats-panel .stats-grid");
  if (!container) return;

  function fmtPercent(val, decimals = 2) {
    if (!Number.isFinite(val)) return "—";
    return (val >= 0 ? "+" : "") + (val * 100).toFixed(decimals) + "%";
  }

  function fmtRatio(val) {
    return Number.isFinite(val) ? val.toFixed(2) : "—";
  }

  function color(val) {
    if (!Number.isFinite(val)) return "#a0a8b0"; // neutral grey — no data yet
    return val >= 0 ? "#2d8a5e" : "#c0385a";
  }

  const rows = [
    {
      label: "Ann. Return",
      value: fmtPercent(stats.portfolioReturn),
      color: color(stats.portfolioReturn),
      tooltip: "Portfolio annualised return (2021-2024), per selected weighting",
    },
    {
      label: "Ann. Volatility",
      value: Number.isFinite(stats.portfolioVol) ? (stats.portfolioVol * 100).toFixed(1) + "%" : "—",
      color: "#555",
      tooltip: "Portfolio annualised volatility (√wᵀΣw)",
    },
    {
      label: "Sharpe Ratio",
      value: fmtRatio(stats.sharpe),
      color: color(Number.isFinite(stats.sharpe) ? stats.sharpe - 1 : NaN),
      tooltip: "Sharpe = (Return − Rf) / Vol, Rf = 5.25%",
    },
    {
      label: "Sortino Ratio",
      value: fmtRatio(stats.sortino),
      color: color(Number.isFinite(stats.sortino) ? stats.sortino - 1 : NaN),
      tooltip: "Sortino = (Return − Rf) / Downside Vol",
    },
    {
      label: "Avg Correlation",
      value: fmtRatio(stats.avgCorrelation),
      color: Number.isFinite(stats.avgCorrelation)
        ? (stats.avgCorrelation > 0.5 ? "#c0385a" : "#2d8a5e")
        : "#a0a8b0",
      tooltip: "Mean pairwise correlation across all asset pairs",
    },
    {
      label: "Max Drawdown",
      value: Number.isFinite(stats.maxDrawdown) ? (stats.maxDrawdown * 100).toFixed(1) + "%" : "—",
      color: "#c0385a",
      tooltip: "Weighted avg of individual asset max drawdowns (2021-2024)",
    },
  ];

  container.innerHTML = rows.map(row => `
      <div class="stat-item" title="${row.tooltip}">
        <div class="stat-label">${row.label}</div>
        <div class="stat-value" style="color:${row.color}">${row.value}</div>
      </div>
    `).join("");
}