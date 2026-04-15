const form = document.getElementById("prefsForm");
const btnClear = document.getElementById("btnClear");

const navMatch = document.getElementById("navMatch");
const navSaved = document.getElementById("navSaved");
const savedPanel = document.getElementById("savedPanel");
const savedList = document.getElementById("savedList");
const btnClearSaved = document.getElementById("btnClearSaved");

// Modal elements
const modal = document.getElementById("matchModal");
const modalOverlay = document.getElementById("modalOverlay");
const btnCloseModal = document.getElementById("btnCloseModal");
const btnLike = document.getElementById("btnLike");
const btnPass = document.getElementById("btnPass");

const placeName = document.getElementById("placeName");
const placePrice = document.getElementById("placePrice");
const placeMeta = document.getElementById("placeMeta");
const placeDesc = document.getElementById("placeDesc");
const placeTags = document.getElementById("placeTags");
const matchScore = document.getElementById("matchScore");

const STORAGE_KEY = "location_matchmaker_saved_v1";

//JS ELEMENTS FOR USER OUTPUT
const resultsPanel = document.getElementById("resultsPanel");
const resultsList = document.getElementById("resultsList");

// Queue of matches to “swipe”
let matchQueue = [];
let current = null;

//STORES LATEST RESULTS
let lastResults = [];

function getSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setSaved(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function alreadySaved(placeId) {
  return getSaved().some(p => p.id === placeId);
}

function renderSaved() {
  const items = getSaved();
  if (items.length === 0) {
    savedList.innerHTML = `<div class="muted">No saved places yet. Go match and hit Like.</div>`;
    return;
  }

  savedList.innerHTML = items.map(p => `
    <div class="savedItem">
      <div class="savedItem__top">
        <h3 class="savedItem__name">${escapeHtml(p.name)}</h3>
        <span class="pill">${escapeHtml(p.price || "")}</span>
      </div>
      <div class="savedItem__meta">${escapeHtml(p.category)} • ${escapeHtml(p.city)}</div>
      <div class="muted" style="margin-top:8px;">${escapeHtml(p.description || "")}</div>
    </div>
  `).join("");
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function openModal() {
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
}

function closeModal() {
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
}

function showNextMatch() {
  current = matchQueue.shift() || null;

  if (!current) {
    closeModal();
    alert("No more matches right now. Try different preferences!");
    return;
  }

  // Fill modal
  placeName.textContent = current.name;
  placePrice.textContent = current.price || "";
  placeMeta.textContent = `${current.category} • ${current.city}`;
  placeDesc.textContent = current.description || "";
  matchScore.textContent = String(current.matchScore ?? 0);

  // tags
  placeTags.innerHTML = "";
  const tags = [
    ...(current.vibe || []),
    ...(current.culture || []),
    ...(current.trends || [])
  ].slice(0, 10);

  for (const t of tags) {
    const el = document.createElement("span");
    el.className = "tag";
    el.textContent = t;
    placeTags.appendChild(el);
  }

  openModal();
}

async function fetchMatches(prefs) {
  const res = await fetch("/api/match", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(prefs)
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || "Failed to fetch matches");
  }

  const data = await res.json();
  return data.results || [];
}

function showMatchView() {
  savedPanel.style.display = "none";
}

function showSavedView() {
  savedPanel.style.display = "block";
  renderSaved();
}

// Nav
if (navMatch) {
  navMatch.addEventListener("click", (e) => {
    e.preventDefault();
    showMatchView();
  });
}

if (navSaved) {
  navSaved.addEventListener("click", (e) => {
    e.preventDefault();
    showSavedView();
  });
}

btnClearSaved.addEventListener("click", () => {
  if (confirm("Clear all saved places?")) {
    setSaved([]);
    renderSaved();
  }
});

// SUBMIT HANDLER
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const prefs = {};

  document.querySelectorAll(".button-group").forEach(group => {
    const name = group.dataset.name;
    const selected = [...group.querySelectorAll(".pref-btn.selected")]
      .map(btn => btn.textContent.trim());
    prefs[name] = selected.join(" ");
  });

  // keep dropdowns if you have them (category/price)
  const categoryEl = form.querySelector('[name="category"]');
  const priceEl = form.querySelector('[name="price"]');
  prefs.category = categoryEl ? categoryEl.value : "";
  prefs.price = priceEl ? priceEl.value : "";

  try {
    const results = await fetchMatches(prefs);

    lastResults = results;
    matchQueue = results.filter(r => !alreadySaved(r.id));

    renderMatches(results);

    if (matchQueue.length === 0) {
      alert("No unsaved matches found.");
      return;
    }

    showNextMatch();
  } catch (err) {
    console.error(err);
  }
});


// SECOND HALF
//clear button function
if (btnClear) {
  btnClear.addEventListener("click", () => {
    document.querySelectorAll(".pref-btn.selected").forEach((btn) => {
      btn.classList.remove("selected");
    });

    resultsList.innerHTML = "";
  });
}

//modal controls
btnCloseModal.addEventListener("click", closeModal);
modalOverlay.addEventListener("click", closeModal);

btnPass.addEventListener("click", () => {
  showNextMatch();
});

btnLike.addEventListener("click", () => {
  if (!current) return;

  const saved = getSaved();
  if (!saved.some(p => p.id === current.id)) {
    saved.unshift({
      id: current.id,
      name: current.name,
      category: current.category,
      price: current.price,
      city: current.city,
      description: current.description
    });
    setSaved(saved);
  }

  showNextMatch();
});

//preference button color toggling
document.querySelectorAll(".pref-btn").forEach((button) => {
  button.addEventListener("click", () => {
    button.classList.toggle("selected");
  });
});

//render matches on page
function renderMatches(results) {
  if (!results || results.length === 0) {
    resultsList.innerHTML = `<div class="muted">No matches found. Try different preferences.</div>`;
    return;
  }

  resultsList.innerHTML = results.map(place => `
    <div class="resultCard">
      <div class="resultCard__top">
        <h3 class="resultCard__name">${escapeHtml(place.name)}</h3>
        <span class="pill">${escapeHtml(place.price || "")}</span>
      </div>

      <div class="resultCard__meta">
        ${escapeHtml(place.category || "")} • ${escapeHtml(place.city || "")}
      </div>

      <div class="resultCard__desc">
        ${escapeHtml(place.description || "No description available.")}
      </div>

      <div class="matchrow">
        <span class="muted">Match Score:</span>
        <strong>${escapeHtml(String(place.matchScore ?? 0))}</strong>
      </div>

      <div class="resultCard__actions">
        <button class="btn btn--ghost" type="button" onclick="saveMatch(${place.id})">
          Save
        </button>
      </div>
    </div>
  `).join("");
}

//save from front-end result cards
function saveMatch(placeId) {
  const place = matchQueue.find(p => p.id === placeId) || lastResults.find(p => p.id === placeId);
  if (!place) return;

  const saved = getSaved();

  if (!saved.some(p => p.id === place.id)) {
    saved.unshift({
      id: place.id,
      name: place.name,
      category: place.category,
      price: place.price,
      city: place.city,
      description: place.description
    });
    setSaved(saved);
    alert("Place saved!");
  } else {
    alert("That place is already saved.");
  }
}

