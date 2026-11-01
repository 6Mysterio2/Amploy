// These standalone functions run only after a user clicks a popup button.
export function captureJob() {
  const queue = [];
  for (const node of document.querySelectorAll('script[type="application/ld+json"]')) {
    try { queue.push(JSON.parse(node.textContent)); } catch {}
  }
  let posting;
  while (queue.length) {
    const value = queue.shift();
    if (!value || typeof value !== 'object') continue;
    if (Array.isArray(value)) { queue.push(...value); continue; }
    if ([value['@type']].flat().some(type => typeof type === 'string' && type.toLowerCase() === 'jobposting')) { posting = value; break; }
    if (value['@graph']) queue.push(value['@graph']);
  }
  const plainText = value => {
    const doc = new DOMParser().parseFromString(String(value || ''), 'text/html');
    return (doc.body.textContent || '').trim();
  };
  const region = document.querySelector('main, article, [role="main"]') || document.body;
  const title = posting?.title || document.querySelector('h1')?.innerText || document.querySelector('meta[property="og:title"]')?.content || document.title;
  return {
    title: String(title || '').trim().slice(0, 300),
    company: String(typeof posting?.hiringOrganization === 'string' ? posting.hiringOrganization : posting?.hiringOrganization?.name || '').slice(0, 300),
    url: location.href,
    description: (posting?.description ? plainText(posting.description) : region?.innerText || '').trim().slice(0, 20000),
  };
}

export function collectFields() {
  const allowed = new Set(['text', 'email', 'tel', 'url', 'search']);
  const fields = [];
  for (const element of document.querySelectorAll('input')) {
    const type = (element.type || 'text').toLowerCase();
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    if (!allowed.has(type) || element.disabled || element.readOnly || element.value.trim() || rect.width === 0 || rect.height === 0 || style.visibility === 'hidden' || style.display === 'none') continue;
    const label = [...element.labels || []].map(x => x.textContent.trim()).join(' ') || element.getAttribute('aria-label') || element.placeholder || element.name || element.id;
    const signature = [element.tagName, type, element.name, element.id].join('|');
    const fieldId = crypto.randomUUID();
    element.setAttribute('data-apply-studio-field', fieldId);
    fields.push({fieldId, signature, type, label, name: element.name, id: element.id, autocomplete: element.autocomplete, maxLength: element.maxLength});
  }
  return {url: location.href, fields};
}

export function fillFields(request) {
  if (location.href !== request.url) throw new Error('The page changed. Preview suggestions again.');
  let filled = 0, skipped = 0;
  for (const item of request.fields) {
    const element = document.querySelector(`[data-apply-studio-field="${CSS.escape(item.fieldId)}"]`);
    const rect = element?.getBoundingClientRect();
    const type = element?.type?.toLowerCase();
    const signature = element ? [element.tagName, type, element.name, element.id].join('|') : '';
    if (!(element instanceof HTMLInputElement) || !['text','email','tel','url','search'].includes(type) || signature !== item.signature || element.disabled || element.readOnly || element.value.trim() || !rect?.width || !rect?.height || getComputedStyle(element).visibility === 'hidden' || (element.maxLength >= 0 && item.value.length > element.maxLength)) { skipped++; continue; }
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(element, item.value);
    element.dispatchEvent(new Event('input', {bubbles: true}));
    element.dispatchEvent(new Event('change', {bubbles: true}));
    element.removeAttribute('data-apply-studio-field');
    filled++;
  }
  return {filled, skipped};
}
