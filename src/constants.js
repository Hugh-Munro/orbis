export const GROUP_COLORS = {
  equity:    { bg: "#eeedfb", border: "#8880d0", text: "#3a3670" },
  bond:      { bg: "#e0eeea", border: "#408068", text: "#1e4a30" },
  commodity: { bg: "#f0e0e8", border: "#985060", text: "#5a2020" },
  crypto:    { bg: "#e8f0fd", border: "#3070b0", text: "#103070" },
};

export const GROUP_LABELS = {
  equity:    "Equity",
  bond:      "Bond",
  commodity: "Commodity",
  crypto:    "Crypto",
};

export const GRAPH_LAYOUT = {
  name: "cose",
  animate: true,
  animationDuration: 900,
  nodeRepulsion: () => 42000,
  idealEdgeLength: () => 115,
  edgeElasticity: () => 80,
  gravity: 0.28,
  numIter: 1200,
  padding: 40,
  randomize: false,
};