import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const PLACEHOLDER_EXCEPTIONS = [
  /YOUR_SUPABASE_SERVICE_ROLE_KEY/,
  /YOUR_EBAY_CLIENT_ID/,
  /YOUR_EBAY_CLIENT_SECRET/,
  /YOUR_AGORA_APP_ID/,
  /YOUR_AGORA_APP_CERTIFICATE/,
  /MY_GEMINI_API_KEY/,
  /MY_APP_URL/
];

const PATTERNS = [
  {
    name: 'Supabase service role key assignment',
    regex: /SUPABASE_SERVICE_ROLE_KEY\s*=\s*["'](?!YOUR_SUPABASE_SERVICE_ROLE_KEY)[^"'\n]+["']/g
  },
  {
    name: 'JWT-like token prefix',
    regex: /eyJhbGciOiJIUzI1Ni[^\s"']*/g
  },
  {
    name: 'Supabase secret key prefix (sbp_)',
    regex: /\bsbp_[A-Za-z0-9._-]+\b/g
  },
  {
    name: 'Private key block',
    regex: /-----BEGIN (?:RSA|OPENSSH|EC|PRIVATE) KEY-----/g
  }
];

const getTrackedFiles = () => {
  const output = execSync('git ls-files', { encoding: 'utf8' });
  return output
    .split(/\r?\n/)
    .map((file) => file.trim())
    .filter(Boolean)
    .filter((file) => !file.startsWith('node_modules/'));
};

const isAllowedPlaceholderLine = (line) => {
  return PLACEHOLDER_EXCEPTIONS.some((regex) => regex.test(line));
};

const run = () => {
  const files = getTrackedFiles();
  const findings = [];

  for (const file of files) {
    let content = '';

    try {
      content = readFileSync(file, 'utf8');
    } catch {
      continue;
    }

    const lines = content.split(/\r?\n/);

    for (const pattern of PATTERNS) {
      for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
        const line = lines[lineIndex];

        if (!pattern.regex.test(line)) {
          pattern.regex.lastIndex = 0;
          continue;
        }

        pattern.regex.lastIndex = 0;

        if (isAllowedPlaceholderLine(line)) {
          continue;
        }

        findings.push({
          file,
          lineNumber: lineIndex + 1,
          rule: pattern.name,
          snippet: line.trim().slice(0, 180)
        });
      }
    }
  }

  if (findings.length === 0) {
    console.log('Secret scan passed: no high-risk patterns found in tracked files.');
    process.exit(0);
  }

  console.error('Secret scan failed. Potential sensitive content detected:');
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.lineNumber} | ${finding.rule}`);
    console.error(`  ${finding.snippet}`);
  }

  process.exit(1);
};

run();
