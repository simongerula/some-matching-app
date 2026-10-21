// Coffee Matchup - Bolt app entrypoint. Wiring only; logic lives in src/*.
require('dotenv').config();

const { App } = require('@slack/bolt');
const state = require('./state');
const onboarding = require('./onboarding');
const matchup = require('./matchup');
const chat = require('./chat');

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

for (const key of ['SLACK_BOT_TOKEN', 'SLACK_APP_TOKEN', 'SLACK_SIGNING_SECRET']) {
  if (!process.env[key]) fail(`Missing ${key}. Copy .env.example to .env and fill it in.`);
}

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  // Bolt otherwise fires its own auth.test at init, which crashes unhandled on bad tokens
  tokenVerificationEnabled: false,
});

onboarding.register(app);
matchup.register(app);
chat.register(app);

(async () => {
  try {
    const auth = await app.client.auth.test();
    state.botUserId = auth.user_id;
  } catch (err) {
    fail(`Could not authenticate with SLACK_BOT_TOKEN: ${err.message || err}`);
  }

  try {
    await app.start();
  } catch (err) {
    fail(`Could not connect (check SLACK_APP_TOKEN has the connections:write scope): ${err.message || err}`);
  }
  console.log(`:coffee: Coffee Matchup running in Socket Mode (bot user: ${state.botUserId})`);
})();
