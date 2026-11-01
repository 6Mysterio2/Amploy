# Apply Studio personal companion

An original Chrome MV3 extension for the local Apply Studio app. It contains no code, branding assets, account integration, or analytics from the inspected Amploy extension. Version 0.2 adds automatic application-page assistance.

## Install on your own computer

1. Run the Apply Studio server on that same computer at `http://127.0.0.1:3000` (see the repository README).
2. Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select this `extension` directory.
3. Save your profile in the app. Under **AI assistant**, save a provider API key and supported model ID if you want AI answers. Test drafting there.
4. Copy the local pairing token from the app's Browser extension screen. In the extension's **Connect** tab, paste it, enable **Automatic assistance**, and save/test. The default local port is 3000; custom loopback ports are supported too.
5. Open or refresh an application page. Personal details fill first, then AI answers appear in empty question fields. Review and edit them before submitting yourself. Use the on-page panel to pause the site, retry failed requests, or undo unchanged fills.
6. To save a job listing, choose **Read this page** in the popup, correct the role/company/description, then save. Manual **Preview suggestions** is also retained.

After updating the files, click the extension's Reload button on `chrome://extensions` and refresh application tabs. Chrome may ask for website access; automatic assistance needs content-script access to detect forms when they load. You can disable assistance globally in Connect or pause individual sites.

The hosted coding environment is a different computer from your Mac. This extension's `localhost` means your Mac, so it cannot reach a server running only inside the cloud container. Download and run the repository locally to use the extension in your own browser. No extension installation on the user's computer is performed by the cloud setup.

## Supported and intentionally limited behavior

- Profile name, email, telephone, personal website, LinkedIn, location, address, and explicitly saved eligibility, sponsorship, start-date or salary answers where labels and choices match unambiguously.
- Automatic assistance detects application forms on HTTP(S) pages and frames. Non-application/login/checkout/contact pages are excluded by heuristics. The server origin itself is excluded. New DOM fields and multi-step forms are rechecked.
- Visible empty inputs, textareas, contenteditable areas, standard selects and radio groups are supported. Passwords, file uploads, hidden fields, consent checkboxes, inaccessible shadow roots and custom dropdown widgets need manual handling. Nothing is auto-submitted.
- Unknown work/education facts and open-ended questions can use the configured AI provider. Questions requiring missing facts are left blank; the model is not used to invent legal, demographic, eligibility, salary or credential answers. User input always takes precedence, including typing while an AI request is pending.
- The local service worker holds the pairing token. It sends only empty-field labels and limited job context with professional profile data to the configured provider via the local server, not existing form values, cookies, passwords, or complete HTML. This is separate from manual job capture.
- Page capture is heuristic and capped at 20,000 characters. The user confirms every saved job.
- Browser-managed pages and the Chrome Web Store may reject script injection; use manual entry in the web app for these pages.
- The popup holds the capture/preview while open; closing it discards an unsaved preview. The connection token is persisted in `chrome.storage.local`. Remove/revoke it if the browser profile is shared.
- The token is sent only to the configured HTTP localhost/127.0.0.1 origin. Extension API access is paired with server-side bearer-token authorization. API provider keys never reach the content script.

Validation: `npm test` and `npm run test:browser` from the repository root. Browser coverage runs the actual content and background scripts with simulated Chrome messaging against a real local app/API and mock model endpoint. The cloud-managed Chromium forbids loading unpacked extensions, so installed toolbar behavior and third-party portal compatibility still require checking in your own Chrome. No browser policy was changed to work around that restriction.
