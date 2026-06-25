import { loadJSON, degreeMap, validateGraphData } from "./data.js";
import { createGraph, setupGraphEvents } from "./graph.js";
import { buildSidebar, buildLegend, resetView, setFilter } from "./ui.js";
import { setupSearch } from "./search.js";

const app = {
  cy: null,
  overlays: null,
  selectedNode: null,
  nodeSize: null,
};

async function init() {
  try {
    const [nodes, edges, overlays] = await Promise.all([
      loadJSON("data/nodes.json"),
      loadJSON("data/edges.json"),
      loadJSON("data/overlays.json"),
    ]);

    validateGraphData(nodes, edges);

    app.overlays = overlays;

    const deg = degreeMap(nodes, edges);

    buildSidebar(app);
    buildLegend();

    app.cy = createGraph(app, nodes, edges, deg);

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
        font-family: Computer Modern, serif;
      ">
        Failed to load graph data. Check the browser console for details.
      </div>
    `;
  }
}

init();