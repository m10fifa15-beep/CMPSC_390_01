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

const sql = `
  INSERT INTO place (
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
  const price = normalize(prefs.price);

  let score = 0;

  const foodCategory = normalize(place.food_category || place.placeType);
  const blob = normalize(
  `${place.name} ${place.food_category || ""} ${place.placeType || ""} ${place.city} ${place.state}`
);

  if (price && normalize(place.price_range).includes(price)) score += 3;

  const tokens = `${likes} ${personality} ${culture} ${trends}`
    .split(/[, ]+/)
    .filter(Boolean);

  tokens.forEach((t) => {
    if (t.length > 2) {
      if (foodCategory.includes(t)) score += 4;
      else if (blob.includes(t)) score += 2;
    }
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
  try {
    console.log("POST /api/match hit");
    console.log("prefs:", req.body);

    const prefs = req.body || {};

    const sql = `
  SELECT
    l.id AS id,
    l.name AS name,
    COALESCE(r.review_count, l.number_of_reviews, 0) AS number_of_reviews,
    COALESCE(r.avg_rating, l.average_rating, 0) AS average_rating,
    l.food_category,
    l.price_range,
    COALESCE(p.city, l.city) AS city,
    COALESCE(p.state, l.state) AS state,
    l.website_url,
    p.placeType,
    p.addressLine1,
    p.addressLine2,
    p.zip,
    p.country,
    p.placeImage
  FROM locations l
  LEFT JOIN place p
    ON LOWER(TRIM(l.name)) COLLATE utf8mb4_unicode_ci
       = LOWER(TRIM(p.placeName)) COLLATE utf8mb4_unicode_ci
  LEFT JOIN (
    SELECT
      location_id,
      AVG(rating) AS avg_rating,
      COUNT(*) AS review_count
    FROM reviews
    GROUP BY location_id
  ) r
    ON r.location_id COLLATE utf8mb4_unicode_ci
       = CAST(l.id AS CHAR) COLLATE utf8mb4_unicode_ci

  UNION

  SELECT
    CONCAT('place_', p.id) AS id,
    p.placeName AS name,
    COALESCE(rp.review_count, 0) AS number_of_reviews,
    COALESCE(rp.avg_rating, 0) AS average_rating,
    p.placeType AS food_category,
    '' AS price_range,
    p.city AS city,
    p.state AS state,
    '' AS website_url,
    p.placeType,
    p.addressLine1,
    p.addressLine2,
    p.zip,
    p.country,
    p.placeImage
  FROM place p
  LEFT JOIN locations l
    ON LOWER(TRIM(l.name)) COLLATE utf8mb4_unicode_ci
       = LOWER(TRIM(p.placeName)) COLLATE utf8mb4_unicode_ci
  LEFT JOIN (
    SELECT
      location_id,
      AVG(rating) AS avg_rating,
      COUNT(*) AS review_count
    FROM reviews
    GROUP BY location_id
  ) rp
    ON rp.location_id COLLATE utf8mb4_unicode_ci
       = CONCAT('place_', p.id) COLLATE utf8mb4_unicode_ci
  WHERE l.id IS NULL
`;

    db.query(sql, (err, results) => {
      try {
        if (err) {
          console.error("Match query error:", err);
          return res.status(500).json({
            error: "Database error",
            details: err.message
          });
        }

        console.log("rows:", results.length);

        const safeResults = Array.isArray(results) ? results : [];

        const ranked = safeResults
          .map((place) => ({
            ...place,
            matchScore: scorePlace(place, prefs)
          }))
          .sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));

        const hasRealMatches = ranked.length > 0 && (ranked[0].matchScore || 0) > 0;
        const finalList = hasRealMatches
          ? ranked.filter((r) => (r.matchScore || 0) > 0)
          : ranked;

        const response = finalList.slice(0, 10).map((r) => ({
          id: r.id,
          name: r.name || "",
          category: r.placeType || r.food_category || "",
          price: r.price_range || "",
          city: r.city || "",
          state: r.state || "",
          website: r.website_url || "",
          rating: Number(r.avg_rating || r.average_rating || 0),
          reviews: Number(r.review_count || r.number_of_reviews || 0),
          matchScore: r.matchScore || 0,
          image: r.placeImage || "",
          description: [
            r.addressLine1,
            r.addressLine2,
            r.city,
            r.state,
            r.zip,
            r.country
          ].filter(Boolean).join(", ")
        }));

        return res.json({ results: response });
      } catch (innerError) {
        console.error("Match route processing error:", innerError);
        return res.status(500).json({
          error: "Match processing failed",
          details: innerError.message
        });
      }
    });
  } catch (outerError) {
    console.error("Match route outer error:", outerError);
    return res.status(500).json({
      error: "Route failed",
      details: outerError.message
    });
  }
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

/*LOCATION*/
app.get("/location/:id", (req, res) => {
  const rawId = String(req.params.id || "").trim();

  // Handle user-added places like place_1
  if (rawId.startsWith("place_")) {
    const placeId = rawId.replace("place_", "");

    const sql = `
      SELECT
        CONCAT('place_', id) AS id,
        placeName AS name,
        placeType AS category,
        '' AS price,
        city,
        state,
        '' AS website,
        0 AS reviews,
        0 AS rating,
        addressLine1,
        addressLine2,
        zip,
        country,
        placeImage
      FROM place
      WHERE id = ?
      LIMIT 1
    `;

    db.query(sql, [placeId], (err, results) => {
      if (err) {
        console.error("Load place error:", err);
        return res.status(500).json({ error: "Database error" });
      }

      if (results.length === 0) {
        return res.status(404).json({ error: "Restaurant not found" });
      }

      const row = results[0];

      res.json({
        id: row.id,
        name: row.name,
        category: row.category,
        price: row.price,
        city: row.city,
        state: row.state,
        website: row.website,
        reviews: row.reviews,
        rating: row.rating,
        image: row.placeImage || "",
        description: [
          row.addressLine1,
          row.addressLine2,
          row.city,
          row.state,
          row.zip,
          row.country
        ].filter(Boolean).join(", ")
      });
    });

    return;
  }

  // Handle original CSV/imported restaurants like 1, 2, 3...
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
    WHERE id = ?
    LIMIT 1
  `;

  db.query(sql, [rawId], (err, results) => {
    if (err) {
      console.error("Load location error:", err);
      return res.status(500).json({ error: "Database error" });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: "Restaurant not found" });
    }

    const row = results[0];

    res.json({
      id: row.id,
      name: row.name,
      category: row.food_category,
      price: row.price_range,
      city: row.city,
      state: row.state,
      website: row.website_url,
      reviews: row.number_of_reviews,
      rating: row.average_rating
    });
  });
});

/* =========================
   STORE PAGE REVIEWS
   TABLE: js_reviews
   Using location_id = 1 for this page
========================= */
app.post("/reviews", (req, res) => {
  const { userId, locationId, rating, review } = req.body;

  if (!userId) {
    return res.status(400).json({ error: "Login required" });
  }

  if (!locationId) {
    return res.status(400).json({ error: "Location ID is required" });
  }

  if (!rating || rating < 1 || rating > 5) {
    return res.status(400).json({ error: "Rating must be 1 to 5" });
  }

  const usernameSql = `
    SELECT username
    FROM js_users
    WHERE id = ?
    LIMIT 1
  `;

  db.query(usernameSql, [userId], (userErr, userResults) => {
    if (userErr) {
      console.error("Load username error:", userErr);
      return res.status(500).json({ error: "Database error" });
    }

    if (userResults.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const username = userResults[0].username;

    const sql = `
      INSERT INTO reviews (user_id, location_id, username, rating, review)
      VALUES (?, ?, ?, ?, ?)
    `;

    db.query(sql, [userId, String(locationId), username, rating, review || ""], (err, result) => {
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
});


app.get("/reviews", (req, res) => {
  const sort = req.query.sort === "highest" ? "highest" : "newest";
  const locationId = req.query.locationId;

  if (!locationId) {
    return res.status(400).json({ error: "Location ID is required" });
  }

  let orderBy = "created_at DESC";
  if (sort === "highest") {
    orderBy = "rating DESC, created_at DESC";
  }

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

  db.query(sql, [String(locationId)], (err, results) => {
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

    const deleteSql = `DELETE FROM reviews WHERE id = ?`;

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
  const locationId = req.query.locationId;

  if (!locationId) {
    return res.status(400).json({ error: "Location ID is required" });
  }

  const sql = `
    SELECT AVG(rating) AS average
    FROM reviews
    WHERE location_id = ?
  `;

  db.query(sql, [String(locationId)], (err, results) => {
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
   USER PREFERENCES
========================= */
app.post("/save-preferences", (req, res) => {
  const { userId, likes, personality, culture, trends } = req.body;

  if (!userId) {
    return res.status(400).json({ error: "Login required" });
  }

  const sql = `
    INSERT INTO user_preferences (user_id, likes, personality, culture, trends)
    VALUES (?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      likes = VALUES(likes),
      personality = VALUES(personality),
      culture = VALUES(culture),
      trends = VALUES(trends),
      saved_at = CURRENT_TIMESTAMP
  `;

  db.query(sql, [userId, likes, personality, culture, trends], (err) => {
    if (err) {
      console.error("Save preferences error:", err);
      return res.status(500).json({ error: "Database error" });
    }

    res.json({ success: true });
  });
});

/* =========================
   SAVE LOCATION
========================= */
app.post("/save-location", (req, res) => {
  const { userId, locationId } = req.body;

  if (!userId || !locationId) {
    return res.status(400).json({ error: "User ID and Location ID required" });
  }

  const sql = `
    INSERT IGNORE INTO user_saved_locations (user_id, location_id)
    VALUES (?, ?)
  `;

  db.query(sql, [userId, locationId], (err) => {
    if (err) {
      console.error("Save location error:", err);
      return res.status(500).json({ error: "Database error" });
    }

    res.json({ success: true });
  });
});

/* =========================
   USER HISTORY
========================= */
app.post("/user-history", (req, res) => {
  const { userId, locationId, action } = req.body;

  if (!userId || !locationId || !action) {
    return res.status(400).json({ error: "User ID, Location ID, and action required" });
  }

  const sql = `
    INSERT INTO user_history (user_id, location_id, action)
    VALUES (?, ?, ?)
  `;

  db.query(sql, [userId, locationId, action], (err) => {
    if (err) {
      console.error("User history error:", err);
      return res.status(500).json({ error: "Database error" });
    }

    res.json({ success: true });
  });
});

/* =========================
   GET USER PROFILE
========================= */
app.get("/user-profile", (req, res) => {
  const userId = req.query.userId;

  if (!userId) {
    return res.status(400).json({ error: "User ID required" });
  }

  const prefsSql = "SELECT * FROM user_preferences WHERE user_id = ?";
  const savedSql = `
    SELECT
      l.id,
      l.name,
      l.food_category,
      l.price_range,
      l.city,
      l.state,
      us.saved_at
    FROM user_saved_locations us
    JOIN locations l ON us.location_id = l.id
    WHERE us.user_id = ?
    ORDER BY us.saved_at DESC
  `;
  const historySql = `
    SELECT
      h.action,
      h.timestamp,
      l.name
    FROM user_history h
    JOIN locations l ON h.location_id = l.id
    WHERE h.user_id = ?
    ORDER BY h.timestamp DESC
    LIMIT 20
  `;

  db.query(prefsSql, [userId], (err, prefs) => {
    if (err) {
      console.error("Get profile preferences error:", err);
      return res.status(500).json({ error: "Database error" });
    }

    db.query(savedSql, [userId], (err, saved) => {
      if (err) {
        console.error("Get profile saved locations error:", err);
        return res.status(500).json({ error: "Database error" });
      }

      db.query(historySql, [userId], (err, history) => {
        if (err) {
          console.error("Get profile history error:", err);
          return res.status(500).json({ error: "Database error" });
        }

        res.json({
          preferences: prefs[0] || {},
          savedLocations: saved,
          history: history
        });
      });
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