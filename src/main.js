import { loadCorrelationData, parseGraphData, degreeMap, validateGraphData } from "./data.js";
import { createGraph, setupGraphEvents, setNodeUniverseVisibility } from "./graph.js";
import { buildSidebar, buildLegend, buildStatsPanel, buildWeightingPanel, buildUniversePanel, buildPortfolioValuePanel, setPortfolioValueDisplay, resetView, setFilter } from "./ui.js";
import { setupSearch } from "./search.js";
import { computePortfolioStats, computeEqualWeights, computeInverseVolWeights } from "./stats.js";

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

async function init() {
  try {
    const correlationData = await loadCorrelationData();
    const { nodes, edges } = parseGraphData(correlationData);

    validateGraphData(nodes, edges);

    app.overlays = {};

    const deg = degreeMap(nodes, edges);

    buildSidebar(app, nodes);
    buildLegend();
    
    app.correlationData = correlationData;
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

      // Shares mode: portfolio value is emergent from share counts × price.
      // Any other mode: portfolio value is whatever the user typed in directly.
      if (app.valueMode === "shares") {
        app.portfolioValue = app.emergentPortfolioValue || 0;
        setPortfolioValueDisplay(app.portfolioValue, true);
      } else {
        setPortfolioValueDisplay(app.portfolioValue, false);
      }

      const stats = computePortfolioStats(correlationData, weights);
      buildStatsPanel(stats);

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
    });

    buildUniversePanel(app, nodes, () => {
      refreshStats(activeScheme === "custom" ? app.weights : activeScheme);
      if (app.onUniverseChangeForCustom) app.onUniverseChangeForCustom();
    });

    refreshStats("equal");
    buildWeightingPanel(app, correlationData, refreshStats);

    setupGraphEvents(app);
    setupSearch(app);

    const allBtn = document.querySelector('.pf-btn[data-filter="none"]');
    if (allBtn) {
      allBtn.addEventListener("click", () => setFilter(app, "none", allBtn));
    }

    document.getElementById("reset-btn").addEventListener("click", () => {
      resetView(app);
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