#!/usr/bin/env node
/**
 * fetch-mfa-code.mjs
 *
 * Polls viktor.klasson@hotmail.com inbox for a recent MFA code email
 * and prints the code to stdout.
 *
 * Usage:
 *   node /app/fetch-mfa-code.mjs [timeout_seconds] [sender_keyword]
 *
 * Examples:
 *   node /app/fetch-mfa-code.mjs          # 60s timeout, any sender
 *   node /app/fetch-mfa-code.mjs 90       # 90s timeout
 *   node /app/fetch-mfa-code.mjs 60 salesys  # only emails with "salesys" in from/subject
 *
 * Exits 0 and prints the code on success.
 * Exits 1 on timeout or error (reason printed to stderr).
 */

import { ImapFlow } from 'imapflow';

const TIMEOUT_SECS = parseInt(process.argv[2] || '60', 10);
const SENDER_KEYWORD = (process.argv[3] || '').toLowerCase();
const POLL_INTERVAL_MS = 5000;

const client = new ImapFlow({
  host: 'outlook.office365.com',
  port: 993,
  secure: true,
  auth: {
    user: 'viktor.klasson@hotmail.com',
    pass: 'yqfqbubevgnisgwe',
  },
  logger: false,
});

async function searchForCode(sinceDate) {
  await client.mailboxOpen('INBOX');

  const uids = await client.search({ since: sinceDate });
  if (!uids.length) return null;

  // Fetch newest first
  for (const uid of [...uids].reverse()) {
    const msg = await client.fetchOne(String(uid), { envelope: true, source: true }, { uid: true });
    if (!msg?.source) continue;

    // Filter by sender/subject keyword if provided
    if (SENDER_KEYWORD) {
      const from = (msg.envelope?.from?.[0]?.address ?? '').toLowerCase();
      const subject = (msg.envelope?.subject ?? '').toLowerCase();
      if (!from.includes(SENDER_KEYWORD) && !subject.includes(SENDER_KEYWORD)) continue;
    }

    const body = msg.source.toString('utf-8');

    // Match 4–8 digit codes (most MFA codes are 6 digits)
    const match = body.match(/\b(\d{4,8})\b/);
    if (match) return match[1];
  }

  return null;
}

async function main() {
  const startTime = Date.now();
  // Look for emails that arrived up to 2 minutes before this script started
  // (in case of slight clock skew or delay between the MFA request and polling)
  const sinceDate = new Date(startTime - 2 * 60 * 1000);

  console.error(`Polling inbox for MFA code (timeout: ${TIMEOUT_SECS}s)...`);

  await client.connect();

  try {
    while (Date.now() - startTime < TIMEOUT_SECS * 1000) {
      const code = await searchForCode(sinceDate);
      if (code) {
        console.log(code);
        process.exit(0);
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }

    console.error('Timeout: no MFA code found in inbox');
    process.exit(1);
  } finally {
    await client.logout().catch(() => {});
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
