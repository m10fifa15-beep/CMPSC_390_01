const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

// MySQL connection
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

// Get reviews
app.get("/reviews", (req, res) => {
  db.query("SELECT * FROM reviews ORDER BY id DESC", (err, result) => {
    if (err) throw err;
    res.json(result);
  });
});

// Add review
app.post("/reviews", (req, res) => {
  const { rating, review } = req.body;

  db.query(
    "INSERT INTO reviews (rating, review) VALUES (?, ?)",
    [rating, review],
    (err, result) => {
      if (err) throw err;
      res.json({ success: true });
    }
  );
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});