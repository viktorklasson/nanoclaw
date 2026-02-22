#!/usr/bin/env node
/**
 * fetch-mfa-code.mjs
 *
 * Polls viktor.klasson@hotmail.com inbox for a SaleSys service login email,
 * extracts the support URL, follows it, and prints the bearer token to stdout.
 *
 * Usage:
 *   node /app/fetch-mfa-code.mjs [timeout_seconds]
 *
 * Exits 0 and prints the token (login-...) on success.
 * Exits 1 on timeout or error (reason printed to stderr).
 */

import { ImapFlow } from 'imapflow';

const TIMEOUT_SECS = parseInt(process.argv[2] || '60', 10);
const POLL_INTERVAL_MS = 5000;

const client = new ImapFlow({
  host: 'imap.gmail.com',
  port: 993,
  secure: true,
  auth: {
    user: 'agana@salesys.se',
    pass: process.env.GMAIL_APP_PASSWORD || 'jgaiyrsivjgzhvub',
  },
  logger: false,
});

/**
 * Extract the SaleSys support URL from the email body.
 * Handles SafeLinks-wrapped URLs and plain URLs.
 */
function extractSupportUrl(body) {
  // SafeLinks: ?url=<encoded-url>&data=...
  const safeLinksMatch = body.match(
    /https:\/\/[a-z0-9]+\.safelinks\.protection\.outlook\.com\/\?url=(https%3A%2F%2Fapp\.salesys\.se%2Fapi%2Fusers%2Fsupport-v1%3F[^&\s"<>]+)/i,
  );
  if (safeLinksMatch) {
    return decodeURIComponent(safeLinksMatch[1]);
  }

  // Direct URL (no SafeLinks wrapping)
  const directMatch = body.match(
    /https:\/\/app\.salesys\.se\/api\/users\/support-v1\?[^\s"<>]+/i,
  );
  if (directMatch) {
    return directMatch[0];
  }

  return null;
}

/**
 * Follow the support URL and extract the bearer token from the response.
 */
async function fetchTokenFromUrl(supportUrl) {
  // Follow redirects manually so we can inspect each response's Set-Cookie
  let url = supportUrl;
  let token = null;

  for (let i = 0; i < 5; i++) {
    const res = await fetch(url, {
      redirect: 'manual',
      headers: { 'Content-Type': 'application/json' },
    });

    // Check Set-Cookie for s2_utoken
    const setCookie = res.headers.get('set-cookie') ?? '';
    const cookieMatch = setCookie.match(/s2_utoken=([^;,\s]+)/);
    if (cookieMatch) {
      token = cookieMatch[1];
      break;
    }

    // Check response body for login- token
    const body = await res.text().catch(() => '');
    const bodyMatch = body.match(/login-[A-Za-z0-9+/=]{20,}/);
    if (bodyMatch) {
      token = bodyMatch[0];
      break;
    }

    // Follow redirect
    const location = res.headers.get('location');
    if (location && (res.status === 301 || res.status === 302 || res.status === 303)) {
      url = location.startsWith('http') ? location : new URL(location, url).href;
      continue;
    }

    break;
  }

  return token;
}

async function searchForToken(sinceDate) {
  await client.mailboxOpen('INBOX');

  const uids = await client.search({ since: sinceDate });
  if (!uids.length) return null;

  for (const uid of [...uids].reverse()) {
    const msg = await client.fetchOne(String(uid), { envelope: true, source: true }, { uid: true });
    if (!msg?.source) continue;

    const subject = msg.envelope?.subject ?? '';
    // Decode quoted-printable encoding (soft line breaks and =XX sequences)
    const body = msg.source
      .toString('utf-8')
      .replace(/=\r?\n/g, '')
      .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

    // Only process SaleSys service login emails
    if (!subject.toLowerCase().includes('serviceinlogg') && !body.includes('salesys.se')) {
      continue;
    }

    const supportUrl = extractSupportUrl(body);
    if (!supportUrl) continue;

    console.error(`Found support URL: ${supportUrl}`);
    const token = await fetchTokenFromUrl(supportUrl);
    if (token) return token;
  }

  return null;
}

async function main() {
  const startTime = Date.now();
  // Look back 2 minutes to account for any delay between the API request and email arrival
  const sinceDate = new Date(startTime - 2 * 60 * 1000);

  console.error(`Polling inbox for SaleSys service login email (timeout: ${TIMEOUT_SECS}s)...`);

  await client.connect();

  try {
    while (Date.now() - startTime < TIMEOUT_SECS * 1000) {
      const token = await searchForToken(sinceDate);
      if (token) {
        console.log(token);
        process.exit(0);
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }

    console.error('Timeout: no SaleSys service login email found');
    process.exit(1);
  } finally {
    await client.logout().catch(() => {});
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
