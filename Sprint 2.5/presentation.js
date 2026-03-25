require("dotenv").config();

const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

/* =========================
   MIDDLEWARE
========================= */
app.use(cors());
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static(__dirname));

/* =========================
   DATABASE CONNECTIONS
========================= */

/*
// DB for addLocation feature
const dbLocation = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "Agent142!",
  database: "location"
});
*/

// DB for matchmaker feature
const dbMatchmaker = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

/*
// DB for register/login/reviews feature
const dbStore = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "password",
  database: "store_db"
});
*/

/*
dbLocation.connect((err) => {
  if (err) {
    console.error("dbLocation connection failed:", err);
  } else {
    console.log("Connected to location database");
  }
});
*/

dbMatchmaker.connect((err) => {
  if (err) {
    console.error("dbMatchmaker connection failed:", err);
  } else {
    console.log("Connected to matchmaker database");
  }
});

/*
dbStore.connect((err) => {
  if (err) {
    console.error("dbStore connection failed:", err);
  } else {
    console.log("Connected to store_db database");
  }
});
*/

/* =========================
   HELPERS FOR MATCHMAKER
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

  tokens.forEach((t) => {
    if (t.length > 2 && blob.includes(t)) score += 2;
  });

  return score;
}

/* =========================
   PAGE ROUTES (SERVE HTML)
========================= */

// Main page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "home.html"));
});

// Home page
app.get("/home", (req, res) => {
  res.sendFile(path.join(__dirname, "home.html"));
});

// Add Location page
app.get("/add-location", (req, res) => {
  res.sendFile(path.join(__dirname, "addLocation.html"));
});

// Matchmaker page
app.get("/matchmaker", (req, res) => {
  res.sendFile(path.join(__dirname, "matchmaker.html"));
});

// Store / Reviews page
app.get("/store", (req, res) => {
  res.sendFile(path.join(__dirname, "storepage.html"));
});

// Auth page
app.get("/auth", (req, res) => {
  res.sendFile(path.join(__dirname, "auth.html"));
});

// Signup page
app.get("/signup", (req, res) => {
  res.sendFile(path.join(__dirname, "signup.html"));
});

// Optional photo album page
app.get("/social_feed", (req, res) => {
  res.sendFile(path.join(__dirname, "social_feed.html"));
});

/* =========================
   ADD LOCATION
========================= */
app.post("/addLocation", (req, res) => {
  const { PlaceType, PlaceName, PlaceAddress } = req.body;

  const sql = `
    INSERT INTO place (PlaceType, PlaceName, PlaceAddress)
    VALUES (?, ?, ?)
  `;

  dbLocation.query(sql, [PlaceType, PlaceName, PlaceAddress], (err, results) => {
    if (err) {
      console.error("Add location error:", err);
      return res.status(500).send("Server Error");
    }

    if (results.affectedRows === 1) {
      return res.send(`${PlaceType}: has been created!`);
    }

    res.send("Location Not Created");
  });
});

/* =========================
   MATCHMAKER API
========================= */
app.post("/api/match", (req, res) => {
  const prefs = req.body;

  const sql = `
    SELECT
      id,
      name,
      number_of_reviews,
      average_rating,
      food_category,
      price_range,
      city,
      state,
      website_url
    FROM locations
  `;

  dbMatchmaker.query(sql, (err, results) => {
    if (err) {
      console.error("Matchmaker error:", err);
      return res.status(500).send("Database error");
    }

    const ranked = results
      .map((place) => ({
        ...place,
        matchScore: scorePlace(place, prefs)
      }))
      .sort((a, b) => b.matchScore - a.matchScore);

    const hasRealMatches = ranked.length > 0 && ranked[0].matchScore > 0;
    const finalList = hasRealMatches
      ? ranked.filter((r) => r.matchScore > 0)
      : ranked;

    const response = finalList.slice(0, 10).map((r) => ({
      id: r.id,
      name: r.name,
      category: r.food_category,
      price: r.price_range,
      city: r.city,
      state: r.state,
      website: r.website_url,
      reviews: r.number_of_reviews,
      rating: r.average_rating,
      matchScore: r.matchScore
    }));

    res.json({ results: response });
  });
});

/* =========================
   TEST ROUTE
========================= */
app.get("/hello-place", (req, res) => {
  const sql = "SELECT * FROM locations LIMIT 1";

  dbMatchmaker.query(sql, (err, results) => {
    if (err) {
      console.error("Hello-place error:", err);
      return res.status(500).send("Database error");
    }

    if (results.length === 0) {
      return res.send("No places found");
    }

    res.send(`First place: ${results[0].name}`);
  });
});

/* =========================
   REGISTER
========================= */
app.post("/register", (req, res) => {
  const { username, password } = req.body;

  const sql = `
    INSERT INTO users (username, password)
    VALUES (?, ?)
  `;

  dbStore.query(sql, [username, password], (err) => {
    if (err) {
      console.error("Register error:", err);
      return res.status(400).json({ error: "Username taken" });
    }

    res.json({ success: true });
  });
});

/* =========================
   LOGIN
========================= */
app.post("/login", (req, res) => {
  const { username, password } = req.body;

  const sql = `
    SELECT * FROM users
    WHERE username = ? AND password = ?
  `;

  dbStore.query(sql, [username, password], (err, result) => {
    if (err) {
      console.error("Login error:", err);
      return res.status(500).json({ error: "Server error" });
    }

    if (!result || result.length === 0) {
      return res.status(401).json({ error: "Invalid login" });
    }

    res.json({
      userId: result[0].id,
      username: result[0].username
    });
  });
});

/* =========================
   GET REVIEWS
========================= */
app.get("/reviews", (req, res) => {
  const sort = req.query.sort;

  let query = `
    SELECT reviews.*, users.username
    FROM reviews
    JOIN users ON reviews.user_id = users.id
  `;

  if (sort === "highest") {
    query += " ORDER BY rating DESC";
  } else {
    query += " ORDER BY created_at DESC";
  }

  dbStore.query(query, (err, result) => {
    if (err) {
      console.error("Get reviews error:", err);
      return res.status(500).json({ error: "Server error" });
    }

    res.json(result);
  });
});

/* =========================
   ADD REVIEW
========================= */
app.post("/reviews", (req, res) => {
  const { userId, rating, review } = req.body;

  const sql = `
    INSERT INTO reviews (user_id, rating, review)
    VALUES (?, ?, ?)
  `;

  dbStore.query(sql, [userId, rating, review], (err) => {
    if (err) {
      console.error("Add review error:", err);
      return res.status(500).json({ error: "Server error" });
    }

    res.json({ success: true });
  });
});

/* =========================
   DELETE REVIEW
========================= */
app.delete("/reviews/:id", (req, res) => {
  const reviewId = req.params.id;
  const userId = req.body.userId;

  const sql = `
    DELETE FROM reviews
    WHERE id = ? AND user_id = ?
  `;

  dbStore.query(sql, [reviewId, userId], (err, result) => {
    if (err) {
      console.error("Delete review error:", err);
      return res.status(500).json({ error: "Server error" });
    }

    if (!result || result.affectedRows === 0) {
      return res.status(403).json({ error: "Not allowed" });
    }

    res.json({ success: true });
  });
});

/* =========================
   AVERAGE RATING
========================= */
app.get("/reviews/average", (req, res) => {
  const sql = "SELECT AVG(rating) AS avg FROM reviews";

  dbStore.query(sql, (err, result) => {
    if (err) {
      console.error("Average rating error:", err);
      return res.status(500).json({ error: "Server error" });
    }

    res.json({ average: result[0].avg || 0 });
  });
});

/* =========================
   404 HANDLER
========================= */
app.use((req, res) => {
  res.status(404).send("Not Found");
});

/* =========================
   START SERVER
========================= */
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});