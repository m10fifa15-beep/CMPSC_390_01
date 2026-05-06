require("dotenv").config();
const PORT = process.env.PORT || 3000;

const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();

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

// AUTHENTICATION & USER MANAGEMENT

/**
 * REGISTER - Create new user with enhanced profile fields
 * Body: { username, email, password, first_name, last_name }
 */
app.post('/register', (req, res) => {
  const { username, email, password, first_name, last_name } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const sql = `
    INSERT INTO js_users (username, email, password, first_name, last_name)
    VALUES (?, ?, ?, ?, ?)
  `;

  db.query(sql, [username, email || null, password, first_name || '', last_name || ''], (err, results) => {
    if (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({ error: 'Username or email already exists' });
      }
      console.error(err);
      return res.status(500).json({ error: 'Registration failed' });
    }

    // Create user statistics record
    const statsSQL = `INSERT INTO user_statistics (user_id) VALUES (?)`;
    db.query(statsSQL, [results.insertId], (err) => {
      if (err) console.error(err);
    });

    // Create notification preferences record
    const notifSQL = `INSERT INTO user_notification_preferences (user_id) VALUES (?)`;
    db.query(notifSQL, [results.insertId], (err) => {
      if (err) console.error(err);
    });

    res.json({ 
      success: true, 
      userId: results.insertId,
      username,
      message: 'User registered successfully'
    });
  });
});

/**
 * LOGIN - Authenticate user and return profile
 * Body: { username, password }
 */
app.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const sql = `
    SELECT id, username, email, first_name, last_name, profile_picture_url, bio, created_at
    FROM js_users
    WHERE username = ? AND password = ? AND is_active = TRUE
  `;

  db.query(sql, [username, password], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Login failed' });
    }

    if (results.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = results[0];

    // Log activity
    const logSQL = `INSERT INTO user_activity_log (user_id, activity_type) VALUES (?, 'login')`;
    db.query(logSQL, [user.id], (err) => {
      if (err) console.error(err);
    });

    res.json({
      userId: user.id,
      username: user.username,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      profile_picture_url: user.profile_picture_url,
      bio: user.bio,
      created_at: user.created_at
    });
  });
});

// USER PROFILE MANAGEMENT

/**
 * GET USER PROFILE - Comprehensive user info
 * Query: userId
 */
app.get('/user-profile', (req, res) => {
  const userId = req.query.userId;

  if (!userId) {
    return res.status(400).json({ error: 'userId required' });
  }

  const sql = `
    SELECT 
      u.id, u.username, u.email, u.first_name, u.last_name, 
      u.profile_picture_url, u.bio, u.created_at, u.is_verified,
      s.total_reviews, s.total_saved_locations, s.total_posts,
      s.total_followers, s.total_following, s.average_review_rating
    FROM js_users u
    LEFT JOIN user_statistics s ON u.id = s.user_id
    WHERE u.id = ?
  `;

  db.query(sql, [userId], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to fetch profile' });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = results[0];

    // Get dietary restrictions
    const dietSQL = `SELECT restriction_type FROM dietary_restrictions WHERE user_id = ?`;
    db.query(dietSQL, [userId], (err, dietResults) => {
      const dietary_restrictions = err ? [] : dietResults.map(d => d.restriction_type);

      // Get favorite cuisines
      const cuisineSQL = `SELECT cuisine FROM favorite_cuisines WHERE user_id = ?`;
      db.query(cuisineSQL, [userId], (err, cuisineResults) => {
        const favorite_cuisines = err ? [] : cuisineResults.map(c => c.cuisine);

        // Get badges
        const badgeSQL = `SELECT badge_name, badge_description, badge_icon_url, earned_at FROM user_badges WHERE user_id = ?`;
        db.query(badgeSQL, [userId], (err, badgeResults) => {
          const badges = err ? [] : badgeResults;

          res.json({
            ...user,
            dietary_restrictions,
            favorite_cuisines,
            badges
          });
        });
      });
    });
  });
});

/**
 * UPDATE USER PROFILE
 * Body: { userId, email, first_name, last_name, bio, profile_picture_url }
 */
app.put('/user-profile', (req, res) => {
  const { userId, email, first_name, last_name, bio, profile_picture_url } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'userId required' });
  }

  const sql = `
    UPDATE js_users
    SET email = COALESCE(?, email),
        first_name = COALESCE(?, first_name),
        last_name = COALESCE(?, last_name),
        bio = COALESCE(?, bio),
        profile_picture_url = COALESCE(?, profile_picture_url),
        updated_at = NOW()
    WHERE id = ?
  `;

  db.query(sql, [email, first_name, last_name, bio, profile_picture_url, userId], (err) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to update profile' });
    }

    res.json({ success: true, message: 'Profile updated' });
  });
});

// DIETARY RESTRICTIONS

/**
 * ADD DIETARY RESTRICTION
 * Body: { userId, restriction_type }
 */
app.post('/dietary-restrictions', (req, res) => {
  const { userId, restriction_type } = req.body;

  if (!userId || !restriction_type) {
    return res.status(400).json({ error: 'userId and restriction_type required' });
  }

  const sql = `INSERT INTO dietary_restrictions (user_id, restriction_type) VALUES (?, ?)`;

  db.query(sql, [userId, restriction_type], (err) => {
    if (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({ error: 'Restriction already added' });
      }
      console.error(err);
      return res.status(500).json({ error: 'Failed to add restriction' });
    }

    res.json({ success: true, message: 'Dietary restriction added' });
  });
});

/**
 * REMOVE DIETARY RESTRICTION
 */
app.delete('/dietary-restrictions/:userId/:restriction', (req, res) => {
  const { userId, restriction } = req.params;

  const sql = `DELETE FROM dietary_restrictions WHERE user_id = ? AND restriction_type = ?`;

  db.query(sql, [userId, restriction], (err) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to remove restriction' });
    }

    res.json({ success: true, message: 'Dietary restriction removed' });
  });
});

// FAVORITE CUISINES

/**
 * ADD FAVORITE CUISINE
 * Body: { userId, cuisine }
 */
app.post('/favorite-cuisines', (req, res) => {
  const { userId, cuisine } = req.body;

  if (!userId || !cuisine) {
    return res.status(400).json({ error: 'userId and cuisine required' });
  }

  const sql = `INSERT INTO favorite_cuisines (user_id, cuisine) VALUES (?, ?)`;

  db.query(sql, [userId, cuisine], (err) => {
    if (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({ error: 'Cuisine already added' });
      }
      console.error(err);
      return res.status(500).json({ error: 'Failed to add cuisine' });
    }

    res.json({ success: true, message: 'Favorite cuisine added' });
  });
});

/**
 * REMOVE FAVORITE CUISINE
 */
app.delete('/favorite-cuisines/:userId/:cuisine', (req, res) => {
  const { userId, cuisine } = req.params;

  const sql = `DELETE FROM favorite_cuisines WHERE user_id = ? AND cuisine = ?`;

  db.query(sql, [userId, cuisine], (err) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to remove cuisine' });
    }

    res.json({ success: true, message: 'Favorite cuisine removed' });
  });
});

// SOCIAL FEATURES

/**
 * FOLLOW USER
 * Body: { follower_id, following_id }
 */
app.post('/follow', (req, res) => {
  const { follower_id, following_id } = req.body;

  if (!follower_id || !following_id) {
    return res.status(400).json({ error: 'follower_id and following_id required' });
  }

  if (follower_id === following_id) {
    return res.status(400).json({ error: 'Cannot follow yourself' });
  }

  const sql = `INSERT INTO user_followers (follower_id, following_id) VALUES (?, ?)`;

  db.query(sql, [follower_id, following_id], (err) => {
    if (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({ error: 'Already following this user' });
      }
      console.error(err);
      return res.status(500).json({ error: 'Failed to follow user' });
    }

    // Update statistics
    updateUserStats(following_id);
    updateUserStats(follower_id);

    res.json({ success: true, message: 'User followed' });
  });
});

/**
 * UNFOLLOW USER
 * Body: { follower_id, following_id }
 */
app.post('/unfollow', (req, res) => {
  const { follower_id, following_id } = req.body;

  if (!follower_id || !following_id) {
    return res.status(400).json({ error: 'follower_id and following_id required' });
  }

  const sql = `DELETE FROM user_followers WHERE follower_id = ? AND following_id = ?`;

  db.query(sql, [follower_id, following_id], (err) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to unfollow user' });
    }

    // Update statistics
    updateUserStats(following_id);
    updateUserStats(follower_id);

    res.json({ success: true, message: 'User unfollowed' });
  });
});

/**
 * GET USER'S FOLLOWERS
 * Query: userId
 */
app.get('/followers/:userId', (req, res) => {
  const userId = req.params.userId;

  const sql = `
    SELECT u.id, u.username, u.profile_picture_url, u.bio
    FROM user_followers uf
    JOIN js_users u ON uf.follower_id = u.id
    WHERE uf.following_id = ?
  `;

  db.query(sql, [userId], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to fetch followers' });
    }

    res.json({ followers: results });
  });
});

/**
 * GET USER'S FOLLOWING
 * Query: userId
 */
app.get('/following/:userId', (req, res) => {
  const userId = req.params.userId;

  const sql = `
    SELECT u.id, u.username, u.profile_picture_url, u.bio
    FROM user_followers uf
    JOIN js_users u ON uf.following_id = u.id
    WHERE uf.follower_id = ?
  `;

  db.query(sql, [userId], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to fetch following' });
    }

    res.json({ following: results });
  });
});

// USER BADGES & ACHIEVEMENTS

/**
 * AWARD BADGE TO USER (Admin function)
 * Body: { userId, badge_name, badge_description, badge_icon_url }
 */
app.post('/badges', (req, res) => {
  const { userId, badge_name, badge_description, badge_icon_url } = req.body;

  if (!userId || !badge_name) {
    return res.status(400).json({ error: 'userId and badge_name required' });
  }

  const sql = `
    INSERT INTO user_badges (user_id, badge_name, badge_description, badge_icon_url)
    VALUES (?, ?, ?, ?)
  `;

  db.query(sql, [userId, badge_name, badge_description || null, badge_icon_url || null], (err) => {
    if (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({ error: 'User already has this badge' });
      }
      console.error(err);
      return res.status(500).json({ error: 'Failed to award badge' });
    }

    res.json({ success: true, message: 'Badge awarded' });
  });
});

/**
 * GET USER BADGES
 */
app.get('/badges/:userId', (req, res) => {
  const userId = req.params.userId;

  const sql = `SELECT badge_name, badge_description, badge_icon_url, earned_at FROM user_badges WHERE user_id = ?`;

  db.query(sql, [userId], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to fetch badges' });
    }

    res.json({ badges: results });
  });
});

// BLOCKING & SAFETY

/**
 * BLOCK USER
 * Body: { user_id, blocked_user_id, reason }
 */
app.post('/block-user', (req, res) => {
  const { user_id, blocked_user_id, reason } = req.body;

  if (!user_id || !blocked_user_id) {
    return res.status(400).json({ error: 'user_id and blocked_user_id required' });
  }

  const sql = `INSERT INTO blocked_users (user_id, blocked_user_id, reason) VALUES (?, ?, ?)`;

  db.query(sql, [user_id, blocked_user_id, reason || null], (err) => {
    if (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({ error: 'User already blocked' });
      }
      console.error(err);
      return res.status(500).json({ error: 'Failed to block user' });
    }

    res.json({ success: true, message: 'User blocked' });
  });
});

/**
 * UNBLOCK USER
 */
app.delete('/block-user/:userId/:blockedUserId', (req, res) => {
  const { userId, blockedUserId } = req.params;

  const sql = `DELETE FROM blocked_users WHERE user_id = ? AND blocked_user_id = ?`;

  db.query(sql, [userId, blockedUserId], (err) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to unblock user' });
    }

    res.json({ success: true, message: 'User unblocked' });
  });
});

// NOTIFICATION PREFERENCES

/**
 * UPDATE NOTIFICATION PREFERENCES
 * Body: { userId, email_on_new_followers, email_on_friend_posts, ... }
 */
app.put('/notification-preferences', (req, res) => {
  const { userId, email_on_new_followers, email_on_friend_posts, email_on_location_updates, email_on_new_reviews, push_notifications_enabled } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'userId required' });
  }

  const sql = `
    UPDATE user_notification_preferences
    SET 
      email_on_new_followers = COALESCE(?, email_on_new_followers),
      email_on_friend_posts = COALESCE(?, email_on_friend_posts),
      email_on_location_updates = COALESCE(?, email_on_location_updates),
      email_on_new_reviews = COALESCE(?, email_on_new_reviews),
      push_notifications_enabled = COALESCE(?, push_notifications_enabled)
    WHERE user_id = ?
  `;

  db.query(sql, [email_on_new_followers, email_on_friend_posts, email_on_location_updates, email_on_new_reviews, push_notifications_enabled, userId], (err) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to update preferences' });
    }

    res.json({ success: true, message: 'Notification preferences updated' });
  });
});

/**
 * GET NOTIFICATION PREFERENCES
 */
app.get('/notification-preferences/:userId', (req, res) => {
  const userId = req.params.userId;

  const sql = `SELECT * FROM user_notification_preferences WHERE user_id = ?`;

  db.query(sql, [userId], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to fetch preferences' });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: 'Preferences not found' });
    }

    res.json(results[0]);
  });
});

// HELPER FUNCTION - Update user statistics
function updateUserStats(userId) {
  const sql = `
    UPDATE user_statistics
    SET 
      total_reviews = (SELECT COUNT(*) FROM js_reviews WHERE user_id = ?),
      total_saved_locations = (SELECT COUNT(*) FROM user_saved_locations WHERE user_id = ?),
      total_posts = (SELECT COUNT(*) FROM Posts WHERE user_id = ?),
      total_followers = (SELECT COUNT(*) FROM user_followers WHERE following_id = ?),
      total_following = (SELECT COUNT(*) FROM user_followers WHERE follower_id = ?),
      average_review_rating = (SELECT AVG(rating) FROM js_reviews WHERE user_id = ?),
      updated_at = NOW()
    WHERE user_id = ?
  `;

  db.query(sql, [userId, userId, userId, userId, userId, userId, userId], (err) => {
    if (err) console.error('Error updating stats:', err);
  });
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