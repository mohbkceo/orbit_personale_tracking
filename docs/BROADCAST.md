# Broadcast and automatic messages

Open **Admin → Operations → Broadcast** at `/admin/broadcast`. Admins can create drafts, inspect and save audiences, preview content, send a test to their own Telegram-linked user account, and inspect history. A Super Admin can confirm a live launch with their current password, pause, resume, cancel, retry eligible failures, and edit global templates and delivery settings.

## Deployment

No destructive migration is required. On startup the API creates the new indexes and inserts missing automatic template defaults with `$setOnInsert`. Existing templates, `AutomationSettings`, `EventSettings`, `Setting.reminders`, reminders, reminder events, and Telegram connections are preserved. Missing template rows use built-in defaults until initialized.

Set `ORBIT_TELEGRAM_BOT_TOKEN` and configure the existing webhook. Images are normalized to JPEG and stored in MongoDB GridFS (`broadcastMedia.files` and `broadcastMedia.chunks`). No local media directory or external storage credential is needed.

The API starts independent broadcast and custom automation loops by default. For a dedicated process, set `BROADCAST_WORKER_EMBEDDED=false` on API instances and run:

```bash
npm run worker:broadcast -w server
```

Multiple worker instances use atomic recipient claims with leases. MongoDB documents reserve both concurrency slots and Telegram API request slots globally across instances. Admin settings limit the rate to 1–20 requests per second and control global concurrency, batch size, retry bounds, UTC delivery hours, and per-user quiet-hour handling. The personal reminder scheduler is unchanged and does not process campaign recipients.

## Delivery behavior

Campaigns move from draft through preparation, scheduled or sending, then completed. Preparation snapshots the server-resolved audience into unique `(campaign, user)` records before sending. Account status, Telegram connection, and consent are checked again at delivery. **Announcement**, **Product Update**, and **Important Notice** are operational communications and do not require a paid subscription or personal Telegram-assistant entitlement. **Promotion** and **Custom** require explicit promotional Telegram opt-in. The composer exposes a promotional checkbox; linking Telegram alone never grants promotional consent. Users control that opt-in under **Settings → Telegram** or with an opt-out button on a campaign. Connecting Telegram alone does not opt them in.

Telegram acceptance and message IDs are recorded separately for photo and text parts. A failed second part retries without resending a recorded successful first part. Telegram has no idempotency key: if a process stops after Telegram accepts a part but before MongoDB records it, the expired claim is marked `AMBIGUOUS` and excluded from automatic retry. An operator must inspect the Telegram-side outcome before choosing any manual intervention. The UI reports API acceptance, not reads.

Allowed message HTML is limited to Telegram formatting tags and HTTPS links. Template variables and button actions are allowlisted. Automatic message templates affect future delivery text; they do not rewrite existing reminder records or change their scheduling state. Automatic timing remains owned by existing automation, event, and per-user reminder settings. The Broadcast catalog links to the corresponding admin settings where a global timing policy exists.

Automatic templates can append validated HTTPS buttons. Morning and daily summaries can use an optional image; the notifier sends it as a single photo caption when the rendered summary fits Telegram's caption limit and otherwise sends the text alone. Reminder and event templates keep their existing action buttons and delivery lifecycle.

## API

- `/api/admin/broadcasts`: campaigns, image upload, preview, test, launch, pause, resume, cancel, duplicate, recipients, retry.
- `/api/admin/broadcast-audience`: plans, filtered users, counts, reusable segments.
- `/api/admin/custom-automations`: custom automation list, create, edit, preview, test, enabled toggle, recent executions.
- `/api/admin/automatic-messages`: catalog, edit, preview, test, reset, revision history, restore.
- `/api/admin/broadcast-settings`: global worker policy.
- `/api/message-preferences`: authenticated user's promotional Telegram opt-in.

All admin mutations require the existing admin action CSRF header. Launch additionally requires Super Admin role, the exact `SEND` confirmation value, and fresh password verification. Test sends are restricted to the admin's own email-matched, Telegram-linked user account.

## Custom automations

**Auto Messages** has Existing Automations and Custom Automations on the same page. **+ New Automation** opens a single editor for name, start, audience, messages, preview and test. Each message supports text, an optional uploaded image, an HTTPS link button and a delay. Up/down, duplicate and remove controls change the message list without a workflow canvas. Creating, editing, testing and enabling custom automations require Super Admin, matching the existing automatic-template permissions.

The backend supports registration, confirmed subscription activation, before/after subscription expiry, and a one-time scheduled UTC instant. Local date/time inputs are converted to UTC in the browser; delay units are elapsed minutes (a day is 24 hours). Before-expiry automations start at `expiresAt - leadMinutes`; **all** message delays are measured from that start, independently of list position. For example, a three-day lead with delays of zero and two days sends three days and one day before expiry.

Registration runs once per account using the committed `USER_CREATED` audit event. Activation runs once per subscription grant using committed `ACCESS_ACTIVATED` or `ADMIN_ACCESS_GRANTED` events, covering activation links, verified SlickPay payments and admin grants. Expiry uses the actual access subscription ID plus expiry timestamp as the source cycle. Scheduled starts use the scheduled instant and exclude accounts created after it. New event automations apply from enabling onward; they do not send historical welcome messages. Expiry automations also cover existing cycles expiring after enabling. Users may link Telegram before a later delayed step; an unlinked user is skipped at send time.

The scheduler replays committed source records with streaming MongoDB cursors. Compound unique execution indexes prevent duplicate message scheduling and make partial enrollment and restarts recoverable without an in-memory timer or event cursor that could miss a late transaction commit. This favors reliability for Orbit's existing scale; very large audit histories may warrant a durable outbox consumer later. `CustomAutomation` and `AutomationExecution` are separate collections; `Reminder` is unchanged. Startup creates their indexes before starting either the embedded or dedicated broadcast worker.

Each execution has an atomic claim, bounded retry attempts, per-part photo/text checkpoints, and a status visible in the editor's **Recent delivery activity**. Both delivery loops share the global Telegram request-rate reservation and delivery/quiet-hour policy. Explicit rate-limit and server failures use delayed retries. Unknown network outcomes and expired in-flight leases fail as `AMBIGUOUS` for inspection instead of blind retry, because Telegram sends do not support an idempotency key. No live Telegram calls are made by the automated tests.

Disabling or saving an edited automation cancels pending work from previous revisions. Re-enabling starts with future events and does not resurrect cancelled runs. A send already accepted by Telegram cannot be recalled. Immediately before every photo/text request the worker checks the current revision, active account, valid connection, audience and promotional consent. Expiry steps are suppressed after renewal, revocation or an expiry-date change. A blocked/deactivated/invalid-chat rejection fails the execution and disables delivery to that connection until a new incoming Telegram interaction confirms it is reachable again. Personal notification permissions and built-in schedules are unchanged.
