export const GROUP_COLORS = {
  equity:    { bg: "#ededfc", border: "#6558d3", text: "#2d2560" },
  bond:      { bg: "#d8f0e8", border: "#2d8a5e", text: "#144530" },
  commodity: { bg: "#fce8ee", border: "#c0385a", text: "#6a1028" },
  crypto:    { bg: "#ddeeff", border: "#2060c0", text: "#0a2a60" },
};

export const GROUP_LABELS = {
  equity:    "Equity",
  bond:      "Bond",
  commodity: "Commodity",
  crypto:    "Crypto",
};

export const PARADIGM_COLORS = {
  "Risk-On":      { bg: "#fdf0e8", border: "#c06820", text: "#6a3010" },
  "Risk-Off":     { bg: "#e8f4e8", border: "#3a8a3a", text: "#1a4a1a" },
  "Real Assets":  { bg: "#f0e8f8", border: "#8050b0", text: "#402060" },
};

export const GRAPH_LAYOUT = {
  name: "cose",
  animate: true,
  animationDuration: 900,
  nodeRepulsion: () => 400000,
  idealEdgeLength: () => 250,
  edgeElasticity: () => 45,
  gravity: 0.15,
  numIter: 2500,
  padding: 100,
  randomize: true,
};