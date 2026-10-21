// Pushes manifest.yml to Slack via the Slack CLI.
// Needs two env vars:
//   SLACK_APP_ID        - the A0... id from the app settings page
//   SLACK_SERVICE_TOKEN - long-lived Slack CLI service token (slack auth token)
// SLACK_DRY_RUN=1 only prints the request body (no Slack call).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const yaml = require('js-yaml');

const appId = process.env.SLACK_APP_ID;
const serviceToken = process.env.SLACK_SERVICE_TOKEN;

if (!fs.existsSync(path.join(__dirname, '..', 'manifest.yml'))) {
  console.error('manifest.yml not found');
  process.exit(1);
}
if (!appId) {
  console.error('Missing SLACK_APP_ID (A0... code from the app settings page)');
  process.exit(1);
}

const manifest = yaml.load(fs.readFileSync(path.join(__dirname, '..', 'manifest.yml'), 'utf8'));

// apps.manifest.update receives the manifest as a JSON-encoded *string*
const body = JSON.stringify({ app_id: appId, manifest: JSON.stringify(manifest) });
const bodyFile = path.join(os.tmpdir(), 'manifest-body.json');
fs.writeFileSync(bodyFile, body);

if (process.env.SLACK_DRY_RUN) {
  console.log('Dry run - request body written to', bodyFile);
  process.exit(0);
}

if (!serviceToken) {
  console.error('Missing SLACK_SERVICE_TOKEN (slack auth token, see README)');
  process.exit(1);
}

function run(args) {
  const res = spawnSync('slack', args, { encoding: 'utf8', env: process.env, timeout: 120000 });
  const out = (res.stdout || '') + (res.stderr || '');
  let parsed = null;
  try {
    parsed = JSON.parse(out.match(/\{[\s\S]*\}/)?.[0] || '{}');
  } catch {}
  return { res, out, parsed };
}

// 1. validate first so schema problems surface without touching the app
const validate = run([
  'api', 'apps.manifest.validate', '--json', fs.readFileSync(bodyFile, 'utf8'),
  '--token', serviceToken, '--skip-update',
]);
if (!validate.parsed?.ok) {
  console.error('Manifest validation failed:\n', validate.out);
  process.exit(1);
}

// 2. actually update. NB: this replaces the whole app config with manifest.yml
const update = run([
  'api', 'apps.manifest.update', '--json', fs.readFileSync(bodyFile, 'utf8'),
  '--token', serviceToken, '--skip-update',
]);
if (update.res.status !== 0 || !update.parsed?.ok) {
  console.error('Manifest update failed:\n', update.out);
  process.exit(1);
}

console.log('Manifest updated on Slack. permissions_updated:', update.parsed.permissions_updated);
if (update.parsed.permissions_updated) {
  console.log(
    'Scopes changed - a workspace member needs to click "Reinstall to Workspace" in the app settings to grant them.'
  );
}
