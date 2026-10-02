# First-party analytics

Orbit stores acquisition, visitor identity, sessions, semantic events, and WhatsApp leads in dedicated MongoDB collections. AuditLog and Activity remain operational records. The application database is the attribution source of truth; no advertising or analytics provider is configured.

## Instrumenting an event

Use `analytics.track(EVENTS.SIGNUP_STARTED)` from `client/src/analytics/client.js` for a meaningful browser intent. Add the name to `shared/analyticsEvents.js` and, if it is allowed from the browser, to the server's `WEB_EVENTS` allowlist. Web events are queued and batched to `/api/analytics/events/batch`. The server owns visitor, session, and user identity; callers cannot supply those IDs. Product completion events should come from the backend with `recordProductEvent`, using an entity-derived event ID. Confirmed conversions use `recordServerEvent` with a stable business ID.

Current account funnel: `page_viewed` → `registration_completed` → `access_activated`. WhatsApp `contact_started` and `lead_created` form an optional sales handoff and are reported separately. The online payment button is disabled, so there is no purchase or revenue event. `access_activated` means an activation link was successfully consumed, not that money was paid.

## Attribution and sessions

The browser opens `/api/analytics/session` on initial load with its landing URL and external referrer. The backend accepts only configured own origins as landing URLs, redacts activation tokens from paths, strips query strings from stored URLs, and keeps bounded marketing parameters and click IDs. Channel classification lives in `channelClassifier.js`. A session is reused while active and expires after 30 minutes of inactivity; a genuinely different tagged external entry can start a new session sooner. Internal route changes emit page views but do not update attribution. A new session updates `lastTouch`; only non-direct touches update `lastNonDirectTouch`. `firstTouch` stays fixed after the initial touch.

Signed HttpOnly first-party cookies carry random visitor and session IDs. Login and registration claim an anonymous visitor; another authenticated account on the same browser receives a new visitor ID. Logout clears these analytics cookies. Anonymous event and session rows are linked when an anonymous visitor is claimed. No fingerprinting or IP history is stored.

## WhatsApp leads and conversions

The WhatsApp contact action calls `/api/analytics/leads`, receives a `LEAD-...` code, and includes it in the outgoing message. An admin can create an activation link with `leadCode` in `POST /api/admin/activation-links`. Using that link marks the lead converted and carries its touch snapshot into `access_activated`, even if activation happens on another browser. The server uses unique event IDs (`registration:<userId>` and `access:<subscriptionId>`) to avoid duplicate conversions. External analytics providers can register with `eventDispatcher.js`; advertising conversion providers can register with `conversionDispatcher.js`. Both dispatch only after internal storage succeeds. No providers are active.

Admin analytics is available under `/api/admin/analytics` with overview, acquisition, campaigns, funnel, events, conversions, leads, retention, and product endpoints. Funnel counts require each step to occur after the preceding step for the same visitor. Filters use UTC dates (`from`, `to`) and exact source, medium, campaign, content, channel, or conversion names as appropriate. Event and lead lists are paginated. Seven-day retention uses only visitor cohorts old enough to complete the 7–14 day return window.

## Admin dashboard

`/admin/analytics` is available to authenticated `ADMIN` and `SUPER_ADMIN` accounts. Its pages cover Overview, Acquisition, Campaigns, Funnel, Conversions, Product, Retention, Visitors, Sessions, and Events. Date range, attribution model, and supported filters live in the URL. Previous-period comparison is available on Overview and Funnel. Tables based on raw records use server pagination; breakdowns are capped at 100 groups. Trends are UTC hourly, daily, or weekly according to the selected range.

The dashboard consumes `/api/admin/analytics/overview`, `/trend`, `/performance`, `/source-quality`, `/funnel`, `/conversions`, `/conversions/:eventId/journey`, `/product`, `/retention`, `/visitors`, `/visitors/:visitorId/journey`, `/sessions`, `/event-summary`, `/event-trend`, and `/events`. All remain behind the server's admin authentication middleware. Conversion and visitor journeys return bounded session, event, and lead summaries; event properties, full referrer URLs, and marketing query maps are not returned by these UI-facing reports.

Traffic columns use each session's acquisition touch. Conversion columns use the selected first, last, or last non-direct touch snapshot. Period conversion-to-visitor ratios can differ from cohort activation rates because a conversion may follow a visit in an earlier period. Source quality uses users who registered in the selected period: it checks whether they later activated access or created a task or project. Retention reports a true day 7–13 return window for mature first-seen cohorts. The application has no ad spend or payment revenue source, so the UI has no ROAS, CPA, or revenue metrics.

## Privacy and configuration

There was no existing consent UI or consent state in this app. Set both `VITE_ANALYTICS_REQUIRE_CONSENT=true` in `client/.env` and `ANALYTICS_REQUIRE_CONSENT=true` in the server environment in a jurisdiction requiring prior analytics consent; the app then shows an allow/decline prompt. The server also gates conversion and product events. While consent is required and absent, the browser makes no analytics tracking requests or persistent analytics identifier. `analytics.setConsent(false)` stops future browser collection and clears analytics cookies; a data deletion workflow would need to be added to meet any applicable erasure policy. Set a retention policy before enabling tracking in such a jurisdiction.

`CLIENT_URL` must list the application's public origin so campaign URLs are accepted. External analytics and ad platforms require their own credentials and adapter implementation.
