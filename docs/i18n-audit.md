# EN/AR localization audit

## Scope and coverage

This audit follows the existing `react-i18next` catalogs, persisted language preference, document direction handling, and Telegram language setting. The public client source was inspected recursively, including conditional text, attributes, forms, dialogs, toasts, empty states, charts, filters, and shared components. Admin routes intentionally remain English and LTR as specified in `docs/i18n.md`.

| Route or surface | Nested coverage implemented |
| --- | --- |
| `/`, `/features`, `/about` | Existing marketing catalog retained; WhatsApp lead reference and directional call-to-action icons localized. |
| `/pricing`, `/checkout`, `/checkout/return`, `/access` | Pricing and checkout states, built-in plan names, features, duration, price, billing fields, status messages, and dates. |
| `/login`, `/register`, `/activate/:key`, `/onboarding` | Authentication copy, activation steps and gender choices, Telegram connection states, onboarding progress and examples. |
| `/panel`, `/panel/tasks`, `/panel/reminders`, `/panel/events` | Cards, charts, filters, action menus, nested forms and dialogs, reminder schedules, event notification confirmation, dynamic counts and statuses. |
| `/panel/money/accounts`, `/panel/money/transactions`, `/panel/money/expenses`, `/panel/money/income`, `/panel/money/debts` | Ledger and account forms, transaction modes, debt payments, archive confirmations, monetary values and status labels. |
| `/panel/planning/bills`, `/panel/planning/subscriptions`, `/panel/planning/goals` | Billing and goal forms, contribution and withdrawal workflows, due and renewal text, reminders and states. |
| `/panel/personal/{projects,habits,wishlist,contacts,notes}`, `/panel/settings` | Resource and field labels, empty states, nested settings sections, appearance choices, timezone text and Telegram settings. |
| Shared navigation and overlays | Sidebar, mobile navigation, Quick Add, search palette, Daily Focus, feature gate, rewards, icon picker, confirmation and locked states. |
| Telegram bot and background jobs | Commands, guided entry, callbacks, task and debt actions, reminder buttons and follow-ups, focus workflows, daily summary and task digest. Persisted recipient settings are read before scheduled delivery. |
| `/admin/*` | Preserved existing English/LTR behavior. Excluded from public string scanner. |

## Implementation notes

- Added corresponding English and Arabic catalog entries for static and dynamic copy. Canonical API status, feature, callback, and route identifiers remain unchanged; display labels are translated.
- Centralized user-visible date, time, number, and currency formatting in `client/src/utils/format.js`, using the selected language and workspace timezone/date format. Built-in plan presentation uses `client/src/utils/planDisplay.js`.
- Converted mapped configuration copy, conditional messages, confirm prompts, keyboard labels, and Telegram replies to reactive catalog lookups. The open-dialog language-switch test verifies that nested content updates without remounting.
- Added logical alignment and spacing classes in public UI, and mirrored navigation arrows in RTL. Existing sidebar RTL positioning and admin isolation remain intact.
- `scripts/check-i18n.mjs` parses public source with Babel and fails on hardcoded JSX text, human-facing attributes, rendered conditional and template strings, and direct notification text. Babel parser/traverse are explicit development dependencies for this check. The catalog tests also check namespace parity, nonempty values, interpolation signatures, static references, and plural forms. Exceptions are documented in the scanner for the Orbit brand, Iconify identifier, admin-only loading text, and canonical internal values.

## Verification

| Check | Result |
| --- | --- |
| Client tests | 18 files, 58 tests passed, including a nested Events dialog language-switch test. |
| Server tests | 22 files, 227 tests passed. |
| ESLint | Passed without warnings. |
| Production Vite build | Passed. Existing large-chunk advisory remains. |
| AST untranslated-string check | Passed. |
| Browser desktop/mobile | Local preview could not be opened by the browser automation surface (`ERR_BLOCKED_BY_CLIENT` for localhost; `ERR_CONNECTION_REFUSED` for 127.0.0.1). Pixel-level desktop and mobile layout verification remains unperformed. |

## Remaining limitations

- `client/src/utils/planDisplay.js` translates the built-in Free, Starter, and Plus plans and seeded feature identifiers. New admin-authored plan names, descriptions, badges, free-text features, and CTA copy still fall back to the configured source text because the current plan API has only one language field. A bilingual plan schema and admin editor would be required to translate arbitrary custom plans without changing the API contract in this mission.
- `client/src/pages/Events.jsx` preserves titles and venue names received from external event providers. Their language depends on the provider; translating them automatically would alter third-party content.
- `client/src/api/client.js` maps known API errors to Arabic and uses a generic Arabic fallback for unknown codes. An error message already displayed from an arbitrary server string does not have a stable translation key when the language changes after the error. Extending the API error-code catalog would address every such runtime case.
- The AST check intentionally covers the most reliable static UI constructs. Runtime text assembled through arbitrary helper functions or received from an external API still needs review when new features are added.
