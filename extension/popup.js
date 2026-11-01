import {validateBaseURL, suggestField} from './mapping.mjs';
import {captureJob, collectFields, fillFields} from './content.mjs';

const $ = selector => document.querySelector(selector);
const status = (message, error = false) => {
  $('#status').textContent = message;
  $('#status').className = error ? 'error' : 'success';
};
let settings = {baseURL: 'http://127.0.0.1:3000', token: ''};
let preview = null;

function panel(name) {
  for (const node of document.querySelectorAll('.panel')) node.hidden = node.id !== name;
  for (const tab of document.querySelectorAll('.tab')) {
    tab.classList.toggle('active', tab.dataset.panel === name);
    tab.setAttribute('aria-pressed', String(tab.dataset.panel === name));
  }
  status('');
}
document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => panel(tab.dataset.panel)));

async function api(path, options = {}) {
  if (!settings.token) throw new Error('Open Connect and add your local pairing token first.');
  let response;
  try {
    response = await fetch(validateBaseURL(settings.baseURL) + path, {
      ...options,
      headers: {'Content-Type': 'application/json', Authorization: `Bearer ${settings.token}`},
      signal: AbortSignal.timeout(15000),
    });
  } catch { throw new Error('Cannot reach your local workspace. Start Apply Studio on this computer and check the server URL.'); }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'Pairing failed. Copy the current token from Apply Studio and save it under Connect.' : body.error || `Request failed (${response.status}).`);
  return body;
}

async function currentTab() {
  const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
  if (!tab?.id || !/^https?:\/\//.test(tab.url || '')) throw new Error('Open a normal HTTP or HTTPS job page first. Chrome internal pages are not supported.');
  return tab;
}
async function run(button, action) {
  button.disabled = true;
  status('Working…');
  try { await action(); } catch (error) { status(error.message || 'This action could not be completed.', true); }
  finally { button.disabled = false; }
}

$('#connection-form').addEventListener('submit', event => {
  event.preventDefault();
  run(event.submitter, async () => {
    const data = new FormData(event.target);
    const next = {baseURL: validateBaseURL(data.get('baseURL').trim()), token: data.get('token').trim()};
    if (!next.token) throw new Error('Enter your pairing token.');
    settings = next;
    await api('/api/profile');
    await chrome.storage.local.set({applyStudioConnection: settings});
    status('Connected. You can now save jobs and review profile suggestions.');
  });
});

$('#capture-button').addEventListener('click', event => run(event.currentTarget, async () => {
  const tab = await currentTab();
  const [result] = await chrome.scripting.executeScript({target: {tabId: tab.id}, func: captureJob});
  if (!result?.result) throw new Error('This page does not allow capture. You can paste the listing into Apply Studio instead.');
  const form = $('#job-form');
  for (const key of ['title', 'company', 'url', 'description']) form.elements[key].value = result.result[key] || '';
  form.hidden = false;
  status('Captured locally. Review the details before saving.');
}));

$('#job-form').addEventListener('submit', event => {
  event.preventDefault();
  run(event.submitter, async () => {
    const job = Object.fromEntries(new FormData(event.target));
    if (!job.title.trim() || !job.company.trim()) throw new Error('Add a role and company before saving.');
    await api('/api/jobs', {method: 'POST', body: JSON.stringify({...job, status: 'Saved'})});
    status('Job saved to your workspace.');
  });
});

$('#preview-button').addEventListener('click', event => run(event.currentTarget, async () => {
  preview = null;
  $('#suggestions').replaceChildren();
  $('#fill-button').hidden = true;
  const profile = await api('/api/profile');
  const tab = await currentTab();
  const [result] = await chrome.scripting.executeScript({target: {tabId: tab.id}, func: collectFields});
  if (!result?.result) throw new Error('Could not inspect this form.');
  const fields = result.result.fields.flatMap(field => {
    const suggestion = suggestField(field, profile);
    return suggestion && (field.maxLength < 0 || suggestion.value.length <= field.maxLength) ? [{...field, value: suggestion.value, source: suggestion.label}] : [];
  });
  preview = {tabId: tab.id, url: result.result.url, fields};
  for (const field of fields) {
    const label = document.createElement('label');
    label.className = 'suggestion';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox'; checkbox.checked = true; checkbox.dataset.fieldId = field.fieldId;
    const text = document.createElement('span');
    const title = document.createElement('strong'); title.textContent = field.label || field.source;
    text.append(title, document.createTextNode(field.value));
    label.append(checkbox, text); $('#suggestions').append(label);
  }
  $('#fill-button').hidden = !fields.length;
  status(fields.length ? `${fields.length} suggestions. Uncheck any you do not want to insert.` : 'No matching empty fields. Add your profile details or try another form.');
}));

$('#fill-button').addEventListener('click', event => run(event.currentTarget, async () => {
  if (!preview) throw new Error('Preview suggestions first.');
  const tab = await currentTab();
  if (tab.id !== preview.tabId) throw new Error('The active tab changed. Preview suggestions again.');
  const selected = new Set([...document.querySelectorAll('#suggestions input:checked')].map(input => input.dataset.fieldId));
  const fields = preview.fields.filter(field => selected.has(field.fieldId));
  if (!fields.length) throw new Error('Select at least one field.');
  const [result] = await chrome.scripting.executeScript({target: {tabId: preview.tabId}, func: fillFields, args: [{url: preview.url, fields}]});
  if (!result?.result) throw new Error('The page changed. Preview suggestions again.');
  status(`Filled ${result.result.filled} field(s); skipped ${result.result.skipped}. Nothing was submitted. Review the page before continuing.`);
  preview = null;
  $('#fill-button').hidden = true;
  $('#suggestions').replaceChildren();
}));

chrome.storage.local.get('applyStudioConnection').then(data => {
  if (data.applyStudioConnection) settings = data.applyStudioConnection;
  const form = $('#connection-form');
  form.elements.baseURL.value = settings.baseURL;
  form.elements.token.value = settings.token;
  if (!settings.token) panel('connect');
}).catch(() => status('Could not load connection settings.', true));
