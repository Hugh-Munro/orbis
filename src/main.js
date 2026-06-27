import { loadCorrelationData, parseGraphData, degreeMap, validateGraphData } from "./data.js";
import { createGraph, setupGraphEvents } from "./graph.js";
import { buildSidebar, buildLegend, buildStatsPanel, resetView, setFilter } from "./ui.js";
import { setupSearch } from "./search.js";
import { computePortfolioStats } from "./stats.js";

const app = {
  cy: null,
  overlays: null,
  selectedNode: null,
  nodeSize: null,
};

async function init() {
  try {
    const correlationData = await loadCorrelationData();
    const { nodes, edges } = parseGraphData(correlationData);

    validateGraphData(nodes, edges);

    // overlays no longer needed — kept on app in case ui.js references it
    app.overlays = {};

    const deg = degreeMap(nodes, edges);

    buildSidebar(app, nodes);
    buildLegend();

    app.cy = createGraph(app, nodes, edges, deg);

    const stats = computePortfolioStats(correlationData);
    buildStatsPanel(stats);

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