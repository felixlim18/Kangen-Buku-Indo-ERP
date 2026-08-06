const fs = require('fs');
try {
  require('./dist/server.cjs');
  console.log("Server loaded fine");
} catch(e) {
  console.error("Error loading server:", e);
}
