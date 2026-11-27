import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const tracked = execFileSync('git', ['ls-files', '-z'], {
  encoding: 'utf8',
});
const files = tracked.split('\0').filter(Boolean);
const ignoredExtensions = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.pdf',
  '.lock',
]);
const patterns = [
  [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, 'private key'],
  [/sk_(?:live|test)_[A-Za-z0-9]{12,}/, 'Stripe key'],
  [/whsec_[A-Za-z0-9]{12,}/, 'Stripe webhook secret'],
  [/mongodb(?:\+srv)?:\/\/[^:\s]+:[^@\s]+@/, 'MongoDB credential URI'],
  [/AKIA[0-9A-Z]{16}/, 'AWS access key'],
];

let found = false;
for (const file of files) {
  if (
    file.endsWith('.env') ||
    file.includes('/.env.') ||
    file.includes('/tests/') ||
    file.includes('/test/') ||
    file.includes('.test.') ||
    file.includes('.spec.') ||
    ignoredExtensions.has(file.slice(file.lastIndexOf('.')))
  ) {
    continue;
  }
  let content;
  try {
    content = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  for (const [pattern, label] of patterns) {
    if (pattern.test(content)) {
      console.error(`::error title=Potential secret found::${file}: ${label}`);
      found = true;
    }
  }
}

if (found) process.exitCode = 1;
