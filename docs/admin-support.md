# Admin user management and Support Mode

## Deployment

1. Deploy the server and client together. Use a MongoDB replica set; account, grant, and support actions require transactions.
2. Allow Mongoose to create indexes for `AuthSession`, `SupportSession`, `AccountActionToken`, `UserFeatureOverride`, `TelegramInteraction`, and the new partial unique `AccessSubscription.idempotencyKey` index. Check index creation before allowing administrative writes.
3. Existing users need no destructive migration. A missing `User.authVersion` is treated as `0`, so existing signed user cookies remain valid until their natural expiry or an explicit revoke-all action. New logins receive a tracked `AuthSession`.
4. Configure `RESEND_API_KEY` and a verified `EMAIL_FROM` sender to enable verified email changes and password recovery. Without both settings, those actions return `EMAIL_NOT_CONFIGURED` and make no account change. See [Resend's email API](https://resend.com/aws-lambda) for the supported delivery endpoint.
5. Keep `AUTH_JWT_SECRET` and all mail credentials server-side. Use HTTPS in production, and set `CLIENT_URL` to the exact frontend origin used for admin actions.

## Manual access policy

- `ADMIN_GRANT` records never claim to be SlickPay purchases or activation-link redemptions. The grant kind is `PAYMENT_CONFIRMED`, `COMPLIMENTARY`, or `SUPPORT_COMPENSATION`.
- Externally confirmed payment requires a reference and an admin reason. It does not change a `PaymentOrder`.
- Assigning a new active paid plan changes the effective plan immediately and adds its duration after any remaining valid paid time. Extending a current plan adds the selected days after its existing expiry.
- Each grant requires an idempotency UUID. A retry with the same UUID returns the original grant; a different request with that UUID is rejected.
- Only the latest active manual grant can be revoked. Earlier purchase and activation history is retained.
- Individual feature overrides are stored separately from plan definitions and are resolved by the same entitlement service used by web and Telegram.

## Support boundary

- The `orbit_support` cookie is HttpOnly, SameSite Strict, and expires after 15 minutes. It contains a random bearer token; only its SHA-256 digest is stored. It is bound to one active Super Admin and one target user.
- `/api/admin/support/session` and `/api/admin/support/workspace/:section` only read records owned by the session's target. The support router does not mount ordinary user routes or accept an arbitrary target ID for workspace reads.
- While the cookie represents a live support session, ordinary user APIs and other admin APIs are rejected by `supportRequestGuard`, including side-effectful GET routes. Exiting revokes the database session before clearing the cookie.
- Workspace lists are paginated at 100 records per page. Supported sections include dashboard, tasks, reminders, accounts, transactions, expenses, income, debts, bills, subscriptions, goals, projects, habits, wishlist, contacts, notes, followed events, and settings/Telegram connection state.
- Admins can terminate an active support session from Manage account. The scheduled worker audits expiry; access checks also revoke and audit an expired session immediately.

## User deletion and bulk actions

- A Super Admin can delete one user from the Security Danger Zone or select up to 20 users on one `/admin/users` page and apply Suspend, Unsuspend, Revoke all sessions, or Delete. These endpoints require the admin action header, a reason, and fresh admin password verification. Deletion also requires typed email or `DELETE N` confirmation.
- Deletion permanently removes the User document and user-owned workspace, settings, Telegram, authentication, analytics and support-note records in a MongoDB transaction. Existing web cookies stop authenticating, Telegram sessions and pending link tokens are removed, and support sessions and unused account-specific activation links are revoked.
- `PaymentOrder`, `AccessSubscription`, used `ActivationLink`, `SupportSession`, and `AuditLog` records remain for payment, access and accountability history. Active subscriptions are marked revoked while their duration and source history remain. Checkout URLs and attribution payloads are removed from retained payment orders. An account with a pending or processing payment cannot be deleted until that payment is resolved.
- Bulk status and session actions are atomic for the selected users. Bulk deletion runs one transaction per user and reports successes and blocked users individually; a blocked user does not roll back another completed deletion.
