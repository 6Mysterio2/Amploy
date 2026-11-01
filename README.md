# Apply Studio

A personal job-application workspace and Chrome companion, implemented independently after analyzing Amploy's public extension and website with REA. It runs on your own computer, stores your data in SQLite, and does not use Amploy's accounts, private backend, billing, or analytics.

## Run on your computer

Install Node.js 24.22.1 or a compatible later Node 24 release. From this directory:

```sh
npm ci
npm start
```

Open `http://127.0.0.1:3000` in your own browser. The server binds to loopback and is intended for one user on that computer. It is not a production public hosting configuration. Stop it with Ctrl+C. `PORT` changes its port; `AMPLOY_DB` changes the SQLite database path.

In the prepared Codex cloud workspace, first run:

```sh
export PATH="/workspace/tools/node-v24.22.1-linux-x64/bin:$PATH"
export npm_config_cache=/workspace/tools/npm-cache
cd /workspace/Amploy
npm start
```

That starts the app on the cloud machine, not on your Mac. This onboarding chat has no supported web preview. Download the source archive and run it locally to use the browser interface and extension together. A URL using `127.0.0.1` on your Mac reaches your Mac, not this cloud machine.

## What works

- Profile and application details, including contact information, address, work eligibility, and original resume text.
- Resume text import from PDF, DOCX, TXT, or Markdown. Scanned/image-only PDFs need external OCR; import extracts text, not an editable reconstruction of the original layout.
- Job capture/manual entry, search/filter, notes, saved/applied/interview/offer/rejected stages.
- Transparent local keyword overlap between a job description and your profile. This is a rough aid, not an ATS score or hiring prediction.
- Editable resume and cover-letter drafts based on information you supplied. By default, deterministic templates require no external service. Optional AI drafting uses your own provider and still requires factual review.
- Text download and browser print-to-PDF for documents.
- Optional encrypted login vault. Your passphrase derives an AES-GCM key in the browser; the server stores ciphertext. The key is not saved. Keep your passphrase: there is no recovery service.
- JSON backup/restore. Profile, jobs, and documents are plaintext in the backup; only vault contents are encrypted. Keep backups private.
- A Chrome extension that detects application pages, fills empty personal fields from your profile, and automatically drafts open-ended answers with your configured AI provider. Later form steps are observed too. It does not submit applications or overwrite existing writing. An on-page panel offers pause, retry, and undo.

## Chrome companion

Run this app on the same computer as Chrome. Open Chrome's extensions page, enable Developer mode, choose **Load unpacked**, and select the `extension/` directory. Open the app's extension settings and copy the pairing token into the extension popup, together with the app's local server address. The token grants access to your profile and job creation; do not share it.

Enable **Automatic assistance** in the extension's Connect panel. On an application page, the assistant fills known personal fields first, then inserts AI drafts into empty open-ended fields. Standard text inputs, textareas, editable areas, and straightforward selects/radio choices are supported; custom widgets and inaccessible embedded forms may still need manual input. Work authorization, sponsorship, and salary answers are used only when explicitly saved and unambiguously matched. Unsupported or unknown information stays blank. Always review the result. The encrypted vault remains manual copy/paste and is not exposed to the extension.

The extension now needs website access so it can detect forms when you land on a page. Updating an existing installation requires clicking **Reload** on `chrome://extensions`, accepting any changed access request, and refreshing application tabs. Assistance can be paused globally in the popup or per site using the on-page panel. Job capture remains a deliberate popup action.

## Optional AI drafts

Open **AI assistant** in the app, enter your provider's base URL, model ID and API key, then save. Use **Test AI drafting** to check the connection with your profile. The key is stored in the local SQLite database separately from exported workspace data, never returned by the API, and never sent to application pages. Keep the database private. Without a provider key, personal-detail autofill still works but open-ended AI answers are unavailable.

Alternatively, copy `.env.example` to `.env` and set `APPLY_STUDIO_AI_API_KEY`, `APPLY_STUDIO_AI_MODEL`, and optionally `APPLY_STUDIO_AI_BASE_URL`. Environment configuration takes precedence over in-app settings; restart the server after changing `.env`. The default endpoint is OpenAI's `/v1` API; other providers must implement compatible `POST /chat/completions` requests/responses. Each question batch uses JSON answers; a provider that does not follow this format returns an explicit error instead of filling arbitrary text.

With a key configured, document generation sends the profile's name/headline/summary/skills/resume text and the selected job description to that provider. Automatic question drafting sends those same professional details, empty-field question labels, and limited job context. The extension does not serialize filled form values, passwords, cookies, or complete page HTML. Vault contents and application eligibility fields are not sent. Provider usage may incur charges. With no key, no AI request is made. Responses take as long as the configured provider needs; they are not guaranteed instantaneous. Failed calls show an on-page error with explicit Retry. Matching remains local keyword overlap. Model transport is tested using a local provider fixture; real credentials and model quality are not verified here.

## Persistence and tests

State lives in `data/amploy.sqlite` with SQLite sidecar files. Back up through the interface or stop the app before copying the whole data directory. The pairing token also persists in that database. The app does not sync to a cloud account.

```sh
npm test
CHROMIUM_PATH=/path/to/chromium npm run test:browser
```

The browser tests require an installed Chromium-compatible browser. In the prepared cloud host it is `/usr/bin/chromium`. Tests use temporary databases and browser profiles, executing the real extension content/background scripts with simulated Chrome messaging against local application fixtures and a mock AI provider. The managed cloud browser blocks unpacked extension installation, so a fully installed toolbar session was not verified here. The tests do not overwrite saved jobs or submit third-party applications, and do not establish compatibility with every job portal.

## Updating from version 0.1

Stop the running server with Ctrl+C, then update the source files. Preserve your existing `data/` directory and `.env` if present. If using a fresh ZIP in a new directory, copy those from the old folder while the server is stopped. Run `npm ci` and `npm start` in the updated directory. In Chrome, reload the unpacked extension (or remove the old entry and load the new directory), pair again if needed, and refresh application tabs. Configure your model/key through **AI assistant**, then enable **Automatic assistance** in the extension's Connect tab.

## Analysis and limits

See [the feature and implementation report](docs/analysis.md). Full REA evidence and original downloaded artifacts remain outside this repository at `/workspace/research/amploy` in the cloud environment. Compact evidence summaries are in `docs/evidence/`.

This is a working independent personal-use reconstruction, not the original app's recovered server source or an exact clone. Original AI prompts/models, matching weights, server storage, billing, authentication, resume rendering, and backend password encryption were not available in public browser assets. Their existence and request contracts can be observed; their implementations cannot. No original application scripts, icons, logos, or vendor bundles are included in this rebuild.
