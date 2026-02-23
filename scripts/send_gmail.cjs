#!/usr/bin/env node
/**
 * Send an email via Gmail SMTP using an App Password.
 *
 * Credentials file format (~/.openclaw/credentials/gmail-smtp.json):
 * {
 *   "user": "1duanagent@gmail.com",
 *   "appPassword": "xxxx xxxx xxxx xxxx",
 *   "fromName": "lala醬"
 * }
 *
 * Usage:
 *   node scripts/send_gmail.cjs --to someone@example.com --subject "Hi" --text "Hello"
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const nodemailer = require('nodemailer');

function arg(name) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

const to = arg('to');
const subject = arg('subject') ?? '';
let text = arg('text') ?? '';
// Allow passing literal "\\n" sequences via CLI args and convert them to real newlines.
text = text.replace(/\\n/g, "\n");

if (!to) {
  console.error('Missing --to');
  process.exit(2);
}

const credPath = path.join(os.homedir(), '.openclaw', 'credentials', 'gmail-smtp.json');
if (!fs.existsSync(credPath)) {
  console.error(`Missing credentials file: ${credPath}`);
  process.exit(3);
}

let creds;
try {
  creds = JSON.parse(fs.readFileSync(credPath, 'utf8'));
} catch (e) {
  console.error(`Failed to read/parse credentials file: ${credPath}`);
  console.error(e?.message ?? String(e));
  process.exit(4);
}

const user = creds.user;
const appPassword = creds.appPassword;
const fromName = creds.fromName ?? 'OpenClaw';

if (!user || !appPassword) {
  console.error('Credentials file must include: user, appPassword');
  process.exit(5);
}

(async () => {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user,
      pass: appPassword,
    },
  });

  const info = await transporter.sendMail({
    from: { name: fromName, address: user },
    to,
    subject,
    text,
  });

  console.log(JSON.stringify({ ok: true, messageId: info.messageId, accepted: info.accepted, rejected: info.rejected }, null, 2));
})().catch((err) => {
  console.error('Send failed');
  console.error(err);
  process.exit(1);
});
