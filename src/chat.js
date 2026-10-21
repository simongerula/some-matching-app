// Light social handlers: match-DM buttons, app mentions, DM chatter.
// The "AI agent" voice of the demo lives here (canned for now).
const { pick, chatter } = require('./content');

module.exports.register = (app) => {
  app.action('match_snooze', async ({ ack, body, say }) => {
    await ack();
    await say(`<@${body.user.id}> snoozed the catchup - I will gently poke later. :zzz:`);
  });

  app.action('match_skip', async ({ ack, body, say }) => {
    await ack();
    await say(`<@${body.user.id}> skipped this round. Next one might be better! :fist_oncoming:`);
  });

  app.event('app_mention', async ({ event, say }) => {
    await say(`<@${event.user}> ${pick(chatter)}`);
  });

  app.message(async ({ message, client, logger }) => {
    if (message.bot_id || (message.subtype && message.subtype !== 'thread_broadcast')) return;
    if (message.channel_type !== 'im') return;
    try {
      await client.chat.postMessage({ channel: message.channel, text: `${pick(chatter)}` });
    } catch (err) {
      logger.error(err);
    }
  });
};
