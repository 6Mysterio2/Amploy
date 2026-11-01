// Original deterministic field mapping. No page content is sent to a third party.
export function validateBaseURL(value) {
  const u = new URL(value);
  if (u.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(u.hostname) || u.port !== '3000' || u.username || u.password || u.pathname !== '/' || u.search || u.hash) {
    throw new Error('Use http://127.0.0.1:3000 or http://localhost:3000.');
  }
  return u.origin;
}

export function suggestField(field, profile) {
  const label = [field.label, field.name, field.id].filter(Boolean).join(' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ').toLowerCase();
  const ac = (field.autocomplete || '').toLowerCase().split(/\s+/).at(-1);
  if (/password|passcode|security|social.?security|\bssn\b|passport|national.?id|tax.?id|credit.?card|bank|date.?of.?birth|\bdob\b|otp|verification|referr|emergency|supervisor|manager/.test(label)) return null;
  const fullName = profile.name || profile.fullName || '';
  const names = fullName.trim().split(/\s+/);
  const rules = [
    [ac === 'given-name' || /\b(first|given) name\b/.test(label), 'First name', profile.firstName || names[0]],
    [ac === 'family-name' || /\b(last|family|sur) ?name\b/.test(label), 'Last name', profile.lastName || (names.length > 1 ? names.slice(1).join(' ') : '')],
    [ac === 'email' || field.type === 'email' || /\be ?mail\b/.test(label), 'Email', profile.email],
    [ac === 'tel' || field.type === 'tel' || /\b(phone|mobile|telephone)\b/.test(label), 'Phone', profile.phone],
    [/\blinked ?in\b/.test(label), 'LinkedIn', profile.linkedin],
    [ac === 'url' || /\b(website|portfolio|personal url)\b/.test(label), 'Website', profile.website],
    [ac === 'street-address' || ac === 'address-line1' || /\b(street address|address line ?1)\b/.test(label), 'Street address', profile.addressStreet],
    [ac === 'address-level2' || /\bcity\b/.test(label), 'City', profile.addressCity],
    [ac === 'address-level1' || /\b(state|province)\b/.test(label), 'State / province', profile.addressState],
    [ac === 'postal-code' || /\b(zip|postal)\s*(code)?\b/.test(label), 'Postal code', profile.addressZip],
    [ac === 'country-name' || /\bcountry\b/.test(label), 'Country', profile.addressCountry],
    [/\blocation\b/.test(label) && !/relocat|desired|prefer|company/.test(label), 'Location', profile.location],
    [ac === 'name' || /\b(full name|your name|legal name|applicant name)\b/.test(label) || /^(name\s*)+$/.test(label.trim()), 'Name', fullName],
  ];
  const hit = rules.find(([matches, , value]) => matches && typeof value === 'string' && value.trim());
  return hit ? {label: hit[1], value: hit[2].trim()} : null;
}
