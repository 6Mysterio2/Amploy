# Apply Studio personal companion

An original, minimal Chrome MV3 extension for the local Apply Studio app. It contains no code, branding assets, account integration, or analytics from the inspected Amploy extension.

## Install on your own computer

1. Run the Apply Studio server on that same computer at `http://127.0.0.1:3000` (see the repository README).
2. Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select this `extension` directory.
3. In Apply Studio's extension settings, copy the pairing token. Open this extension, choose **Connect**, paste the token, and save/test.
4. On a job page, choose **Read this page**, correct the role/company/description, then save. The popup does not contact a site backend; extraction uses JSON-LD or visible page content.
5. On an application form, choose **Preview suggestions**. Review and uncheck mappings as needed, then **Fill selected fields**. It never submits a form or overwrites existing input.

The hosted coding environment is a different computer from your Mac. This extension's `localhost` means your Mac, so it cannot reach a server running only inside the cloud container. Download and run the repository locally to use the extension in your own browser. No extension installation on the user's computer is performed by the cloud setup.

## Supported and intentionally limited behavior

- Profile name, email, telephone, personal website, LinkedIn, location, and explicit street/city/state/postal/country text fields.
- User-triggered access to the active tab; no always-running content script and no remote service dependency.
- Only visible, empty text/email/tel/url/search inputs in the main frame are considered. No iframe/shadow-DOM forms, selects, checkboxes, file uploads, password fields, contenteditable rich editors, or open-ended AI answers.
- Eligibility, salary, sensitive identity information, credentials and automated application submission are not filled.
- Page capture is heuristic and capped at 20,000 characters. The user confirms every saved job.
- Browser-managed pages and the Chrome Web Store may reject script injection; use manual entry in the web app for these pages.
- The popup holds the capture/preview while open; closing it discards an unsaved preview. The connection token is persisted in `chrome.storage.local`. Remove/revoke it if the browser profile is shared.
- The token is sent only to one of the two declared local origins. Extension CORS access is paired with server-side bearer-token authorization.

Unit validation: `node --test extension/mapping.test.mjs` from the repository root. Actual Chrome installation and cross-site compatibility require testing on the user's browser and are not implied by unit tests.
