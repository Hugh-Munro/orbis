export const GROUP_COLORS = {
  equity:    { bg: "#e4e2f0", border: "#4a4ea3", text: "#242660" },
  bond:      { bg: "#dceae0", border: "#2f7a52", text: "#1c4a32" },
  commodity: { bg: "#f2e1e1", border: "#9c3d2e", text: "#6a2318" },
  crypto:    { bg: "#dde6ee", border: "#33628f", text: "#1a3550" },
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

export const GRAPH_LAYOUT_BASE = {
  name: "cola",
  animate: true,
  infinite: true,
  fit: false,
  nodeSpacing: 45,
  nodeRepulsion: 60000,
  gravity: 0.35,
  dragCoeff: 0.008,
  randomize: true,
  maxSimulationTime: Infinity,
  padding: 80,
  avoidOverlap: true,
};