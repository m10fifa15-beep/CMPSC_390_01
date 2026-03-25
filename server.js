const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const multer = require("multer");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// MySQL connection
const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "micheelcanelo",
  database: "RestaurantFeed",
});

db.connect((err) => {
  if (err) {
    console.error("DB connection failed:", err);
  } else {
    console.log("Connected to MySQL");
  }
});

// Image upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "public/uploads");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({ storage });

// Get all posts
app.get("/posts", (req, res) => {
  db.query(
    "SELECT restaurant_name, caption, image_path FROM Posts ORDER BY created_at DESC",
    (err, results) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: "DB error" });
      }
      res.json(results);
    }
  );
});

// Create post
app.post("/create-post", upload.single("image"), (req, res) => {
  const { restaurant_name, caption } = req.body;

  if (!restaurant_name || !caption || !req.file) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const imagePath = `uploads/${req.file.filename}`;

  db.query(
    "INSERT INTO Posts (restaurant_name, caption, image_path) VALUES (?, ?, ?)",
    [restaurant_name, caption, imagePath],
    (err) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: "Insert failed" });
      }
      res.json({ success: true });
    }
  );
});

// Start server
app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
