import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const afterArg = process.argv[2];
const appId = process.env.AGORA_APP_ID;
const appCert = process.env.AGORA_APP_CERTIFICATE;
const channelName = afterArg || process.env.AGORA_CHANNEL_NAME || 'YOUR_CHANNEL_NAME';
const uid = Number(process.argv[3] ?? process.env.AGORA_HOST_UID ?? 0); // 0 means any host UID

if (!appId || !appCert) {
  console.error('Missing AGORA_APP_ID or AGORA_APP_CERTIFICATE in .env.local');
  process.exit(1);
}

const expirationTime = Math.floor(Date.now() / 1000) + 86400; // 24 hours

const content = `${appId}\n${expirationTime}\n${channelName}\n${uid}`;

const signature = crypto
  .createHmac('sha256', appCert)
  .update(content)
  .digest('hex');

const streamKey = `${appId}:${channelName}:${uid}:${expirationTime}:${signature}`;
const encoded = Buffer.from(streamKey).toString('base64');

console.log('Your Stream Key:', encoded);
