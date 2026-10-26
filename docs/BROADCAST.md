# Broadcast and automatic messages

Open **Admin → Operations → Broadcast** at `/admin/broadcast`. Admins can create drafts, inspect and save audiences, preview content, send a test to their own Telegram-linked user account, and inspect history. A Super Admin can confirm a live launch with their current password, pause, resume, cancel, retry eligible failures, and edit global templates and delivery settings.

## Deployment

No destructive migration is required. On startup the API creates the new indexes and inserts missing automatic template defaults with `$setOnInsert`. Existing templates, `AutomationSettings`, `EventSettings`, `Setting.reminders`, reminders, reminder events, and Telegram connections are preserved. Missing template rows use built-in defaults until initialized.

Set `ORBIT_TELEGRAM_BOT_TOKEN` and configure the existing webhook. Images are normalized to JPEG and stored in MongoDB GridFS (`broadcastMedia.files` and `broadcastMedia.chunks`). No local media directory or external storage credential is needed.

The API starts an independent broadcast loop by default. For a dedicated process, set `BROADCAST_WORKER_EMBEDDED=false` on API instances and run:

```bash
npm run worker:broadcast -w server
```

Multiple worker instances use atomic recipient claims with leases. MongoDB documents reserve both concurrency slots and Telegram API request slots globally across instances. Admin settings limit the rate to 1–20 requests per second and control global concurrency, batch size, retry bounds, UTC delivery hours, and per-user quiet-hour handling. The personal reminder scheduler is unchanged and does not process campaign recipients.

## Delivery behavior

Campaigns move from draft through preparation, scheduled or sending, then completed. Preparation snapshots the server-resolved audience into unique `(campaign, user)` records before sending. Account status, Telegram connection, and consent are checked again at delivery. **Important Notice** is the only manual category treated as operational; all other manual categories require explicit promotional Telegram opt-in. Users control that opt-in under **Settings → Telegram** or with an opt-out button on a campaign. Connecting Telegram alone does not opt them in.

Telegram acceptance and message IDs are recorded separately for photo and text parts. A failed second part retries without resending a recorded successful first part. Telegram has no idempotency key: if a process stops after Telegram accepts a part but before MongoDB records it, the expired claim is marked `AMBIGUOUS` and excluded from automatic retry. An operator must inspect the Telegram-side outcome before choosing any manual intervention. The UI reports API acceptance, not reads.

Allowed message HTML is limited to Telegram formatting tags and HTTPS links. Template variables and button actions are allowlisted. Automatic message templates affect future delivery text; they do not rewrite existing reminder records or change their scheduling state. Automatic timing remains owned by existing automation, event, and per-user reminder settings. The Broadcast catalog links to the corresponding admin settings where a global timing policy exists.

Automatic templates can append validated HTTPS buttons. Morning and daily summaries can use an optional image; the notifier sends it as a single photo caption when the rendered summary fits Telegram's caption limit and otherwise sends the text alone. Reminder and event templates keep their existing action buttons and delivery lifecycle.

## API

- `/api/admin/broadcasts`: campaigns, image upload, preview, test, launch, pause, resume, cancel, duplicate, recipients, retry.
- `/api/admin/broadcast-audience`: plans, filtered users, counts, reusable segments.
- `/api/admin/automatic-messages`: catalog, edit, preview, test, reset, revision history, restore.
- `/api/admin/broadcast-settings`: global worker policy.
- `/api/message-preferences`: authenticated user's promotional Telegram opt-in.

All admin mutations require the existing admin action CSRF header. Launch additionally requires Super Admin role, the exact `SEND` confirmation value, and fresh password verification. Test sends are restricted to the admin's own email-matched, Telegram-linked user account.
