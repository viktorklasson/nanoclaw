#!/usr/bin/env node
/**
 * list-drive-docs.mjs
 *
 * Lists all files in the SaleSys Docs Google Drive folder.
 * Outputs tab-separated: fileId \t name \t mimeType
 *
 * Usage: node /app/list-drive-docs.mjs
 */

import fs from 'fs';

const FOLDER_ID = '12hSSfU--5ELuSVcDNVOtg7abXTWUbYyF';
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

const res = await fetch(
  `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`'${FOLDER_ID}' in parents`)}&fields=files(id,name,mimeType)&pageSize=100&orderBy=name`,
  { headers: { Authorization: `Bearer ${access_token}` } }
);
const { files, error: listError } = await res.json();
if (listError) { console.error('Drive list failed:', listError.message); process.exit(1); }

files.forEach(f => console.log(`${f.id}\t${f.name}\t${f.mimeType}`));
