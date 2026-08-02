const STORAGE_KEY = "orbis:savedPortfolios";

function loadAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveAll(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function savePortfolio(name, weights, selectedTickers) {
  const list = loadAll();
  const portfolio = {
    id: "p_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name,
    weights,
    selectedTickers: [...selectedTickers],
  };
  list.push(portfolio);
  saveAll(list);
  return portfolio;
}

export function getSavedPortfolios() {
  return loadAll();
}

export function deletePortfolio(id) {
  saveAll(loadAll().filter(p => p.id !== id));
}