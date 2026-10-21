# Architecture - demo (now) vs prod (AWS)

Same Bolt handler code in both. Only the transport (receiver) and the storage swap - that was the point of keeping all Slack/data logic behind interfaces (`src/app.js` handlers, `src/store.js`).

## DEMO - today (Socket Mode + mocked JSON store)

```
                    ① WebSocket (outbound, xapp- token)                     ② REST API (xoxb- token)
┌──────────────┐        events pushed to our app          ┌─────────────────────────┐      chat.postMessage
│              │  ←═══════ acks pushed back ════════       │   Coffee Matchup app    │ ─────▶  conversations.open
│    Slack     │ ──────────── / BOLT HANDLERS / ────────▶ │   Bolt JS, Node 22      │         ...
│ (buttons,    │      button clicks, modal submits,      │   one always-on process │
│  commands,   │      /matchup, /coffee-theme            └───────────┬─────────────┘
│  events)     │                                                      │ ③ read/write
└──────────────┘                                                      ▼
                                                        ┌─────────────────────────────┐
                                                        │  data/store.json            │
                                                        │  "the database" (file mock) │
                                                        └─────────────────────────────┘
```

Notes:
- Slack never calls us. Our process dials Slack first and holds the WebSocket open - that's why `npm start` from a laptop needs no public URL.
- Outbound actions (sending messages, opening DMs) are ordinary HTTPS REST calls with the bot token - not the WebSocket.
- `store.json` works because there is exactly one process and zero concurrency. That's the mock.

## PROD - target (AWS Lambda + Postgres)

```
┌──────────────┐   ① HTTPS POST /slack/events
│              │      commands, events, buttons            ┌──────────────────────────────┐
│    Slack     │ ◀──────────────────────────────────────── │  API Gateway (HTTP API)      │
│              │  ② 200 ack within 3 seconds               │  Lambda "slack-gateway"      │
└──────────────┘                                           │  AwsLambdaReceiver + Bolt    │
        │                                                  │  verifies signing secret     │
        │        ③ REST API calls (xoxb- token)            │  fast handlers only          │
        └───────────────────── ◀ ──────────────────────    └──────────────┬───────────────┘
        chat.postMessage / conversations.open                             │ ④ enqueue slow payloads
                                                                          ▼
                                                           ┌──────────────────────────────┐
                                                           │           SQS                │
                                                           │ (only /matchup-speed work)   │
                                                           └──────────────┬───────────────┘
                                                                          ▼
                                                           ┌──────────────────────────────┐
                                                           │  Lambda "match-worker"       │
                                                           │  same Bolt handlers, any slow│
                                                           │  work (DMs, retries, future  │
                                                           │  LLM calls)                  │
                                                           └──────────────┬───────────────┘
                                                                          │ ⑤ RDS Data API (HTTPS, no VPC)
                                                                          ▼
                                                           ┌──────────────────────────────┐
                                                           │  Postgres                    │
                                                           │  (Aurora Serverless v2 with  │
                                                           │   Data API - or Neon)        │
                                                           │  tables: users, matches      │
                                                           └──────────────────────────────┘

   Secrets (SLACK_BOT_TOKEN, DB creds) come from Secrets Manager / SSM - not from .env, not in the image.
```

Why Postgres instead of DynamoDB (as requested): table shape can change without a migration ceremony; real SQL for "who met whom and how often"; and the **RDS Data API** means Lambda talks to the database over plain HTTPS - no VPC, no security groups, no connection-pool plumbing. Aurora Serverless v2 scales down to near-zero when idle.

Flow:
1. Slack POSTs to `/slack/events`. The **signing secret** (HMAC over the request body) proves the request came from Slack - the app-level `xapp-` token is gone in this mode.
2. The gateway lambda acks inside Slack's 3-second window and returns. `/matchup` is slow (several web API calls), so its payload is dropped into SQS instead of being processed inline.
3. The worker lambda runs the same handler logic - it can take minutes if needed. Slack's event retries on the way in are deduped in the worker (check `event_id` / `X-Slack-Retry-Num` before doing real work).
4. Both lambdas reach Postgres via the Data API (HTTPS per statement).

## What moves when the DB swap happens

`src/store.js` gets a Postgres implementation behind the exact same interface the app already uses: read/write users as a table keyed by `user_id`, match history rows in `matches(user_a, user_b, intent, theme, at)`, and `removeUser()` deletes the user plus every match row referencing them. `app.js`, `pairing.js`, `weekly_themes.js` (now `src/content.js`) don't change at all; `manifest.yml` changes once for HTTP mode (see `SPIKE-AWS.md`).

## Credentials & trust

| .env var | Where it comes from | What it does in this codebase |
|---|---|---|
| `SLACK_BOT_TOKEN` (`xoxb-...`) | OAuth & Permissions → **Install to Workspace** → Bot User OAuth Token | Every web API call (`chat.postMessage`, `conversations.open`/`invite`, `users.info`, …). NOT the same thing as the "Verification Token" on Basic Information - that one is legacy and unused. |
| `SLACK_SIGNING_SECRET` | Basic Information → App Credentials → Signing Secret | Bolt requires it in the constructor; actually used only in HTTP mode (HMAC verification of inbound requests). |
| `SLACK_APP_TOKEN` (`xapp-...`) | Basic Information → App-Level Tokens, scope `connections:write` | Authenticates the Socket Mode WebSocket. Disappears in HTTP mode. |

Trust model: Socket Mode = outbound WebSocket authenticated by the app-level token; HTTP mode = inbound POSTs validated with the signing secret (HMAC-SHA256 over the raw body + 5-minute timestamp window).

## What the manifest declares

- `display_information` - app name as Slack shows it.
- `features.bot_user` - makes the app a bot user (`@Coffee Matchup`) that can message anything it is a member of.
- `features.slash_commands` - `/coffee-theme` and `/matchup`. Gotcha: the manifest validator rejects an empty `url` even for Socket Mode apps that never get called over HTTP - we ship a dummy `https://example.com/slack/commands`.
- `oauth_config.scopes`: `chat:write` (posting), `im:write` + `mpim:write` (opening DMs and pair group DMs via `conversations.open`), `channels:manage` + `channels:read` (create/join/invite to `#coffee-catchup`, look up names), `users:read` (user info + ghost-user pruning), `commands` (slash commands), `app_mentions:read` (reply when mentioned).
- `settings.event_subscriptions.bot_events`: `member_joined_channel` (the join trigger), `message.im` (DM chatter).
- `settings.socket_mode_enabled: true` + `interactivity.is_enabled: true` - everything arrives over the WebSocket; flip to HTTP mode for AWS per SPIKE-AWS.md.

## CI: pushing manifest changes automatically

`apps.manifest.update` can push `manifest.yml` to Slack so nobody re-pastes it in the UI. Slack's own config tokens for that API expire every 12 hours, so CI uses the long-lived Slack CLI **service token** instead:

1. `curl -fsSL https://downloads.slack-edge.com/slack-cli/install.sh | bash`
2. `slack login` → `slack auth token` → paste the `/slackauthticket …` command into any Slack message box, paste the challenge code back → the CLI prints the long-lived service token
3. GitHub repo secrets: `SLACK_SERVICE_TOKEN` + `SLACK_APP_ID` (the `A0…` id from Basic Information)

`.github/workflows/update-slack-manifest.yml` then runs on pushes touching `manifest.yml` (and manually via "Run workflow"): YAML→JSON conversion, `apps.manifest.validate` first, then `apps.manifest.update` (implemented in `scripts/push-manifest.js`; `SLACK_DRY_RUN=1` builds the body without calling Slack).

Notes:
- The update **replaces the whole app config** with `manifest.yml` - the file is the single source of truth.
- Scope changes still require one manual **Reinstall to Workspace** click - Slack never grants new scopes automatically (the workflow prints `permissions_updated: true` when that applies).

## Known Bolt 5 gotcha baked into the code

Bolt 5 runs an internal `auth.test()` during app init that throws **outside** any user try/catch on a bad token (unhandled crash with a raw stack). We set `tokenVerificationEnabled: false` (`src/app.js`) and do our own guarded `auth.test()` at boot with a friendly error instead.
