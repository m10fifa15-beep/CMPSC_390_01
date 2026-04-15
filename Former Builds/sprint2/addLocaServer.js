const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const multer = require('multer');
const upload = multer({ dest: 'UploadedImages/' });


const app = express();
const port = 3000;

app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static(__dirname));
app.use('/UploadedImages', express.static('UploadedImages'));

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'Agent142!', // use your MySQL password if needed
  database: 'location'
});


app.post('/addLocation', upload.single('ImageFile'), (req, res) => {
  console.log("START ADD LOCATION");

  console.log("req" + req);

  const ImageFile = req.file ? req.file.filename : null;


  const PlaceType = req.body.PlaceType;
  const PlaceName = req.body.PlaceName

  const addressLine1 = req.body.addressLine1;
  const addressLine2 = req.body.addressLine2;
  const city = req.body.city;
  const state = req.body.state;
  const zip = req.body.zip;
  const country = req.body.country;
  
  const PlaceAddress = `${addressLine1}, ${city}, ${state}, ${zip}, ${country}`
  const sql = `


  INSERT INTO place (PlaceType, PlaceName, PlaceAddress, PlaceImage)
  VALUES (?, ?, ?, ?)
  `;

  db.query(sql, [PlaceType, PlaceName, PlaceAddress,  ImageFile], (err, results) => {
  if (err) {
  console.error(err);
  return res.status(500).send('Server Error'); 

  }
  console.error(results);

  if (results.affectedRows == 1) {
  res.send(`${req.body.PlaceType}: has been created!`);
  } else {
    console.log("Error!");
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


  