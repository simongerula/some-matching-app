// Channel find/create + pruning of stale (deleted) users out of the pool.
const store = require('./store');

// Finds #coffee-catchup, creating it and joining it when needed.
// Returns a conversations.list-style channel object.
async function ensureCoffeeChannel(client) {
  const list = await client.conversations.list({ types: 'public_channel', limit: 200 });
  let channel = list.channels?.find((c) => c.name === store.COFFEE_CHANNEL && !c.is_archived);

  if (!channel) {
    const created = await client.conversations.create({ name: store.COFFEE_CHANNEL });
    channel = created.channel;
  }

  if (!channel.is_member) {
    await client.conversations.join({ channel: channel.id });
  }
  return channel;
}

// Remove users that no longer exist in the workspace (deleted accounts leave
// ghost ids in the store and break conversations.open with misleading errors).
async function pruneStaleUsers(client, logger) {
  const removed = [];
  for (const id of Object.keys(store.users)) {
    try {
      const res = await client.users.info({ user: id });
      if (res.user?.deleted) removed.push(id);
    } catch (err) {
      if (err?.data?.error === 'user_not_found') removed.push(id);
      else logger.warn(`users.info failed for ${id}, keeping the entry: ${err}`);
    }
    if (removed.includes(id)) store.removeUser(id);
  }
  if (removed.length) {
    logger.warn(`Pruned stale users: ${removed.join(', ')}`);
  }
  return removed;
}

module.exports = { ensureCoffeeChannel, pruneStaleUsers };
