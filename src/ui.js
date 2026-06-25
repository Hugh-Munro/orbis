import { GROUP_COLORS, GROUP_LABELS } from "./constants.js";

export function formatGroupName(group) {
  return GROUP_LABELS[group] || group;
}

export function buildSidebar(app) {
  const container = document.getElementById("filters");

  Object.entries(app.overlays).forEach(([key, overlay]) => {
    const btn = document.createElement("button");
    btn.className = "pf-btn";
    btn.dataset.filter = key;
    btn.type = "button";

    const swatch = document.createElement("span");
    swatch.className = "btn-swatch";
    swatch.style.background = overlay.color.border;

    btn.append(swatch, document.createTextNode(overlay.label));
    btn.addEventListener("click", () => setFilter(app, key, btn));

    container.appendChild(btn);
  });
}

export function buildLegend() {
  const container = document.getElementById("legend-items");
  container.innerHTML = "";

  Object.entries(GROUP_COLORS).forEach(([group, c]) => {
    const item = document.createElement("div");
    item.className = "legend-item";

    const dot = document.createElement("div");
    dot.className = "legend-dot";
    dot.style.background = c.bg;
    dot.style.border = `1px solid ${c.border}`;

    item.append(dot, document.createTextNode(formatGroupName(group)));
    container.appendChild(item);
  });
}

export function clearSearch(app) {
  const input = document.getElementById("search-input");

  if (input) {
    input.value = "";
  }

  if (app.cy) {
    app.cy.elements().removeClass("search-match search-dimmed");
  }
}

export function clearFilterClasses(app) {
  if (!app.cy) return;

  app.cy.elements().removeClass("highlighted dimmed");

  app.cy.nodes().forEach(node => {
    node.removeData("hl_border");
    node.removeData("hl_bg");
  });

  app.cy.edges().forEach(edge => {
    edge.removeData("hl_edge");
  });
}

export function clearSelectionClasses(app) {
  if (!app.cy) return;

  app.cy.elements().removeClass("selected-node selected-edge neighbour-node");
}

export function setActiveFilterButton(activeBtn) {
  document.querySelectorAll(".pf-btn").forEach(button => {
    button.classList.remove("active");
    button.style.color = "";
    button.style.borderColor = "";
    button.style.background = "";
  });

  activeBtn.classList.add("active");
}

export function resetInfoPanel() {
  document.getElementById("info-content").textContent = "Select a node to explore.";
}

export function updateInfoPanel(data) {
  document.getElementById("info-content").innerHTML = `
    <strong>${data.label}</strong><br>
    Class: ${formatGroupName(data.group)}<br>
    Degree: ${data.deg}
  `;
}

export function updateSearchInfo(rawQuery, resultCount) {
  if (resultCount === 0) {
    document.getElementById("info-content").textContent = `No node found for "${rawQuery}".`;
    return;
  }

  document.getElementById("info-content").textContent =
    `${resultCount} node${resultCount === 1 ? "" : "s"} found. Press Enter to fit.`;
}

export function hideCard(app) {
  app.selectedNode = null;
  document.getElementById("fc").classList.remove("visible");
}

export function resetView(app) {
  if (!app.cy) return;

  clearSearch(app);
  clearFilterClasses(app);
  clearSelectionClasses(app);
  hideCard(app);
  resetInfoPanel();

  const allBtn = document.querySelector('.pf-btn[data-filter="none"]');

  if (allBtn) {
    setActiveFilterButton(allBtn);
  }

  app.cy.animate({
    fit: { padding: 40 },
    duration: 400,
    easing: "ease-in-out",
  });
}

export function setFilter(app, key, btn) {
  if (!app.cy) return;

  clearSearch(app);
  clearFilterClasses(app);
  clearSelectionClasses(app);
  hideCard(app);
  resetInfoPanel();
  setActiveFilterButton(btn);

  if (key !== "none") {
    const c = app.overlays[key].color;

    btn.style.color = c.text;
    btn.style.borderColor = c.border;
    btn.style.background = c.bg;
  }

  if (key === "none") return;

  const assumed = app.overlays[key].assumes;
  const c = app.overlays[key].color;

  app.cy.nodes().forEach(node => {
    if (assumed.includes(node.id())) {
      node.data("hl_border", c.border);
      node.data("hl_bg", c.bg);
      node.addClass("highlighted");
    } else {
      node.addClass("dimmed");
    }
  });

  app.cy.edges().forEach(edge => {
    const source = edge.source().id();
    const target = edge.target().id();

    if (assumed.includes(source) && assumed.includes(target)) {
      edge.data("hl_edge", c.border);
      edge.addClass("highlighted");
    } else {
      edge.addClass("dimmed");
    }
  });
}

export function switchToAllNodesWithoutClearingSearch(app) {
  const allBtn = document.querySelector('.pf-btn[data-filter="none"]');

  if (!allBtn) return;

  clearFilterClasses(app);
  clearSelectionClasses(app);
  hideCard(app);
  setActiveFilterButton(allBtn);
}

export function positionCardForNode(app, node) {
  if (!node) return;

  const wrap = document.getElementById("cy-wrap");
  const card = document.getElementById("fc");

  if (!card.classList.contains("visible")) return;

  const pos = node.renderedPosition();
  const wrapRect = wrap.getBoundingClientRect();
  const cardRect = card.getBoundingClientRect();

  const margin = 16;

  let left = pos.x + margin;
  let top = pos.y + margin;

  if (left + cardRect.width + margin > wrapRect.width) {
    left = pos.x - cardRect.width - margin;
  }

  if (top + cardRect.height + margin > wrapRect.height) {
    top = pos.y - cardRect.height - margin;
  }

  card.style.left = `${Math.max(margin, left)}px`;
  card.style.top = `${Math.max(margin, top)}px`;
}

export function showCard(app, data, node) {
  const card = document.getElementById("fc");

  document.getElementById("fc-name").textContent = data.label;
  document.getElementById("fc-group").textContent = formatGroupName(data.group);
  document.getElementById("fc-desc").textContent = data.description || "No definition available.";
  document.getElementById("fc-origin").textContent = data.origin || "—";
  document.getElementById("fc-year").textContent = data.year || "—";
  document.getElementById("fc-figures").textContent =
    data.key_figures && data.key_figures.length ? data.key_figures.join(", ") : "—";

  card.classList.add("visible");
  positionCardForNode(app, node);
}