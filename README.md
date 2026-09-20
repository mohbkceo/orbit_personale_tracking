# Orbit — Personal OS

Orbit is a multi-user life-management application for finances, tasks, debts, bills, subscriptions, savings goals, projects, notes, habits, contacts, and Telegram capture. It is a JavaScript MERN application with a responsive React interface and an Express/Mongoose API. Users receive time-limited access through single-use Activation Links; each user's workspace data is isolated.

## Architecture

```text
client/                      React 19 + Vite + TailwindCSS
  src/components/            Layout, command search, quick capture, UI primitives
  src/pages/                 Feature pages
  src/api/                   Axios API boundary

server/                      Express + Mongoose
  src/models/                Identity, access, ledger and personal-domain schemas
  src/services/              Access, activation, financial and personal-domain rules
  src/routes/                REST endpoints
  src/telegram/              Parser, bot client, update handler and notifier
  src/jobs/                  Scheduled state checks and summaries
```

The unified `Transaction` ledger is the financial source of truth. Account balances are derived from the opening balance plus ledger movements. Transfers and savings movements decrease one owned account and increase another without affecting income or expenses. Debt payments create a distinct ledger movement and update the debt once, while creating a debt alone never changes cash.

## Reminders and prospective memory

Reminders are independent records with an optional link to a task, debt, bill, subscription, or goal. Each record has a trigger, status, delivery state, and dedicated `ReminderEvent` history. A due date does not itself mean a notification was delivered or an item was completed. New entities use `Automatic` mode by default, while `Custom` and `Off` are available in their forms and on the linked reminder plan page. Existing documents without a mode behave as Automatic. The defaults are product choices informed by prospective-memory principles, not scientifically proven exact intervals.

The reminder policy creates conservative cues: dated tasks get an action cue and at most one planned follow-up; exact-time high-priority tasks can get preparation; debts and bills get pre-due, due, and limited overdue cues; subscriptions get a renewal warning; goals get a weekly progress review. Users can edit or cancel each generated cue without later regeneration overwriting that choice. A task completion, debt payment, bill payment, or other linked entity resolution closes its remaining cues through the domain service. Financial reminder buttons call the existing payment flow.

The minute worker reads indexed due reminders, claims each in MongoDB with a lease, checks the linked entity, quiet and active hours, follow-up cap, and recent equivalent delivery, then sends through Telegram or surfaces it in the web attention schedule. Two or three simple low-priority task or standalone cues can be bundled into one Telegram message. A sent cue remains unresolved until the user completes, snoozes, blocks, cancels, or resolves its linked entity. Recurring cues retain their event history and advance to a later occurrence. Old standalone cues beyond seven days expire; old recurring occurrences advance without replaying the backlog. The morning summary reports counts rather than re-sending the same item as a separate due-today alert.

The web **Reminders** page offers Now, Upcoming, Snoozed, Waiting, Recurring, and History views. Creation keeps title, date, time, repeat, and optional link visible; priority, delivery, and context live under advanced settings. **Settings → Reminders** controls automatic generation, hours, follow-ups, and new-entity defaults. Telegram understands `/reminders`, `show reminders`, `remind me tomorrow at 9 to call Karim`, `remind me in 2 hours to check deployment`, `remind me every Friday to review debts`, `cancel reminder <id>`, and `update reminder <id> tomorrow at 9 to ...`. Ambiguous times receive a clarification request. Inline reminder actions support Done, Later, Blocked, snooze choices, and Resume. For arbitrary snoozes use `/snooze <id> YYYY-MM-DD HH:mm`; for a partial debt payment use `/debtpay <id> AMOUNT` after setting a default payment account.

Authenticated reminder endpoints are under `/api/reminders`: list, create, read, update, cancel, complete, snooze, block, resume, event history, and entity plan/mode endpoints. All linked entities are checked against the requesting user. Timestamps are stored in UTC and scheduling uses the workspace timezone (default `Africa/Algiers`). The first-class `Reminder` and `ReminderEvent` collections require indexes; the backfill command creates them.

After deploying to an existing workspace, run `npm run backfill:reminders` once. It is repeat-safe, does not delete records, and scans at most 100 open/upcoming records of each supported type per user within a 60-day horizon (plus active goals). It does not run automatically on server startup or replay old overdue notifications. Re-enabling smart reminders from Settings also reconciles the same bounded horizon. Increase the cap deliberately in the backfill service if a workspace needs a larger historical rollout.

MongoDB claims prevent overlapping workers from sending the same due cue during normal operation. Telegram does not provide an idempotency key for `sendMessage`, so a process crash in the narrow interval after Telegram accepts a message but before MongoDB records success can still produce a retry; check `ReminderEvent` delivery history when investigating such a case.

## Prerequisites

- Node.js 20.19+ or 22.12+
- npm 10+
- MongoDB 7+ replica set (local single-node replica set or MongoDB Atlas); activation uses transactions

## Local setup

1. Copy `.env.example` to `.env` and update its values.
2. Install all root, client, and server workspace packages:

   ```bash
   npm install
   ```

3. Configure the bootstrap and owner variables in `.env`, then initialize the first Super Admin and migrate the existing owner:

   ```bash
   npm run bootstrap:admin
   npm run migrate:legacy
   ```

4. Optionally add non-destructive development examples with `npm run seed`. Start the API and web app together:

   ```bash
   npm run dev
   ```

Open `http://localhost:5173/login`. The API runs at `http://localhost:5000`. The Super Admin signs in at `/admin/login`, creates a Plan, and generates Activation Links for new users or renewals. There is no unrestricted signup endpoint.

## Environment variables

| Variable                                                                | Purpose                                                                                 |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `NODE_ENV`                                                              | `development`, `test`, or `production`                                                  |
| `PORT`                                                                  | Express port, default `5000`                                                            |
| `MONGODB_URI`                                                           | MongoDB connection string                                                               |
| `CLIENT_URL`                                                            | Allowed browser origin; comma-separated values are supported                            |
| `AUTH_JWT_SECRET`                                                       | Long random secret for user and admin HttpOnly session cookies; required in production  |
| `SETTINGS_ENCRYPTION_KEY`                                               | Stable secret used to encrypt copyable Activation Links at rest; required in production |
| `TELEGRAM_WEBHOOK_SECRET`                                               | Long random path and header secret checked on Telegram webhook calls                    |
| `APP_BASE_URL`                                                          | Public HTTPS API origin used to construct the webhook URL                               |
| `ORBIT_TELEGRAM_BOT_TOKEN`                                              | One platform-wide Telegram bot token; never exposed through user settings               |
| `ORBIT_TELEGRAM_BOT_USERNAME`                                           | Bot username without `@`, used for connection deep links                                |
| `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_NAME`, `SUPER_ADMIN_PASSWORD`         | First Super Admin bootstrap credentials; password must be at least 12 characters        |
| `ORBIT_OWNER_EMAIL`, `ORBIT_OWNER_NAME`, `ORBIT_OWNER_INITIAL_PASSWORD` | Existing workspace owner's account migration; password must be at least 12 characters   |
| `ORBIT_OWNER_ACCESS_DAYS`                                               | One-time migrated owner's initial grant length, default 365 days                        |

Do not rotate `AUTH_JWT_SECRET` without planning to invalidate sessions. Rotating `SETTINGS_ENCRYPTION_KEY` makes existing encrypted Activation Link URLs uncopyable, although their hashes still validate existing shared links. Never commit `.env`.

## Commands

```bash
npm run dev       # start Vite and Express
npm run build     # production client build
npm start         # run Express; serves client/dist when NODE_ENV=production
npm run bootstrap:admin # create the first Super Admin only if none exists
npm run migrate:legacy  # assign unowned legacy data to the owner, repeat-safe
npm run backfill:reminders # create reminder indexes and seed upcoming automatic plans
npm run seed      # add sample data only if the owner has none; never deletes data
npm test          # authentication, activation, tenancy, Telegram, migration and ledger tests
npm run lint      # ESLint across both workspaces
npm run format    # Prettier
```

## Telegram setup

1. Create a bot with Telegram's `@BotFather`.
2. Set `ORBIT_TELEGRAM_BOT_TOKEN` and `ORBIT_TELEGRAM_BOT_USERNAME` on the server.
3. Deploy Orbit behind HTTPS and set `APP_BASE_URL`. A Super Admin registers the webhook under **Admin → Settings**.
4. Each user opens **Settings → Telegram**, clicks **Connect Telegram**, and sends the generated `/start` link to the central bot. Links are single-use and expire after 15 minutes.
5. Users may choose default expense and income accounts and summary times in their own Settings.

Supported examples include:

```text
spent 450 coffee
income 25000 freelance
Ahmed owes me 5000
I owe Karim 7000
Ahmed paid me 2000
task call dentist tomorrow
```

Commands include `/start`, `/help`, `/today`, `/tasks`, `/money`, `/expenses`, `/income`, `/debts`, and `/accounts`. Every message and callback is routed through that Telegram sender's unique Orbit connection and checked for active access before touching personal data. Connections remain intact after access expiry.

## Production

Build the client and run the server:

```bash
npm run build
NODE_ENV=production npm start
```

Use a managed MongoDB replica set with backups and TLS. Serve the web app and API from the same origin where possible. Set `CLIENT_URL` to the public web origin and `APP_BASE_URL` to the public API origin. Secure cookies and stable secrets are mandatory in production. Put the app behind HTTPS; an additional access proxy is optional, not a substitute for the app's login and tenant guards.

### Migrating an existing single-user deployment

1. Back up MongoDB and stop the old Orbit process. Use a staging copy first. Do not run the old unauthenticated server after adding new users.
2. Start MongoDB as a replica set, configure the new secrets and bootstrap/owner variables, and ensure `ORBIT_TELEGRAM_BOT_TOKEN` is set if the legacy Settings document contains an encrypted bot token.
3. Run `npm run bootstrap:admin`, then `npm run migrate:legacy` before starting the new server. The command creates the owner only if absent, assigns every unowned personal record (including Settings, Tasks, Accounts, Transactions, Debts, Planning, Personal and Activity), drops the old singleton Settings index, and adds ownership indexes. It never resets an existing password or extends an existing grant on rerun.
4. A single legacy allowed Telegram UID becomes that owner's `TelegramConnection`; multiple UIDs or a UID claimed by another user cause the migration to stop for manual review, without erasing them. Old bot credentials and allow-list fields are removed from user Settings only after safe conversion. The platform bot token comes from the server environment, not Settings.
5. Verify the printed per-collection assignment counts, sign in as the owner, inspect Settings and representative records, and run `npm test`, `npm run lint`, and `npm run build`. Only then route production traffic to the new version.

The owner gets one historical “Legacy Owner Access” grant for `ORBIT_OWNER_ACCESS_DAYS` (default 365); later access is renewed with normal Activation Links. New activations require MongoDB transactions. A standalone MongoDB server cannot activate links: Orbit fails closed instead of risking a used link without a grant. Development tests run a single-node replica set.

## Data safety

- Critical transactions are soft-deleted and account deletion is blocked when financial history exists.
- Account balances are derived from the ledger, reducing cache drift.
- Activation Link tokens are hashed for lookup and encrypted for authorized admin re-copy; password hashes use bcrypt.
- User and admin sessions use separate HttpOnly cookies. Protected APIs check the user's account status and grant expiration on every request.
- API input is schema-validated and guarded with Helmet, CORS, rate limits, payload limits, and unsafe-query-key rejection.
- JSON and CSV exports are available from **Settings → Data**.
- Development seed data is never loaded automatically; the seed command refuses to run in production and never deletes existing records.
