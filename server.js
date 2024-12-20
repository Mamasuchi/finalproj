import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import pg from "pg";
import path from "path";
import session from "express-session"; // Add express-session for login persistence

const app = express();
const port = 3000;
const APP_TOKEN = '648c247278e935488e68786ac930c6c1'; //AOI KEY to use the APIfavquotes
// PostgreSQL setup
const pool = new pg.Pool({
  user: "postgres",
  host: "localhost",
  database: "favquotes",
  password: "wawasuchi22", // Your PostgreSQL password
  port: 5432,
});

// Middleware
app.use(express.static("public")); // Serve static assets
app.use(bodyParser.urlencoded({ extended: true })); // Parse form data
app.use(
  session({
    secret: "mySecretKey", // A random key used to sign the session ID cookie
    resave: false, // Prevent session from being saved on every request
    saveUninitialized: true, // Save uninitialized sessions
  })
);

// Set EJS as the template engine
app.set("views", path.join(process.cwd(), "views"));
app.set("view engine", "ejs");

// Home route
app.get("/", async (req, res) => {
  try {
    // Fetch random activity as before
    const response = await axios.get("https://bored-api.appbrewery.com/random");
    const result = response.data;

    // Get the following count if the user is logged in
    const followingCount = req.session.username
      ? await pool.query('SELECT COUNT(*) FROM follows WHERE follower = $1', [req.session.username])
      : { rows: [{ count: 0 }] }; // Default to 0 if not logged in

    res.render("index", {
      data: result,
      loggedIn: req.session.loggedIn || false, // Check if the session for login status
      username: req.session.username || null, // only Pass username if the user is logged in
      followingCount: followingCount.rows[0].count, // only Pass the following count to the template
    });
  } catch (error) {
    console.error("Error fetching activity:", error.message);
    res.render("error", { error: "Failed to fetch activity." });
  }
});


// User registration from DB (GET)
app.get("/register", (req, res) => {
  res.render("register");
});

// post user registration
app.post("/register", async (req, res) => {
  const { username, password } = req.body;
  try {
    await pool.query("INSERT INTO users (username, password) VALUES ($1, $2)", [ //register user name and password into DB
      username,
      password,
    ]);
    res.redirect("/login");
  } catch (error) {
    console.error("Error registering user:", error.message); //pass error message if there is a register error
    res.render("error", { error: "Username already exists. Try again." });
  }
});

// user login from DB
app.get("/login", (req, res) => {
  res.render("login");
});

// post user LOGIN such as username and password
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query("SELECT * FROM users WHERE username = $1", [ //login username
      username,
    ]);
    const user = result.rows[0];

    if (user && user.password === password) { // if pasasword matches user and passsword then success in logging in
      // Set session variables
      req.session.loggedIn = true;
      req.session.username = username;
      req.session.user_id = user.id;

      // Redirect to the dashboard page after login
      res.redirect("/dashboard");
    } else {
      res.render("error", { error: "Invalid username or password." });
    }
  } catch (error) {
    console.error("Error logging in:", error.message);
    res.render("error", { error: "Failed to log in." });
  }
});

//log out stops sesssion
app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/"); // Redirect back to  home page once logged out
  });
});

app.get("/dashboard", async (req, res) => {
  if (!req.session.loggedIn) {
    return res.redirect("/login"); // Redirect to login if not logged in
  }

  const user_id = req.session.user_id;

  try {
    // Fetch all quotes for the user thats logged in
    const quotesResult = await pool.query(
      "SELECT * FROM quotes WHERE user_id = $1",
      [user_id]
    );
    const quotes = quotesResult.rows;

    // Fetch all quotes for the user thats logged in
    const favoritesResult = await pool.query(
      "SELECT * FROM favorite_quotes WHERE user_id = $1",
      [user_id]
    );
    const favoriteQuotes = favoritesResult.rows;

    // Fetch quote of the day from API QUOTD
    const response = await axios.get("https://favqs.com/api/qotd");
    const quoteOfTheDay = response.data.quote;

    res.render("dashboard", {
      quotes: quotes,
      favoriteQuotes: favoriteQuotes,
      user_id: user_id, 
      quoteOfTheDay: quoteOfTheDay
    });
  } catch (error) {
    console.error("Error fetching quotes:", error.message);
    res.render("error", { error: "Failed to fetch quotes." });
  }
});



// Save quote
app.post("/save-quote", async (req, res) => {
  if (!req.session.loggedIn) {
    return res.redirect("/login"); // Redirect back to login if user is not logged in
  }

  const { quote, author, user_id } = req.body;

  try {
    await pool.query(
      "INSERT INTO quotes (quote, author, user_id) VALUES ($1, $2, $3)",
      [quote, author, user_id]
    );
    res.redirect("/dashboard"); // Redirect to the dashboard after saving the quote
  } catch (error) {
    console.error("Error saving quote:", error.message);
    res.render("error", { error: "Failed to save quote." });
  }
});

app.get("/quote-of-the-day", async (req, res) => {
  try {
    const response = await axios.get("https://favqs.com/api/qotd");
    const quote = {
      body: response.data.quote.body,
      author: response.data.quote.author,
    };

    res.json(quote);
  } catch (error) {
    console.error("Error fetching Quote of the Day:", error.message);
    res.status(500).json({ error: "Failed to fetch Quote of the Day." });
  }
});


app.post("/favorite-quote", async (req, res) => {
  if (!req.session.loggedIn) {
    return res.redirect("/login"); // Redirect back to login if user is not logged in
  }

  const { quote, author } = req.body; // Extract quote and author from database
  const user_id = req.session.user_id;

  try {
    // Save the quote to the favorite_quotes table
    await pool.query(
      "INSERT INTO favorite_quotes (quote, author, user_id) VALUES ($1, $2, $3)",
      [quote, author, user_id]
    );

    // Redirect back to the dashboard after saving the favorite
    res.redirect("/dashboard");
  } catch (error) {
    console.error("Error saving favorite quote:", error.message);
    res.render("error", { error: "Failed to save favorite quote." });
  }
});



app.post("/delete-favorite/:quote_id", async (req, res) => {
  if (!req.session.loggedIn) {
    return res.redirect("/login"); // Redirect back to login if user is not logged in
  }

  const quoteId = req.params.quote_id;
  const user_id = req.session.user_id;

  try {
    // Delete the favorite quote from the favorite_quotes table
    await pool.query(
      "DELETE FROM favorite_quotes WHERE id = $1 AND user_id = $2",
      [quoteId, user_id]
    );

    // Redirect back to the dashboard after removing the favorite
    res.redirect("/dashboard");
  } catch (error) {
    console.error("Error removing favorite quote:", error.message);
    res.render("error", { error: "Failed to remove favorite quote." });
  }
});

app.get('/list-of-quotes', async (req, res) => {
  const filter = req.query.filter || ''; // Get filter from the query string
  const filterParam = filter ? `&filter=${filter}` : '';

  try {
    const response = await axios.get(`https://favqs.com/api/quotes?${filterParam}`, {
      headers: {
        Authorization: `Token token="${APP_TOKEN}"`,
      },
    });

    const quotes = response.data.quotes.slice(0, 5); // 6 total quotes 

    // Pass loggedIn status and quotes to the view
    res.render('list-of-quotes', {
      quotes,
      loggedIn: req.session.loggedIn || false, // Ensure it's passed to the template
    });
  } catch (error) {
    console.error('Error fetching quotes:', error.message);
    res.status(500).send('Failed to fetch quotes');
  }
});



app.post('/add-quote', async (req, res) => {
  const { quote, author } = req.body;
  const userId = req.session.user_id; // Retrieve user_id from session

  if (!userId) {
    console.error('User ID not found in session.');
    return res.status(400).send('User not logged in.');
  }

  try {
    const result = await pool.query(
      'INSERT INTO quotes (quote, author, user_id) VALUES ($1, $2, $3) RETURNING *',
      [quote, author, userId]
    );
    console.log('Quote saved to the database:', result.rows[0]);
    res.redirect('/your-quotes');
  } catch (error) {
    console.error('Error saving quote:', error);
    res.status(500).send('Error saving quote');
  }
});


app.get('/your-quotes', async (req, res) => {
  const userId = req.session.user_id;

  if (!userId) {
    console.error('User ID not found in session.');
    return res.status(400).send('User not logged in.');
  }

  try {
    const dbResult = await pool.query(
      'SELECT * FROM quotes WHERE user_id = $1',
      [userId]
    );
    console.log('Quotes found:', dbResult.rows);
    res.render('your-quotes', {
      quotes: dbResult.rows,
      username: req.session.username || 'Anonymous',
    });
  } catch (error) {
    console.error('Error fetching quotes:', error);
    res.status(500).send('Error fetching quotes');
  }
});



app.post('/delete-quote', async (req, res) => {
  const { id } = req.body; // Get the quote ID from the form
  const userId = req.session.user_id; // Get the logged-in user's ID

  if (!userId) {
    console.error('User ID not found in session.');
    return res.status(400).send('User not logged in.');
  }

  try {
    // Check if the quote belongs to the logged-in user
    const checkOwnership = await pool.query(
      'SELECT * FROM quotes WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (checkOwnership.rows.length === 0) {
      console.error('Quote not found or does not belong to the user.');
      return res.status(403).send('Unauthorized action.');
    }

    // Delete the quote
    await pool.query('DELETE FROM quotes WHERE id = $1 AND user_id = $2', [id, userId]);

    console.log(`Quote with ID ${id} deleted.`);
    res.redirect('/your-quotes'); // Redirect back to the user's quotes page
  } catch (error) {
    console.error('Error deleting quote:', error);
    res.status(500).send('Error deleting quote');
  }
});

app.get('/search-users', async (req, res) => {
  const searchTerm = req.query.query;

  try {
    const dbResult = await pool.query(
      "SELECT username FROM users WHERE username ILIKE $1 AND username != $2",
      [`%${searchTerm}%`, req.session.username] 
    );
    res.render('search-users', { users: dbResult.rows });
  } catch (error) {
    console.error('Error searching users:', error);
    res.status(500).send('Error searching users');
  }
});

app.post('/follow-user', async (req, res) => {
  const follower = req.session.username;
  const followed = req.body.followed_username;

  if (!follower) {
    return res.status(401).send('You must be logged in to follow users.');
  }

  try {
    // Insert follow relationship into a new 'follows' table
    await pool.query(
      'INSERT INTO follows (follower, followed) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [follower, followed]
    );
    console.log(`${follower} is now following ${followed}`);
    res.redirect('/your-following');
  } catch (error) {
    console.error('Error following user:', error);
    res.status(500).send('Error following user');
  }
});

app.get('/your-following', async (req, res) => {
  const username = req.session.username;

  if (!username) {
    return res.status(401).send('You must be logged in to view this page.');
  }

  try {
    const dbResult = await pool.query(
      'SELECT followed FROM follows WHERE follower = $1',
      [username]
    );
    
    // Pass the followed users to the view
    res.render('your-following', { following: dbResult.rows });
  } catch (error) {
    console.error('Error fetching following list:', error);
    res.status(500).send('Error fetching following list');
  }
});


// Unfollow User 
app.post('/unfollow-user', async (req, res) => {
  const follower = req.session.username; // Get the logged-in user
  const followed = req.body.followed_username; // Get the username to unfollow

  if (!follower) {
    return res.status(401).send('You must be logged in to unfollow users.');
  }

  try {
    // Delete the follow relationship from the 'follows'  DB table
    await pool.query(
      'DELETE FROM follows WHERE follower = $1 AND followed = $2',
      [follower, followed]
    );
    console.log(`${follower} has unfollowed ${followed}`);
    res.redirect('/your-following'); // Redirect back to the following page
  } catch (error) {
    console.error('Error unfollowing user:', error);
    res.status(500).send('Error unfollowing user');
  }
});

// Route to display the profile of a followed user
app.get('/profile/:username', async (req, res) => {
  const username = req.params.username; // Get the username from the URL parameter

  try {
    // Fetch quotes of the user from the database 
    const result = await pool.query(
      'SELECT quote, author FROM favorite_quotes WHERE user_id = (SELECT id FROM users WHERE username = $1)', 
      [username]
    );

    const userQuotes = result.rows;

    res.render('profile', { 
      username: username,
      quotes: userQuotes 
    });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).send('Error fetching user profile');
  }
});



//start server port
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
