# Orbit Meta audit — 2026-10-19

## Verdict and live evidence

**Production visit tracking: FAIL. Production registration tracking: NOT VERIFIED
(browser path FAIL).**
The deployed `https://orbit.tooutdo.com` JavaScript bundle contains `vp=""`
and a numeric-ID guard, so it never creates the Pixel iframe. After granting
advertising consent through Orbit's own control on a landing visit, the
connected Chrome tab had zero `/meta-pixel.html` iframes. SPA visits to
`/features` and `/pricing` also had zero. The test consent was withdrawn.
The production bundle contained zero instances of dataset ID
`1432887715641697`. The `/meta-pixel.html` and `/meta-pixel.js` static files
both returned HTTP 200. The parent CSP permits same-origin frames and the
iframe CSP permits `connect.facebook.net` and `www.facebook.com`; CSP is not
the observed blocker. A browser request trace was unavailable; the absent
iframe and empty compiled ID explain why no Pixel request is expected. No
real account was created.

Connected Meta Events Manager showed dataset **ORBIT — Website**, ID
`1432887715641697`, owned by business `4557191121277130` and shared with ad
account `3015830155427067`. Overview said the dataset had received no
activity for its selected Sep 21–Oct 18 period. Test Events displayed the
website test instructions but no received PageView or CompleteRegistration
after opening the production site. Diagnostics reported no errors; this does
not prove healthy delivery. The Conversions API connection was marked pending.
Meta Business Settings lists `tooutdo.com` as a verified domain in the Orbit
business portfolio. The dataset Settings page showed no configured website
allow list; it offered `Create allow list`.
Automatic events was Off. With the user's approval, automatic page/product
detail collection and automatic website matching were turned Off and their
Off states were verified in Settings. First-party cookie usage remains On.

## Source trace

Reviewed `client/src/main.jsx`, `App.jsx`, `analytics/{meta.js,client.js,
AdvertisingConsent.jsx}`, `public/{meta-pixel.html,meta-pixel.js}`,
`context/AuthContext.jsx`, `pages/{Register.jsx,Checkout.jsx,Activation.jsx}`,
`shared/{metaEvents.js,analyticsPath.js}`, and server auth, activation,
payments, registration, payment, consent, attribution, analytics, Meta provider,
dispatcher, worker, security, config, and model files.

React StrictMode mounts `App`, which synchronizes server advertising consent
and calls `meta.page()` on React Router path changes. Eligible public paths
are allowlisted. The iframe uses a sanitized path, no parent referrer, one
Pixel initialization, and explicit `trackSingle` events with event IDs.
Private, admin, activation-token, and unknown routes do not produce Meta page
events. The corrected client waits for the iframe's `fbevents.js` readiness
before dispatching queued events or recording them in session storage. It
retains queued registration during the immediate private-route redirect and
removes the iframe on refusal or withdrawal.

`POST /api/auth/register` returns 201 only after a new user and
`registration:<userId>` internal conversion commit. The success response
contains the matching browser event ID; `AuthContext.registerDirect` dispatches
it before React navigation. Failed validation, duplicate email, login, and
registration page views do not dispatch CompleteRegistration. Activation-link
registration has the same stable event shape; manual access activation is
separate and never Purchase. Meta failure cannot turn a committed registration
into a frontend signup failure.

Order creation records `checkout:<orderId>` and returns InitiateCheckout.
Only authoritative SlickPay invoice reconciliation to PAID records
`purchase:<orderId>` with DZD value and currency. The paid order response can
send the matching browser Purchase. No free registration, manual activation,
payment click, or unverified return is Purchase.

The server uses the encrypted `AnalyticsEvent.metaDelivery` outbox, consent
lookup, bearer-token Graph API transport, `event_time`, `action_source=website`,
sanitized `event_source_url`, hashed normalized email/external ID and eligible
phone, and validated IP, user agent, `_fbp`, `_fbc`. It retries with leases and
bounded backoff, expires pending payloads after six days, and supports a test
event code. The same event name and ID are used by browser and CAPI. No live
server receipt or Meta deduplication was observed.

## Event verification matrix

| Event | Code / local tests | Staging | Production browser/network | Meta receipt | Browser/CAPI dedup |
|---|---|---|---|---|---|
| PageView | Public landing and SPA navigation; PASS | NOT VERIFIED: no staging deployment | FAIL: consented public pages made no iframe, so the Pixel script/request path was not reached | NOT VERIFIED: no event in Test Events | No CAPI pair |
| ViewContent | Intentional landing and pricing views; PASS | NOT VERIFIED | FAIL: same missing iframe | NOT VERIFIED | No CAPI pair |
| CompleteRegistration | Confirmed new account, stable `registration:<userId>`; PASS | NOT VERIFIED | NOT VERIFIED: no real account created; deployed Pixel disabled | NOT VERIFIED | Matching name/ID in code; live pair NOT VERIFIED |
| InitiateCheckout | Actual order creation, stable `checkout:<orderId>`; PASS | NOT VERIFIED | NOT VERIFIED: no live checkout | NOT VERIFIED | Matching name/ID in code; live pair NOT VERIFIED |
| Purchase | Confirmed paid invoice only, DZD value/currency, stable `purchase:<orderId>`; PASS | NOT VERIFIED | NOT VERIFIED: no real payment | NOT VERIFIED | Matching name/ID in code; live pair NOT VERIFIED |

No staging deployment or permitted test account was provided. Local tests use
isolated fixtures and mocked transport; they are not Meta receipts.

## Configuration and privacy

The local frontend has no `client/.env`; the old production bundle likewise
had no Pixel ID. The corrected source falls back to the required public ID in
production and fails closed on a different ID. Development still requires
`VITE_META_PIXEL_ENABLED=true` to use the Pixel. The backend defaults to the
required ID and now rejects a different configured ID. Local CAPI settings are
absent, so it is disabled with no access token; production secrets are not
visible from this workspace. Do not infer production CAPI delivery from the
pending connection label or HTTP success alone.

First-party analytics is separate from advertising consent. A tagged Instagram
bio arrival can retain source, medium, and campaign through the visitor/session
and registration snapshot. Referrer-stripped, untagged arrivals are direct.
Only genuine, permitted `fbclid` creates `_fbc` for Meta; internal analytics
may retain a click ID under its own consent policy. No password or raw email
appears in Meta browser custom data. Bounded UTM values are accepted as
first-party attribution, so operators must avoid placing PII in campaign tags.
Already in-flight CAPI requests cannot be recalled after consent withdrawal;
the server cancels queued deliveries and rechecks consent before sending.

## Tests and remaining work

- `npm run test -w client -- src/analytics/meta.test.js src/pages/Register.test.jsx src/pages/Checkout.test.jsx`: 17/17 passed.
- `npm run test -w server -- test/analytics.test.js test/commerce.test.js`: 40/40 passed.
- `npm run lint`: passed.
- `npm run build`: passed; the locally built main bundle contains the required Pixel ID and iframe reference.

No commit was created. Other pre-existing working-tree edits were left in
place.

Scoped changes: `client/src/analytics/meta.js`, `client/public/meta-pixel.js`,
`client/src/context/AuthContext.jsx` (only the optional Meta dispatch guards),
`client/src/analytics/meta.test.js`, `server/src/config/env.js`, `ANALYTICS.md`,
`docs/COMMERCE-DEPLOYMENT.md`, and this report. The working tree also contains
unrelated existing UI/i18n edits; those are excluded from the proposed Meta
deployment.

1. Production deployment has been approved, but the deployment method or access
   path has not yet been provided. Deploy only the scoped Meta changes, excluding
   unrelated working-tree edits, then confirm the served bundle embeds ID
   `1432887715641697`.
2. Using a consented test browser, verify exactly one `fbevents.js` load and
   the intended `tr` PageView/SPA requests, then a PageView in Meta Test Events.
   Confirm refusal and withdrawal stop them.
3. Use a designated staging/test account for a successful registration; do not
   create a real public account solely for telemetry. Compare browser
   CompleteRegistration `eventID`, the durable event, and Meta Test Events.
4. Configure an approved backend CAPI access token, `META_CAPI_ENABLED=true`,
   the required Pixel ID, a supported Graph API version, and a temporary
   `META_CAPI_TEST_EVENT_CODE` in the target environment. Inspect outbox
   statuses and Meta browser/server deduplication, then remove the test code.
5. Inspect any production proxy forwarding for consent, cookies, Origin, user
   agent, and `X-Orbit-Fb*` headers. Production environment and deployment
   access were unavailable in this audit.

Meta's [Graph API version table](https://developers.facebook.com/docs/graph-api/changelog/versions/)
lists v26.0 as released July 29, 2026, with expiration TBD. Its
[deduplication guide](https://developers.facebook.com/documentation/ads-commerce/conversions-api/deduplicate-pixel-and-server-events)
confirms the `eventID`/`event_id` plus event-name pairing used here. Live CAPI
acceptance on v26.0 remains unverified without a configured token and event.
