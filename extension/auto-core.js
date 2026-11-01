(()=>{
// Original deterministic field mapping. No page content is sent to a third party.
function validateBaseURL(value) {
  const u = new URL(value);
  if (u.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(u.hostname) || u.username || u.password || u.pathname !== '/' || u.search || u.hash) {
    throw new Error('Use an HTTP localhost or 127.0.0.1 server address.');
  }
  return u.origin;
}

function suggestField(field, profile) {
  const label = [field.label, field.name, field.id].filter(Boolean).join(' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ').toLowerCase();
  const ac = (field.autocomplete || '').toLowerCase().split(/\s+/).at(-1);
  if (/password|passcode|security|social.?security|\bssn\b|passport|national.?id|tax.?id|credit.?card|bank|date.?of.?birth|\bdob\b|otp|verification|referr|emergency|supervisor|manager/.test(label)) return null;
  const fullName = profile.name || profile.fullName || '';
  const names = fullName.trim().split(/\s+/);
  const rules = [
    [/\b(authorized|authorised|authorization|authorisation|legally eligible|right to work)\b/.test(label) && /work|employment/.test(label) && !/sponsor|visa|previous|past|before/.test(label), 'Work authorization', profile.workAuthorized],
    [/\b(sponsorship|sponsor)\b/.test(label) && /require|need/.test(label) && !/previous|past|before/.test(label), 'Sponsorship', profile.needsSponsorship],
    [/^(earliest start|start date|availability|available from|notice period)[ ?*]*$/.test(String(field.label||'').toLowerCase()), 'Earliest start', profile.earliestStart],
    [/^(salary expectation|expected salary|salary expectations|desired salary)[ ?*]*$/.test(String(field.label||'').toLowerCase()), 'Salary expectation', profile.salaryExpectation],

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
    [ac === 'country' || ac === 'country-name' || /\bcountry\b/.test(label), 'Country', profile.addressCountry],
    [/\blocation\b/.test(label) && !/relocat|desired|prefer|company/.test(label), 'Location', profile.location],
    [ac === 'name' || /\b(full name|your name|legal name|applicant name)\b/.test(label) || /^(name\s*)+$/.test(label.trim()), 'Name', fullName],
  ];
  const hit = rules.find(([matches, , value]) => matches && typeof value === 'string' && value.trim());
  return hit ? {label: hit[1], value: hit[2].trim()} : null;
}

function blockedQuestion(label) {
 return /password|passcode|social.?security|\bssn\b|passport|national.?id|tax.?id|credit.?card|bank|date.?of.?birth|\bdob\b|otp|verification|gender|ethnic|race|disabilit|veteran|religio|sexual|marital|criminal|convict|citizen|visa|sponsor|authori[sz]|legally|salary|compensation|pay expectation|consent|agree|signature|certif|attest/.test(String(label).toLowerCase());
}
function isOpenQuestion(field) {
 const label=String(field.label||'').trim();
 if(label.length<8||blockedQuestion(label))return false;
 return /^(current|most recent|previous|last) (employer|company|job title|position)|^(university|college|school|degree|field of study|years of (relevant |professional )?experience)[ ?*]*$/i.test(label) || ['textarea','contenteditable'].includes(field.type) || /^(why|how|describe|tell us|tell me|what|please (describe|explain|share|provide)|explain|share|outline|summari[sz]e)\b/i.test(label);
}
function applicationPage({title='',url='',headings='',labels=[]}) {
 const context=[title,url,headings].join(' ').toLowerCase();
 if(/\b(checkout|shopping cart|contact us|newsletter|sign in|log in|login|register account|reset password)\b/.test(context)&&!/job application|apply for|apply to|career|jobposting/.test(context))return false;
 const jobCue=/\b(apply|application|applicant|career|job|vacancy|recruit|employment|workday|greenhouse|lever)\b/.test(context);
 const personal=labels.filter(l=>/name|email|phone|resume|cv|cover letter/i.test(l)).length;
 const question=labels.some(l=>/why.*(role|position|company|work)|describe.*(experience|skill|project)|tell us.*(yourself|experience)|cover letter/i.test(l));
 return jobCue&&(personal>=2||question||labels.some(l=>/work authori|sponsorship|earliest start/i.test(l)));
}
globalThis.ApplyStudioCore={validateBaseURL,suggestField,blockedQuestion,isOpenQuestion,applicationPage};

})();
