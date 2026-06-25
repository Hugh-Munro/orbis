import { GROUP_COLORS } from "./constants.js";

export async function loadJSON(path) {
  const response = await fetch(path);

  if (!response.ok) {
    throw new Error(`Failed to load ${path}: ${response.status}`);
  }

  return response.json();
}

export function degreeMap(nodes, edges) {
  const deg = {};

  nodes.forEach(node => {
    deg[node.id] = 0;
  });

  edges.forEach(([a, b]) => {
    if (deg[a] !== undefined) deg[a]++;
    if (deg[b] !== undefined) deg[b]++;
  });

  return deg;
}

export function validateGraphData(nodes, edges) {
  const ids = new Set(nodes.map(node => node.id));

  const missingEdges = edges.filter(([a, b]) => !ids.has(a) || !ids.has(b));

  if (missingEdges.length > 0) {
    console.warn("Edges reference missing nodes:", missingEdges);
  }

  const unknownGroups = nodes.filter(node => !GROUP_COLORS[node.group]);

  if (unknownGroups.length > 0) {
    console.warn("Nodes use unknown groups:", unknownGroups);
  }
}