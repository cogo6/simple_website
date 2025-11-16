const express = require('express');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Set EJS as view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Route for home page
app.get('/', (req, res) => {
  res.render('index', { title: 'Simple Website' });
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
