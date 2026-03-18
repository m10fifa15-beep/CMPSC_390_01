const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "password",
  database: "store_db"
});

db.connect(err => {
  if (err) throw err;
  console.log("MySQL Connected");
});

/* =========================
   REGISTER
========================= */
app.post("/register", (req, res) => {
  const { username, password } = req.body;

  db.query(
    "INSERT INTO users (username, password) VALUES (?, ?)",
    [username, password],
    (err) => {
      if (err) {
        return res.status(400).json({ error: "Username taken" });
      }
      res.json({ success: true });
    }
  );
});

/* =========================
   LOGIN
========================= */
app.post("/login", (req, res) => {
  const { username, password } = req.body;

  db.query(
    "SELECT * FROM users WHERE username = ? AND password = ?",
    [username, password],
    (err, result) => {
      if (result.length === 0) {
        return res.status(401).json({ error: "Invalid login" });
      }

      res.json({
        userId: result[0].id,
        username: result[0].username
      });
    }
  );
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

  db.query(query, (err, result) => {
    if (err) throw err;
    res.json(result);
  });
});

/* =========================
   ADD REVIEW
========================= */
app.post("/reviews", (req, res) => {
  const { userId, rating, review } = req.body;

  db.query(
    "INSERT INTO reviews (user_id, rating, review) VALUES (?, ?, ?)",
    [userId, rating, review],
    (err) => {
      if (err) throw err;
      res.json({ success: true });
    }
  );
});

/* =========================
   DELETE (ONLY AUTHOR)
========================= */
app.delete("/reviews/:id", (req, res) => {
  const reviewId = req.params.id;
  const userId = req.body.userId;

  db.query(
    "DELETE FROM reviews WHERE id = ? AND user_id = ?",
    [reviewId, userId],
    (err, result) => {
      if (result.affectedRows === 0) {
        return res.status(403).json({ error: "Not allowed" });
      }
      res.json({ success: true });
    }
  );
});

/* =========================
   AVG RATING
========================= */
app.get("/reviews/average", (req, res) => {
  db.query("SELECT AVG(rating) as avg FROM reviews", (err, result) => {
    res.json({ average: result[0].avg || 0 });
  });
});

app.listen(3000, () => console.log("Server running on port 3000"));