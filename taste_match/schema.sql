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

-- 3. `js_users` table (Used for User Authentication & Core Profile)
CREATE TABLE IF NOT EXISTS js_users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(255) NOT NULL UNIQUE,
  email VARCHAR(255) UNIQUE,
  password VARCHAR(255) NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  profile_picture_url VARCHAR(255),
  bio TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  is_active BOOLEAN DEFAULT TRUE,
  is_verified BOOLEAN DEFAULT FALSE
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

-- 6. `user_preferences` table (Stores user-selected preferences for matchmaking)
CREATE TABLE IF NOT EXISTS user_preferences (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  likes TEXT,
  personality TEXT,
  culture TEXT,
  trends TEXT,
  saved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES js_users(id) ON DELETE CASCADE
);

-- 7. `user_saved_locations` table (Stores locations saved by users)
CREATE TABLE IF NOT EXISTS user_saved_locations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  location_id INT NOT NULL,
  saved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES js_users(id) ON DELETE CASCADE,
  FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE
);

-- 8. `user_history` table (Tracks user interactions with locations)
CREATE TABLE IF NOT EXISTS user_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  location_id INT NOT NULL,
  action VARCHAR(50), -- e.g., 'viewed', 'liked', 'passed', 'saved'
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES js_users(id) ON DELETE CASCADE,
  FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE
);

-- 9. `user_followers` table (Social network - follows/friends)
CREATE TABLE IF NOT EXISTS user_followers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  follower_id INT NOT NULL,
  following_id INT NOT NULL,
  followed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (follower_id) REFERENCES js_users(id) ON DELETE CASCADE,
  FOREIGN KEY (following_id) REFERENCES js_users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_follow (follower_id, following_id),
  CHECK (follower_id != following_id)
);

-- 10. `dietary_restrictions` table (User dietary preferences)
CREATE TABLE IF NOT EXISTS dietary_restrictions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  restriction_type VARCHAR(100), -- e.g., 'vegan', 'vegetarian', 'gluten-free', 'halal', 'kosher', 'nut-allergy'
  added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES js_users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_restriction (user_id, restriction_type)
);

-- 11. `favorite_cuisines` table (User cuisine preferences)
CREATE TABLE IF NOT EXISTS favorite_cuisines (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  cuisine VARCHAR(100), -- e.g., 'Italian', 'Japanese', 'Mexican', 'Indian'
  added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES js_users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_cuisine (user_id, cuisine)
);

-- 12. `user_statistics` table (Engagement metrics)
CREATE TABLE IF NOT EXISTS user_statistics (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  total_reviews INT DEFAULT 0,
  total_saved_locations INT DEFAULT 0,
  total_posts INT DEFAULT 0,
  total_followers INT DEFAULT 0,
  total_following INT DEFAULT 0,
  average_review_rating DECIMAL(3,2) DEFAULT 0.0,
  last_activity TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES js_users(id) ON DELETE CASCADE
);

-- 13. `user_badges` table (Gamification - achievements)
CREATE TABLE IF NOT EXISTS user_badges (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  badge_name VARCHAR(100), -- e.g., 'Foodie', 'Reviewer', 'Explorer', 'Social Butterfly'
  badge_description TEXT,
  badge_icon_url VARCHAR(255),
  earned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES js_users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_badge (user_id, badge_name)
);

-- 14. `blocked_users` table (Safety & moderation)
CREATE TABLE IF NOT EXISTS blocked_users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  blocked_user_id INT NOT NULL,
  blocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reason VARCHAR(255),
  FOREIGN KEY (user_id) REFERENCES js_users(id) ON DELETE CASCADE,
  FOREIGN KEY (blocked_user_id) REFERENCES js_users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_block (user_id, blocked_user_id),
  CHECK (user_id != blocked_user_id)
);

-- 15. `user_notifications_preferences` table (Notification settings)
CREATE TABLE IF NOT EXISTS user_notification_preferences (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  email_on_new_followers BOOLEAN DEFAULT TRUE,
  email_on_friend_posts BOOLEAN DEFAULT TRUE,
  email_on_location_updates BOOLEAN DEFAULT FALSE,
  email_on_new_reviews BOOLEAN DEFAULT FALSE,
  push_notifications_enabled BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES js_users(id) ON DELETE CASCADE
);

-- 16. `user_activity_log` table (Comprehensive activity tracking)
CREATE TABLE IF NOT EXISTS user_activity_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  activity_type VARCHAR(100), -- e.g., 'login', 'post_created', 'review_posted', 'location_saved'
  activity_details TEXT,
  ip_address VARCHAR(45),
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES js_users(id) ON DELETE CASCADE,
  INDEX idx_user_activity (user_id, timestamp)
);
