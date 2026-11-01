# Phone-first authentication rollout

Feature branch: `codex/phone-first-auth`.

## API and identity behavior

- `POST /api/auth/register`: `{ fullName, phone, password, language? }`.
- `POST /api/activation/:key/register`: the same identity fields plus the existing `gender` and optional `preferences` metadata.
- An optional real `email` remains accepted by both signup APIs for integrations. Phone is required for every new signup. Email-only signup clients must upgrade before rollout.
- `POST /api/auth/login`: `{ identifier, password }`. Existing `{ email, password }` requests continue to work; `{ phone, password }` is also accepted. Multiple identity fields must describe the same normalized identity. Email and phone supplied together are rejected, even if one account has both.
- Local numbers default to Algeria (`DZ`). `0550123456`, `+213550123456` and `00213550123456` all become `+213550123456`. Explicit international country codes work. Arabic digit input is supported. Extensions, free text and invalid numbers are rejected using `libphonenumber-js/max`, including at the model boundary.
- Legacy email-only users retain their ObjectIds, email and password hashes. Phone is optional on legacy documents. User responses include phone when available; admin authentication remains email-based.
- Duplicate prechecks provide friendly feedback. Partial unique indexes provide the authoritative constraint, including concurrent requests. Registration, settings, audit and durable registration conversions remain transactional.

## Read-only database inspection

On 2026-10-31 the MongoDB connection configured in `server/.env` was inspected using `autoIndex: false` and `autoCreate: false`. Its database name is `test`; this checkout does not independently establish whether that is the live production database. Operators must repeat inspection against the explicitly selected production connection before deployment.

Observed: 23 users, all with email, no phone fields, no normalized identity collisions or invalid identities. No accounts or indexes were modified.

Actual index definitions returned by MongoDB:

```json
[
  { "v": 2, "key": { "_id": 1 }, "name": "_id_" },
  { "v": 2, "key": { "email": 1 }, "name": "email_1", "background": true, "unique": true },
  { "v": 2, "key": { "status": 1 }, "name": "status_1", "background": true },
  { "v": 2, "key": { "status": 1, "createdAt": -1 }, "name": "status_1_createdAt_-1", "background": true },
  { "v": 2, "key": { "lastLoginAt": -1 }, "name": "lastLoginAt_-1", "background": true },
  { "v": 2, "key": { "fullName": 1 }, "name": "fullName_1", "background": true }
]
```

The unfiltered unique `email_1` index permits only one missing/null email. Changing the Mongoose schema alone cannot fix it.

## Migration

`npm run migrate:identities -w server` is read-only by default. It lists actual indexes, counts, a review fingerprint, legacy index names, normalization counts and problems without printing identity values. It checks every existing email/phone, normalized collisions and users without any usable login identity. Unknown identity indexes, noncanonical legacy emails and invalid data require manual review; it never merges/deletes accounts or fabricates email addresses.

Desired indexes:

```js
{ key: { email: 1 }, name: 'user_email_unique_present', unique: true,
  partialFilterExpression: { email: { $type: 'string' } } }
{ key: { phone: 1 }, name: 'user_phone_unique_present', unique: true,
  partialFilterExpression: { phone: { $type: 'string' } } }
```

Missing and null emails/phones are excluded. API-created accounts omit missing email entirely. Empty strings are rejected in signup and flagged by inspection. Mongoose production `autoIndex` stays disabled. Do not use `syncIndexes()` or a blanket `dropIndexes()`.

Apply requires all of: an explicit `--apply`, acknowledgement that writers are paused, the current inspected fingerprint, and exactly the inspected legacy email index names. It builds the replacement email constraint before dropping the legacy one, normalizes existing phones in place with compare-and-set updates, builds the unique phone constraint, checks identities again, and only then removes the explicitly reviewed old email index. Every unrelated index is retained. Existing email bytes, ObjectIds, timestamps and related collections are untouched. A failure leaves completed safe steps in place; inspect again before retrying. There is no automatic destructive migration at application startup. The existing startup index creation remains additive; a readiness gate prevents listening for requests while incompatible unique identity indexes (including the old email constraint) remain.

## Deployment

1. Take and verify a restorable database backup and capture existing index definitions. Test this migration on a recent isolated copy first, using the deployment MongoDB version.
2. Build the feature release with `npm ci`. Keep the frontend and backend deployment artifacts together. Run the checks below.
3. Select the intended production `MONGODB_URI` through the deployment secret environment. Do not copy credentials into commands, logs or this document. Run the read-only command and review every reported problem/index.
4. Pause **all account and identity writers**, including public and activation signup, account email actions, imports, old application instances and administrative writers. A flag cannot pause services for you. Run inspection again after writers are paused.
5. Apply the exact reviewed plan. For the observed index name, the command shape is:

   ```sh
   npm run migrate:identities -w server -- --apply --writes-paused --expected-plan=REPLACE_WITH_REVIEWED_SHA256 --replace-email-index=email_1
   ```

   Replace the fingerprint placeholder with the current read-only result. Supply a repeated `--replace-email-index=...` only if inspection actually lists additional recognized legacy email indexes. If no legacy indexes remain, omit that flag. Unrecognized definitions require a separately reviewed migration; never bypass the guard by blindly deleting them.
6. Deploy backend support with the new schema and dual-identifier login while writers remain paused. Verify actual index definitions, legacy email login, cookie issuance and `/auth/me`. Deploy the matching frontend and unpause services. Avoid a mixed fleet with email-required User models operating on new phone-only accounts.
7. Smoke-test two disposable phone-only signups, format-equivalent duplicate rejection, phone login, legacy email login, activation reservation/consumption, subscription extension, onboarding, Telegram, admin search and account actions. Use a controlled test environment for disposable accounts and billing; no live payment is necessary for validation.
8. Monitor registration 409/422 rates, duplicate-key errors, login failures, activation failures and conversion delivery. Verify no unexpected `email_1` was recreated by an old process.

## Rollback and interrupted migration

- Before new phone accounts exist, leave the additive partial indexes in place; legacy email accounts still work. Inspection and backups provide the exact original state if a separately reviewed restoration is necessary.
- After phone-only accounts exist, retain the new indexes and dual-identity backend. Roll back presentation changes or ship a compatibility fix. Pause signup during an incident if necessary, while keeping existing email and phone login available.
- Do **not** redeploy an email-required backend against phone-only documents, recreate the old unfiltered unique email index, remove phone fields, fabricate emails, or delete new accounts to force an old deployment to work. An older release must first receive the optional-email/phone compatibility patch.
- DDL is not a multi-document transaction. If an index build fails, the script does not drop the legacy email index. If phone normalization partly completed, it is canonical, idempotent and retains the same IDs. Keep writers paused, resolve the reported issue, inspect again, and apply the new fingerprint. Never reuse an outdated fingerprint or automatically restore a snapshot over subsequent user activity.

## Security and recovery limitations

- Phone is a login identifier, **not verified ownership**. No verified flag, SMS provider or OTP cost was introduced. Phone changes/removals are not exposed. Existing authenticated profile updates cannot alter login identities, and document validation rejects removing the last identity.
- Existing bcrypt work factor, JWT architecture, HttpOnly/SameSite cookies, session revocation, suspended-user restrictions, rate limits, audit events, analytics IDs, Super Admin restrictions, CSRF checks, fresh admin password checks and read-only Support Mode remain in place.
- Email password recovery remains available for legacy users. A phone-only reset returns `RECOVERY_EMAIL_REQUIRED` before creating a token or attempting delivery. No automatic SMS or phone-based ownership proof is available. Users see this limitation in account settings; administrators see it in account management.
- The existing Super Admin email-add/change workflow still requires reauthentication, audited reason, configured email delivery and a one-time link sent to the new email. Support must establish customer ownership through its established process; knowledge of an unverified phone alone is insufficient. Successful email completion retains phone and revokes old sessions. Token expiry, single use and delivery-failure invalidation are preserved.
- Individual admin deletion retains exact email confirmation for email accounts and accepts canonical phone confirmation for phone-only accounts. Bulk deletion retains its separate explicit count confirmation. Authorization, reauthentication, audit and unfinished-payment checks remain unchanged.
- Advertising consent and ObjectId-based analytics identification remain unchanged. Accounts without email never produce fabricated email matching data. Billing-only contact email is not used as an account email or analytics email identity.
- SlickPay requires a real billing email. Phone-only accounts collect one only at checkout, with a clear explanation. It is validated and sent for that invoice, not saved to User or accepted as a login/recovery identifier. Missing billing email is rejected before an invoice is claimed/submitted, so the order stays resumable. QR/activation and free access do not require email.

## Audit scope

The audit covered Register, Login, Activation, AuthContext and the shared API client; onboarding pages/gates/experience and profile/settings; auth and activation routes/services; User schema; account recovery and account actions; admin user lists/details, deletion/bulk actions, Support Mode, broadcasts, dashboard and QR activation views; analytics identity/Meta matching; checkout/payment and WhatsApp account identification.

Remaining email references were classified: separate Admin credentials and admin-owned Telegram test-recipient checks continue to use email; contacts store unrelated address-book emails; operational seed/legacy-owner migration scripts retain email identities for their explicit legacy fixtures/imports. These are not public signup entry points. No authenticated self-service password-change endpoint existed in the audited routes; none was removed.

The broadcast regression suite had a fixture with identical campaign sort keys and an assertion that depended on their unspecified MongoDB tie order. The fixture now gives campaigns distinct start times. Broadcast worker behavior and security rules were not changed.

## Validation

Run from the repository root:

```sh
npm run test -w server
npm run test -w client
npm run lint
npm run i18n:check
npm run build
```

The server is JavaScript with no separate build script; its tests exercise the actual Express application. All database mutation tests use disposable `mongodb-memory-server` replica sets, including migration tests with real legacy unique indexes. Provider requests are mocked; no SMS, email or financial transaction is sent during validation.

Final results (2026-10-31):

| Check | Result |
| --- | --- |
| Backend suite | 26 files, 308 tests passed (`vitest run --maxWorkers=4`) |
| Frontend suite | 25 files, 83 tests passed (`vitest run --maxWorkers=2`) |
| ESLint | Passed |
| Translation static-string audit | Passed |
| Vite production build | Passed; existing large-chunk advisory remains |
| Mobile browser QA | Signup/login in English and Arabic at 320 x 760; no horizontal overflow; phone/identifier fields remain LTR; signup has no email input |
| Configured database inspection | Read-only, no problems; account/index fingerprint unchanged on repeat inspection |
| Git whitespace check | Passed |

Database inspection fingerprint at both reads: `fba31eed035fdf696e24081a2a6de054f38945c56b3b0e9354c4139c363f1173`. This is evidence of this audit, not a deployment authorization or a replacement for a fresh production inspection. The migration apply step was not run against the configured database. Mobile preview used a disposable MongoDB replica set and no real account or payment.

Verification logs are available locally as `server-phone-verified.log`, `client-phone-verified.log`, `lint-phone-verified.log`, `i18n-phone-verified.log`, `build-phone-verified.log` and `identity-index-inspection.log` (ignored by Git).

## Reference contracts

- [libphonenumber-js parsing and validation](https://github.com/catamphetamine/libphonenumber-js)
- [MongoDB partial unique indexes](https://www.mongodb.com/docs/manual/core/index-partial/)
- [SlickPay invoice creation](https://developers.slick-pay.com/invoices/create)

## Exact changed-file manifest

56 files, including this guide. Paths below are repository-relative.

- `client/src/api/client.js`
- `client/src/components/Layout.jsx`
- `client/src/components/PhoneField.jsx`
- `client/src/context/AuthContext.jsx`
- `client/src/i18n/locales/ar.js`
- `client/src/i18n/locales/en.js`
- `client/src/marketing/whatsapp.js`
- `client/src/pages/Activation.jsx`
- `client/src/pages/Activation.test.jsx`
- `client/src/pages/Admin.jsx`
- `client/src/pages/Checkout.jsx`
- `client/src/pages/Checkout.test.jsx`
- `client/src/pages/Login.jsx`
- `client/src/pages/Login.test.jsx`
- `client/src/pages/Register.jsx`
- `client/src/pages/Register.test.jsx`
- `client/src/pages/Settings.jsx`
- `client/src/pages/Subscribe.jsx`
- `client/src/pages/admin/AccountDialog.jsx`
- `client/src/pages/admin/Broadcast.jsx`
- `client/src/pages/admin/BulkUserActions.jsx`
- `client/src/pages/admin/DeleteUserDialog.jsx`
- `client/src/pages/admin/QrBatches.jsx`
- `client/src/pages/admin/SupportWorkspace.jsx`
- `client/src/pages/admin/UserDetail.jsx`
- `client/src/pages/admin/UserManagementActions.test.jsx`
- `docs/PHONE-AUTH.md`
- `package-lock.json`
- `server/package.json`
- `server/src/models/User.js`
- `server/src/routes/activation.js`
- `server/src/routes/adminActivationLinks.js`
- `server/src/routes/adminBroadcast.js`
- `server/src/routes/adminOperations.js`
- `server/src/routes/adminSupport.js`
- `server/src/routes/adminUserActions.js`
- `server/src/routes/adminUsers.js`
- `server/src/routes/auth.js`
- `server/src/routes/payments.js`
- `server/src/scripts/migrateUserIdentities.js`
- `server/src/server.js`
- `server/src/services/accountRecoveryService.js`
- `server/src/services/activationService.js`
- `server/src/services/adminUserLifecycleService.js`
- `server/src/services/authService.js`
- `server/src/services/broadcastAudience.js`
- `server/src/services/identityMigrationService.js`
- `server/src/services/paymentService.js`
- `server/src/services/qrBatchService.js`
- `server/src/services/registrationService.js`
- `server/src/utils/userIdentity.js`
- `server/test/broadcast.test.js`
- `server/test/commerce.test.js`
- `server/test/freemiumAccess.test.js`
- `server/test/multiuser.test.js`
- `server/test/phoneAuth.test.js`
