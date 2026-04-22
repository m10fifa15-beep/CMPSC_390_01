require("dotenv").config();

const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = 3000;

/* =========================
   MIDDLEWARE
========================= */
app.use(cors());
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static(__dirname));

/* =========================
   DATABASE (ONE DB ONLY)
========================= */
const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "password",
  database: "store_db"
});

db.connect(err => {
  if (err) {
    console.error("DB connection failed:", err);
  } else {
    console.log("Connected to MySQL");
  }
});

/* =========================
   HELPERS (MATCHMAKER)
========================= */
function normalize(str) {
  return String(str || "").toLowerCase().trim();
}

function scorePlace(place, prefs) {
  const likes = normalize(prefs.likes);
  const personality = normalize(prefs.personality);
  const culture = normalize(prefs.culture);
  const trends = normalize(prefs.trends);
  const category = normalize(prefs.category);
  const price = normalize(prefs.price);

  let score = 0;

  if (category && normalize(place.food_category) === category) score += 4;
  if (price && normalize(place.price_range) === price) score += 3;

  const blob = normalize(
    `${place.name} ${place.food_category} ${place.city} ${place.state}`
  );

  const tokens = `${likes} ${personality} ${culture} ${trends}`
    .split(/[, ]+/)
    .filter(Boolean);

  tokens.forEach(t => {
    if (t.length > 2 && blob.includes(t)) score += 2;
  });

  return score;
}

/* =========================
   PAGE ROUTES
========================= */
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "home.html")));
app.get("/locations", (req, res) => res.sendFile(path.join(__dirname, "locations.html")));
app.get("/addLocation", (req, res) => res.sendFile(path.join(__dirname, "addLocation.html")));
app.get("/store", (req, res) => res.sendFile(path.join(__dirname, "storepage.html")));
app.get("/search", (req, res) => res.sendFile(path.join(__dirname, "search.html")));
app.get("/matchmaker", (req, res) => res.sendFile(path.join(__dirname, "matchmaker.html")));

/* =========================
   ADD LOCATION
========================= */
app.post("/addLocation", (req, res) => {
  const { PlaceType, PlaceName, PlaceAddress } = req.body;

  const sql = `
    INSERT INTO locations (type, name, address)
    VALUES (?, ?, ?)
  `;

  db.query(sql, [PlaceType, PlaceName, PlaceAddress], err => {
    if (err) {
      console.error("Add location error:", err);
      return res.status(500).send("Error adding location");
    }

    res.send("Location added!");
  });
});

/* =========================
   GET LOCATIONS
========================= */
app.get("/api/locations", (req, res) => {
  db.query("SELECT * FROM locations ORDER BY id DESC", (err, result) => {
    if (err) return res.status(500).send(err);
    res.json(result);
  });
});

app.get("/api/locations/:id", (req, res) => {
  db.query("SELECT * FROM locations WHERE id=?", [req.params.id], (err, result) => {
    res.json(result[0]);
  });
});

/* =========================
   MATCHMAKER
========================= */
app.post("/api/match", (req, res) => {
  const prefs = req.body;

  const sql = `
    SELECT id, name, food_category, price_range, city, state,
           number_of_reviews, average_rating
    FROM locations
  `;

  db.query(sql, (err, results) => {
    if (err) return res.status(500).send("DB error");

    const ranked = results
      .map(place => ({
        ...place,
        matchScore: scorePlace(place, prefs)
      }))
      .sort((a, b) => b.matchScore - a.matchScore);

    res.json({ results: ranked.slice(0, 10) });
  });
});

/* =========================
   AUTH
========================= */
app.post("/register", (req, res) => {
  const { username, password } = req.body;

  db.query(
    "INSERT INTO users (username, password) VALUES (?, ?)",
    [username, password],
    err => {
      if (err) return res.status(400).json({ error: "Username taken" });
      res.json({ success: true });
    }
  );
});

app.post("/login", (req, res) => {
  const { username, password } = req.body;

  db.query(
    "SELECT * FROM users WHERE username=? AND password=?",
    [username, password],
    (err, result) => {
      if (result.length === 0)
        return res.status(401).json({ error: "Invalid login" });

      res.json({
        userId: result[0].id,
        username: result[0].username
      });
    }
  );
});

/* =========================
   REVIEWS (BY LOCATION)
========================= */
app.get("/api/reviews/:locationId", (req, res) => {
  db.query(
    `SELECT reviews.*, users.username
     FROM reviews
     JOIN users ON reviews.user_id = users.id
     WHERE location_id = ?
     ORDER BY created_at DESC`,
    [req.params.locationId],
    (err, result) => res.json(result)
  );
});

app.post("/api/reviews", (req, res) => {
  const { userId, locationId, rating, review } = req.body;

  db.query(
    "INSERT INTO reviews (user_id, location_id, rating, review) VALUES (?, ?, ?, ?)",
    [userId, locationId, rating, review],
    err => {
      if (err) return res.status(500).send(err);
      res.json({ success: true });
    }
  );
});

app.delete("/api/reviews/:id", (req, res) => {
  const { userId } = req.body;

  db.query(
    "DELETE FROM reviews WHERE id=? AND user_id=?",
    [req.params.id, userId],
    (err, result) => {
      if (result.affectedRows === 0)
        return res.status(403).json({ error: "Not allowed" });

      res.json({ success: true });
    }
  );
});

/* =========================
   AVERAGE RATING
========================= */
app.get("/api/reviews/average/:locationId", (req, res) => {
  db.query(
    "SELECT AVG(rating) as avg FROM reviews WHERE location_id=?",
    [req.params.locationId],
    (err, result) => {
      res.json({ average: result[0].avg || 0 });
    }
  );
});

/* =========================
   TEST
========================= */
app.get("/hello-place", (req, res) => {
  db.query("SELECT * FROM locations LIMIT 1", (err, results) => {
    if (!results.length) return res.send("No places found");
    res.send(`First place: ${results[0].name}`);
  });
});

/* =========================
   404
========================= */
app.use((req, res) => {
  res.status(404).send("Not Found");
});

/* =========================
   START
========================= */
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});