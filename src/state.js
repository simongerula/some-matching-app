// Tiny module holding runtime state that multiple handler modules need
// (currently: the bot's own user id, set once at boot).
let botUserId = null;

module.exports = {
  get botUserId() {
    return botUserId;
  },
  set botUserId(value) {
    botUserId = value;
  },
};
