import { GROUP_COLORS, GRAPH_LAYOUT_BASE } from "./constants.js";
import {
  clearSelectionClasses,
  showCard,
  positionCardForNode,
  hideCard,
  updateInfoPanel,
  updateEdgeInfoPanel,
  resetInfoPanel,
} from "./ui.js";

if (window.cytoscape && window.cytoscapeCola && !window.__colaRegistered) {
  window.cytoscape.use(window.cytoscapeCola);
  window.__colaRegistered = true;
}

function colorFor(ele) {
  return GROUP_COLORS[ele.data("group")] || GROUP_COLORS.equity;
}

function edgeWidth(correlation) {
  return 0.8 + Math.abs(correlation) * 6;
}

function edgeLengthFor(correlation) {
  const minLen = 160;
  const maxLen = 420;
  const t = (1 - correlation) / 2;
  return minLen + t * (maxLen - minLen);
}

function edgeColor(correlation) {
  if (correlation >= 0.7)  return "#9c3d2e";
  if (correlation >= 0.3)  return "#c46a52";
  if (correlation >= 0)    return "#b8b4a8";
  if (correlation >= -0.3) return "#5c9a6e";
  return "#2f7a52";
}

function formatDollars(amount) {
  if (amount == null) return "";
  return "$" + Math.round(amount).toLocaleString("en-US");
}

export function createGraph(app, nodes, edges, deg) {
  const nodeIds = nodes.map(n => n.id);
  const equalFallback = Object.fromEntries(nodeIds.map(id => [id, 1 / nodeIds.length]));

  const nodeSize = id => {
    const weights = app.weights || equalFallback;
    const w = weights[id] || 0;
    const maxW = Math.max(...Object.values(weights)) || 1;
    const minSize = 30;
    const maxSize = 96;
    return minSize + (w / maxW) * (maxSize - minSize);
  };
  app.nodeSize = nodeSize;

  const nodeDollarLabel = id => {
    const weights = app.weights || equalFallback;
    const w = weights[id] || 0;
    const value = (app.portfolioValue || 0) * w;
    return formatDollars(value);
  };
  app.nodeDollarLabel = nodeDollarLabel;

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
          "border-width": 1.5,
          label: ele => {
            const size = nodeSize(ele.id());
            if (size < 45) return ele.data("label");
            return `${ele.data("label")}\n${nodeDollarLabel(ele.id())}`;
          },
          color: ele => colorFor(ele).text,
          "font-family": "Inter",
          "font-size": ele => Math.min(13, Math.max(8, nodeSize(ele.id()) * 0.18)),
          "font-weight": 600,
          "text-valign": "center",
          "text-halign": "center",
          "text-wrap": "wrap",
          "text-max-width": ele => `${nodeSize(ele.id()) - 8}px`,
          "line-height": 1.3,
          "transition-property": "background-color, border-color, border-width, opacity, outline-color, outline-width",
          "transition-duration": "200ms",
        },
      },
      {
        selector: "node.dimmed",
        style: {
          "background-color": ele => colorFor(ele).bg,
          "border-color": ele => colorFor(ele).border,
          opacity: 0.15,
        },
      },
      {
        selector: "node.focused",
        style: {
          "border-width": 2.5,
          "border-color": ele => colorFor(ele).border,
          "outline-color": ele => colorFor(ele).border,
          "outline-width": 8,
          "outline-opacity": 0.22,
          opacity: 1,
          "z-index": 999,
        },
      },
      {
        selector: "node.selected-node",
        style: {
          "border-width": 2.5,
          "border-color": ele => colorFor(ele).border,
          "outline-color": ele => colorFor(ele).border,
          "outline-width": 8,
          "outline-opacity": 0.2,
        },
      },
      {
        selector: "node.neighbour-node",
        style: {
          "border-width": 2,
          "border-color": ele => colorFor(ele).border,
          opacity: 1,
        },
      },
      {
        selector: "node.highlighted",
        style: {
          "border-color": ele => ele.data("hl_border") || colorFor(ele).border,
          "border-width": 2,
          "outline-color": ele => ele.data("hl_border") || colorFor(ele).border,
          "outline-width": 6,
          "outline-opacity": 0.2,
        },
      },
      {
        selector: "node.search-match",
        style: {
          "border-width": 2.5,
          "border-color": ele => colorFor(ele).border,
          "outline-color": "#1a1a1a",
          "outline-width": 6,
          "outline-opacity": 0.18,
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
          opacity: 0.55,
          "curve-style": "bezier",
          "transition-property": "line-color, opacity, width",
          "transition-duration": "200ms",
        },
      },
      {
        selector: "edge.dimmed",
        style: { opacity: 0.04, width: 0.5 },
      },
      {
        selector: "edge.focused",
        style: {
          opacity: 0.9,
          width: ele => ele.data("edgeWidth") + 1,
        },
      },
      {
        selector: "edge.highlighted",
        style: {
          opacity: 0.9,
          width: ele => ele.data("edgeWidth") + 1.5,
        },
      },
      {
        selector: "edge.selected-edge",
        style: {
          opacity: 0.9,
          width: ele => ele.data("edgeWidth") + 2,
          "line-color": ele => ele.data("edgeColor"),
        },
      },
      {
        selector: "edge.search-dimmed",
        style: { opacity: 0.04 },
      },
    ],
    layout: {
      ...GRAPH_LAYOUT_BASE,
      edgeLength: edge => edgeLengthFor(edge.data("correlation")),
    },
    userZoomingEnabled: true,
    userPanningEnabled: true,
    minZoom: 0.3,
    maxZoom: 4,
  });
}

export function setNodeUniverseVisibility(node, inUniverse) {
  if (inUniverse) {
    node.style("display", "element");
    node.stop();
    node.animate(
      { style: { opacity: 1 } },
      { duration: 200, easing: "ease-out" }
    );
  } else {
    node.stop();
    node.animate(
      { style: { opacity: 0 } },
      {
        duration: 200,
        easing: "ease-in",
        complete: () => node.style("display", "none"),
      }
    );
  }
}

function applyFocus(app, node) {
  const cy = app.cy;
  const keepEdges = node.connectedEdges();
  cy.elements().removeClass("dimmed focused");
  cy.elements().difference(node.union(keepEdges)).addClass("dimmed");
  node.addClass("focused");
  keepEdges.addClass("focused");
}

function clearFocus(app) {
  if (!app.cy) return;
  app.cy.elements().removeClass("dimmed focused");
}

export function setupGraphEvents(app) {
  app.lockedFocusNode = null;

  app.cy.on("mouseover", "node", event => {
    document.body.style.cursor = "pointer";
    if (app.lockedFocusNode) return;
    applyFocus(app, event.target);
  });

  app.cy.on("mouseout", "node", () => {
    document.body.style.cursor = "default";
    if (app.lockedFocusNode) return;
    clearFocus(app);
  });

  app.cy.on("tap", "node", event => {
    const node = event.target;
    const data = node.data();
    if (app.lockedFocusNode && app.lockedFocusNode.id() === node.id()) {
      app.lockedFocusNode = null;
      clearFocus(app);
      node.unlock();
    } else {
      if (app.lockedFocusNode) app.lockedFocusNode.unlock();
      app.lockedFocusNode = node;
      applyFocus(app, node);
      node.lock();
    }
    app.selectedNode = node;
    app.selectedEdge = null;
    node.connectedEdges().addClass("selected-edge");
    showCard(app, data, node);
    updateInfoPanel(data, node, app);
  });

  app.cy.on("tap", "edge", event => {
    const edge = event.target;
    app.selectedEdge = edge;
    app.selectedNode = null;
    clearSelectionClasses(app);
    hideCard(app);
    edge.addClass("selected-edge");
    updateEdgeInfoPanel(edge, app);
  });

  app.cy.on("pan zoom resize", () => {
    if (app.selectedNode) positionCardForNode(app, app.selectedNode);
  });

  app.cy.on("mouseover", "edge", () => { document.body.style.cursor = "pointer"; });
  app.cy.on("mouseout", "edge", () => { document.body.style.cursor = "default"; });

  app.cy.on("tap", event => {
    if (event.target === app.cy) {
      if (app.lockedFocusNode) {
        app.lockedFocusNode.unlock();
        app.lockedFocusNode = null;
      }
      clearFocus(app);
      clearSelectionClasses(app);
      hideCard(app);
      resetInfoPanel();
      app.selectedNode = null;
      app.selectedEdge = null;
    }
  });
}