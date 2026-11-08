# Unified Goals

Goals is the sole workflow for achievements, savings and purchases. Wishlist navigation,
forms and cards have been removed. Projects, Tasks, Habits and other resources are unchanged.

## Model and API

The existing `goals` collection and Goal IDs are retained. `progressType` is `money`,
`steps` or `simple`. Legacy `financial` records read as money; `personal` records read
as simple. The legacy `type` property remains synchronized for older integrations.
Steps are embedded in the Goal. Priority, URL, category, description, notes, currency,
account, deadline, timestamps and reminder settings remain optional.

`GET/POST /api/goals`, `GET/PATCH/DELETE /api/goals/:id`, the existing contribution
and withdrawal routes, and `POST/PATCH/DELETE /api/goals/:id/steps[/:stepId]` all use
the same model and services. Deletes retain a tombstone, financial references and
migration provenance. Public goal reads exclude deleted Goals.

Creation requires a title. Money fields and deadline are optional. Steps are added
after creation. Secondary settings are collapsed. Cards and detail dialogs support
English/Arabic and RTL. Search opens the relevant detail dialog; Quick Add links to
the same creation form. Dashboard, Telegram and reminders use the shared progress
calculator. No percentage is shown for simple Goals, empty checklists or zero targets.

Savings estimates require two contributions on distinct dates and at least seven
days of observation. Pace uses net contributions, including withdrawals, over the
observed history. The required monthly amount uses the time remaining to the deadline
and an average month of 365.25/12 days. At risk means recorded pace is between 80%
and 100% of the required pace; behind means below 80%, or overdue. These labels are
pace comparisons, not probabilities. Paused, cancelled and completed Goals have no
forward pace estimates. Without sufficient data the UI says “Not enough data”.

## Financial integrity

The Transaction ledger remains the account-balance source of truth. Contributions
and withdrawals remain transfers between distinct, owned accounts of the same
currency. They do not become income or expenses. Goal savings are opening savings
metadata plus linked, undeleted contribution/withdrawal entries.

Before the first ledger edit, legacy opening savings are initialized as the existing
Goal amount minus historical net contributions, avoiding double counting. Subsequent
transaction edits, reversals and soft deletions recompute saved amounts and completion.
A database lease serializes Goal/ledger edits across server processes. Reads derive
saved amounts from the ledger, so an interrupted cached-total update is recoverable.
An expired lease is recoverable after two minutes; a busy request returns 409 to retry.
Changing saved amounts directly is blocked once any ledger history exists. History
and account reconciliation remain intact after deleting a Goal.

## Recoverable migration

The migration never deletes or modifies Wishlist records and creates no transactions.
It stores the entire raw source record in Goal provenance, including unknown metadata.
The user can read earlier notes and purchase details in the Goal detail dialog.

New records use a deterministic user/source ID. Linked `goalId` records merge into
the owned Goal. Existing nonempty Goal fields, status, tracking method, savings,
account references and timestamps take precedence. Blank descriptive fields and
missing targets may be filled atomically together with the source snapshot. Conflicts
are reported and both values remain recoverable. Dangling and foreign-user goal links
produce a new owned Goal. Invalid sources produce an explicit review report.

`wanted` and `saving` become active, `purchased` becomes completed, and `cancelled`
remains cancelled. A numeric price, including zero, selects money tracking; otherwise
the new Goal uses simple tracking. Purchased items do not invent savings or account
movements. A linked existing Goal retains its own tracking method and status.

From the repository root:

```powershell
npm.cmd run migrate:wishlist -- --dry-run
npm.cmd run migrate:wishlist -- --apply
npm.cmd run migrate:wishlist -- --validate
# Optional on any command: --user=<24-character owner ID>
```

These use `npm.cmd` on Windows because the installed PowerShell `npm.ps1` wrapper
consumes double-dash arguments. On other shells use `npm`. Direct invocation:

```powershell
cd server
node src/scripts/migrateWishlist.js --dry-run
node src/scripts/migrateWishlist.js --apply
node src/scripts/migrateWishlist.js --validate
```

No flags means dry-run. Validation does not write and returns a failing exit status
for missing migrations, invalid records or changed legacy sources. Dry-run disables
automatic index creation. The connection comes from the existing server environment.
Back up the database before a deployment-wide run and retain legacy records afterward.
There is no startup deletion or destructive cleanup job.

Owned legacy records are also migrated on Goals, search, dashboard, Telegram Goals
and export access. This makes records available if a deployment-wide run has not yet
occurred. Invalid items show a review notice without hiding the successfully migrated
Goals. Retrying cannot resurrect a deleted migrated Goal.

Old Wishlist browser URLs redirect to `/panel/planning/goals`. Deprecated Wishlist
API routes translate to the Goal service and return compatible name/price/status
aliases with deprecation headers. No new Wishlist records are written by the app.
Old feature definitions and purchased plan snapshots remain stored as compatibility
data. Wishlist grants resolve to Goals; migrated owners retain Goals access despite
plan changes. Explicit administrator denial, disabled features and suspension remain
enforced. Legacy records remain included in backups through Goals access.

## Execution on 8 November 2026

The configured database was named `test`; this does not establish that any other
deployment database has been migrated. The actual all-user dry-run and apply found
five Wishlist records: three new Goals, one merge into an existing Goal, and one
already migrated record. Two title/description conflicts retained the existing Goal
values and preserved the legacy originals. Goal count changed from six to nine.

Validation found all five sources represented with zero errors. A second apply made
zero creations or merges. Byte-equivalent JSON digests confirmed that Wishlist,
Transaction, Account and Reminder records were unchanged. Every existing nonempty
Goal field was unchanged. A pre-migration backup and the detailed audit report were
written outside the repository under `C:/Users/MrCOMPUTER/.codex/migration-backups/`.

## Verification

- Full server suite: 32 files, 410 tests passed.
- Full client suite: 33 files, 145 tests passed with two workers. The first unrestricted
  run had a timeout in the unrelated QR template editor; the complete rerun passed.
- New regression coverage includes all progress methods, legacy types, checklist
  changes, CRUD, reminders, financial edits/reversals, simultaneous contributions and
  overdrafts, all migration statuses, linked/dangling/cross-user references, concurrent
  migration retries, retained originals, subscription access and old routes.
- Real browser checks cover desktop and 390px mobile cards and creation, English and
  Arabic RTL, and absence of horizontal overflow, using a disposable in-memory database.
- Production build, repository-wide lint, translation audit and `git diff --check` passed.
  Vite continues to warn about existing large bundles.

## Changed files

Frontend: `App.jsx`, `App.goals.test.jsx`, `animations/AnimatedProgress.jsx`,
`components/Layout.jsx`, `components/QuickAdd.jsx`, `components/SearchPalette.jsx`,
`components/goals/{GoalForm,GoalSummary,GoalDetail,SavingsForm}.jsx`,
`pages/{Goals,Planning,Personal,Dashboard}.jsx`, `pages/Goals.test.jsx`,
`pages/admin/SupportWorkspace.jsx`, and both locale catalogs under `client/src/`.

Backend under `server/src/`: `models/Planning.js`,
`routes/{planning,resources,system,transactions,dashboard,adminSupport,adminFeatures,adminAccessControl}.js`,
`services/{goalService,goalSavingsService,wishlistMigrationService,financeService,dashboardService,entitlementCatalog,entitlementService,planService}.js`,
`services/reminders/{reminderService,reminderDeliveryService,reminderBackfillService}.js`,
`telegram/{commandHandlers,guidedAdd.service}.js`, `i18n/telegram.js`,
`scripts/{migrateWishlist,seedPlansAndFeatures,seedDemoAds,seedDemoData}.js`.

Also changed: root/server `package.json`, `shared/goalProgress.js`,
`server/test/{goals,goalProgress}.test.js`, and the admin-support/i18n audit documentation.
