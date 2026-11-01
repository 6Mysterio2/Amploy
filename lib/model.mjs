import { randomUUID } from 'node:crypto';

export const statuses = ['Saved', 'Applied', 'Interview', 'Offer', 'Rejected'];
export const blankProfile = () => Object.fromEntries(['fullName','email','phone','location','headline','website','linkedin','summary','skills','resumeText','addressStreet','addressCity','addressState','addressZip','addressCountry','workAuthorized','needsSponsorship','earliestStart','salaryExpectation'].map(k => [k, '']));
export const emptyState = () => ({ profile: blankProfile(), jobs: [], documents: [], vault: null });
export function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
export function object(value) { if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Expected a JSON object.'); return value; }
function strings(input, keys, max = 150000) {
  const out = {}; object(input);
  for (const key of keys) if (Object.hasOwn(input,key)) {
    if (typeof input[key] !== 'string' || input[key].length > max) fail(`Invalid ${key}.`);
    out[key] = input[key];
  }
  return out;
}
export function profilePatch(value) {
  const patch = strings(value, Object.keys(blankProfile()));
  for (const key of ['workAuthorized','needsSponsorship']) if (key in patch && !['','yes','no'].includes(patch[key])) fail(`${key} must be yes, no, or blank.`);
  return patch;
}
export function jobPatch(value) {
  const out = strings(value, ['title','company','url','location','description','status','notes']);
  if ('status' in out && !statuses.includes(out.status)) fail('Unknown job status.');
  if ('url' in out && out.url) {
    try { if (!['http:','https:'].includes(new URL(out.url).protocol)) fail('Job URL must use HTTP or HTTPS.'); }
    catch { fail('Job URL must use HTTP or HTTPS.'); }
  }
  return out;
}
export function createJob(input) {
  const patch = jobPatch(input);
  if (!patch.title?.trim() || !patch.company?.trim()) fail('A job title and company are required.');
  const now = new Date().toISOString();
  return { id: randomUUID(),title:'',company:'',url:'',location:'',description:'',status:'Saved',notes:'', ...patch, createdAt:now,updatedAt:now };
}
export function vaultValue(value) {
  if (value === null) return null;
  object(value);
  if (value.version !== 1) fail('Unsupported vault format.');
  const result = {version: 1};
  for (const key of ['salt','iv','ciphertext']) {
    if (typeof value[key] !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(value[key]) || value[key].length > 1500000) fail(`Invalid vault ${key}.`);
    result[key] = value[key];
  }
  if (Buffer.from(value.salt,'base64').length !== 16 || Buffer.from(value.iv,'base64').length !== 12 || Buffer.from(value.ciphertext,'base64').length < 16) fail('Invalid vault encryption parameters.');
  return result;
}
export function documentPatch(value) { return strings(value,['title','content']); }
export function validateImport(value) {
  object(value);
  if (value.schemaVersion !== 1) fail('Unsupported backup version.');
  const profile = {...blankProfile(), ...profilePatch(value.profile)};
  if (!Array.isArray(value.jobs) || !Array.isArray(value.documents) || value.jobs.length > 10000 || value.documents.length > 20000) fail('Invalid backup collections.');
  const seen = new Set();
  function identity(v) {
    object(v);
    if (typeof v.id !== 'string' || !v.id || v.id.length > 100 || seen.has(v.id)) fail('Missing or duplicate backup ID.');
    seen.add(v.id);
    for (const k of ['createdAt','updatedAt']) if (typeof v[k] !== 'string' || !Number.isFinite(Date.parse(v[k]))) fail('Invalid backup timestamp.');
    return {id:v.id,createdAt:v.createdAt,updatedAt:v.updatedAt};
  }
  const jobs = value.jobs.map(j => ({...createJob(j), ...identity(j)}));
  const jobIds = new Set(jobs.map(j => j.id));
  const documents = value.documents.map(d => {
    const id = identity(d);
    if (!jobIds.has(d.jobId) || !['resume','cover-letter'].includes(d.type)) fail('Invalid document job or type.');
    const p = documentPatch(d);
    if (typeof p.title !== 'string' || typeof p.content !== 'string') fail('Missing document content.');
    if(d.generation!==undefined&&!['AI draft','Local template'].includes(d.generation))fail('Unknown document generation method.');
    return {...id,jobId:d.jobId,type:d.type,...p,generation:d.generation||'Local template'};
  });
  return {profile,jobs,documents,vault:vaultValue(value.vault)};
}

const stop = new Set('a an and are as at be been but by can company could duties for from have in into is it job of on or our position role should that the their them these they this to us was we will with work working would you your years experience skills required responsibilities requirements ability looking team strong excellent including'.split(' '));
export function matchJob(profile, job) {
  const tokens = (job.description || '').toLowerCase().match(/[a-z][a-z0-9+#.-]{2,}/g) || [];
  const frequencies = new Map();
  for (const token of tokens) if (!stop.has(token)) frequencies.set(token,(frequencies.get(token)||0)+1);
  const keywords = [...frequencies].sort((a,b)=>b[1]-a[1]).slice(0,30).map(([word])=>word);
  const source = [profile.headline,profile.summary,profile.skills,profile.resumeText].join(' ').toLowerCase();
  const known = new Set(source.match(/[a-z][a-z0-9+#.-]{2,}/g)||[]);
  const matched = keywords.filter(x=>known.has(x)), missing=keywords.filter(x=>!known.has(x));
  return {score:keywords.length?Math.round(matched.length/keywords.length*100):0,matched,missing,method:'Local keyword overlap'};
}
export function draftDocument(profile, job, type) {
  if (!['resume','cover-letter'].includes(type)) fail('Unknown document type.');
  if (!profile.fullName.trim() || !(profile.resumeText.trim() || profile.summary.trim())) fail('Add your name and resume text or summary in Profile first.');
  const match = matchJob(profile,job);
  const name = profile.fullName.trim();
  let content;
  if (type === 'resume') {
    content = [name, [profile.headline,profile.location].filter(Boolean).join(' · '), [profile.email,profile.phone,profile.website,profile.linkedin].filter(Boolean).join(' | '), '', `Application: ${job.title} — ${job.company}`, '', profile.summary && `SUMMARY\n${profile.summary}`, profile.skills && `SKILLS\n${profile.skills}`, match.matched.length && `RELEVANT TERMS ALREADY IN YOUR PROFILE\n${match.matched.join(', ')}`, profile.resumeText && `EXPERIENCE & BACKGROUND (YOUR ORIGINAL TEXT)\n${profile.resumeText}`].filter(x=>x!==false && x!==0 && x!==undefined).join('\n');
  } else {
    content = [`Dear ${job.company} hiring team,`, '', `I am writing to apply for the ${job.title} position at ${job.company}.`, '', profile.summary || profile.resumeText.trim().slice(0,1100), '', match.matched.length ? `My background includes ${match.matched.slice(0,6).join(', ')}, which also appear in your job description. I would welcome the opportunity to discuss how my experience could support this role.` : 'I would welcome the opportunity to discuss my background and learn more about the priorities of this role.', '', 'Thank you for considering my application.', '', `Kind regards,\n${name}`, profile.email].join('\n');
  }
  const now = new Date().toISOString();
  return {id:randomUUID(),jobId:job.id,type,title:`${type==='resume'?'Resume':'Cover letter'} · ${job.company}`,content,createdAt:now,updatedAt:now};
}
