# Onboarding Studio

Open **Admin → Management → Onboarding** (`/admin/onboarding`). Super Admins can edit and publish; other authenticated administrators can inspect reports and responses under Orbit's existing admin read-access policy. CSV export is restricted to Super Admins.

Edit pages in Builder, configure fields in Question Editor, then try the entire draft in Preview. Save draft keeps work private. Publish validates the complete English/Arabic definition, creates an immutable snapshot, and atomically activates it for new sessions. Editing a published version saves a new draft. Select a previous published version and use Make active to roll back. Changing a question type creates a new ID; labels and emojis can change while historical answers retain their snapshot definitions.

## Deployment

- Deploy server and client together and run the normal production build. No destructive migration or environment variables are needed.
- Startup creates indexes for `onboardingflows`, `onboardingconfigurations`, and `onboardingresponses`, then safely initializes the existing welcome/features/Telegram template. Existing user fields and data remain intact. Do not use `syncIndexes()`.
- Publishing uses MongoDB transactions and therefore requires a replica set, as do Orbit's existing transactional admin actions.
- Older accounts remain unprompted. Completed/skipped users stay dismissed. Legacy in-progress users retain the original tour; new sessions use the active snapshot. Publication does not change subscriptions or feature permissions.
- The existing admin reset action creates a separate response attempt while retaining previous answers. User deletion removes questionnaire responses along with other personal workspace data.

## Response and statistics semantics

The authenticated user API returns only published definitions. A session is pinned when started. Answers and navigation use an optimistic revision to reject concurrent stale writes; completed submissions are idempotent. The existing `firstUseOnboarding` state mirrors the authoritative response record. Navigation, skips, entered pages, and entered questions are persisted. Optional unanswered fields remain absent, including numeric fields; zero and false are valid answers.

The renderer saves progressively and retains unsaved input in tab-scoped session storage keyed by user, version, and reset attempt. Network failures show retry controls. A conflicting tab requires reloading to fetch current progress. Preview uses the same renderer without database submissions; its Telegram button is simulated.

Reports deduplicate by user within the filtered cohort, keeping the most recently updated matching attempt. Dates filter session start timestamps in UTC; subscription filters use the plan name captured at session start. Each question/version has its own cohort and definitions. Choice percentages use answered respondents; multiple-choice percentages can exceed 100% in total. Numeric statistics include only actual numbers. Text answers are inspectable and paginated, never treated as numeric measures. Date distributions group by month.

Question counts distinguish answered, explicitly skipped, pending on a seen page, and never reached. Completion time is elapsed time, including time away. Status filters separate completed, partial, and skipped submissions. Activities from before response tracking existed are not fabricated or backfilled into these KPIs. CSV exports use snapshot labels and stable answer values, protect against spreadsheet formula injection, and create an audit event without logging personal answers. Questionnaire answers are never sent to advertising or third-party analytics.

V1 limits: 50 pages, 100 questions per flow, 20 questions per page, and 100 choices per question. Existing HTTP request-size limits also apply. Prefer one question or a small group per screen.
