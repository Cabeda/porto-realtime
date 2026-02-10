const fs = require('fs');
const path = require('path');

const swPath = path.join(__dirname, '..', 'public', 'sw.js');
const buildTimestamp = Date.now().toString();

console.log('[Build] Updating service worker version to:', buildTimestamp);

// Read the service worker file
let swContent = fs.readFileSync(swPath, 'utf8');

// Replace the placeholder with actual timestamp
swContent = swContent.replace('{{BUILD_TIMESTAMP}}', buildTimestamp);

// Write back
fs.writeFileSync(swPath, swContent, 'utf8');

console.log('[Build] Service worker version updated successfully');
