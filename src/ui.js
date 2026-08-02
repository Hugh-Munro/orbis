import { GROUP_COLORS, GROUP_LABELS, PARADIGM_COLORS } from "./constants.js";

export function formatGroupName(group) {
  return GROUP_LABELS[group] || group;
}

function formatDollars(amount) {
  if (amount == null || Number.isNaN(amount)) return "—";
  return "$" + Math.round(amount).toLocaleString("en-US");
}

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

// Turns the Risk Regime filter buttons into a live exposure readout — each
// button shows what share of current portfolio weight sits in that regime,
// not just a static filter label.
export function updateRegimeWeights(nodes, weights) {
  const totals = {};
  nodes.forEach(n => {
    totals[n.paradigm] = (totals[n.paradigm] || 0) + ((weights && weights[n.id]) || 0);
  });
  document.querySelectorAll('.pf-btn:not([data-filter="none"])').forEach(btn => {
    let pctEl = btn.querySelector(".pf-btn-weight");
    if (!pctEl) {
      pctEl = document.createElement("span");
      pctEl.className = "pf-btn-weight";
      btn.appendChild(pctEl);
    }
    const pct = totals[btn.dataset.filter] || 0;
    pctEl.textContent = Math.round(pct * 100) + "%";
  });
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
  document.getElementById("info-content").textContent = "Select an asset to explore.";
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
      <div style="font-size:10px;color:#aaa;margin-bottom:4px">Correlations</div>
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
    document.getElementById("info-content").textContent = `No asset found for "${rawQuery}".`;
    return;
  }
  document.getElementById("info-content").textContent =
    `${resultCount} asset${resultCount === 1 ? "" : "s"} found. Press Enter to fit.`;
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

function clearLegendActive() {
  document.querySelectorAll(".legend-item.active").forEach(el => el.classList.remove("active"));
}

export function setFilter(app, key, btn) {
  if (!app.cy) return;
  clearSearch(app);
  clearFilterClasses(app);
  clearSelectionClasses(app);
  hideCard(app);
  resetInfoPanel();
  setActiveFilterButton(btn);
  clearLegendActive();

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

export function setClassFilter(app, group, item) {
  if (!app.cy) return;
  clearSearch(app);
  clearFilterClasses(app);
  clearSelectionClasses(app);
  hideCard(app);
  resetInfoPanel();

  const allBtn = document.querySelector('.pf-btn[data-filter="none"]');
  if (allBtn) setActiveFilterButton(allBtn);
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

  const groups = [
    {
      name: "Performance",
      cols: 2,
      rows: [
        {
          label: "CAGR",
          value: fmtPercent(stats.portfolioReturn),
          color: color(stats.portfolioReturn),
          tooltip: "Compound Annual Growth Rate — geometric annualised return per selected weighting",
        },
        {
          label: "Sharpe ratio",
          value: fmtRatio(stats.sharpe),
          color: color(Number.isFinite(stats.sharpe) ? stats.sharpe - 1 : NaN),
          tooltip: "Sharpe = (CAGR − Rf) / Realised Vol, Rf = 2.6%",
        },
        {
          label: "Sortino ratio",
          value: fmtRatio(stats.sortino),
          color: color(Number.isFinite(stats.sortino) ? stats.sortino - 1 : NaN),
          tooltip: "Sortino = (CAGR − Rf) / Downside Vol, Rf = 2.6%",
        },
        {
          label: "PSR",
          value: Number.isFinite(stats.psr) ? (stats.psr * 100).toFixed(1) + "%" : "—",
          color: Number.isFinite(stats.psr)
            ? (stats.psr >= 0.95 ? "#2d8a5e" : "#c0385a")
            : "#a0a8b0",
          tooltip: "Probabilistic Sharpe Ratio (Bailey & Lopez de Prado) — confidence that the true daily Sharpe exceeds 0, correcting for skew, kurtosis and sample length (n=" + stats.psrObs + " daily obs)",
        },
      ],
    },
    {
      name: "Distribution",
      cols: 3,
      rows: [
        {
          label: "Realised Vol",
          value: Number.isFinite(stats.portfolioVol) ? (stats.portfolioVol * 100).toFixed(1) + "%" : "—",
          color: "#555",
          tooltip: "Annualised realised volatility of the portfolio (√wᵀΣw)",
        },
        {
          label: "Skew",
          value: fmtRatio(stats.skew),
          color: Number.isFinite(stats.skew)
            ? (stats.skew >= 0 ? "#2d8a5e" : "#c0385a")
            : "#a0a8b0",
          tooltip: "Sample skewness of daily portfolio returns — positive means a fatter right tail (occasional large gains), negative means a fatter left tail (occasional large losses)",
        },
        {
          label: "Kurtosis",
          value: fmtRatio(stats.kurtosis),
          color: Number.isFinite(stats.kurtosis)
            ? (stats.kurtosis > 0 ? "#c0385a" : "#2d8a5e")
            : "#a0a8b0",
          tooltip: "Excess kurtosis of daily portfolio returns — positive means fatter tails than a normal distribution (more extreme days than the vol number alone implies)",
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
          tooltip: "Weighted average of individual asset maximum drawdowns",
        },
        {
          label: "VaR",
          value: Number.isFinite(stats.var95) ? (stats.var95 * 100).toFixed(1) + "%" : "—",
          color: "#c0385a",
          tooltip: "Value at Risk — 95% confidence, 1-day horizon. 5% chance of a one-day loss exceeding this, based on the full historical return series",
        },
        {
          label: "CVaR",
          value: Number.isFinite(stats.cvar95) ? (stats.cvar95 * 100).toFixed(1) + "%" : "—",
          color: "#c0385a",
          tooltip: "Conditional Value at Risk (Expected Shortfall) — 95% confidence, 1-day horizon. Average one-day loss on the worst 5% of days",
        },
        {
          label: "Mean Corr",
          value: fmtRatio(stats.avgCorrelation),
          color: Number.isFinite(stats.avgCorrelation)
            ? (stats.avgCorrelation > 0.5 ? "#c0385a" : "#2d8a5e")
            : "#a0a8b0",
          tooltip: "Mean pairwise correlation across all asset pairs in the portfolio",
        },
      ],
    },
  ];

  container.innerHTML = groups.map(group => `
    <div class="stats-group">
      <div class="stats-group-label">${group.name}</div>
      <div class="stats-grid stats-grid-${group.cols}">
        ${group.rows.map(row => `
          <div class="stat-item" title="${row.tooltip}">
            <div class="stat-label">${row.label}</div>
            <div class="stat-value" style="color:${row.color}">${row.value}</div>
          </div>
        `).join("")}
      </div>
    </div>
  `).join("");
}