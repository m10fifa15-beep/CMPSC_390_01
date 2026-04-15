-- Database Setup Script for Match-Maker App
-- To run this script, you can use the MySQL command line, MySQL Workbench, or phpMyAdmin.
-- You may need to create the database first if you haven't already:
-- CREATE DATABASE IF NOT EXISTS matchmaker_db;
-- USE matchmaker_db;

-- 1. `locations` table (Used for Match API)
CREATE TABLE IF NOT EXISTS locations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  number_of_reviews INT DEFAULT 0,
  average_rating DECIMAL(3,2) DEFAULT 0.0,
  food_category VARCHAR(100),
  price_range VARCHAR(50),
  city VARCHAR(100),
  state VARCHAR(50),
  website_url VARCHAR(255)
);

-- 2. `place` table (Used for Add Location form)
CREATE TABLE IF NOT EXISTS place (
  id INT AUTO_INCREMENT PRIMARY KEY,
  placeType VARCHAR(100),
  placeName VARCHAR(255) NOT NULL,
  addressLine1 VARCHAR(255) NOT NULL,
  addressLine2 VARCHAR(255),
  city VARCHAR(100) NOT NULL,
  state VARCHAR(50) NOT NULL,
  zip VARCHAR(20),
  country VARCHAR(100),
  placeImage VARCHAR(255)
);

-- 3. `js_users` table (Used for User Authentication)
CREATE TABLE IF NOT EXISTS js_users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(255) NOT NULL UNIQUE,  -- 'UNIQUE' is required for the ER_DUP_ENTRY check to work in register logic
  password VARCHAR(255) NOT NULL          -- In real life use hashed passwords, plain text for testing/class
);

-- 4. `js_reviews` table (Used for Store Page Reviews)
CREATE TABLE IF NOT EXISTS js_reviews (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  location_id INT NOT NULL,
  rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES js_users(id) ON DELETE CASCADE,
  -- Assuming location_id links to our 'locations' table:
  FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE
);

-- 5. `Posts` table (Used for Social Feed)
CREATE TABLE IF NOT EXISTS Posts (
  post_id INT AUTO_INCREMENT PRIMARY KEY,
  restaurant_name VARCHAR(255) NOT NULL,
  caption TEXT NOT NULL,
  image_path VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert some dummy data into `locations` to make sure /api/match returns results!
INSERT INTO locations (name, number_of_reviews, average_rating, food_category, price_range, city, state)
VALUES 
  ('The Burger Joint', 150, 4.5, 'American', '$$', 'Chicago', 'IL'),
  ('Pizza Planet', 85, 4.2, 'Italian', '$', 'Chicago', 'IL'),
  ('Sushi Station', 300, 4.8, 'Japanese', '$$$', 'Chicago', 'IL')
ON DUPLICATE KEY UPDATE name=name;
