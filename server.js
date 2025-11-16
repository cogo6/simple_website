const http = require('http');
const fs = require('fs');
const path = require('path');

// Port to listen on. Defaults to 3000 or uses environment variable PORT if set.
const port = process.env.PORT || 3000;

// Helper function to map file extensions to MIME types
function getContentType(ext) {
  const mimeTypes = {
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
  };
  return mimeTypes[ext.toLowerCase()] || 'text/html';
}

// Create a simple HTTP server that serves static files from the "public" directory
const server = http.createServer((req, res) => {
  // Determine the path to serve based on the request URL
  let filePath = 'public' + (req.url === '/' ? '/index.html' : req.url);
  const ext = path.extname(filePath);
  const contentType = getContentType(ext);

  fs.readFile(filePath, (err, content) => {
    if (err) {
      // File not found or other error
      res.writeHead(404);
      res.end('404 Not Found');
    } else {
      // Successful read; serve file with appropriate content type
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
