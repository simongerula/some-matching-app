// Onboarding flow: user joins #general -> welcome DM -> button -> modal -> invite.
const state = require('./state');
const store = require('./store');
const { ensureCoffeeChannel } = require('./channels');
const { prefsModal, welcomeBlocks } = require('./blocks');

module.exports.register = (app) => {
  // When someone joins #general -> DM them the welcome card
  app.event('member_joined_channel', async ({ event, client, logger }) => {
    if (event.user === state.botUserId) return;

    let name;
    try {
      const info = await client.conversations.info({ channel: event.channel });
      name = info.channel?.name;
    } catch {
      return;
    }

    if (name === store.GENERAL_CHANNEL) {
      try {
        await client.chat.postMessage({
          channel: event.user,
          text: 'Welcome to Coffee Matchup! Click "Set my taste" to get matched.',
          blocks: welcomeBlocks(),
        });
      } catch (err) {
        logger.error(`Could not DM ${event.user}: ${err}`);
      }
    }

    if (name === store.COFFEE_CHANNEL) {
      try {
        await client.chat.postMessage({
          channel: event.channel,
          text: `:wave: <@${event.user}> joined the catchup pool!`,
        });
      } catch (err) {
        logger.error(err);
      }
    }
  });

  // Welcome button -> modal
  app.action('open_tastes_modal', async ({ ack, body, client, logger }) => {
    await ack();
    try {
      await client.views.open({ trigger_id: body.trigger_id, view: prefsModal() });
    } catch (err) {
      logger.error(err);
    }
  });

  // Modal submitted -> save prefs, invite to #coffee-catchup
  app.view('coffee_prefs_submit', async ({ ack, body, view, client, logger }) => {
    await ack();

    const frequency = view.state.values.frequency_block.frequency_select.selected_option?.value;
    const intent = view.state.values.intent_block.intent_select.selected_option?.value;
    const userId = body.user.id;

    store.users[userId] = { id: userId, frequency, intent, at: new Date().toISOString() };
    store.save();

    try {
      const channel = await ensureCoffeeChannel(client);
      try {
        await client.conversations.invite({ channel: channel.id, users: userId });
      } catch (err) {
        // already_in_channel errors are fine to ignore
        if (!String(err).includes('already_in_channel')) throw err;
      }
      await client.chat.postMessage({
        channel: userId,
        text: `:white_check_mark: All set! I will look for a *${intent}* buddy for you *${frequency}*. You have been added to <#${channel.id}>.`,
      });
      await client.chat.postMessage({
        channel: channel.id,
        text: `:dart: <@${userId}> joined the pool - wants *${intent}* catchups *${frequency}*.`,
      });
    } catch (err) {
      logger.error(err);
      await client.chat
        .postMessage({ channel: userId, text: 'Saved your answers, but I hit a snag setting up #coffee-catchup. Ask an admin to check my logs.' })
        .catch(() => {});
    }
  });
};
