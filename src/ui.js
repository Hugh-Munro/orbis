import { GROUP_COLORS, GROUP_LABELS, PARADIGM_COLORS } from "./constants.js";

export function formatGroupName(group) {
  return GROUP_LABELS[group] || group;
}

// Build paradigm filter buttons from live node data
export function buildSidebar(app, nodes) {
  const container = document.getElementById("filters");
  // Remove any previously built buttons (keep "All nodes")
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

// Node info panel — shows asset details + neighbour correlations
export function updateInfoPanel(data, node, app) {
  const neighbours = node.neighborhood("node");
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
        <span style="font-weight:600;color:${corr >= 0 ? "#b03060" : "#1a7860"}">${sign}${corr.toFixed(2)}</span>
      </div>`;
  });

  document.getElementById("info-content").innerHTML = `
    <strong style="font-size:13px">${data.label}</strong><br>
    <span style="font-size:11px;color:#888">${data.assetClass} · ${data.paradigm}</span>
    <div style="margin-top:10px;border-top:1px solid #e8e8e0;padding-top:8px">
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.06em;color:#aaa;margin-bottom:4px">Correlations</div>
      ${correlationRows}
    </div>
  `;
}

// Edge info panel
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
      <span style="font-size:22px;font-weight:700;color:${corr >= 0 ? "#b03060" : "#1a7860"}">${sign}${corr.toFixed(2)}</span>
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

// Updated showCard for asset data shape
export function showCard(app, data, node) {
  const card = document.getElementById("fc");
  document.getElementById("fc-name").textContent = data.label;
  document.getElementById("fc-group").textContent = `${data.assetClass} · ${data.paradigm}`;
  document.getElementById("fc-desc").textContent = "";
  document.getElementById("fc-origin").textContent = data.id;
  document.getElementById("fc-year").textContent = "—";
  document.getElementById("fc-figures").textContent = "—";
  card.classList.add("visible");
  positionCardForNode(app, node);
}

export function buildStatsPanel(stats) {
  const container = document.getElementById("stats-panel");
  if (!container) return;

  function fmt(val, decimals = 2) {
    return (val >= 0 ? "+" : "") + (val * 100).toFixed(decimals) + "%";
  }

  function color(val) {
    return val >= 0 ? "#2d8a5e" : "#c0385a";
  }

  const rows = [
    {
      label: "Ann. Return",
      value: fmt(stats.portfolioReturn),
      color: color(stats.portfolioReturn),
      tooltip: "Equal-weight portfolio annualised return (2021-2024)",
    },
    {
      label: "Ann. Volatility",
      value: (stats.portfolioVol * 100).toFixed(1) + "%",
      color: "#555",
      tooltip: "Portfolio annualised volatility (√wᵀΣw)",
    },
    {
      label: "Sharpe Ratio",
      value: stats.sharpe.toFixed(2),
      color: color(stats.sharpe - 1),
      tooltip: "Sharpe = (Return − Rf) / Vol, Rf = 5.25%",
    },
    {
      label: "Sortino Ratio",
      value: stats.sortino.toFixed(2),
      color: color(stats.sortino - 1),
      tooltip: "Sortino = (Return − Rf) / Downside Vol",
    },
    {
      label: "Avg Correlation",
      value: stats.avgCorrelation.toFixed(2),
      color: stats.avgCorrelation > 0.5 ? "#c0385a" : "#2d8a5e",
      tooltip: "Mean pairwise correlation across all asset pairs",
    },
    {
      label: "Max Drawdown",
      value: (stats.maxDrawdown * 100).toFixed(1) + "%",
      color: "#c0385a",
      tooltip: "Equal-weight avg of individual asset max drawdowns (2021-2024)",
    },
  ];

  container.innerHTML = `
    <div class="stats-grid">
      ${rows.map(row => `
        <div class="stat-item" title="${row.tooltip}">
          <div class="stat-label">${row.label}</div>
          <div class="stat-value" style="color:${row.color}">${row.value}</div>
        </div>
      `).join("")}
    </div>
  `;
}