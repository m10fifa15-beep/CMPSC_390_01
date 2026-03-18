const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'password',
  database: 'restaurant_db'
});

// Get restaurant by ID
app.get('/restaurant/:id', (req, res) => {
  const id = req.params.id;

  const query = `
    SELECT * FROM restaurants WHERE id = ?;
  `;

  db.query(query, [id], (err, result) => {
    if (err) return res.status(500).send(err);

    const restaurant = result[0];

    db.query("SELECT * FROM reviews WHERE restaurant_id = ?", [id], (err, reviews) => {
      if (err) return res.status(500).send(err);

      restaurant.reviews = reviews;
      res.json(restaurant);
    });
  });
});

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
