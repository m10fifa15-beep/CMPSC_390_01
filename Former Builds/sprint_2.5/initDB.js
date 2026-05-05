const mysql = require('mysql2');
const fs = require('fs');
require('dotenv').config();

const connection = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  multipleStatements: true // Allows running all queries at once
});

console.log('Connecting to MySQL to create database and tables...');

// Create DB if not exists
connection.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME}\`;`, (err) => {
  if (err) {
    console.error('Failed to create database:', err);
    connection.end();
    process.exit(1);
  }
  
  // Use DB
  connection.query(`USE \`${process.env.DB_NAME}\`;`, (err) => {
    if (err) {
      console.error('Failed to select database:', err);
      connection.end();
      process.exit(1);
    }
    
    // Read schema
    const schema = fs.readFileSync('schema.sql', 'utf8');
    
    connection.query(schema, (err, results) => {
      if (err) {
        console.error('Error executing schema.sql:', err.message);
      } else {
        console.log('✅ Database and tables created successfully!');
      }
      connection.end();
    });
  });
});
