# Orbit registration, Meta and SlickPay deployment

## Launch state and verified contract

Live CAPI and SlickPay are **disabled by default**. Public registration is available
independently and grants no entitlement. No trial or recurring card billing is added.
The application remains the source of truth; Meta is optional advertising measurement.
No live transaction has been used to test this change.

Contract sources inspected on 2026-10-12:

- [Create invoice](https://developers.slick-pay.com/invoices/create): POST
  `/api/v2/users/invoices`, amount, inline billing details, items and return URL;
  top-level `success: 1`, numeric `id`, hosted `url`.
- [Invoice details](https://developers.slick-pay.com/invoices/details): authenticated
  GET `/api/v2/users/invoices/:id`. The nested response is abbreviated in this reference.
- [Quick integration](https://developers.slick-pay.com/quick-integration): SATIM
  redirect and authoritative server status lookup. Its examples differ from the create
  reference (wrapped URL, different hostname and `payment_status`).
- [Official Node SDK core](https://github.com/Slick-Pay-Algeria/slickpay-npm/blob/main/core.js):
  sandbox `https://devapi.slick-pay.com`, production `https://prodapi.slick-pay.com`.
- [Official WooCommerce gateway](https://github.com/Slick-Pay-Algeria/slickpay-wp):
  `data.completed == 1`, `data.transaction.amount`, `data.serial`, DZD-only channel.
  Orbit uses strict numeric completion and exact amount checks against this contract;
  unknown/contradictory payloads fail closed. DZD is intrinsic to this documented channel;
  an explicitly returned conflicting currency is rejected.
- [Meta Business SDK](https://github.com/facebook/facebook-nodejs-business-sdk): Graph
  `v26.0`, server event fields and matching normalization. Meta's documentation endpoints
  returned HTTP 429 during implementation; the official SDK supplied the primary reference.

**Merchant launch gate:** validate these exact response fields, amount units (DZD, not
minor units), invoice identity and payment URL with your own sandbox account. Retain
redacted fixtures, obtain clarification from SlickPay for any differences, and adjust
only the provider adapter and corresponding contract tests. A boolean flag does not
substitute for this validation. Production cannot use sandbox payments to grant access.

**Unsupported provider capabilities:** no verified idempotency-header contract, signature
algorithm, final failed/cancelled/expired payment codes, refund or reversal API. Webhooks
return 501 and never grant access. `SLICKPAY_WEBHOOK_URL` is reserved, not sent to SlickPay.
`SLICKPAY_WEBHOOK_SECRET` is intentionally neither accepted nor used until a documented
verification method is available. Refunds require a reviewed business workflow; do not
delete grants or shorten aggregate expiry manually, especially after later renewals.

## Environment configuration

Frontend / Vercel (`client/.env.example`):

| Variable | Value / purpose |
|---|---|
| `VITE_META_PIXEL_ID` | `1432887715641697` (public) |
| `VITE_META_PIXEL_ENABLED` | `false`; opt in only for development Pixel tests |
| `VITE_ANALYTICS_REQUIRE_CONSENT` | Existing internal analytics consent flag; match backend |

Backend / Railway (root `.env.example`):

| Variable | Default / purpose |
|---|---|
| `META_PIXEL_ID` | `1432887715641697` |
| `META_CAPI_ENABLED` | `false` |
| `META_CAPI_ACCESS_TOKEN` | Empty; newly rotated token only, backend secret |
| `META_CAPI_TEST_EVENT_CODE` | Empty; use Events Manager code during validation |
| `META_GRAPH_API_VERSION` | `v26.0`; verify support before changing |
| `SLICKPAY_ENABLED` | `false` |
| `SLICKPAY_ENV` | `sandbox` or `production` |
| `SLICKPAY_API_KEY` | Empty; merchant environment's key, backend only |
| `SLICKPAY_RETURN_URL` | HTTPS frontend URL ending exactly `/checkout/return` |
| `SLICKPAY_WEBHOOK_URL` | Empty, reserved/unused |
| `SLICKPAY_CONTRACT_VERIFIED` | `false`; required with production environment on production server |
| `CLIENT_URL` | Comma-separated permitted frontend origins, canonical origin first |
| `APP_BASE_URL` | Public backend origin |
| `MONGODB_URI` | Replica set / Atlas; transactions are mandatory |
| `AUTH_JWT_SECRET` | Existing secure signing key; also signs consent cookies |
| `SETTINGS_ENCRYPTION_KEY` | Existing encryption key; encrypts pending Meta payloads |
| `ANALYTICS_REQUIRE_CONSENT` | Existing internal analytics policy flag |

Do not place API keys/tokens in any Vite variable. Never use the documentation's public
test key in a deployment. Keep existing encryption keys stable across deployments.

Use the existing same-origin `/api` proxy from Vercel to Railway. HttpOnly cookies use
SameSite=Lax and are designed for this topology; pointing the browser directly at an
unrelated Railway domain is not equivalent. Forward Origin, Set-Cookie, User-Agent and
the two X-Orbit-Fb* headers. Configure the trusted proxy boundary correctly so req.ip
cannot be spoofed. Do not cache auth, consent, checkout, or payment endpoints.

Serve `/meta-pixel.html` and `/meta-pixel.js` as actual static files before the SPA fallback.
The iframe uses `Referrer-Policy: no-referrer` and a sanitized same-origin path. The parent
must allow `frame-src 'self'`. The frame's CSP needs `script-src 'self'
https://connect.facebook.net`, `connect-src https://www.facebook.com
https://connect.facebook.net`, `img-src https://www.facebook.com`, and `frame-ancestors
'self'`. Express sets these for the frame; mirror them in Vercel headers if adding a CSP.
Disable automatic events and advanced matching rules in Events Manager: Orbit sends only
explicit events and handles permitted hashed matching on the backend.

## Database rollout

1. Back up production MongoDB and validate on a staging replica set.
2. Deploy with SlickPay/CAPI disabled. Do not run against production during development tests.
3. Run `npm run migrate:commerce -w server` once (safe to repeat).
4. The migration builds a partial unique `activationLink` index before removing its legacy
   non-partial unique index; it backfills only missing source values on link subscriptions.
   It creates unique order, open-checkout, invoice/reference and delivery indexes. It does
   not delete users, links or subscriptions or change any expiry date.
5. Verify source values, existing expiry dates and index definitions before enabling payments.
   Startup refuses enabled SlickPay with an unmigrated activation index.

New `PaymentOrder` and `AdvertisingConsent` collections; optional `User.advertisingAllowed`;
`AccessSubscription.source/order`; encrypted, excluded-by-default `AnalyticsEvent.metaDelivery`.
Legacy subscriptions lacking source retain their original behavior. Orders and consent must
also be included in your data-export/deletion and retention operations.

## Customer and order flow

Landing → configured Pricing plan → minimal registration or existing login → billing
(first/last name, phone, address; account email reused) → pending Orbit order → backend
invoice creation → hosted SATIM → `/checkout/return?order=<Orbit ID>` → authenticated
server verification → atomic PAID/order, entitlement, internal purchase event and Meta outbox
→ optional Telegram/personalization → existing workspace.

The amount always comes from the backend Plan in DZD. The quote expires after 30 minutes
before invoice creation. Plan/price availability is checked again when creating the invoice.
After invoice creation the committed plan snapshot is honored even if an admin later edits
the plan. New entitlement dates extend from max(now, latest expiry), under the same user
write lock as activation links. Features change immediately according to the latest grant,
matching the existing activation service. Renewals never shorten already valid access.

One open checkout per user prevents duplicate charges across tabs and retries. The unique
request key also resolves response-loss retries. A definite invoice validation rejection
becomes FAILED; an abandoned unsent quote may become CANCELLED/EXPIRED. Unpaid provider
status remains PROCESSING. A provider timeout is never assumed to be a failed payment.

An ambiguous invoice POST (timeout, response loss, crash before persisting its ID) blocks
another charge and shows `INVOICE_UNCERTAIN`. **Recovery limitation:** because SlickPay does
not document an idempotency or lookup-by-Orbit-order contract, an operator must locate the
invoice in the merchant dashboard and verify its customer, amount, return order URL and
outcome. Do not simply retry POST or remove the open-order constraint. No automatic repair
is provided for an unknown invoice ID; add an audited recovery workflow only after that
provider contract is established. Known invoices resume through Access or checkout and
can be reconciled from Admin → Payments. Background reconciliation is capped at 48 checks;
subsequent authenticated user/admin checks remain available with a cooldown.

Webhook/return data never changes payment state. Only the stored invoice fetched with the
merchant key can confirm payment. Unique environment+reference prevents replay across orders.
Confirmed purchases and account suspension remain distinct: payment is recorded, but a
suspended user still fails accessGuard.

## New HTTP endpoints

| Endpoint | Authorization / purpose |
|---|---|
| `POST /api/auth/register` | Public, rate-limited; fullName/email/password |
| `GET/POST /api/analytics/advertising-consent` | Browser consent status / explicit choice |
| `GET /api/payments/orders` | User's recent orders |
| `POST /api/payments/orders` | User; planId and UUID key; starts real checkout |
| `GET /api/payments/orders/:id` | Owner only, sanitized order |
| `POST /api/payments/orders/:id/pay` | Owner; required billing fields; one invoice |
| `POST /api/payments/orders/:id/verify` | Owner; empty body; authoritative lookup |
| `POST /api/payments/orders/:id/cancel` | Owner; only unsent PENDING orders |
| `POST /api/payments/webhook` | Deliberately unsupported (501) |
| `GET /api/admin/payments` | Existing admin auth; paginated safe fields |
| `POST /api/admin/payments/:id/verify` | Existing admin auth; audited lookup |
| `GET /api/admin/payments/meta-delivery` | Safe queue counts and failed event IDs/codes |
| `POST /api/admin/payments/meta-delivery/:eventId/retry` | Audited bounded retry, still checks consent/age |

`GET /api/public/config` adds `payments.enabled/currency`; no credentials are exposed.
Registration responses and relevant order responses include stable browser conversion IDs.

## Meta and consent verification

1. Rotate the exposed Meta token in Meta; configure only the new token on Railway.
2. Enable CAPI on staging with the test event code. Opt into Pixel development testing only
   on a test deployment. Leave production payments disabled.
3. Decline advertising: verify no requests to Meta, no Pixel script/iframe load, no CAPI outbox
   payload. Internal analytics follows its separate consent policy. GPC prevents ad consent.
4. Grant advertising: verify one PageView for initial eligible navigation and one per meaningful
   path change, even in React StrictMode. Verify no query strings/tokens enter Meta requests.
5. Complete registration: one `CompleteRegistration` with `registration:<userId>`. Login and
   failed/duplicate registration do not create this event.
6. Submit a real plan checkout: `InitiateCheckout`, `checkout:<orderId>`, configured plan/value.
7. With merchant sandbox responses validated: Purchase only after durable PAID confirmation,
   `purchase:<orderId>`, DZD and actual confirmed value. Confirm matching event name/ID across
   browser and server in Events Manager Test Events and diagnostics. No StartTrial is sent.
8. Withdraw through Privacy choices, including from another tab: future browser events stop;
   queued deliveries are cancelled. Already-transmitted events cannot be recalled by withdrawal.
9. Disable Meta/network: registration and paid activation still complete; eligible stored
   events retry asynchronously with identical IDs. Verify queue monitoring and operator retry.

Email is trimmed/lowercased and SHA-256 hashed; phone is included only with explicit country
code; stable account ID is hashed. IP, user-agent, fbp/fbc remain un-hashed inside encrypted
pending payloads. No fabricated matching identifiers. fbc derives only from a genuine fbclid
observed in the landing URL after consent. Matching data is never returned in analytics/admin
payloads or logged. Payloads are removed on send/withdrawal and after six days; failed delivery
keeps encrypted data within that window for an audited retry (maximum eight attempts per run).

## Deployment checklist, monitoring and rollback

- [ ] Verify credentials, HTTPS origins, same-origin proxy, static iframe files and CSP.
- [ ] Back up data; run and verify migration on staging, then production with flags off.
- [ ] Validate real merchant sandbox schema, URLs, amount/fees and SATIM return experience;
  no live financial tests are performed by the automated suite.
- [ ] Test new registration/login, unpaid access rejection, known-order recovery and expiry.
- [ ] Test existing QR/link activation, Telegram, admin plan editing and WhatsApp/COD.
- [ ] Test Pixel/CAPI consent, hashing, matching IDs and Meta test diagnostics.
- [ ] Inspect Admin → Payments and Meta delivery status; alert on INVOICE_UNCERTAIN,
  mismatch codes, long-pending payments and DEAD outbox entries. Never log provider bodies.
- [ ] Set merchant production credentials and environment only after contract validation;
  then set SLICKPAY_CONTRACT_VERIFIED and SLICKPAY_ENABLED deliberately.
- [ ] Remove Meta test code and enable live CAPI deliberately after validation.
- [ ] Rollback: disable payment/CAPI flags first; retain orders, grants and the partial index.
  Do not restore the old required/unique-null activation schema while purchase grants exist.
  Disabling provider flags pauses reconciliation: re-enable with validated credentials to
  finish known pending payments. Existing paid entitlements remain usable.

Automated verification: `npm run test -w server`, `npm run test -w client`, `npm run lint`,
`npm run build`. Provider calls in commerce tests are mocked; MongoDB uses an isolated
in-memory replica set. See the implementation delivery for actual executed test results.
