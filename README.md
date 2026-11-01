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
- A separate Chrome extension to capture the active job page and fill reviewed empty contact fields. It does not submit applications or fill passwords.

## Chrome companion

Run this app on the same computer as Chrome. Open Chrome's extensions page, enable Developer mode, choose **Load unpacked**, and select the `extension/` directory. Open the app's extension settings and copy the pairing token into the extension popup, together with the app's local server address. The token grants access to your profile and job creation; do not share it.

Capture only pages you choose. Review the extracted job details before saving, and review autofill suggestions before applying them. Some Chrome internal pages, store pages, PDFs, cross-origin embedded frames, select widgets, and nonstandard forms cannot be filled. The initial companion uses a popup rather than reproducing Amploy's injected drawer. The encrypted vault is manual copy/paste and is not exposed to the extension.

## Optional AI drafts

Copy `.env.example` to `.env`. Set `APPLY_STUDIO_AI_API_KEY` to your provider key and `APPLY_STUDIO_AI_MODEL` to a supported model ID. The default endpoint is OpenAI's `/v1` API; another HTTPS provider may be used if it implements `POST /chat/completions` with the same request/response format. Restart `npm start` after changing these settings. The server loads `.env`; the key is never returned to the browser, stored in workspace exports, or included in prompts.

With a key configured, generating a document sends the profile's name/headline/summary/skills/resume text and the selected job title/company/description to that provider. Vault contents and application eligibility fields are not sent. Provider usage may incur charges. With no key, no AI request is made. Failed provider calls leave saved data unchanged and show an error instead of silently substituting a template. Matching remains a local keyword calculation. The optional adapter was tested against a local protocol fixture; real provider credentials and model quality were not verified in this environment.

## Persistence and tests

State lives in `data/amploy.sqlite` with SQLite sidecar files. Back up through the interface or stop the app before copying the whole data directory. The pairing token also persists in that database. The app does not sync to a cloud account.

```sh
npm test
CHROMIUM_PATH=/path/to/chromium npm run test:browser
```

The browser test requires an installed Chromium-compatible browser. In the prepared cloud host it is `/usr/bin/chromium`. Tests use temporary databases and do not overwrite your saved jobs. Validation: 10 backend/adapter/extension mapping tests and 2 Chromium workflow tests passed. Chromium tests exercise the extension's actual extraction/fill functions, not a complete installed toolbar-popup session on third-party portals.

## Analysis and limits

See [the feature and implementation report](docs/analysis.md). Full REA evidence and original downloaded artifacts remain outside this repository at `/workspace/research/amploy` in the cloud environment. Compact evidence summaries are in `docs/evidence/`.

This is a working independent personal-use reconstruction, not the original app's recovered server source or an exact clone. Original AI prompts/models, matching weights, server storage, billing, authentication, resume rendering, and backend password encryption were not available in public browser assets. Their existence and request contracts can be observed; their implementations cannot. No original application scripts, icons, logos, or vendor bundles are included in this rebuild.
