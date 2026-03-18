const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

// DB CONNECTION
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
   GET REVIEWS (WITH SORT)
========================= */
app.get("/reviews", (req, res) => {
  const sort = req.query.sort;

  let query = "SELECT * FROM reviews";

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
  const { username, rating, review } = req.body;

  if (!username || !rating || !review) {
    return res.status(400).json({ error: "Missing fields" });
  }

  db.query(
    "INSERT INTO reviews (username, rating, review) VALUES (?, ?, ?)",
    [username, rating, review],
    (err) => {
      if (err) throw err;
      res.json({ success: true });
    }
  );
});

/* =========================
   DELETE REVIEW
========================= */
app.delete("/reviews/:id", (req, res) => {
  const id = req.params.id;

  db.query("DELETE FROM reviews WHERE id = ?", [id], (err) => {
    if (err) throw err;
    res.json({ success: true });
  });
});

/* =========================
   AVERAGE RATING
========================= */
app.get("/reviews/average", (req, res) => {
  db.query("SELECT AVG(rating) as avg FROM reviews", (err, result) => {
    if (err) throw err;
    res.json({ average: result[0].avg || 0 });
  });
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});