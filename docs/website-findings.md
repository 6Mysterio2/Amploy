# Amploy public website analysis

Analyzed 1 November 2026 from public pages and their shipped JavaScript. No account was used, no private API was called, and no original application action was submitted. Static code shows the client implementation; it does not establish server behavior or completed real-user workflows.

## Evidence

Original responses: `access-20261101T055952Z/website.body` and `store.body`. Readable extracts: `website-text.txt`, `store-text.txt`. Public `/pricing`, `/demo`, `/jobs`, `/resume`, `/logins`, and `/application-details` page responses and referenced Next.js assets are under `website/`. The protected-page JavaScript is publicly downloadable; this does not grant or imply authenticated data access. File digests are in `website-sha256.json`.

REA ran three selected-source static analyses, all completing with zero JavaScript parse failures:

| Evidence | Selection | Results |
|---|---|---|
| `ev_ff8c4ae805ab0bf4fff97f8d107771638876040753b5df057026e16d03d89379` | Homepage, pricing, demo page and demo layout | 4 files parsed, 185 findings |
| `ev_38b002697afeb88689184d1d78b4eebcaa537c2080f0ad5027adbab11053b49a` | Jobs, resume, site logins, protected layout, generation stream client | 5 files parsed, 313 findings |
| `ev_7a7d808107f69532086d5154cfcb5980f6e52aadeb27294c37aab61990f3f40c` | Application-details profile page | 1 file parsed, 57 findings |

Full bundles are `website-rea-evidence.json`, `website-app-rea-evidence.json`, and `website-profile-rea-evidence.json`; matching `*-summary.json` files contain coverage. All three report **partial application and semantic coverage** because source selections omit vendor/unselected chunks and dynamic relationships remain unknown. Parsed syntax is complete for the selected files. This is not a whole-server decompilation. The directory accumulated additional captured files between analyses; each evidence bundle retains the inventory identity for its own run.

## Feature and logic breakdown

### 1. Account, access, and onboarding

Client code uses Firebase Google sign-in. The API client adds the current user's ID token as `Authorization: Bearer …` to requests to `https://backend.amploy.app`. Profile and quota are loaded together. Authenticated profile fields include `app_access`, `starter_pack_purchased`, `onboarding_step`, `onboarding_sample_id`, `onboarding_role_locked`, and resume-source/completion fields.

The public demo route chooses the authenticated user's saved onboarding step, sends unlocked users to `/jobs`, and otherwise starts the anonymous autofill demo. Signed-in onboarding steps are upload → role → autofill → cover letter → resume → unlock. Anonymous demo steps are autofill → cover → resume → next. The demo presents sample jobs and a sample resume; it is not evidence of live external form automation.

Sources: `website/_next/static/chunks/app/demo/page-63b1b13feb3b93a4.js` (webpack modules 28595, 65380, 76083, 98496), `5629-d48ba93c37944f10.js`, and the protected layout. REA evidence: first and second bundles above.

### 2. Jobs dashboard and pipeline

The dashboard fetches jobs and default-resume readiness, searches by title/company, and filters with the exact status enum `saved`, `applied`, `interviewing`, `offered`, `rejected`. A table shows title, company, match, status, materials, and age. Rows navigate to `/jobs/{id}`. Status edits PATCH the job and replace the local row with the returned object.

Multi-select uses a set of job IDs. Bulk status/delete calls use `Promise.allSettled`, retain successful changes, and report partial failures. Individual deletion asks for confirmation. The Add Job modal supports an extension tab and manual entry: required title and company, optional URL and description. URLs have tracking parameters removed. Saving POSTs the job; if it has a description, a second request asks the server to score the match. Score failure does not discard the saved job.

The displayed score is `job.match_json.score`, green at >=70, amber at >=50, otherwise red. This is **presentation logic only**; the score algorithm is server-side and not recovered. Materials badges are based on `resume_json` and `cover_letter_json` presence. Age uses days since `created_at`.

Source: `website/_next/static/chunks/app/(protected)/jobs/page-b46ce07d2fca8c3b.js`. REA evidence: `ev_38b…`. Public marketing screenshot: `website/screenshots/job-tracker.png`; it corroborates the table layout but may depict an older UI revision.

### 3. Resume and tailored document workflow

The client accepts PDF resume uploads as multipart data to `/api/resume/upload`, then reads the structured default resume from `/api/resume/default`. The UI provides editable resume content, preview, undo/redo, autosave state, polish navigation, and download. Upload/parse errors are visible. Default resume editing and per-job resume content are separate.

Document generation is server-side streaming. POST `/api/jobs/{id}/generate/resume/stream` is consumed through a `ReadableStream`/`TextDecoder` SSE parser: `header`, `section`, then `done` with final `resume_json` and quota. Cover-letter generation at `/generate/cover-letter/stream` uses `meta`, `delta`, then `done` with `cover_letter_json` and quota. The browser accumulates partial content and updates the preview. Errors are parsed from the stream. Public/onboarding generation routes have separate sample/session inputs.

The shared client demonstrates the delivery contract, not the original model, prompt, ranking method, factuality checks, PDF parsing algorithm, or rendering implementation in unselected dependencies.

Sources: protected resume page, `8589-424a52446a103e41.js` (streaming client), `5629-d48ba93c37944f10.js` (demo/editor components), and public screenshot `website/screenshots/resume-editor.png`. REA evidence: `ev_38b…`; the larger demo component chunk was inspected manually and not selected for REA analysis.

### 4. Application details for autofill

The separate `/application-details` screen stores phone, LinkedIn URL, website URL, street, city, state/region, ZIP/postal code, country, work authorization, sponsorship need, earliest start, and salary expectation. Work authorization and sponsorship are tri-state boolean values (unset/yes/no). A 700 ms debounce saves updates to PUT `/api/application-profile` and shows saving/saved/error state.

The screen explicitly states these fields are used by the extension on ATS forms and **are not on the resume PDF; PDF uploads do not overwrite them**. This is an important data-ownership distinction for reconstruction.

Source: `website/_next/static/chunks/app/(protected)/application-details/page-e635f712c3c8b128.js`. REA evidence: `ev_7a7d…`.

### 5. Site logins

The site-login screen fetches `/api/site-logins`, displays one account per career site, and reveals a password via a detail GET when requested. It has copy-email, copy-password, reveal/hide, and confirmed-delete controls. The empty state tells users the extension's **Generate & fill** creates these entries during application signup.

The public client does not establish whether the original backend encrypts passwords at rest, its retention policy, or its access controls. A personal-use implementation must choose its own explicit storage model and should not infer encryption from marketing statements.

Source: `website/_next/static/chunks/app/(protected)/logins/page-f2352c39f7842b75.js`. REA evidence: `ev_38b…`.

## Endpoint contracts visible in shipped client code

| Purpose | Client-declared endpoint |
|---|---|
| Identity/access/quota | GET `/api/me`, `/api/quota` |
| Resume | POST `/api/resume/upload`; GET/PUT `/api/resume/default` |
| Jobs | GET/POST `/api/jobs`; GET/PATCH/DELETE `/api/jobs/{id}` |
| Match | POST `/api/jobs/{id}/match` |
| Document generation | POST `/api/jobs/{id}/generate/{resume,cover-letter}/stream` |
| Autofill profile | GET/PUT `/api/application-profile` |
| Saved logins | GET `/api/site-logins`; GET/DELETE `/api/site-logins/{id}` |
| Payment | POST `/api/checkout` with a plan |

These are static endpoint declarations, not verified live responses. The client also contains administrator API declarations; these were not called and are outside the personal-use reconstruction scope.

## Marketing claims versus verified client implementation

The homepage and pricing page advertise autofill, resume tailoring, cover letters, a tracker, saved logins, match scoring, and AI polish. The downloaded client code corroborates UI and request paths for these features. It does not verify output quality, number of successful applications, password security, employer response rate, or testimonial authenticity.

Pricing claims a one-time HKD 350 starter pack, 800+ full applications or 2,000+ individual tailored documents, English output, and no monthly subscription. Stripe is named as payment provider. These are not requirements for an independent personal-use build and cannot be implemented as entitlement to the original service.

The store listing reports extension version 2.5.2, updated November 1, 2026, and a 103 KiB package. It describes saving jobs, autofilling applications, and generating AI-tailored resumes. Store disclosures are publisher assertions, not independent verification.

## Reconstruction guidance and unresolved scope

Verified client workflows support an original implementation with a jobs table/pipeline, separate default-resume and autofill-profile editors, per-job documents, reviewable form filling, and site-level account organization. Keep user review before sending any application; the demo explicitly says Amploy never auto-submits.

Private backend storage, matching/generation algorithms, PDF extraction, prompt templates, model versions, billing enforcement, credential encryption, and authenticated live behavior remain unavailable. Any replacements for these must be described as new designs, not recovered internals. React/Next.js/framework source is irrelevant to feature equivalence and was deliberately excluded from semantic analysis. No branding, third-party testimonial, or acquired code needs to be copied into the personal-use implementation.
