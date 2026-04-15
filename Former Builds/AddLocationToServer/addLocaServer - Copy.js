const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');

const app = express();
const port = 3000;

app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static(__dirname));

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'Agent142!', // use your MySQL password if needed
  database: 'location'
});


app.post('/addLocation', (req, res) => {

  const PlaceType = req.body.PlaceType;
  const PlaceName = req.body.PlaceName
  const PlaceAddress = req.body.PlaceAddress
  const sql = `
  INSERT INTO place (PlaceType, PlaceName, PlaceAddress)
  VALUES (?, ?, ?)
  `;

  db.query(sql, [req.body.PlaceType, req.body.PlaceName, req.body.PlaceAddress], (err, results) => {
  if (err) {
  console.error(err);
  return res.status(500).send('Server Error'); //Why wont this message change?!?!?

  /* console.error("MYSQL ERROR:", err);
  return res.status(500).send(err.message);*/
  }
  if (results.affectedRows == 1) {
  res.send(`${req.body.PlaceType}: has been created!`);
  } else {
  res.send('User Not Created');
  }
  });
  });


app.use((req, res) => {
  res.status(404).send('Location Not Created');
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

  