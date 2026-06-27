import { GROUP_COLORS, GRAPH_LAYOUT } from "./constants.js";
import {
  clearSelectionClasses,
  showCard,
  positionCardForNode,
  hideCard,
  updateInfoPanel,
  updateEdgeInfoPanel,
  resetInfoPanel,
} from "./ui.js";

function colorFor(ele) {
  return GROUP_COLORS[ele.data("group")] || GROUP_COLORS.equity;
}

function edgeWidth(correlation) {
  return 0.8 + Math.abs(correlation) * 6;
}

function edgeColor(correlation) {
  if (correlation >=  0.7) return "#b03060";  // strong positive — deep rose
  if (correlation >=  0.3) return "#d07090";  // moderate positive — muted pink
  if (correlation >=  0)   return "#b0b8c8";  // weak positive — cool grey
  if (correlation >= -0.3) return "#50a890";  // weak negative — teal
  return "#1a7860";                            // strong negative — deep teal
}

export function createGraph(app, nodes, edges, deg) {
  const maxDeg = Math.max(...Object.values(deg)) || 1;
  const nodeSize = id => 28 + ((deg[id] || 0) / maxDeg) * 24;
  app.nodeSize = nodeSize;

  return window.cytoscape({
    container: document.getElementById("cy"),
    elements: [
      ...nodes.map(node => ({
        data: {
          id: node.id,
          label: node.label,
          group: node.group,
          assetClass: node.assetClass,
          paradigm: node.paradigm,
          deg: deg[node.id] || 0,
        },
      })),
      ...edges.map((edge, index) => ({
        data: {
          id: `e${index}`,
          source: edge.source,
          target: edge.target,
          correlation: edge.correlation,
          edgeWidth: edgeWidth(edge.correlation),
          edgeColor: edgeColor(edge.correlation),
        },
      })),
    ],
    style: [
      {
        selector: "node",
        style: {
          width: ele => nodeSize(ele.id()),
          height: ele => nodeSize(ele.id()),
          "background-color": ele => colorFor(ele).bg,
          "border-color": ele => colorFor(ele).border,
          "border-width": 2,
          label: "data(label)",
          color: ele => colorFor(ele).text,
          "font-size": 10,
          "font-family": "Inter, sans-serif",
          "text-valign": "center",
          "text-halign": "center",
          "text-wrap": "wrap",
          "text-max-width": ele => `${nodeSize(ele.id()) - 10}px`,
          "transition-property": "background-color, border-color, border-width, opacity, outline-color, outline-width",
          "transition-duration": "220ms",
        },
      },
      {
        selector: "node.dimmed",
        style: {
          "background-color": "#f0efe8",
          "border-color": "#d0cfc8",
          color: "#b8b8b0",
          opacity: 0.45,
        },
      },
      {
        selector: "node.selected-node",
        style: {
          "border-width": 3,
          "outline-color": ele => colorFor(ele).border,
          "outline-width": 8,
          "outline-opacity": 0.25,
        },
      },
      {
        selector: "node.neighbour-node",
        style: { "border-width": 2.5 },
      },
      {
        selector: "node.highlighted",
        style: {
          "border-color": ele => ele.data("hl_border") || colorFor(ele).border,
          "border-width": 2.5,
          "outline-color": ele => ele.data("hl_border") || colorFor(ele).border,
          "outline-width": 6,
          "outline-opacity": 0.25,
        },
      },
      {
        selector: "node.search-match",
        style: {
          "border-width": 3,
          "outline-color": "#0f1b2d",
          "outline-width": 6,
          "outline-opacity": 0.22,
          opacity: 1,
        },
      },
      {
        selector: "node.search-dimmed",
        style: { opacity: 0.14 },
      },
      {
        selector: "edge",
        style: {
          width: ele => ele.data("edgeWidth"),
          "line-color": ele => ele.data("edgeColor"),
          opacity: 0.7,
          "curve-style": "bezier",
          "transition-property": "line-color, opacity, width",
          "transition-duration": "220ms",
        },
      },
      {
        selector: "edge.dimmed",
        style: { opacity: 0.06, width: 0.5 },
      },
      {
        selector: "edge.highlighted",
        style: {
          opacity: 1,
          width: ele => ele.data("edgeWidth") + 1.5,
        },
      },
      {
        selector: "edge.selected-edge",
        style: {
          opacity: 1,
          width: ele => ele.data("edgeWidth") + 2,
          "line-color": ele => ele.data("edgeColor"),
        },
      },
      {
        selector: "edge.search-dimmed",
        style: { opacity: 0.05 },
      },
    ],
    layout: GRAPH_LAYOUT,
    userZoomingEnabled: true,
    userPanningEnabled: true,
    minZoom: 0.3,
    maxZoom: 4,
  });
}

export function setupGraphEvents(app) {
  // Node tap
  app.cy.on("tap", "node", event => {
    const node = event.target;
    const data = node.data();
    app.selectedNode = node;
    app.selectedEdge = null;
    clearSelectionClasses(app);
    node.addClass("selected-node");
    node.connectedEdges().addClass("selected-edge");
    node.neighborhood("node").addClass("neighbour-node");
    showCard(app, data, node);
    updateInfoPanel(data, node, app);
  });

  // Edge tap
  app.cy.on("tap", "edge", event => {
    const edge = event.target;
    app.selectedEdge = edge;
    app.selectedNode = null;
    clearSelectionClasses(app);
    hideCard(app);
    edge.addClass("selected-edge");
    edge.source().addClass("neighbour-node");
    edge.target().addClass("neighbour-node");
    updateEdgeInfoPanel(edge);
  });

  app.cy.on("pan zoom resize", () => {
    if (app.selectedNode) positionCardForNode(app, app.selectedNode);
  });

  app.cy.on("mouseover", "node", () => { document.body.style.cursor = "pointer"; });
  app.cy.on("mouseout", "node", () => { document.body.style.cursor = "default"; });
  app.cy.on("mouseover", "edge", () => { document.body.style.cursor = "pointer"; });
  app.cy.on("mouseout", "edge", () => { document.body.style.cursor = "default"; });

  app.cy.on("tap", event => {
    if (event.target === app.cy) {
      clearSelectionClasses(app);
      hideCard(app);
      resetInfoPanel();
      app.selectedNode = null;
      app.selectedEdge = null;
    }
  });
}