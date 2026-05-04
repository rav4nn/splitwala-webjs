#!/usr/bin/env node
'use strict';

// One-time interactive script to generate a TG_USER_SESSION string.
// Run once: node tg/test-harness/login.js
// Copy the printed session string into your .env as TG_USER_SESSION=...

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const { TelegramClient } = require('telegram');
const { StringSession }  = require('telegram/sessions');
const { ConnectionTCPAbridged } = require('telegram/network');
const input              = require('input');

const apiId   = Number(process.env.TG_API_ID);
const apiHash = process.env.TG_API_HASH;

if (!apiId || !apiHash) {
  console.error('Set TG_API_ID and TG_API_HASH in .env first.');
  console.error('Get them from https://my.telegram.org → API development tools.');
  process.exit(1);
}

(async () => {
  const client = new TelegramClient(new StringSession(''), apiId, apiHash, {
    connection:        ConnectionTCPAbridged,
    connectionRetries: 5,
    requestRetries:    5,
    timeout:           30,
  });

  await client.start({
    phoneNumber: () => input.text('Your phone number (with country code, e.g. +91...): '),
    phoneCode:   () => input.text('Telegram code sent to your phone: '),
    password:    () => input.text('2FA password (leave blank if none): '),
    onError:     err => console.error('Auth error:', err.message),
  });

  const me = await client.getMe();
  console.log(`\nLogged in as: ${me.username || me.id}`);

  const sessionString = client.session.save();
  console.log('\n=== Copy this into your .env as TG_USER_SESSION ===');
  console.log(sessionString);
  console.log('===================================================\n');

  await client.disconnect();
})();
