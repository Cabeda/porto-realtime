const fs = require('fs');
const path = require('path');

const swPath = path.join(__dirname, '..', 'public', 'sw.js');
const packagePath = path.join(__dirname, '..', 'package.json');
const envPath = path.join(__dirname, '..', '.env.local');

// Read package.json to get version
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const appVersion = packageJson.version;
const buildTimestamp = Date.now().toString();

console.log('[Build] Updating service worker to version:', appVersion, 'Build:', buildTimestamp);

// Read the service worker file
let swContent = fs.readFileSync(swPath, 'utf8');

// Replace the version and timestamp values
swContent = swContent.replace(/const APP_VERSION = '[^']*';/, `const APP_VERSION = '${appVersion}';`);
swContent = swContent.replace(/const BUILD_TIMESTAMP = '[^']*';/, `const BUILD_TIMESTAMP = '${buildTimestamp}';`);

// Write back
fs.writeFileSync(swPath, swContent, 'utf8');

// Update .env.local with app version
const envContent = `NEXT_PUBLIC_APP_VERSION=${appVersion}\n`;
fs.writeFileSync(envPath, envContent, 'utf8');

console.log('[Build] Service worker version updated successfully');
console.log('[Build] Environment variable NEXT_PUBLIC_APP_VERSION set to:', appVersion);
