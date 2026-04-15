require("dotenv").config();

const express = require("express");
const mysql = require("mysql2");
const bodyParser = require("body-parser");
const path = require("path");
const fs = require("fs");
const multer = require("multer");

const app = express();
const PORT = process.env.PORT || 3000;

/* =========================
   MIDDLEWARE
========================= */
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static(__dirname));

/* =========================
   ENSURE uploads FOLDER EXISTS
========================= */
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

/* =========================
   SERVE UPLOADED IMAGES
========================= */
app.use("/uploads", express.static(uploadsDir));

/* =========================
   MULTER SETUP
========================= */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueName =
      Date.now() + "-" + file.originalname.replace(/\s+/g, "_");
    cb(null, uniqueName);
  }
});

const upload = multer({ storage });

/* =========================
   MYSQL CONNECTION
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
  console.log("Connected to MySQL database");
});

/* =========================
   HELPERS
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
   HOME ROUTE
========================= */
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "home.html"));
});

/* =========================
   MATCH API
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
      console.error("Match query error:", err);
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
      matchScore: r.matchScore,
      description: ""
    }));

    res.json({ results: response });
  });
});

/* =========================
   ADD LOCATION
========================= */
app.post("/addLocation", upload.single("ImageFile"), (req, res) => {
  const {
    PlaceType,
    PlaceName,
    addressLine1,
    addressLine2,
    city,
    state,
    zip,
    country
  } = req.body;

  const imagePath = req.file ? `/uploads/${req.file.filename}` : null;

  const sql = `
    INSERT INTO place
    (
      placeType,
      placeName,
      addressLine1,
      addressLine2,
      city,
      state,
      zip,
      country,
      placeImage
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.query(
    sql,
    [
      PlaceType,
      PlaceName,
      addressLine1,
      addressLine2 || null,
      city,
      state,
      zip,
      country,
      imagePath
    ],
    (err, results) => {
      if (err) {
        console.error("Add location error:", err);
        return res.status(500).send("Server Error");
      }

      if (results.affectedRows === 1) {
        return res.send(`${PlaceName} has been created!`);
      }

      res.send("Location Not Created");
    }
  );
});

/* =========================
   STORE PAGE AUTH
   TABLE: js_users
========================= */
app.post("/register", (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required" });
  }

  const sql = `
    INSERT INTO js_users (username, password)
    VALUES (?, ?)
  `;

  db.query(sql, [username, password], (err, result) => {
    if (err) {
      console.error("Register error:", err);

      if (err.code === "ER_DUP_ENTRY") {
        return res.status(400).json({ error: "Username already exists" });
      }

      return res.status(500).json({ error: "Database error" });
    }

    res.json({
      success: true,
      userId: result.insertId,
      username
    });
  });
});

app.post("/login", (req, res) => {
  const { username, password } = req.body;

  const sql = `
    SELECT id, username
    FROM js_users
    WHERE username = ? AND password = ?
    LIMIT 1
  `;

  db.query(sql, [username, password], (err, results) => {
    if (err) {
      console.error("Login error:", err);
      return res.status(500).json({ error: "Database error" });
    }

    if (results.length === 0) {
      return res.status(401).json({ error: "Invalid login" });
    }

    res.json({
      userId: results[0].id,
      username: results[0].username
    });
  });
});

/* =========================
   STORE PAGE REVIEWS
   TABLE: js_reviews
   Using location_id = 1 for this page
========================= */
app.post("/reviews", (req, res) => {
  const { userId, rating, review } = req.body;
  const locationId = 1;

  if (!userId) {
    return res.status(400).json({ error: "Login required" });
  }

  if (!rating || rating < 1 || rating > 5) {
    return res.status(400).json({ error: "Rating must be 1 to 5" });
  }

  const sql = `
    INSERT INTO js_reviews (user_id, location_id, rating, review)
    VALUES (?, ?, ?, ?)
  `;

  db.query(sql, [userId, locationId, rating, review || ""], (err, result) => {
    if (err) {
      console.error("Create review error:", err);
      return res.status(500).json({ error: "Database error" });
    }

    res.json({
      success: true,
      reviewId: result.insertId
    });
  });
});

app.get("/reviews", (req, res) => {
  const sort = req.query.sort === "highest" ? "highest" : "newest";
  const locationId = 1;

  let orderBy = "r.created_at DESC";
  if (sort === "highest") {
    orderBy = "r.rating DESC, r.created_at DESC";
  }

  const sql = `
    SELECT
      r.id,
      r.user_id,
      r.location_id,
      r.rating,
      r.review,
      r.created_at,
      u.username
    FROM js_reviews r
    JOIN js_users u ON r.user_id = u.id
    WHERE r.location_id = ?
    ORDER BY ${orderBy}
  `;

  db.query(sql, [locationId], (err, results) => {
    if (err) {
      console.error("Load reviews error:", err);
      return res.status(500).json({ error: "Database error" });
    }

    res.json(results);
  });
});

app.delete("/reviews/:id", (req, res) => {
  const reviewId = req.params.id;
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: "Login required" });
  }

  const checkSql = `
    SELECT id, user_id
    FROM js_reviews
    WHERE id = ?
    LIMIT 1
  `;

  db.query(checkSql, [reviewId], (err, results) => {
    if (err) {
      console.error("Review ownership check error:", err);
      return res.status(500).json({ error: "Database error" });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: "Review not found" });
    }

    if (Number(results[0].user_id) !== Number(userId)) {
      return res.status(403).json({ error: "Not allowed to delete this review" });
    }

    const deleteSql = `DELETE FROM js_reviews WHERE id = ?`;

    db.query(deleteSql, [reviewId], (deleteErr) => {
      if (deleteErr) {
        console.error("Delete review error:", deleteErr);
        return res.status(500).json({ error: "Database error" });
      }

      res.json({ success: true });
    });
  });
});

app.get("/reviews/average", (req, res) => {
  const locationId = 1;

  const sql = `
    SELECT AVG(rating) AS average
    FROM js_reviews
    WHERE location_id = ?
  `;

  db.query(sql, [locationId], (err, results) => {
    if (err) {
      console.error("Average review error:", err);
      return res.status(500).json({ error: "Database error" });
    }

    const average = results[0]?.average ?? 0;
    res.json({ average: Number(average) || 0 });
  });
});

/* =========================
   SOCIAL FEED POSTS
   TABLE: Posts
========================= */
app.get("/posts", (req, res) => {
  const sql = `
    SELECT
      post_id,
      restaurant_name,
      caption,
      image_path,
      created_at
    FROM Posts
    ORDER BY created_at DESC, post_id DESC
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error("Load posts error:", err);
      return res.status(500).json({ error: "Database error" });
    }

    res.json(results);
  });
});

app.post("/create-post", upload.single("image"), (req, res) => {
  const { restaurant_name, caption } = req.body;

  if (!restaurant_name || !caption) {
    return res.status(400).json({
      success: false,
      error: "Restaurant name and caption are required"
    });
  }

  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: "Image file is required"
    });
  }

  const imagePath = `/uploads/${req.file.filename}`;

  const sql = `
    INSERT INTO Posts (restaurant_name, caption, image_path)
    VALUES (?, ?, ?)
  `;

  db.query(sql, [restaurant_name, caption, imagePath], (err, result) => {
    if (err) {
      console.error("Create post error:", err);
      return res.status(500).json({
        success: false,
        error: "Database error"
      });
    }

    res.json({
      success: true,
      postId: result.insertId
    });
  });
});

/* =========================
   TEST ROUTE
========================= */
app.get("/hello-place", (req, res) => {
  const sql = "SELECT * FROM locations LIMIT 1";

  db.query(sql, (err, results) => {
    if (err) {
      console.error("Hello-place query error:", err);
      return res.status(500).send("Database error");
    }

    if (results.length === 0) {
      return res.send("No places found");
    }

    res.send(`First place: ${results[0].name}`);
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