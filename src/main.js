import { loadCorrelationData, parseGraphData, degreeMap, validateGraphData } from "./data.js";
import { createGraph, setupGraphEvents, setNodeUniverseVisibility } from "./graph.js";
import { buildLegend, buildStatsPanel, buildWeightingPanel, buildUniversePanel, buildPortfolioValuePanel, setPortfolioValueDisplay, resetView } from "./ui.js";
import { setupSearch } from "./search.js";
import { computePortfolioStats, computeEqualWeights, computeInverseVolWeights } from "./stats.js";
import { openChartView } from "./chart.js";
import { getSavedPortfolios } from "./savedPortfolios.js";

const app = {
  cy: null,
  overlays: null,
  selectedNode: null,
  nodeSize: null,
  weights: null,
  selectedTickers: null,
  portfolioValue: 100000,
  valueMode: "value",
  emergentPortfolioValue: 0,
};

function setView(view) {
  const stage = document.getElementById("stage");
  const dotNetwork = document.getElementById("dot-network");
  const dotChart = document.getElementById("dot-chart");
  if (view === "chart") {
    stage.classList.add("chart-open");
    dotChart.classList.add("active");
    dotNetwork.classList.remove("active");
  } else {
    stage.classList.remove("chart-open");
    dotNetwork.classList.add("active");
    dotChart.classList.remove("active");
  }
}

async function init() {
  try {
    const correlationData = await loadCorrelationData();
    const { nodes, edges } = parseGraphData(correlationData);

    validateGraphData(nodes, edges);

    app.overlays = {};
    app.correlationData = correlationData;

    const deg = degreeMap(nodes, edges);

    buildLegend(app);

    app.cy = createGraph(app, nodes, edges, deg);

    let activeScheme = "equal";

    function refreshStats(weightsOrScheme) {
      let weights;
      if (weightsOrScheme === "equal" || weightsOrScheme === "inverse-vol") {
        activeScheme = weightsOrScheme;
      } else if (weightsOrScheme && typeof weightsOrScheme === "object") {
        activeScheme = "custom";
      }
      if (activeScheme === "equal") weights = computeEqualWeights(correlationData, app.selectedTickers);
      else if (activeScheme === "inverse-vol") weights = computeInverseVolWeights(correlationData, app.selectedTickers);
      else weights = weightsOrScheme;

      app.weights = weights;
      setPortfolioValueDisplay(app.portfolioValue, false); // always editable now

      const stats = computePortfolioStats(correlationData, weights);
      buildStatsPanel(stats);

      document.querySelectorAll(".stat-item").forEach(tile => {
        tile.style.cursor = "pointer";
        tile.addEventListener("click", () => {
          openChartView(correlationData, app.weights, setView);
        });
      });

      if (app.cy) {
        app.cy.nodes().forEach(node => {
          const inUniverse = !app.selectedTickers || app.selectedTickers.has(node.id());
          setNodeUniverseVisibility(node, inUniverse);
        });
        app.cy.style().update();
      }
    }

    buildPortfolioValuePanel(app, () => {
      if (app.cy) app.cy.style().update();
      if (app.onPortfolioValueChangeForCustom) app.onPortfolioValueChangeForCustom();
    });

    buildUniversePanel(app, nodes, () => {
      refreshStats(activeScheme === "custom" ? app.weights : activeScheme);
      if (app.onUniverseChangeForCustom) app.onUniverseChangeForCustom();
    });

    refreshStats("equal");
    buildWeightingPanel(app, correlationData, refreshStats);

    // Open straight into the most recently saved portfolio, if one exists,
    // by replaying the same tab-click + load-click a user would do manually
    // — reuses the existing load logic instead of duplicating it.
    const savedPortfolios = getSavedPortfolios();
    if (savedPortfolios.length) {
      const savedTab = document.querySelector('.wt-tab[data-scheme="saved"]');
      if (savedTab) {
        savedTab.click();
        const mostRecent = savedPortfolios[savedPortfolios.length - 1];
        const loadBtn = document.querySelector(`.saved-load-btn[data-id="${mostRecent.id}"]`);
        if (loadBtn) loadBtn.click();
      }
    }

    setupGraphEvents(app);
    setupSearch(app);

    document.getElementById("reset-btn").addEventListener("click", () => {
      resetView(app);
    });

    document.getElementById("dot-chart").addEventListener("click", () => {
      openChartView(correlationData, app.weights, setView);
    });

    document.getElementById("dot-network").addEventListener("click", () => {
      setView("network");
    });

    document.getElementById("chart-back-btn").addEventListener("click", () => {
      setView("network");
    });

    document.addEventListener("keydown", e => {
      if (!e.ctrlKey) return;
      const isChart = document.getElementById("stage").classList.contains("chart-open");
      if (e.key === "ArrowRight" && !isChart) {
        e.preventDefault();
        openChartView(correlationData, app.weights, setView);
      } else if (e.key === "ArrowLeft" && isChart) {
        e.preventDefault();
        setView("network");
      }
    });

  } catch (error) {
    console.error(error);
    document.getElementById("cy").innerHTML = `
      <div style="
        padding: 24px;
        color: #8090a0;
        font-size: 14px;
        font-family: Inter, sans-serif;
      ">
        Failed to load graph data. Check the browser console for details.
      </div>
    `;
  }
}

init();