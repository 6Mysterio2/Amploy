# Amploy 2.5.2 extension: static implementation findings

## Scope and identity

This report is based on the official downloaded CRX selected by the user, extracted into `extension-2.5.2/`. SHA-256: `8a59543292758f6053d4f6d31a8de7da4f590fca1ea10f6b0f54eddf04a407d7`. The manifest declares version 2.5.2 and Manifest V3. Original application scripts were read, not executed. `formatted/*.js` are formatting-only analysis copies; source references below point there. REA evidence is produced separately by the parent investigation and should be read together with these direct-source observations.

This recovers browser implementation and network contracts, not the server implementation. No authenticated requests, account creation, third-party form submission, or target runtime probe was performed.

## Architecture

| Layer | Responsibility | Evidence |
|---|---|---|
| `manifest.json` | MV3 background service worker, all-URL drawer host, all-frame autofill script, storage/activeTab/scripting/webNavigation permissions | Original manifest |
| `drawer_host.js` | Inject closed shadow-root host and extension iframe; page extraction; dock/resize/drag; URL/navigation observation | formatted/drawer_host.js:365, 883, 1235, 1353 |
| `drawer.js` | React sidebar UI with login, page capture, review/edit, saved job card, scoring/documents, autofill, settings | formatted/drawer.js:1072, 1660, 2902, 3225 |
| `background.js` | Message router, auth token lifecycle, backend API requests, per-tab application session state, analytics | formatted/background.js:1230, 1542, 1731, 2169 |
| `autofill.js` | Discover fields, fetch or reuse suggestions, show hints, user-accepted insertion, remember answers, detect apply/continue clicks | formatted/autofill.js:365, 453, 747, 838 |
| `drawer-vendor.js` | Bundled UI dependency code; not the job-search domain logic | Artifact inventory |

The background points to `https://backend.amploy.app/api`; links open `https://amploy.app`. The obsolete-looking `content_script.js` is only 99 bytes and is not registered in the manifest. Manifest resources expose the drawer HTML, JS, and icons.

## Feature and logic breakdown

### 1. Capture a job listing

The drawer host looks for known job title/description containers (including LinkedIn and Workday selectors), then fallback main/article/body content. It reads JSON-LD `JobPosting` objects including `@graph`, title, organization, and description. A consistency check prevents a structured listing title from overriding an unrelated visible title. A scoring fallback prefers main content with job-related vocabulary and penalizes navigation/aside/footer containers. Extraction returns URL, title, contextual plain text, and sanitized HTML (formatted/drawer_host.js:145–413).

This client extraction is not the final semantic parser. `parse_job` forwards `{page_text, page_url, page_html}` to POST `/jobs/parse` (formatted/background.js:2311). The drawer then lets the user edit `title`, `company`, `url`, and `description`, requiring title and company to save (formatted/drawer.js:2902). A personal rebuild can implement JSON-LD and heuristic extraction locally and make corrections explicit.

### 2. Save and track jobs

The sidebar lists recent saved jobs and reconciles the current page URL/job title with saved records. Save uses POST `/jobs`; list uses GET `/jobs`; updates use PATCH `/jobs/{id}`. The visible statuses are `saved`, `applied`, `interviewing`, `offered`, and `rejected` (formatted/drawer.js:20; background.js:2332–2397). User status changes immediately update UI then persist through the API (drawer.js:1872).

This is a suitable fully local feature: CRUD records, search/filter, editable status, source URL, notes as an original enhancement, and import/export. The extension does not contain the backend database implementation.

### 3. Match a profile to a job

POST `/jobs/{id}/match` performs matching remotely (background.js:2363). The UI expects `score`, `summary`, `strengths[]`, and `gaps[]`; it shows up to three strengths/gaps. Score colors are green at 70+, amber at 50–69, and red below 50 (drawer.js:3020–3190).

Only display thresholds are recovered. The actual score weighting, LLM prompt/model, input profile construction, and result validation are unknown. A local keyword-match replacement must be labelled a transparent approximation rather than the original AI score.

### 4. Tailored resume and cover letter

POST `/jobs/{id}/generate/resume` returns `resume_json`; POST `/jobs/{id}/generate/cover-letter` returns `cover_letter_json` (background.js:2399–2459; drawer.js:1947–1981). The drawer links to web editor and download routes `/jobs/{id}/resume`, `/jobs/{id}/resume/download`, `/jobs/{id}/cover-letter`, and `/jobs/{id}/cover-letter/download` (drawer.js:2025–2031, 2283–2287).

Generation is server-side. The browser package does not reveal prompts, model, resume schema details, rendering templates, document conversion, or PDF pipeline. A personal version can generate factual documents from user-entered profile details with deterministic templates and offer print-to-PDF. An optional independently configured AI provider is a separate design choice.

### 5. User-assisted application autofill

The script inventories visible text-like inputs (text/email/tel/url/number/date/time/month/week/search), textareas, and editable content. Passwords, checkboxes, radios, file uploads, and select controls are not part of its ordinary suggestion field inventory. It gathers labels, name/id, placeholder, aria-label, input type, and assigns per-page UIDs (autofill.js:340–416).

For unmatched fields it clones nearby form sections, removes scripts/media/iframes/styles, removes current input values and textarea text, strips event handlers and most attributes, then limits combined HTML to 60,000 characters (autofill.js:419–514). It sends `{form_html, field_uids, page_url, prior_answers}` to POST `/autofill/analyze`; the result contains UID/value suggestions (background.js:2482–2512).

The UI does not blindly fill the page or submit applications: a user focuses an empty field and presses Tab to accept the suggested value. The script uses native setters and input/change events for framework compatibility. It does not overwrite an already nonempty field (autofill.js:608–639, 747–779).

### 6. Remember answers across an application

Local `amploy_apply_sessions` is keyed by tab ID and origin; entries expire after four hours. Each record holds `jobId`, origin, start/update times and up to 80 recent answers. Merge keys use normalized label/name; later values replace earlier ones (background.js:332–590).

On a later page, answer reuse scores exact normalized name and label matches +4 each, containment +2, cross name/label match +2, requiring at least 4. Only unresolved fields are sent to remote analysis (autofill.js:81–109, 838–946). User edits are recorded after a 400 ms debounce; page hide and submit/continue-like clicks also capture answers. Pending apply detection prompts the user to confirm an applied status; detection is not proof that an application succeeded (autofill.js:641–744; drawer.js:1400–1430).

### 7. Generate an individual answer

The background has a `generate_answer` contract forwarding `{question, job_description, max_length}` to POST `/autofill/generate` (background.js:2643–2657). The code proves the capability exists in the router; it does not establish a currently visible drawer entry point or reveal answer-generation logic.

### 8. Site login convenience

The extension can detect login forms, fetch a saved login using GET `/site-logins/lookup?site_key=...&mark_used=...`, save/update with PUT `/site-logins` using site key, label, origin, email and password, and broadcast filling across frames (background.js:2690–2773; autofill.js:987–1105; drawer.js:1512–1612). The drawer has show/hide/copy controls.

Backend encryption and credential storage are unknown. A personal-use initial rebuild should omit the password vault and use the browser/password manager; label the omission instead of storing credentials in plaintext to claim parity.

### 9. Authentication, quotas, and analytics

The website may send `ping` and auth updates via the manifest's explicit `externally_connectable` origins; arbitrary external messages do not get full access to the background router (background.js:2169–2248). Chrome local storage holds auth token and refresh token; Firebase token refresh is used when the ID token approaches expiry, with a single refresh/retry on API 401 (background.js:1542–1798).

GET `/quota` and UI error distinctions for credits/quota/429 exist. Billing, quota amounts, enforcement, profile persistence, and auth server rules are backend unknowns. Analytics posts events to `https://umami.memdb.com/api/send` and records page/function categories (background.js:999–1195). Neither auth nor analytics is needed for a single-user local reconstruction.

### 10. Panel behavior and settings

The host creates a closed shadow-root with an iframe, keeps it visually separate from the target page, allows left/right docking or floating, resizing, drag-to-edge snapping, and double-click cycling. Layout and an auto-open-on-recognized-job-pages setting are persisted in Chrome local storage. Closing stays closed until a different job is opened (drawer_host.js:883, 1235, 1353–1482; drawer.js:4038–4214).

## Backend request contract inventory

| Method | Path relative to API root | Client purpose |
|---|---|---|
| POST | `/jobs/parse` | Extract semantic listing from supplied page material |
| GET / POST | `/jobs` | List / save jobs |
| PATCH | `/jobs/{id}` | Update job fields/status/documents |
| POST | `/jobs/{id}/match` | Profile-to-job matching |
| POST | `/jobs/{id}/generate/resume` | Generate resume JSON |
| POST | `/jobs/{id}/generate/cover-letter` | Generate cover-letter JSON |
| GET | `/quota` | Usage/credit display |
| POST | `/autofill/analyze` | Map form UIDs to suggestions |
| POST | `/autofill/generate` | Generate a field answer |
| GET | `/site-logins/lookup` | Retrieve saved credentials |
| PUT | `/site-logins` | Persist credentials |

Paths and request shapes are static observations, not evidence that these endpoints were reached or currently succeed.

## Reconstruction boundaries

A faithful feature-level personal workflow can include a local profile, job capture/manual editing, tracker/statuses, transparent matching, factual resume/letter generation and export, and a user-triggered autofill extension. It should be original code with no Amploy account/backend dependency. Public extension source is preserved as evidence only; do not bundle it in the new app.

Unrecovered server portions remain explicit gaps: AI prompts/models/scoring, document schemas and rendering, backend storage, entitlement/billing, credential encryption, and production authentication. Full product parity and cross-site autofill reliability require additional design and runtime tests. No native binary or Ghidra is involved in this browser-extension path.
