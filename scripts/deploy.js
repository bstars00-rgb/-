const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DOCS = path.join(ROOT, 'docs');
const OUTPUT = path.join(ROOT, 'output');

// Find latest dashboard HTML
const htmlFiles = fs.readdirSync(OUTPUT)
  .filter(f => f.startsWith('OMH_Weekly_Dashboard_') && f.endsWith('.html'))
  .sort()
  .reverse();

if (htmlFiles.length === 0) {
  console.error('No dashboard HTML found in output/. Run generate-weekly.js first.');
  process.exit(1);
}

const latest = htmlFiles[0];
const dateMatch = latest.match(/(\d{4}-\d{2}-\d{2})/);
const dateStr = dateMatch ? dateMatch[1] : 'latest';

console.log(`Deploying: ${latest}`);

// Inject password gate (docs pages are public on GitHub Pages)
function withGate(html) {
  if (html.includes('omh-gate') || html.includes('loginOverlay')) return html; // 자체 로그인 있는 페이지는 게이트 주입 안 함(이중 비번 방지)
  const snippet = fs.readFileSync(path.join(__dirname, 'gate-snippet.html'), 'utf8');
  const m = html.match(/<body[^>]*>/i);
  if (!m) return html;
  return html.replace(m[0], m[0] + '\n' + snippet);
}

// Copy to docs/index.html
if (!fs.existsSync(DOCS)) fs.mkdirSync(DOCS);
const gated = withGate(fs.readFileSync(path.join(OUTPUT, latest), 'utf8'));
fs.writeFileSync(path.join(DOCS, 'index.html'), gated);

// Also keep archive
fs.writeFileSync(path.join(DOCS, latest), gated);

console.log('Updated docs/index.html (password gate applied)');

// Git commit & push
try {
  execSync('git add docs/', { cwd: ROOT, stdio: 'inherit' });
  execSync(`git commit -m "Weekly Report ${dateStr}" --allow-empty`, { cwd: ROOT, stdio: 'inherit' });
  execSync('git push', { cwd: ROOT, stdio: 'inherit' });
  console.log(`\nDeployed! URL: https://bstars00-rgb.github.io/-/`);
  console.log(`Archive: https://bstars00-rgb.github.io/-/${latest}`);
} catch (e) {
  console.error('Git push failed:', e.message);
}
