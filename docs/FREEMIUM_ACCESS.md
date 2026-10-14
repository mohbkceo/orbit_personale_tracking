# Freemium access control

## Rollout

Deploy the server and client together. The server calls `ensureAccessCatalog()` after MongoDB connects. This idempotently inserts the protected Free plan and the current workspace sections and capabilities, then maps legacy paid plan features to the new section keys on the first rollout. It does not remove subscriptions, payments, activation links, Telegram connections, or user records. MongoDB must support transactions, as the existing registration, payment, and activation flows already require.

The Free plan is a permanent eligibility rule for every `ACTIVE` user. It is not represented by an expiring `AccessSubscription`. An active paid subscription supplies a paid plan snapshot; expiration falls back to Free. Suspended users remain blocked. New paid subscriptions record `entitlementVersion: 1`; older subscriptions continue to resolve their historical snapshot and legacy feature aliases. Paid feature edits apply to future purchases unless a Super Admin selects **Apply plan assignments to existing paid subscribers**. That action writes explicit subscription overrides without changing payment evidence or the purchased snapshot. Global `FREE` and `DISABLED` changes take effect for everyone after the configuration refresh.

Deploy with a database backup, let one server instance finish the seed before serving traffic, and check `/api/public/plans`, `/api/me/capabilities`, and the Admin Access Control matrix. No new environment variable is required. Existing Telegram bot configuration and payment configuration stay in use. Do not rerun the old `seedPlansAndFeatures.js` to change access assignments; it now inserts missing legacy records only.

## Admin guide

Open **Admin → Access Control** as a Super Admin. Search or filter the matrix, select a section or capability, edit it, then save. The plan columns are generated from active database plans. The preview selector simulates a plan, including inherited Free access.

- **Free for everyone:** set Access mode to **Free for everyone**. All active accounts, including paid accounts, can use it.
- **Only Plus:** set Access mode to **Selected plans** and enable Plus. Disable the Free and other paid plan boxes. The actual plan name comes from the database.
- **Only Ultimate:** use **Selected plans** and enable only Ultimate.
- **Multiple plans:** enable every intended plan in **Selected plans**. A feature assigned to Free is inherited by paid users.
- **Limit:** select a `LIMIT` capability, enable it for each intended plan, and enter its maximum. `0` blocks new items, a positive integer caps active items, and an unassigned limit is unlimited if its parent feature is available. The API rejects an enabled limit without a number.
- **Locked view:** edit Locked title, description, upgrade explanation, button label, preview style, navigation visibility, and recommended paid plan. Save to publish the copy without a deployment. Pricing page visibility is controlled separately.
- **Globally unavailable:** set Access mode to **Unavailable globally**. Users see an unavailable message without an upgrade prompt.

Ordinary plan assignment edits preserve active paid subscription snapshots. Select **Apply plan assignments to existing paid subscribers** to update those customers deliberately. Every Access Control update is validated and written with an audit record. The system Dashboard feature cannot be disabled, and the Free plan cannot be priced, expired, hidden, or deactivated.

## API

All responses use the existing `{ success, data }` envelope. Authentication is required for user endpoints; the admin endpoints require `SUPER_ADMIN`.

| Endpoint | Contract |
| --- | --- |
| `GET /api/me/capabilities` | Returns `effectivePlan: { id, name, slug, type }`, `subscriptionExpiresAt`, `configurationVersion`, and `capabilities` keyed by feature. Each decision includes `allowed`, `reason`, `currentPlan`, `limit`, and locked `presentation`; configured limits also include `used` and `remaining`. |
| `GET /api/me/entitlements/:key` | Returns one decision; unknown keys return 404. |
| `GET /api/admin/access-control` | Returns the Feature catalog, existing Plans with assignments, and configuration version. |
| `PATCH /api/admin/access-control/:key` | Accepts validated `accessMode`, display fields, `locked` copy/presentation fields, `plans: [{ planId, enabled, limit?, value? }]`, and optional `applyExisting`. Returns the updated Feature and configuration version. |
| `GET /api/admin/access-control/preview?planId=...` | Returns effective decisions for that plan, including Free inheritance. |
| `GET /api/telegram-link` | Returns the shared connection status. Available to every active account. |
| `POST /api/telegram-link` | Creates a secure temporary single-use bot link; returns 201. |
| `DELETE /api/telegram-link` | Disconnects the linked identity. |

Blocked operations return 403 with `code: FEATURE_NOT_INCLUDED`, `FEATURE_DISABLED`, or `USER_SUSPENDED`, plus `feature` and an available `upgradePlan` when appropriate. Quota exhaustion returns 409 `FEATURE_LIMIT_EXCEEDED`. Missing or failed entitlement configuration is never interpreted as access granted.

## Runtime behavior

The client loads one capability snapshot for the workspace and refreshes it on visibility, after access-changing actions, and periodically while visible. The server caches shared catalog data briefly and invalidates it on admin changes. The shared Telegram context fetches account status once; the connection dialog polls only while linking and stops after success, cancellation, or unmount. Locked routes render skeleton previews without mounting the private page. APIs, Quick Add paths, bot commands and callbacks, and relevant jobs check the same backend entitlements. Quota writes serialize a per-user/per-feature count and write through a MongoDB lock.
