const form = document.getElementById("prefsForm");
const btnClear = document.getElementById("btnClear");
const btnClearMatches = document.getElementById("btnClearMatches");


const navMatch = document.getElementById("navMatch");
const navSaved = document.getElementById("navSaved");
const savedPanel = document.getElementById("savedPanel");
const savedList = document.getElementById("savedList");
const btnClearSaved = document.getElementById("btnClearSaved");


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


const resultsList = document.getElementById("resultsList");


const STORAGE_KEY = "location_matchmaker_saved_v1";
const USER_STORAGE_KEY = "currentUser";


let matchQueue = [];
let current = null;
let lastResults = [];
let currentUser = null;


window.addEventListener("load", () => {
  try {
    const storedUser = localStorage.getItem(USER_STORAGE_KEY);
    currentUser = storedUser ? JSON.parse(storedUser) : null;
  } catch (err) {
    console.error("Could not load current user:", err);
    currentUser = null;
  }


  renderSaved();
  renderLikedResults();
  showMatchView();
});


function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


function cleanPrefText(text) {
  return String(text || "")
    .replace(/[^\p{L}\p{N}\s/&-]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}


function getSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error("Could not read saved matches:", err);
    return [];
  }
}


function setSaved(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}


function alreadySaved(placeId) {
  return getSaved().some((p) => Number(p.id) === Number(placeId));
}


function buildPrefsFromForm() {
  const prefs = {
    likes: "",
    personality: "",
    culture: "",
    trends: "",
    category: "",
    price: ""
  };


  if (!form) return prefs;


  form.querySelectorAll(".button-group").forEach((group) => {
    const name = group.dataset.name;
    if (!name) return;


    const selected = [...group.querySelectorAll(".pref-btn.selected")]
      .map((btn) => cleanPrefText(btn.textContent))
      .filter(Boolean);


    prefs[name] = selected.join(" ");
  });


  return prefs;
}


async function safePostJson(url, payload) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });


    if (!res.ok) return null;


    const contentType = res.headers.get("content-type") || "";
    return contentType.includes("application/json") ? await res.json() : await res.text();
  } catch (err) {
    console.warn(`Request to ${url} failed:`, err);
    return null;
  }
}


function renderSaved() {
  if (!savedList) return;


  const items = getSaved();


  if (items.length === 0) {
    savedList.innerHTML = `<div class="muted">No saved places yet. Go match and hit Like.</div>`;
    return;
  }


  savedList.innerHTML = items.map((p) => `
    <div class="savedItem">
      <div class="savedItem__top">
        <h3 class="savedItem__name">${escapeHtml(p.name)}</h3>
        <span class="pill">${escapeHtml(p.price || "")}</span>
      </div>


      <div class="savedItem__meta">
        ${escapeHtml(p.category || "")} • ${escapeHtml(p.city || "")}
      </div>


      <div class="muted" style="margin-top:8px;">
        ${escapeHtml(p.description || "")}
      </div>
    </div>
  `).join("");
}


function renderLikedResults() {
  renderMatches(getSaved());
}


function openModal() {
  if (!modal) return;
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
}


function closeModal() {
  if (!modal) return;
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
}


function renderModalTags(place) {
  if (!placeTags) return;


  placeTags.innerHTML = "";


  const tags = [];
  if (place.category) tags.push(place.category);
  if (place.city) tags.push(place.city);
  if (place.price) tags.push(place.price);


  tags.forEach((tagText) => {
    const el = document.createElement("span");
    el.className = "tag";
    el.textContent = tagText;
    placeTags.appendChild(el);
  });
}


function showNextMatch() {
  current = matchQueue.shift() || null;


  if (!current) {
    closeModal();
    alert("You finished swiping through all available matches!");
    return;
  }


  placeName.textContent = current.name || "Unknown Place";
  placePrice.textContent = current.price || "";
  placeMeta.textContent = `${current.category || "Unknown Category"} • ${current.city || "Unknown City"}`;
  placeDesc.textContent = current.description || "No description available.";
  matchScore.textContent = String(current.matchScore ?? 0);


  renderModalTags(current);
  openModal();
}


async function fetchMatches(prefs) {
  const res = await fetch("/api/match", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(prefs)
  });


  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || "Failed to fetch matches");
  }


  const data = await res.json();
  return Array.isArray(data.results) ? data.results : [];
}


async function savePreferencesToDb(prefs) {
  if (!currentUser) return;


  await safePostJson("/save-preferences", {
    userId: currentUser.userId,
    likes: prefs.likes,
    personality: prefs.personality,
    culture: prefs.culture,
    trends: prefs.trends
  });
}


async function saveLocationToDb(place) {
  if (!currentUser || !place) return;


  await safePostJson("/save-location", {
    userId: currentUser.userId,
    locationId: place.id
  });
}


async function logUserHistory(place, action) {
  if (!currentUser || !place) return;


  await safePostJson("/user-history", {
    userId: currentUser.userId,
    locationId: place.id,
    action
  });
}


function showMatchView() {
  if (savedPanel) savedPanel.style.display = "none";
}


function showSavedView() {
  if (savedPanel) savedPanel.style.display = "block";
  renderSaved();
}


function renderMatches(results) {
  if (!resultsList) return;


  if (!results || results.length === 0) {
    resultsList.innerHTML = `
      <div class="muted">
        No liked restaurants yet. Click Find Matches, then press Like on restaurants you want to keep.
      </div>
    `;
    return;
  }


  resultsList.innerHTML = results.map((place) => `
    <div class="resultCard">
      <div class="resultCard__top">
        <h3 class="resultCard__name">${escapeHtml(place.name)}</h3>
        <span class="pill">${escapeHtml(place.price || "")}</span>
      </div>


      <div class="resultCard__meta">
        ${escapeHtml(place.category || "")} •
        ${escapeHtml(place.city || "")}, ${escapeHtml(place.state || "")}
      </div>


      <div class="resultCard__desc">
        ${escapeHtml(place.description || "No description available.")}
      </div>


      <div class="resultCard__rating">
        ⭐ ${Number(place.rating || 0).toFixed(1)}
        (${escapeHtml(String(place.reviews || 0))} reviews)
      </div>


      ${
        place.website
          ? `<div class="resultCard__website">
              <a href="${escapeHtml(place.website)}" target="_blank" rel="noopener noreferrer">
                Visit Website
              </a>
            </div>`
          : `<div class="resultCard__website muted">No website available</div>`
      }


      <div class="matchrow">
        <span class="muted">Match Score:</span>
        <strong>${escapeHtml(String(place.matchScore ?? 0))}</strong>
      </div>


      <div class="resultCard__actions">
        <button class="btn btn--ghost" type="button" onclick="removeLikedMatch(${Number(place.id)})">
          Remove
        </button>
      </div>
    </div>
  `).join("");
}




async function saveMatch(placeId) {
  const place =
    lastResults.find((p) => Number(p.id) === Number(placeId)) ||
    matchQueue.find((p) => Number(p.id) === Number(placeId)) ||
    current;


  if (!place) return;


  const saved = getSaved();


  if (!saved.some((p) => Number(p.id) === Number(place.id))) {
saved.unshift({
  id: place.id,
  name: place.name,
  category: place.category,
  price: place.price,
  city: place.city,
  state: place.state,
  website: place.website,
  reviews: place.reviews,
  rating: place.rating,
  description: place.description,
  matchScore: place.matchScore
});


    setSaved(saved);
    await saveLocationToDb(place);
  }


  renderSaved();
  renderLikedResults();
}


function removeLikedMatch(placeId) {
  const updatedSaved = getSaved().filter((p) => Number(p.id) !== Number(placeId));
  setSaved(updatedSaved);
  renderSaved();
  renderLikedResults();
}


window.saveMatch = saveMatch;
window.removeLikedMatch = removeLikedMatch;


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


if (btnClearSaved) {
  btnClearSaved.addEventListener("click", () => {
    if (confirm("Clear all saved places?")) {
      setSaved([]);
      renderSaved();
      renderLikedResults();
    }
  });
}


if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();


    const prefs = buildPrefsFromForm();
    await savePreferencesToDb(prefs);


    try {
      const results = await fetchMatches(prefs);
      lastResults = results;


    matchQueue = [...results];


      resultsList.innerHTML = `
        <div class="muted">
          Matches are ready. Use the popup and click Like to add restaurants here.
        </div>
      `;


      if (results.length === 0) {
        alert("No matches found.");
        closeModal();
        return;
      }


      showNextMatch();
    } catch (err) {
      console.error("Match fetch failed:", err);
      resultsList.innerHTML = `<div class="muted">Something went wrong while loading matches.</div>`;
      closeModal();
    }
  });
}


if (btnClear) {
  btnClear.addEventListener("click", () => {
    document.querySelectorAll(".pref-btn.selected").forEach((btn) => {
      btn.classList.remove("selected");
    });


    matchQueue = [];
    current = null;
    lastResults = [];
    closeModal();
  });
}


if (btnClearMatches) {
  btnClearMatches.addEventListener("click", () => {
    if (!confirm("Clear all liked matches from the results?")) return;


    setSaved([]);
    matchQueue = [];
    current = null;
    lastResults = [];


    renderSaved();
    renderLikedResults();
    closeModal();
  });
}


if (btnCloseModal) btnCloseModal.addEventListener("click", closeModal);
if (modalOverlay) modalOverlay.addEventListener("click", closeModal);


if (btnPass) {
  btnPass.addEventListener("click", async () => {
    if (current) await logUserHistory(current, "passed");
    showNextMatch();
  });
}


if (btnLike) {
  btnLike.addEventListener("click", async () => {
    if (!current) return;


    await saveMatch(current.id);
    await logUserHistory(current, "liked");
    showNextMatch();
  });
}


document.querySelectorAll(".pref-btn").forEach((button) => {
  button.addEventListener("click", () => {
    button.classList.toggle("selected");
  });
});

