// How many times we remember a pair meeting before we allow a rematch
const MAX_REMEMBERED_MEETS = 3;

function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function pairKey(a, b) {
  return [a, b].sort().join('|');
}

// Pairs up people greedily: each user matches the next eligible user it finds.
// `acceptable(a, b)` filters out mismatched intents / recently-met pairs.
function pairGreedy(people, acceptable) {
  const pool = shuffle(people);
  const used = new Set();
  const pairs = [];

  for (let i = 0; i < pool.length; i++) {
    if (used.has(pool[i])) continue;
    for (let j = i + 1; j < pool.length; j++) {
      if (used.has(pool[j])) continue;
      if (!acceptable(pool[i], pool[j])) continue;
      pairs.push([pool[i], pool[j]]);
      used.add(pool[i]);
      used.add(pool[j]);
      break;
    }
  }

  return { pairs, leftovers: pool.filter((u) => !used.has(u)) };
}

/**
 * Match registered users for this round.
 * @param {Array<{id: string, frequency: string, intent: string}>} users
 * @param {Array<{users: string[]}>} matches - stored match history
 * @returns {{pairs: Array<[user, user]>, singles: users}} pairs of user objects
 */
function buildPairs(users, matches) {
  const meetCount = new Map();
  for (const m of matches) {
    if (!m.users || m.users.length !== 2) continue;
    const key = pairKey(m.users[0], m.users[1]);
    meetCount.set(key, (meetCount.get(key) || 0) + 1);
  }
  const metTooOften = (a, b) => (meetCount.get(pairKey(a.id, b.id)) || 0) >= MAX_REMEMBERED_MEETS;

  let candidates = users.filter((u) => u && u.id);
  const pairs = [];

  const strategies = [
    (a, b) => a.intent === b.intent && a.frequency === b.frequency,
    (a, b) => a.intent === b.intent,
    () => true,
  ];

  for (const strategy of strategies) {
    if (candidates.length < 2) break;
    const result = pairGreedy(candidates, (a, b) => strategy(a, b) && !metTooOften(a, b));
    pairs.push(...result.pairs);
    candidates = result.leftovers;
  }

  // Absolute fallback: pair the rest even if they met recently
  if (candidates.length > 1) {
    const result = pairGreedy(candidates, () => true);
    pairs.push(...result.pairs);
    candidates = result.leftovers;
  }

  return { pairs, singles: candidates };
}

module.exports = { buildPairs, pairKey, shuffle };
