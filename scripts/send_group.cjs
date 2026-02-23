#!/usr/bin/env node
/**
 * Send an email to a named group (stored under ~/.openclaw/credentials/email-groups.json)
 * using Gmail SMTP credentials (stored under ~/.openclaw/credentials/gmail-smtp.json).
 *
 * Usage:
 *   node scripts/send_group.cjs --group "公司員工" --subject "..." --text "...\\n..."
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

const groupName = arg('group');
const subject = arg('subject') ?? '';
let text = arg('text') ?? '';
text = text.replace(/\\n/g, "\n");

if (!groupName) {
  console.error('Missing --group');
  process.exit(2);
}

const credDir = path.join(os.homedir(), '.openclaw', 'credentials');
const smtpPath = path.join(credDir, 'gmail-smtp.json');
const groupsPath = path.join(credDir, 'email-groups.json');

function readJson(p) {
  if (!fs.existsSync(p)) {
    console.error(`Missing file: ${p}`);
    process.exit(3);
  }
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    console.error(`Failed to parse JSON: ${p}`);
    console.error(e?.message ?? String(e));
    process.exit(4);
  }
}

const smtp = readJson(smtpPath);
const groups = readJson(groupsPath);
const group = groups?.groups?.[groupName];
if (!group) {
  console.error(`Unknown group: ${groupName}`);
  console.error(`Available groups: ${Object.keys(groups?.groups ?? {}).join(', ') || '(none)'}`);
  process.exit(5);
}

const user = smtp.user;
const appPassword = smtp.appPassword;
const fromName = smtp.fromName ?? 'OpenClaw';

if (!user || !appPassword) {
  console.error('SMTP credentials must include: user, appPassword');
  process.exit(6);
}

const emails = group.emails ?? [];
if (!Array.isArray(emails) || emails.length === 0) {
  console.error(`Group has no emails: ${groupName}`);
  process.exit(7);
}

const mode = (group.mode ?? 'bcc').toLowerCase();
const mail = {
  from: { name: fromName, address: user },
  subject,
  text,
};

// Use a harmless To when using Bcc so Gmail accepts the message.
if (mode === 'bcc') {
  mail.to = user;
  mail.bcc = emails;
} else if (mode === 'to') {
  mail.to = emails;
} else {
  console.error(`Unsupported group mode: ${group.mode}`);
  process.exit(8);
}

(async () => {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass: appPassword },
  });

  const info = await transporter.sendMail(mail);
  console.log(JSON.stringify({ ok: true, group: groupName, mode, messageId: info.messageId, accepted: info.accepted, rejected: info.rejected }, null, 2));
})().catch((err) => {
  console.error('Send failed');
  console.error(err);
  process.exit(1);
});
