#!/usr/bin/env node
/**
 * get-customer-token.mjs
 *
 * Gets a SaleSys customer bearer token for a given username.
 * No email polling — uses the cookie returned by the POST response directly.
 *
 * Usage:
 *   node /app/get-customer-token.mjs <username>
 *
 * Exits 0 and prints the token (support-...) on success.
 * Exits 1 on error (reason printed to stderr).
 */

const USERNAME = process.argv[2];
const ADMIN_TOKEN = process.env.SALESYS_API_TOKEN;
const ADMIN_BASE = process.env.SALESYS_ADMIN_API_BASE_URL || 'https://admin.salesys.se/api';
const APP_BASE = process.env.SALESYS_APP_API_BASE_URL || 'https://app.salesys.se/api';

if (!USERNAME) {
  console.error('Usage: node get-customer-token.mjs <username>');
  process.exit(1);
}
if (!ADMIN_TOKEN) {
  console.error('SALESYS_API_TOKEN not set');
  process.exit(1);
}

// Step 1: POST support-v1 with admin token — response sets s2_supportToken_{userId} cookie
const postRes = await fetch(`${ADMIN_BASE}/users/support-v1`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${ADMIN_TOKEN}`,
    'Content-Type': 'application/json',
    Referer: 'https://admin.salesys.se/',
  },
  body: JSON.stringify({ username: USERNAME }),
});

if (postRes.status !== 201) {
  const body = await postRes.text().catch(() => '');
  console.error(`POST support-v1 failed: HTTP ${postRes.status} — ${body}`);
  process.exit(1);
}

// Extract s2_supportToken_{userId} from Set-Cookie headers
const postCookies = postRes.headers.getSetCookie?.() ?? [postRes.headers.get('set-cookie') ?? ''];
let userId = '';
let supportCookie = '';
for (const c of postCookies) {
  const m = c.match(/s2_supportToken_([a-f0-9]+)=([^;]+)/);
  if (m) {
    userId = m[1];
    supportCookie = `s2_supportToken_${m[1]}=${m[2]}`;
    break;
  }
}

if (!userId) {
  console.error('No s2_supportToken cookie in POST response — is the username correct?');
  process.exit(1);
}

// Step 2: GET support-v1?userId=... with the support cookie — response sets s2_utoken
const getRes = await fetch(`${APP_BASE}/users/support-v1?userId=${userId}`, {
  redirect: 'manual',
  headers: {
    'Content-Type': 'application/json',
    Cookie: supportCookie,
  },
});

const getCookies = getRes.headers.getSetCookie?.() ?? [getRes.headers.get('set-cookie') ?? ''];
for (const c of getCookies) {
  const m = c.match(/s2_utoken=([^;]+)/);
  if (m) {
    console.log(m[1]);
    process.exit(0);
  }
}

console.error(`No s2_utoken in GET response (HTTP ${getRes.status})`);
process.exit(1);
