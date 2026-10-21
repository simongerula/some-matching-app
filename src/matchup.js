// /matchup (pairing + DMs + solo catchups) and /coffee-theme (weekly theme post).
const store = require('./store');
const { buildPairs } = require('./pairing');
const { pick, pickTheme, icebreakers } = require('./content');
const { matchBlocks } = require('./blocks');
const { ensureCoffeeChannel, pruneStaleUsers } = require('./channels');

module.exports.register = (app) => {
  app.command('/coffee-theme', async ({ ack, respond, body, client, logger }) => {
    await ack();
    const theme = pickTheme();
    try {
      await client.chat.postMessage({
        channel: body.channel_id,
        blocks: [
          {
            type: 'section',
            text: { type: 'mrkdwn', text: `:speech_balloon: *This week's catchup theme:*\n${theme.title}` },
          },
          {
            type: 'context',
            elements: [{ type: 'mrkdwn', text: 'React if you are in the mood - and run </matchup> to pair people up!' }],
          },
        ],
      });
      await respond({ text: 'Theme posted :ok_hand:', response_type: 'ephemeral' });
    } catch (err) {
      logger.error(err);
      await respond({
        text: `I could not post here (${err.message || err}). Am I a member of this channel?`,
        response_type: 'ephemeral',
      });
    }
  });

  app.command('/matchup', async ({ ack, respond, client, logger }) => {
    await ack();

    try {
      const channel = await ensureCoffeeChannel(client);
      const pruned = await pruneStaleUsers(client, logger);
      const theme = pickTheme();
      const { pairs, singles } = buildPairs(Object.values(store.users), store.matches);

      if (pairs.length === 0 && singles.length === 0) {
        await respond({
          text:
            'Nobody eligible to match yet. People need to click "Set my taste" after I DM them when they join <#general>.',
          response_type: 'ephemeral',
        });
        return;
      }
      if (pruned.length) {
        await respond({
          text: `Removed ${pruned.length} stale user(s) from the pool (${pruned.map((u) => `<@${u}>`).join(', ')} - profile no longer exists). Matching continues without them.`,
          response_type: 'ephemeral',
        });
      }

      let summary = `:tada: *This round's catchups* - theme: _${theme.title}_\n`;
      let dmFailures = 0;
      for (const [a, b] of pairs) {
        let sent = false;
        try {
          const dm = await client.conversations.open({ users: `${a.id},${b.id}` });
          await client.chat.postMessage({
            channel: dm.channel.id,
            blocks: matchBlocks(a, b, theme.title),
          });
          sent = true;
        } catch (err) {
          dmFailures++;
          // e.g. invalid_user_combination: the people don't share a channel (or
          // one of them is a guest/external user). Announce in the channel instead.
          logger.warn(`Could not open pair DM for ${a.id}+${b.id}: ${err}`);
          try {
            await client.chat.postMessage({
              channel: channel.id,
              blocks: [
                {
                  type: 'section',
                  text: {
                    type: 'mrkdwn',
                    text: `:coffee: Match announcement for <@${a.id}> and <@${b.id}> - slacks DM service refused me, so go say hi yourselves! ${pick(icebreakers)}`,
                  },
                },
              ],
            });
          } catch (err2) {
            logger.error(err2);
          }
          summary += `\n• <@${a.id}> + <@${b.id}> (could not DM directly - announced in <#${channel.id}> instead :loudspeaker:)`;
        }
        if (sent) summary += `\n• <@${a.id}> + <@${b.id}> (DM sent :mailbox:)`;
      }

      // No pair available (e.g. you are the only registered user): the single
      // still gets a DM and does a solo self-catchup instead of sitting out.
      for (const s of singles) {
        let sent = false;
        try {
          const dm = await client.conversations.open({ users: s.id });
          await client.chat.postMessage({
            channel: dm.channel.id,
            blocks: matchBlocks(s, null, theme.title),
          });
          sent = true;
        } catch (err) {
          logger.warn(`Could not open solo DM for ${s.id}: ${err}`);
          try {
            await client.chat.postMessage({
              channel: s.id,
              text: `:coffee: Solo catchup for <@${s.id}> - I could not DM you directly (${String(err).includes('invalid_user_combination') ? 'check if this is a guest/external account' : 'see app logs'}). ${pick(icebreakers)}`,
            });
          } catch (err2) {
            logger.error(err2);
          }
          summary += `\n• <@${s.id}> -> solo self-catchup (see channel :loudspeaker:)`;
        }
        if (sent) summary += `\n• <@${s.id}> -> solo self-catchup (DM sent :sunny:)`;
      }

      if (dmFailures > 0) {
        summary += `\n\n:warning: ${dmFailures} match DM(s) could not be opened. If this mentions a guest or external user, Slack requires those people to already share a channel with you.`;
      }

      for (const [a, b] of pairs) {
        store.matches.push({
          users: [a.id, b.id],
          intent: a.intent,
          theme: theme.title,
          at: new Date().toISOString(),
        });
      }
      for (const s of singles) {
        store.matches.push({
          users: [s.id],
          intent: s.intent,
          theme: theme.title,
          at: new Date().toISOString(),
        });
      }
      store.save();

      await client.chat.postMessage({ channel: channel.id, text: summary });
      await respond({
        text: `Matched ${pairs.length} pair(s)${singles.length ? ` and ${singles.length} solo` : ''}. Summary in <#${channel.id}>.`,
        response_type: 'ephemeral',
      });
    } catch (err) {
      logger.error(err);
      await respond({ text: `Matching failed: ${err.message || err}`, response_type: 'ephemeral' });
    }
  });
};
