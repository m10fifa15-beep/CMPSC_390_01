const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const bcrypt = require("bcrypt");
const session = require("express-session");

const app = express();

app.use(cors({
  origin: "http://localhost",
  credentials: true
}));

app.use(express.json());

app.use(session({
  secret: "secret123",
  resave: false,
  saveUninitialized: false
}));

const db = mysql.createConnection({
  host: "localhost",
  user: "store_user",
  password: "password123",
  database: "store_db"
});

// REGISTER
app.post("/register", async (req, res) => {
  const { username, password } = req.body;

  const hashed = await bcrypt.hash(password, 10);

  db.query(
    "INSERT INTO users (username, password) VALUES (?, ?)",
    [username, hashed],
    (err) => {
      if (err) return res.status(400).json({ error: "User exists" });
      res.json({ success: true });
    }
  );
});

// LOGIN
app.post("/login", (req, res) => {
  const { username, password } = req.body;

  db.query(
    "SELECT * FROM users WHERE username = ?",
    [username],
    async (err, results) => {
      if (results.length === 0) {
        return res.status(400).json({ error: "User not found" });
      }

      const user = results[0];
      const match = await bcrypt.compare(password, user.password);

      if (!match) {
        return res.status(400).json({ error: "Wrong password" });
      }

      req.session.userId = user.id;
      req.session.username = user.username;

      res.json({ success: true });
    }
  );
});

// LOGOUT
app.get("/logout", (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// GET REVIEWS + AVG
app.get("/reviews", (req, res) => {
  const reviewsQuery = `
    SELECT reviews.*, users.username
    FROM reviews
    JOIN users ON reviews.user_id = users.id
    ORDER BY reviews.id DESC
  `;

  const avgQuery = `SELECT AVG(rating) as avgRating FROM reviews`;

  db.query(reviewsQuery, (err, reviews) => {
    if (err) throw err;

    db.query(avgQuery, (err, avgResult) => {
      if (err) throw err;

      res.json({
        reviews,
        average: avgResult[0].avgRating || 0
      });
    });
  });
});

// ADD REVIEW (requires login)
app.post("/reviews", (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not logged in" });
  }

  const { rating, review } = req.body;

  db.query(
    "INSERT INTO reviews (user_id, rating, review) VALUES (?, ?, ?)",
    [req.session.userId, rating, review],
    (err) => {
      if (err) throw err;
      res.json({ success: true });
    }
  );
});

app.listen(3000, () => console.log("Server running on port 3000"));
