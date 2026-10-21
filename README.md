# Coffee Matchup :coffee:

A Slack bot that randomly matches teammates for chat catchups. Built as a hackathon demo, aimed to end with an AWS deployment (see the docs at the bottom).

## The experience

1. **Someone joins #general** - the bot sends them a friendly DM with a "Set my taste" button.
2. **Click the button**, a little quiz pops up: How often do you want a catchup? (weekly / every 2 weeks / monthly) and What kind? (coffee & small talk / fun & games / skill learning).
3. **They're in** - they get added to `#coffee-catchup` and announced to the pool.
4. **A topic floats in** - anyone can run `/coffee-theme` to post a discussion question for the round ("What is a small win you had this week that nobody here knows about?").
5. **Match time!** - anyone runs `/matchup`. The bot pairs people who haven't met recently, and for every pair it creates a **group chat between the two people and the bot**, with the round's theme and an icebreaker to kick things off. Snooze or skip buttons included.
6. **No partner this round?** You get a "solo self-catchup" DM instead - grab a coffee and enjoy it on your own. (This also means the demo works great with a single user.)
7. Say hello in any of the bot's DMs and it will cheer you on.

## Setup

1. Create the app without writing Slack config by hand: at `api.slack.com/apps` → **Create New App → From a manifest** → pick your workspace → paste the contents of `manifest.yml`.
2. Collect three credentials (details in [ARCHITECTURE.md](ARCHITECTURE.md#credentials--trust)) and put them in `.env` (start from `.env.example`):
   - `SLACK_BOT_TOKEN` (xoxb, from *Install to Workspace*)
   - `SLACK_SIGNING_SECRET` (Basic Information)
   - `SLACK_APP_TOKEN` (xapp, app-level token with `connections:write`)
3. `npm start` - you'll see `Coffee Matchup running in Socket Mode`.
4. In Slack, `/invite @Coffee Matchup` to `#general`. That's it.

## 5-minute demo script

1. (Re-)add a teammate (or yourself) to `#general` → the DM arrives instantly.
2. Click the button, answer the two questions → they appear in `#coffee-catchup`.
3. Run `/coffee-theme` to post the topic of the week.
4. Run `/matchup` → matches announced in the channel, pair DMs open with icebreakers.
5. Bonus: type in a match DM - the "agent" replies with encouragement (canned for the demo; the LLM hookup is a roadmap item below).

## Where to go next

- [ARCHITECTURE.md](ARCHITECTURE.md) - technical: how the app talks to Slack (Socket Mode now, HTTP/Lambda for prod), manifest, credentials, storage.
- [SPIKE-AWS.md](SPIKE-AWS.md) - research + migration plan for hosting on AWS.
- `.github/workflows/update-slack-manifest.yml` - pushes `manifest.yml` changes to Slack automatically (setup steps also in ARCHITECTURE.md).

## Repo layout

```
├── manifest.yml                     # Slack app config (single source of truth, pushed to Slack by CI)
├── src/
│   ├── app.js                       # Bolt wiring + boot
│   ├── onboarding.js                # join #general -> button -> modal -> invite to #coffee-catchup
│   ├── matchup.js                   # /matchup (pairing, DMs, solo catchups) + /coffee-theme
│   ├── chat.js                      # snooze/skip buttons, mentions, DM chatter
│   ├── blocks.js                    # all Block Kit message builders
│   ├── channels.js                  # channel find/create/join, pool cleanup
│   ├── store.js                     # persistence (data/store.json)
│   ├── pairing.js                   # pair-selection algorithm
│   ├── content.js                   # weekly themes, icebreakers, canned replies
│   └── state.js                     # tiny shared runtime state
├── scripts/push-manifest.js         # CI: manifest.yml -> Slack
├── data/store.json                  # runtime data (gitignored)
├── .env.example                     # template for the 3 Slack credentials
└── ARCHITECTURE.md / SPIKE-AWS.md   # technical docs
```

## Ideas roadmap

- Hook the "agent" up to a real LLM (themes, icebreakers, DM replies)
- Scheduled automatic matching (so `/matchup` isn't manual)
- Nudges when a match chat stays silent for 2 days
- After-catchup ratings that influence future pairings
- Badges ("First catchup", "5 catchups", "Most social teammate")
- Proper group mode (game nights of 4 instead of pairs)
