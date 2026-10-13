# Commerce architecture audit (2026-10-12)

The existing Express app uses HttpOnly JWT cookies, bcrypt (cost 12), Zod validation,
origin checks and rate limits. `userAuth` allows account actions; `accessGuard` protects
premium APIs. Public registration can therefore reuse authentication without granting access.

`activationService` reserves links during registration, then consumes them in a MongoDB
transaction. It serializes entitlement changes through `User.accessVersion`, snapshots
plan features and extends from the latest expiry with calendar-aware `addDuration`.
Online purchases must use the same lock and duration rules, with a real order reference
instead of an artificial activation link. The existing unique activationLink index
needs a partial replacement before inserting purchase entitlements.

Plans are administrator-managed; `publicPlans` filters ACTIVE/public plans and projects
public features. Pricing currently opens a contact modal with WhatsApp/COD and a disabled
online button. Landing already supplies brand styling and a product preview. Authentication
routes and checkout should retain a safe local destination and selected plan in the URL.
Activation-link onboarding and Telegram linking are independent and remain supported.

Analytics owns visitor/session identity and first/last/non-direct attribution. Server
registration and manual activation IDs are stable. `conversionDispatcher` is an empty
extension point. Durable Meta delivery belongs on the stored internal event, with encrypted
matching data excluded from ordinary queries and an independent revocable advertising
consent record. Manual access activation is not a purchase. No trial exists.

Provider sources inspected:
- https://developers.slick-pay.com/authentication
- https://developers.slick-pay.com/quick-integration
- https://developers.slick-pay.com/invoices/create
- https://developers.slick-pay.com/invoices/details
- https://github.com/Slick-Pay-Algeria/slickpay-npm/blob/main/core.js
- https://github.com/Slick-Pay-Algeria/slickpay-wp (official WooCommerce gateway)
- https://github.com/facebook/facebook-nodejs-business-sdk (server-side event/user data and Graph version)

SlickPay uses Bearer authorization, devapi/prodapi.slick-pay.com, `/api/v2/users/invoices`,
and hosted SATIM URLs. Inline billing requires firstname, lastname, phone, email, address.
The create reference returns top-level id/url; quick integration illustrates a wrapped
response. The official gateway checks data.completed and reads data.transaction.amount
and data.serial; it only enables DZD. These exact fields form the strict verification
adapter. Unknown or contradictory responses must remain unconfirmed.

Unverified provider capabilities: invoice idempotency key, webhook signature verification,
terminal failed/cancelled/expired codes and refunds. Do not invent these. Do not retry an
ambiguous invoice POST. Keep callbacks disabled and use authenticated verification plus
bounded reconciliation. Merchant sandbox validation of the response contract and amount
units is a production launch gate. No live financial transaction was performed in this audit.
