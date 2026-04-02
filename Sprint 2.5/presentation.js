require("dotenv").config();

const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const multer = require("multer");

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
   UPLOADS FOLDER
========================= */
const uploadsDir = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

app.use("/uploads", express.static(uploadsDir));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({ storage });

/* =========================
   ONE DATABASE CONNECTION
========================= */
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

db.connect((err) => {
  if (err) {
    console.error("Database connection failed:", err);
    return;
  }
  console.log(`Connected to ${process.env.DB_NAME} database`);
});

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
   PAGE ROUTES
========================= */
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "home.html"));
});

app.get("/home", (req, res) => {
  res.sendFile(path.join(__dirname, "home.html"));
});

app.get("/add-location", (req, res) => {
  res.sendFile(path.join(__dirname, "addLocation.html"));
});

app.get("/matchmaker", (req, res) => {
  res.sendFile(path.join(__dirname, "matchmaker.html"));
});

app.get("/store", (req, res) => {
  res.sendFile(path.join(__dirname, "storepage.html"));
});

app.get("/social-feed", (req, res) => {
  res.sendFile(path.join(__dirname, "social_feed.html"));
});

app.get("/auth", (req, res) => {
  res.sendFile(path.join(__dirname, "auth.html"));
});

app.get("/signup", (req, res) => {
  res.sendFile(path.join(__dirname, "signup.html"));
});

/* =========================
   ADD LOCATION PAGE
   table: place
========================= */
app.post("/addLocation", (req, res) => {
  const { PlaceType, PlaceName, PlaceAddress } = req.body;

  const sql = `
    INSERT INTO place (PlaceType, PlaceName, PlaceAddress)
    VALUES (?, ?, ?)
  `;

  db.query(sql, [PlaceType, PlaceName, PlaceAddress], (err, results) => {
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
   MATCHMAKER PAGE
   table: locations
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

  db.query(sql, (err, results) => {
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

app.get("/hello-place", (req, res) => {
  const sql = "SELECT * FROM locations LIMIT 1";

  db.query(sql, (err, results) => {
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
   STORE PAGE AUTH
   table: js_users
========================= */
app.post("/register", (req, res) => {
  const { username, password } = req.body;

  const sql = `
    INSERT INTO js_users (username, password)
    VALUES (?, ?)
  `;

  db.query(sql, [username, password], (err) => {
    if (err) {
      console.error("Register error:", err);
      return res.status(400).json({ error: "Username taken" });
    }

    res.json({ success: true });
  });
});

app.post("/login", (req, res) => {
  const { username, password } = req.body;

  const sql = `
    SELECT * FROM js_users
    WHERE username = ? AND password = ?
  `;

  db.query(sql, [username, password], (err, result) => {
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
   STORE PAGE REVIEWS
   table: js_reviews
========================= */
app.get("/reviews", (req, res) => {
  const sort = req.query.sort;

  let query = `
    SELECT js_reviews.*, js_users.username
    FROM js_reviews
    JOIN js_users ON js_reviews.user_id = js_users.id
  `;

  if (sort === "highest") {
    query += " ORDER BY js_reviews.rating DESC";
  } else {
    query += " ORDER BY js_reviews.created_at DESC";
  }

  db.query(query, (err, result) => {
    if (err) {
      console.error("Get reviews error:", err);
      return res.status(500).json({ error: "Server error" });
    }

    res.json(result);
  });
});

app.post("/reviews", (req, res) => {
  const { userId, rating, review } = req.body;

  const sql = `
    INSERT INTO js_reviews (user_id, rating, review)
    VALUES (?, ?, ?)
  `;

  db.query(sql, [userId, rating, review], (err) => {
    if (err) {
      console.error("Add review error:", err);
      return res.status(500).json({ error: "Server error" });
    }

    res.json({ success: true });
  });
});

app.delete("/reviews/:id", (req, res) => {
  const reviewId = req.params.id;
  const userId = req.body.userId;

  const sql = `
    DELETE FROM js_reviews
    WHERE id = ? AND user_id = ?
  `;

  db.query(sql, [reviewId, userId], (err, result) => {
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

app.get("/reviews/average", (req, res) => {
  const sql = "SELECT AVG(rating) AS avg FROM js_reviews";

  db.query(sql, (err, result) => {
    if (err) {
      console.error("Average rating error:", err);
      return res.status(500).json({ error: "Server error" });
    }

    res.json({ average: result[0].avg || 0 });
  });
});

/* =========================
   SOCIAL FEED PAGE
   table: Posts
========================= */
app.get("/posts", (req, res) => {
  const sql = `
    SELECT post_id, restaurant_name, caption, image_path, created_at
    FROM Posts
    ORDER BY post_id DESC
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error("Get posts error:", err);
      return res.status(500).json({ error: "Failed to load posts" });
    }

    res.json(results);
  });
});

app.post("/create-post", upload.single("image"), (req, res) => {
  const { restaurant_name, caption } = req.body;

  if (!req.file) {
    return res.status(400).json({ success: false, error: "No image uploaded" });
  }

  const imagePath = `uploads/${req.file.filename}`;

  const sql = `
    INSERT INTO Posts (restaurant_name, caption, image_path)
    VALUES (?, ?, ?)
  `;

  db.query(sql, [restaurant_name, caption, imagePath], (err, result) => {
    if (err) {
      console.error("Create post error:", err);
      return res.status(500).json({ success: false, error: "Database error" });
    }

    res.json({ success: true, postId: result.insertId });
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