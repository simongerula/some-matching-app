# SPIKE 2 - Moving the app to AWS (Socket Mode -> HTTP mode)

Key points and risks for deploying the Coffee Matchup app on AWS, based on Slack docs / bolt-js source research (2026-10). Current state of the repo = Socket Mode, fine for laptops, bad for serverless. This spike lists what changes and what to watch out for.

## TL;DR

- For **ECS/Fargate (container)**: both modes work; Fargate + Socket Mode is actually the least-friction path (no ALB) but long-lived sockets on containers is less "production-real".
- For **API Gateway + Lambda (serverless)**: Socket Mode does not fit; switch to **HTTP mode** (`AwsLambdaReceiver`, bundled in `@slack/bolt` 5.x). The killer constraint is Slack's **3-second response requirement** on commands/interactions.
- Our app is small but has slow handler work (`/matchup` opens DMs, posts messages) - to be Lambda-clean we likely need the **SQS decoupling pattern** (ack fast, hand off work).

## 1. What changes in code

- **Different receiver**: swap SocketModeReceiver for a plain `HTTPReceiver` (Lambda) / `AwsLambdaReceiver` (API Gateway + Lambda). `AwsLambdaReceiver` is first-party in `@slack/bolt@5` (see `node_modules/@slack/bolt/dist/receivers/AwsLambdaReceiver.ts`).
- **No more app-level token** (`SLACK_APP_TOKEN` `xapp-...`, `socketMode: true`) - not needed in HTTP mode. Signing secret is now actually used (it's only required-but-unused in Socket Mode).
- One code path can keep a toggle env var like `SOCKET_MODE=true/false` so local dev stays friction-free while prod is HTTP.
- **Request URL convention**: Bolt expects the Events API request URL at `/slack/events` - do not change the path (requests come from Slack to that path only). Slash command request URLs can be the same or a different path - both end up in the same receiver.
- The manifest gets the matching config flip: `socket_mode_enabled: false`, real `request_url` on the event subscriptions and each slash command, plus `interactivity.request_url`. Our CI manifest push (`.github/workflows/update-slack-manifest.yml`) automates the manifest half.
- The **first time you save an Events request URL** Slack sends a `url_verification` challenge handshake - Bolt replies automatically; just don't add proxy config that mangles the raw body.

## 2. The 3-second rule (the big one)

For slash commands, button clicks, modal submits: **Slack expects an HTTP 200 within ~3 seconds** or it shows the user "We had some trouble connecting. Try again?" and (for Events API messages) **retries** several times over ~10 minutes.

Bolt behavior nuances we confirmed in GitHub threads (sources: slackapi/bolt-js issues #2789, #1815, #1293):

- In Socket Mode acks are socket messages - cheap, instant.
- In `AwsLambdaReceiver` the ack response is **deferred until your handler finishes** (so the Lambda doesn't die early). Consequence: the total handler must finish within 3s or your users see the error even though `ack()` was the first line.
- Our `/matchup` handler takes way longer than 3s (pruning users + `conversations.open` + several `chat.postMessage`). Fine today on a laptop; **not fine on Lambda**.

Mitigations, in increasing order of effort:

1. `processBeforeResponse/deferred-ack` semantics as-is, and keep each listener under ~2.5s. Not possible for `/matchup` as written.
2. **SQS decoupling pattern** (blessed by Slack engineers in #2789): a "gate" listener that only `ack()`s and `SQS.queueSend(...)`s the payload, then returns; a separate lambda triggered by the SQS message does the actual work. Extra infra (SQS + event source mapping) but robust for LLM calls too (which we plan to add - they're slow by nature).
3. For Events API (`member_joined_channel`, `message.im`) Bolt already auto-acks before listeners run, so slow listeners don't time out - only button/modal/command handlers need care.

**Idempotency**: Slack retries on timeout; with slow handlers, a retried `/matchup` could match everyone twice. Our match records + store dedupe give some protection but a real guard = dedupe by `event_id`/`response_url` in the worker, or make match creation transactional. Put on the checklist.

## 3. What breaks specifically in this codebase

- **`store.json` on disk** won't work on Lambda - each invocation gets its own ephemeral filesystem, and two concurrent invocations would clobber each other. Swap `require('./store')` for DynamoDB (a `coffee-matchup-users` table + a `matches` table). Our ~30-line store module is the only file to replace.
- **Bolt's in-memory conversation store** (used for thread context in `message` middleware) is per-instance - disable it via `conversationStore: false` (we don't use conversation history for logic) or use the external store if we ever need threaded messages.
- **Secrets on AWS**: don't ship `.env` in the container image. Use AWS Secrets Manager or SSM Parameter Store (encrypted) and inject at runtime; rotate by redeploying. Never bake the `xoxb-` token into the image, don't commit it (already in `.gitignore`).
- **Long-lived state the current code assumes**: `botUserId` is fetched once at boot via `auth.test()`. On Lambda + HTTP receiver there's no "boot"; fetch per invocation (cheap) or cache in cold start.

## 4. Infrastructure sketch (Lambda flavor)

```
Slack (HTTPS POST /slack/events)
  -> Amazon API Gateway HTTP API (proxy integration)
    -> Lambda "slack-gateway" (AwsLambdaReceiver, verifies signing secret, acks <=3s)
        -> SQS (only for slow work like /matchup, DMs, future LLM calls)
            -> Lambda "match-worker" (store, pairing, DMs - minutes are fine here)
```

- Memory: 256-512 MB Lambda; runtime Node 22 (matches our `engines`).
- Cold starts: Node + Bolt cold start is sub-second in practice; not a concern for this app.
- Region pick by team timezone (Slack latency matters more than machine choice here).
- Alternative: **ALB instead of API Gateway HTTP API** if you prefer plain HTTPS-something with IAM/SG configuration or need WebSockets; API GW HTTP API is cheaper and simpler for Slack.

Container flavor (ECS/Fargate): keep Socket Mode as-is; ship the same container, no ALB/SG ingress. Trade-off noted in TL;DR.

## 5. Things that do NOT change

- Manifest scopes stay the same (HTTP vs Socket Mode needs no new scopes).
- The whole event/command-handling code stays idiomatic Bolt - receivers are interchangeable underneath; only the wiring at the top and slow-handler structure change.
- CI manifest push workflow stays valid; just point it at the same app after flipping the manifest (permissions_updated stays false since scopes don't change).
- Testing buttons before deploy: use a Slack tunnel/deploy preview; once HTTP, Slack's Retry behavior means duplicates can happen while you test - watch the logs.

## 6. Recommended plan

1. Phase 1 (now): keep Socket Mode for team demos (zero refactor).
2. Phase 2: add `SOCKET_MODE` env toggle + `HTTPReceiver` path; test HTTP mode locally with ngrok to prove the full 3-second behavior.
3. Phase 3: swap `src/store.js` for DynamoDB; add `conversationStore: false`.
4. Phase 4: Lambda + API Gateway + SQS worker split idempotency around /matchup.
5. Phase 5 (optional): when/once we grow a real multi-workspace story, evaluate OAuth flow - `AwsLambdaReceiver` doesn't cover OAuth; need `ExpressReceiver` on a separate function (first-party note from its source).
