const path = require('path');

const COFFEE_CHANNEL = 'coffee-catchup';
const GENERAL_CHANNEL = 'general';

// Persistence file lives at the repo root, data/ (gitignored)
const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'store.json');

function load() {
  try {
    return JSON.parse(require('fs').readFileSync(FILE, 'utf8'));
  } catch {
    return { users: {}, matches: [] };
  }
}

function save(state = store) {
  require('fs').mkdirSync(DATA_DIR, { recursive: true });
  require('fs').writeFileSync(FILE, JSON.stringify(state, null, 2));
}

const store = load();

// Removes a user and any match history that references them.
// Returns true if the user existed.
function removeUser(id) {
  if (!store.users[id]) return false;
  delete store.users[id];
  store.matches = store.matches.filter((m) => !m.users.includes(id));
  save();
  return true;
}

module.exports = {
  save,
  removeUser,
  users: store.users,
  matches: store.matches,
  COFFEE_CHANNEL,
  GENERAL_CHANNEL,
  FILE,
};
