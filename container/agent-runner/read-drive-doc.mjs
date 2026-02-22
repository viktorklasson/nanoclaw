#!/usr/bin/env node
/**
 * read-drive-doc.mjs
 *
 * Reads a Google Drive file and prints its text content to stdout.
 * Exports Google Docs/Sheets/Slides as plain text. Downloads other files directly.
 *
 * Usage: node /app/read-drive-doc.mjs <fileId>
 */

import fs from 'fs';

const FILE_ID = process.argv[2];
if (!FILE_ID) { console.error('Usage: node read-drive-doc.mjs <fileId>'); process.exit(1); }

const OAUTH_PATH = process.env.GDRIVE_OAUTH_PATH || '/home/node/.gdrive-mcp/gcp-oauth.keys.json';
const CREDS_PATH = process.env.GDRIVE_CREDENTIALS_PATH || '/home/node/.gdrive-mcp/credentials.json';

const creds = JSON.parse(fs.readFileSync(CREDS_PATH, 'utf8'));
const oauthKeys = JSON.parse(fs.readFileSync(OAUTH_PATH, 'utf8'));

const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id: oauthKeys.installed.client_id,
    client_secret: oauthKeys.installed.client_secret,
    refresh_token: creds.refresh_token,
    grant_type: 'refresh_token',
  }),
});
const { access_token, error } = await refreshRes.json();
if (error) { console.error('Token refresh failed:', error); process.exit(1); }

// Get file metadata
const metaRes = await fetch(
  `https://www.googleapis.com/drive/v3/files/${FILE_ID}?fields=name,mimeType`,
  { headers: { Authorization: `Bearer ${access_token}` } }
);
const { name, mimeType, error: metaError } = await metaRes.json();
if (metaError) { console.error('File not found:', metaError.message); process.exit(1); }

console.error(`Reading: ${name} (${mimeType})`);

// Export Google Workspace docs as plain text; download everything else
let url;
if (mimeType === 'application/vnd.google-apps.document') {
  url = `https://www.googleapis.com/drive/v3/files/${FILE_ID}/export?mimeType=text/plain`;
} else if (mimeType === 'application/vnd.google-apps.spreadsheet') {
  url = `https://www.googleapis.com/drive/v3/files/${FILE_ID}/export?mimeType=text/csv`;
} else if (mimeType === 'application/vnd.google-apps.presentation') {
  url = `https://www.googleapis.com/drive/v3/files/${FILE_ID}/export?mimeType=text/plain`;
} else {
  url = `https://www.googleapis.com/drive/v3/files/${FILE_ID}?alt=media`;
}

const contentRes = await fetch(url, { headers: { Authorization: `Bearer ${access_token}` } });
if (!contentRes.ok) { console.error('Download failed:', contentRes.status, await contentRes.text()); process.exit(1); }

const text = await contentRes.text();
console.log(text);
