import { GROUP_COLORS, GRAPH_LAYOUT } from "./constants.js";
import {
  clearSelectionClasses,
  showCard,
  positionCardForNode,
  hideCard,
  updateInfoPanel,
  resetInfoPanel,
} from "./ui.js";

function colorFor(ele) {
  return GROUP_COLORS[ele.data("group")] || GROUP_COLORS.concept;
}

export function createGraph(app, nodes, edges, deg) {
  const maxDeg = Math.max(...Object.values(deg)) || 1;
  const nodeSize = id => 32 + ((deg[id] || 0) / maxDeg) * 52;

  app.nodeSize = nodeSize;

  return window.cytoscape({
    container: document.getElementById("cy"),

    elements: [
      ...nodes.map(node => ({
        data: {
          id: node.id,
          label: node.label,
          group: node.group,
          deg: deg[node.id] || 0,
          description: node.description || "",
          origin: node.origin || "",
          year: node.year || "",
          key_figures: node.key_figures || [],
        },
      })),

      ...edges.map(([source, target], index) => ({
        data: {
          id: `e${index}`,
          source,
          target,
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
          label: "data(label)",
          color: ele => colorFor(ele).text,
          "font-size": 9,
          "font-family": "Computer Modern, serif",
          "text-valign": "center",
          "text-halign": "center",
          "text-wrap": "wrap",
          "text-max-width": ele => `${nodeSize(ele.id()) - 8}px`,
          "transition-property":
            "background-color, border-color, border-width, opacity, outline-color, outline-width, outline-opacity, line-color, width",
          "transition-duration": "220ms",
        },
      },
      {
        selector: "node.highlighted",
        style: {
          "background-color": ele => colorFor(ele).bg,
          "border-color": ele => ele.data("hl_border") || "#c8a820",
          "border-width": 2,
          "outline-color": ele => ele.data("hl_border") || "#c8a820",
          "outline-width": 5,
          "outline-opacity": 0.3,
          color: ele => colorFor(ele).text,
        },
      },
      {
        selector: "node.dimmed",
        style: {
          "background-color": "#eeede8",
          "border-color": "#d0cfc8",
          color: "#c0bfb8",
          opacity: 0.5,
        },
      },
      {
        selector: "node.selected-node",
        style: {
          "border-width": 3,
          "outline-color": ele => colorFor(ele).border,
          "outline-width": 7,
          "outline-opacity": 0.28,
        },
      },
      {
        selector: "node.neighbour-node",
        style: {
          "border-width": 2.2,
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
        style: {
          opacity: 0.16,
        },
      },
      {
        selector: "edge",
        style: {
          width: 0.8,
          "line-color": "#c8c7be",
          opacity: 0.8,
          "curve-style": "bezier",
          "transition-property": "line-color, opacity, width",
          "transition-duration": "220ms",
        },
      },
      {
        selector: "edge.dimmed",
        style: {
          opacity: 0.1,
          "line-color": "#dddbd2",
        },
      },
      {
        selector: "edge.highlighted",
        style: {
          opacity: 1,
          "line-color": ele => ele.data("hl_edge") || "#c8a820",
          width: 1.5,
        },
      },
      {
        selector: "edge.selected-edge",
        style: {
          opacity: 0.9,
          width: 1.5,
          "line-color": "#0f1b2d",
        },
      },
      {
        selector: "edge.search-match",
        style: {
          opacity: 0.85,
          width: 1.4,
          "line-color": "#0f1b2d",
        },
      },
      {
        selector: "edge.search-dimmed",
        style: {
          opacity: 0.06,
        },
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
  app.cy.on("tap", "node", event => {
    const node = event.target;
    const data = node.data();

    app.selectedNode = node;

    clearSelectionClasses(app);

    node.addClass("selected-node");
    node.connectedEdges().addClass("selected-edge");
    node.neighborhood("node").addClass("neighbour-node");

    showCard(app, data, node);
    updateInfoPanel(data);
  });

  app.cy.on("pan zoom resize", () => {
    if (app.selectedNode) {
      positionCardForNode(app, app.selectedNode);
    }
  });

  app.cy.on("mouseover", "node", () => {
    document.body.style.cursor = "pointer";
  });

  app.cy.on("mouseout", "node", () => {
    document.body.style.cursor = "default";
  });

  app.cy.on("tap", event => {
    if (event.target === app.cy) {
      clearSelectionClasses(app);
      hideCard(app);
      resetInfoPanel();
    }
  });
}