require("dotenv").config();
const PORT = process.env.PORT || 3000;

const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');

const app = express();
//Port 
const port = 3000;

//middleware
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.json());              // JSON
app.use(express.static(__dirname));   // serve files 

// MySQL connection
const db = mysql.createConnection({
host: process.env.DB_HOST,
user: process.env.DB_USER,
password: process.env.DB_PASSWORD,
database: process.env.DB_NAME,
});

db.connect((err) => {
  if (err) {
    console.error('Database connection failed:', err);
    return;
  }
  console.log('Connected to MySQL database');
});



// Helpers
function normalize(str) {
  return String(str || '').toLowerCase().trim();
}

//different categories that user goes through when completing match-maker
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

  const blob = normalize(`${place.name} ${place.food_category} ${place.city} ${place.state}`);

  const tokens = `${likes} ${personality} ${culture} ${trends}`
    .split(/[, ]+/)
    .filter(Boolean);

  tokens.forEach((t) => {
    if (t.length > 2 && blob.includes(t)) score += 2;
  });

  return score;
}

// MATCH API (endpoint for front-end calls)
app.post('/api/match', (req, res) => {
  // If you ever switch to HTML form submit, bodyParser will still work.
  const prefs = req.body;

  // const sql = `SELECT ... FROM place WHERE city_state = ?`;
  // const params = ['Chicago, IL'];


  //locations table columns
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
      console.error(err);
      return res.status(500).send('Database error');
    }

    const ranked = results
      .map((place) => ({
        ...place,
        matchScore: scorePlace(place, prefs)
      }))
      .sort((a, b) => b.matchScore - a.matchScore);

    // If nothing matches can return top items (optional)
    const hasRealMatches = ranked.length > 0 && ranked[0].matchScore > 0;
    const finalList = hasRealMatches ? ranked.filter(r => r.matchScore > 0) : ranked;

    //list of locations tables columns
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

// test route "hello-user"
app.get('/hello-place', (req, res) => {
  const sql = 'SELECT * FROM locations LIMIT 1';

  db.query(sql, (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Database error');
    }

    if (results.length === 0) return res.send('No places found');

    res.send(`First place: ${results[0].name}`);
  });
});

//adding a home route to serve the html

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/matchmaker.html');
});

// 404 handler
app.use((req, res) => {
  res.status(404).send('Not Found');
});

app.listen(PORT, () => {
console.log(`Server running on http://localhost:${PORT}`);
});