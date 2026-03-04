import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const cliArgs = process.argv.slice(2);
const showSecrets = cliArgs.includes('--show-secrets');
const positionalArgs = cliArgs.filter((arg) => !arg.startsWith('--'));

const customerId = process.env.AGORA_CUSTOMER_ID;
const customerSecret = process.env.AGORA_CUSTOMER_SECRET;
const appId = process.env.AGORA_APP_ID;
const region = process.env.AGORA_INGRESS_REGION || 'us-east-1';

let channelName = positionalArgs[0] || process.env.AGORA_CHANNEL_NAME || 'item-001';
let uid = String(positionalArgs[1] ?? process.env.AGORA_HOST_UID ?? '0');

const looksLikeEditorLink = (value) => /_vscodecontentref_|^https?:\/\//i.test(String(value ?? ''));
if (looksLikeEditorLink(channelName)) {
  console.warn('Channel argument looked like an editor link. Falling back to channel "item-001".');
  channelName = 'item-001';
}

if (!/^\d+$/.test(uid)) {
  console.warn(`UID "${uid}" is not numeric. Falling back to uid "0".`);
  uid = '0';
}

const missing = [];
if (!customerId) missing.push('AGORA_CUSTOMER_ID');
if (!customerSecret) missing.push('AGORA_CUSTOMER_SECRET');
if (!appId) missing.push('AGORA_APP_ID');

if (missing.length > 0) {
  console.error(`Missing required env vars in .env.local: ${missing.join(', ')}`);
  process.exit(1);
}

function maskSecret(value, visibleStart = 3, visibleEnd = 2) {
  const raw = String(value ?? '');
  if (!raw) {
    return '(empty)';
  }

  if (raw.length <= visibleStart + visibleEnd) {
    return '*'.repeat(raw.length);
  }

  const start = raw.slice(0, visibleStart);
  const end = raw.slice(-visibleEnd);
  const middle = '*'.repeat(Math.max(raw.length - visibleStart - visibleEnd, 4));
  return `${start}${middle}${end}`;
}

function renderValue(value, visibleStart, visibleEnd) {
  return showSecrets ? String(value ?? '(empty)') : maskSecret(value, visibleStart, visibleEnd);
}

console.log('Loaded env (masked):');
console.log(`- AGORA_APP_ID: ${renderValue(appId, 4, 4)}`);
console.log(`- AGORA_CUSTOMER_ID: ${renderValue(customerId, 4, 3)}`);
console.log(`- AGORA_CUSTOMER_SECRET: ${renderValue(customerSecret, 2, 2)}`);
console.log(`- AGORA_INGRESS_REGION: ${region}`);
console.log(`- channelName: ${channelName}`);
console.log(`- uid: ${uid}`);

const looksLikePlaceholder = (value) => {
  const normalized = String(value || '').trim().toUpperCase();
  return normalized.startsWith('YOUR_') || normalized.includes('PLACEHOLDER');
};

if (looksLikePlaceholder(customerId) || looksLikePlaceholder(customerSecret)) {
  console.error('AGORA_CUSTOMER_ID / AGORA_CUSTOMER_SECRET still look like placeholder values.');
  process.exit(1);
}

const credentials = Buffer.from(`${customerId}:${customerSecret}`).toString('base64');

function normalizeRegionCandidates(inputRegion) {
  const raw = String(inputRegion || '').trim().toLowerCase();
  const set = new Set();

  if (raw) {
    set.add(raw);
  }

  const map = {
    'us-east-1': 'na',
    'us-west-1': 'na',
    'us-west-2': 'na',
    'north-america': 'na',
    'na': 'na',
    'eu-west-1': 'eu',
    'eu-central-1': 'eu',
    'europe': 'eu',
    'eu': 'eu',
    'ap-southeast-1': 'ap',
    'ap-southeast-2': 'ap',
    'ap-northeast-1': 'ap',
    'asia': 'ap',
    'ap': 'ap',
    'cn': 'cn',
    'china': 'cn',
  };

  if (raw && map[raw]) {
    set.add(map[raw]);
  }

  set.add('na');
  set.add('ap');
  set.add('eu');
  set.add('cn');

  return Array.from(set);
}

function buildEndpointCandidates(appIdValue, regionValue) {
  const regions = normalizeRegionCandidates(regionValue);
  const endpoints = [];

  for (const r of regions) {
    endpoints.push(`https://api.agora.io/${r}/v1/projects/${appIdValue}/rtls/ingress/streamkeys`);
  }

  endpoints.push(`https://api.agora.io/v1/projects/${appIdValue}/rtls/ingress/streamkeys?region=${encodeURIComponent(regionValue)}`);

  return endpoints;
}

function buildBodyVariants(channelNameValue, uidValue, regionValue) {
  const uidNumber = Number(uidValue);
  const uidNumeric = Number.isFinite(uidNumber) ? uidNumber : 0;

  return [
    {
      label: 'channelName+uid(number)+region',
      body: { channelName: channelNameValue, uid: uidNumeric, region: regionValue },
    },
    {
      label: 'cname+uid(number)+region',
      body: { cname: channelNameValue, uid: uidNumeric, region: regionValue },
    },
    {
      label: 'channelName+uid(number)',
      body: { channelName: channelNameValue, uid: uidNumeric },
    },
  ];
}

function pickFirstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

try {
  const endpoints = buildEndpointCandidates(appId, region);
  const methods = ['POST', 'PUT'];
  const attempts = [];
  let response;
  let data;
  let matchedEndpoint = null;
  let matchedMethod = null;
  let matchedPayloadLabel = null;

  for (const endpoint of endpoints) {
    const endpointRegionMatch = endpoint.match(/^https:\/\/api\.agora\.io\/([^/]+)\//i);
    const endpointRegion = endpointRegionMatch ? endpointRegionMatch[1].toLowerCase() : region;
    const bodyVariants = buildBodyVariants(channelName, uid, endpointRegion);

    for (const method of methods) {
      for (const payloadVariant of bodyVariants) {
        const currentResponse = await fetch(endpoint, {
          method,
          signal: AbortSignal.timeout(10000),
          headers: {
            Authorization: `Basic ${credentials}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payloadVariant.body),
        });

        const rawText = await currentResponse.text();
        let parsed;
        try {
          parsed = JSON.parse(rawText);
        } catch {
          parsed = { raw: rawText };
        }

        attempts.push({
          endpoint,
          method,
          payload: payloadVariant.label,
          status: currentResponse.status,
          requestId:
            currentResponse.headers.get('x-request-id') ||
            currentResponse.headers.get('x-custom-request-id') ||
            null,
          resourceId: currentResponse.headers.get('x-resource-id') || null,
          message: typeof parsed?.message === 'string' ? parsed.message : null,
        });

        if (currentResponse.ok) {
          response = currentResponse;
          data = parsed;
          matchedEndpoint = endpoint;
          matchedMethod = method;
          matchedPayloadLabel = payloadVariant.label;
          break;
        }
      }

      if (response?.ok) {
        break;
      }
    }

    if (response?.ok) {
      break;
    }
  }

  if (!response) {
    response = { ok: false, status: 0 };
    data = { message: 'No request was sent.' };
  }

  if (response.ok) {
    console.log('Request endpoint:', matchedEndpoint);
    console.log('HTTP method:', matchedMethod);
    console.log('Payload variant:', matchedPayloadLabel);
    console.log('HTTP status:', response.status);
    console.log('Response:');
    console.log(JSON.stringify(data, null, 2));
  } else {
    const bestAttempt = attempts.find((item) => item.status !== 404) || attempts[0] || null;
    console.log('No successful endpoint variant found.');
    if (bestAttempt) {
      console.log('Best attempt endpoint:', bestAttempt.endpoint);
      console.log('Best attempt method:', bestAttempt.method);
      console.log('Best attempt payload:', bestAttempt.payload);
      console.log('Best attempt status:', bestAttempt.status);
      if (bestAttempt.requestId) {
        console.log('Best attempt X-Request-ID:', bestAttempt.requestId);
      }
      if (bestAttempt.resourceId) {
        console.log('Best attempt X-Resource-ID:', bestAttempt.resourceId);
      }
      if (bestAttempt.message) {
        console.log('Best attempt message:', bestAttempt.message);
      }
    }
    console.log('Attempt summary:');
    console.log(JSON.stringify(attempts, null, 2));

    if (attempts.some((item) => item.status === 401)) {
      console.log('\nAuth hint: use Agora REST API Customer ID + Customer Secret (NOT App ID / App Certificate).');
    }
  }

  const server = pickFirstString(
    data?.server,
    data?.ingestServer,
    data?.rtmpServer,
    data?.data?.server,
    data?.data?.ingestServer,
    data?.data?.rtmpServer,
  );

  const streamKey = pickFirstString(
    data?.streamKey,
    data?.key,
    data?.stream_key,
    data?.data?.streamKey,
    data?.data?.key,
    data?.data?.stream_key,
  );

  if (server || streamKey) {
    console.log('\nOBS Settings');
    console.log(`Server: ${server ?? '(not provided in response)'}`);
    console.log(`Stream Key: ${streamKey ?? '(not provided in response)'}`);
  } else {
    console.log('\nOBS Settings not found in known fields. Use the JSON response above to map fields.');
  }

  if (!response.ok) {
    process.exit(1);
  }
} catch (error) {
  console.error('Request failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
}
