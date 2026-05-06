require("dotenv").config();

const express = require("express");
const mysql = require("mysql2");
const bodyParser = require("body-parser");
const path = require("path");
const fs = require("fs");
const multer = require("multer");

const app = express();
const PORT = process.env.PORT || 3000;

/* ---------------- MIDDLEWARE ---------------- */
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static(__dirname));
  
/* ---------------- UPLOADS ---------------- */
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
    const safeName = file.originalname.replace(/\s+/g, "_");
    cb(null, Date.now() + "-" + safeName);
  }
});

const upload = multer({ storage });

/* ---------------- DATABASE ---------------- */
const db = mysql.createConnection({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "userDB"
});

db.connect((err) => {
  if (err) {
    console.error("Database connection failed:", err);
    return;
  }
  console.log("Connected to MySQL database");
});

/* ---------------- PAGE ROUTES ---------------- */
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "home.html"));
});

app.get("/home.html", (req, res) => {
  res.sendFile(path.join(__dirname, "home.html"));
});

app.get("/addLocation.html", (req, res) => {
  res.sendFile(path.join(__dirname, "addLocation.html"));
});

app.get("/matchmaker.html", (req, res) => {
  res.sendFile(path.join(__dirname, "matchmaker.html"));
});

app.get("/social_feed.html", (req, res) => {
  res.sendFile(path.join(__dirname, "social_feed.html"));
});

app.get("/storepage.html", (req, res) => {
  const storePath = path.join(__dirname, "storepage.html");

  if (fs.existsSync(storePath)) {
    return res.sendFile(storePath);
  }

  res.send(`
    <h1>Review Page Missing</h1>
    <p>storepage.html was not found in this folder.</p>
    <a href="/home.html">Back Home</a>
  `);
});

/* ---------------- MATCHMAKER HELPERS ---------------- */
function normalize(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s/$&-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scorePlace(place, prefs) {
  const likes = normalize(prefs.likes);
  const personality = normalize(prefs.personality);
  const culture = normalize(prefs.culture);
  const trends = normalize(prefs.trends);
  const category = normalize(prefs.category);
  const price = normalize(prefs.price);

  let score = 0;

  if (category && normalize(place.food_category) === category) score += 5;
  if (price && normalize(place.price_range) === price) score += 3;

  const blob = normalize(`
    ${place.name}
    ${place.food_category}
    ${place.price_range}
    ${place.city}
    ${place.state}
    ${place.website_url}
  `);

  const tokens = `${likes} ${personality} ${culture} ${trends}`
    .split(/\s+/)
    .filter(Boolean);

  tokens.forEach((token) => {
    if (token.length > 2 && blob.includes(token)) {
      score += 2;
    }
  });

  return score;
}

/* ---------------- MATCHMAKER API ---------------- */
app.post("/api/match", (req, res) => {
  const prefs = req.body || {};

const sql = `
  SELECT
    l.id,
    l.name,
    l.number_of_reviews,
    l.average_rating,
    l.food_category,
    l.price_range,
    l.city,
    l.state,
    l.website_url,

    COALESCE(AVG(r.rating), 0) AS current_average_rating,
    COUNT(r.id) AS current_review_count

  FROM locations l

  LEFT JOIN reviews r
    ON l.id = r.location_id

  GROUP BY
    l.id,
    l.name,
    l.number_of_reviews,
    l.average_rating,
    l.food_category,
    l.price_range,
    l.city,
    l.state,
    l.website_url
`;

  db.query(sql, (err, results) => {
    if (err) {
      console.error("Match query error:", err);
      return res.status(500).json({ error: "Database error while loading matches" });
    }

    const ranked = results
      .map((place) => ({
        ...place,
        matchScore: scorePlace(place, prefs)
      }))  
      .sort((a, b) => b.matchScore - a.matchScore);

    const hasAnySelection =
      prefs.likes ||
      prefs.personality ||    
      prefs.culture ||
      prefs.trends ||
      prefs.category ||
      prefs.price;

    const finalList = hasAnySelection
      ? ranked.filter((place) => place.matchScore > 0)
      : ranked;

    const response = finalList.map((place) => ({
      id: place.id,
      name: place.name,
      category: place.food_category,
      price: place.price_range,
      city: place.city,
      state: place.state,
      website: place.website_url,
     reviews: place.current_review_count,
rating: Number(place.current_average_rating).toFixed(1),
      matchScore: place.matchScore,
      description: `${place.food_category || "Restaurant"} option in ${place.city || "Chicago"}, ${place.state || "IL"}.`
    }));

    res.json({ results: response });
  });
});

/* ---------------- ADD LOCATION API ---------------- */
app.post("/addLocation", upload.single("ImageFile"), (req, res) => {
  console.log("Add Location form body:", req.body);
  console.log("Uploaded file:", req.file);

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

  if (!PlaceType || !PlaceName || !addressLine1 || !city || !state || !zip || !country) {
    return res.status(400).send("Missing required location fields.");
  }

  const imagePath = req.file ? `/uploads/${req.file.filename}` : "";

  const sql = `
    INSERT INTO place
    (
      PlaceType,
      PlaceName,
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
      addressLine2 || "",
      city,
      state,
      zip,
      country,
      imagePath
    ],
    (err, result) => {
      if (err) {
        console.error("Add Location database error:", err);
        return res.status(500).send(
          "Database error while adding location. Check the terminal for the exact MySQL error."
        );
      }

      console.log("Location inserted with ID:", result.insertId);
      res.send("Location successfully added!");
    }
  );
});

/* ---------------- AUTH API ---------------- */
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

      return res.status(500).json({ error: "Database error while registering" });
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

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required" });
  }

  const sql = `
    SELECT id, username
    FROM js_users
    WHERE username = ? AND password = ?
    LIMIT 1
  `;

  db.query(sql, [username, password], (err, results) => {
    if (err) {
      console.error("Login error:", err);
      return res.status(500).json({ error: "Database error while logging in" });
    }

    if (results.length === 0) {
      return res.status(401).json({ error: "Invalid login" });
    }

    res.json({
      success: true,
      userId: results[0].id,
      username: results[0].username
    });
  });
});

/* ---------------- REVIEWS API ---------------- */
app.post("/reviews", (req, res) => {
  const { userId, username, rating, review } = req.body;
  const locationId = req.body.locationId || 1;

  if (!userId) {
    return res.status(400).json({ error: "Login required" });
  }

  if (!rating || Number(rating) < 1 || Number(rating) > 5) {
    return res.status(400).json({ error: "Rating must be 1 to 5" });
  }

  const sql = `
    INSERT INTO reviews (user_id, location_id, username, rating, review)
    VALUES (?, ?, ?, ?, ?)
  `;

  db.query(
    sql,
    [userId, locationId, username || "Anonymous", rating, review || ""],
    (err, result) => {
      if (err) {
        console.error("Create review error:", err);
        return res.status(500).json({ error: "Database error while creating review" });
      }

      res.json({
        success: true,
        reviewId: result.insertId
      });
    }
  );
});

app.get("/reviews", (req, res) => {
  const sort = req.query.sort === "highest" ? "highest" : "newest";
  const locationId = req.query.locationId || 1;

  const orderBy =
    sort === "highest"
      ? "rating DESC, created_at DESC"
      : "created_at DESC";

  const sql = `
    SELECT
      id,
      user_id,
      location_id,
      username,
      rating,
      review,
      created_at
    FROM reviews
    WHERE location_id = ?
    ORDER BY ${orderBy}
  `;

  db.query(sql, [locationId], (err, results) => {
    if (err) {
      console.error("Load reviews error:", err);
      return res.status(500).json({ error: "Database error while loading reviews" });
    }

    res.json(results);
  });
});

app.get("/reviews/average", (req, res) => {
  const locationId = req.query.locationId || 1;

  const sql = `
    SELECT AVG(rating) AS average
    FROM reviews
    WHERE location_id = ?
  `;

  db.query(sql, [locationId], (err, results) => {
    if (err) {
      console.error("Average review error:", err);
      return res.status(500).json({ error: "Database error while calculating average" });
    }

    const average = results[0]?.average || 0;
    res.json({ average: Number(average).toFixed(1) });
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
    FROM reviews
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

    db.query("DELETE FROM reviews WHERE id = ?", [reviewId], (deleteErr) => {
      if (deleteErr) {
        console.error("Delete review error:", deleteErr);
        return res.status(500).json({ error: "Database error while deleting review" });
      }

      res.json({ success: true });
    });
  });
});
/* ---------------- SOCIAL FEED API ---------------- */
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
      return res.status(500).json({ error: "Database error while loading posts" });
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
        error: "Database error while creating post"
      });
    }

    res.json({
      success: true,
      postId: result.insertId,
      imagePath
    });
  });
});

/* ---------------- 404 ---------------- */
app.use((req, res) => {
  res.status(404).send("Not Found");
});

/* ---------------- START SERVER ---------------- */
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});