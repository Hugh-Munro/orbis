import { GROUP_COLORS } from "./constants.js";

export async function loadCorrelationData() {
  const response = await fetch("data/correlation.json");
  if (!response.ok) throw new Error(`Failed to load correlation data: ${response.status}`);
  return response.json();
}

// Convert correlation.json into the node/edge shape the rest of the app expects
export function parseGraphData(correlationData) {
  const nodes = Object.entries(correlationData.assets).map(([id, meta]) => ({
    id,
    label: meta.name,
    group: meta.class.toLowerCase(),  // "Equity" → "equity", matches GROUP_COLORS keys
    assetClass: meta.class,
    paradigm: meta.paradigm,
  }));

  const edges = correlationData.edges.map(e => ({
    source: e.source,
    target: e.target,
    correlation: e.correlation,
  }));

  return { nodes, edges };
}

export function degreeMap(nodes, edges) {
  const deg = {};
  nodes.forEach(n => { deg[n.id] = 0; });
  edges.forEach(e => {
    if (deg[e.source] !== undefined) deg[e.source]++;
    if (deg[e.target] !== undefined) deg[e.target]++;
  });
  return deg;
}

export function validateGraphData(nodes, edges) {
  const ids = new Set(nodes.map(n => n.id));
  const bad = edges.filter(e => !ids.has(e.source) || !ids.has(e.target));
  if (bad.length) console.warn("Edges reference missing nodes:", bad);
  const unknownGroups = nodes.filter(n => !GROUP_COLORS[n.group]);
  if (unknownGroups.length) console.warn("Nodes use unknown groups:", unknownGroups);
}