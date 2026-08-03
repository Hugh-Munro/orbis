import {
  switchToAllNodesWithoutClearingSearch,
} from "./ui.js";

function nodeMatchesQuery(node, q) {
  const label = String(node.data("label") || "").toLowerCase();
  const id = String(node.id() || "").toLowerCase();

  return label.includes(q) || id.includes(q);
}

function runSearch(app, rawQuery) {
  if (!app.cy) return;

  const q = rawQuery.trim().toLowerCase();

  app.cy.elements().removeClass("search-match search-dimmed");

  if (!q) return;

  switchToAllNodesWithoutClearingSearch(app);

  const matchedNodes = app.cy.nodes().filter(node => nodeMatchesQuery(node, q));
  const matchedIds = new Set(matchedNodes.map(node => node.id()));

  app.cy.nodes().forEach(node => {
    if (matchedIds.has(node.id())) {
      node.addClass("search-match");
    } else {
      node.addClass("search-dimmed");
    }
  });

  app.cy.edges().forEach(edge => {
    const sourceMatched = matchedIds.has(edge.source().id());
    const targetMatched = matchedIds.has(edge.target().id());

    if (sourceMatched || targetMatched) {
      edge.addClass("search-match");
    } else {
      edge.addClass("search-dimmed");
    }
  });
}

export function setupSearch(app) {
  const input = document.getElementById("search-input");

  if (!input || !app.cy) return;

  input.addEventListener("input", event => {
    runSearch(app, event.target.value);
  });

  input.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      input.value = "";
      app.cy.elements().removeClass("search-match search-dimmed");
      return;
    }

    if (event.key !== "Enter") return;

    const matches = app.cy.nodes(".search-match");

    if (matches.length > 0) {
      app.cy.animate({
        fit: {
          eles: matches,
          padding: 100,
        },
        duration: 350,
        easing: "ease-in-out",
      });
    }
  });

  input.addEventListener("search", () => {
    if (!input.value.trim()) {
      app.cy.elements().removeClass("search-match search-dimmed");
    }
  });
}