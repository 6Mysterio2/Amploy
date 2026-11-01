import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import http from 'node:http';
import JSZip from 'jszip';
import { createApp } from '../server.mjs';
import { extractResume } from '../lib/resume.mjs';

async function fixture(t) {
  const dir=await mkdtemp(join(tmpdir(),'amploy-test-')),dbPath=join(dir,'app.sqlite');
  let app;
  async function start(){app=createApp({dbPath});app.server.listen(0,'127.0.0.1');await once(app.server,'listening');return `http://127.0.0.1:${app.server.address().port}`;}
  let base=await start();
  const request=async(path,method='GET',payload,extra={})=>{
    const response=await fetch(base+path,{method,headers:{...(payload!==undefined?{'Content-Type':'application/json'}:{}),...extra},...(payload!==undefined?{body:JSON.stringify(payload)}:{})});
    return {status:response.status,data:await response.json(),headers:response.headers};
  };
  t.after(async()=>{await new Promise(r=>app.server.close(r));await rm(dir,{recursive:true,force:true});});
  return {request,get base(){return base;},restart:async()=>{await new Promise(r=>app.server.close(r));base=await start();}};
}

test('profile, job and editable drafts persist; deleting a job removes its drafts',async t=>{
  const f=await fixture(t),q=f.request;
  assert.deepEqual((await q('/api/state')).data.jobs,[]);
  const profile={fullName:'Ian Example',email:'ian@example.test',summary:'Built TypeScript tools for analysts.',skills:'TypeScript, SQL',resumeText:'Created an internal SQL reporting tool.'};
  assert.equal((await q('/api/profile','PUT',profile)).status,200);
  assert.equal((await q('/api/profile','PUT',{workAuthorized:'probably'})).status,400);
  assert.equal((await q('/api/profile','PUT',{workAuthorized:'yes',needsSponsorship:'no',addressCountry:'Hong Kong'})).status,200);
  const job=(await q('/api/jobs','POST',{title:'Developer',company:'Example Co',description:'TypeScript SQL reporting Python'})).data;
  const match=(await q('/api/match','POST',{jobId:job.id})).data;
  assert.equal(match.method,'Local keyword overlap');assert.ok(match.matched.includes('typescript'));assert.ok(match.missing.includes('python'));assert.ok(match.score>0&&match.score<100);
  const draft=(await q('/api/documents','POST',{jobId:job.id,type:'cover-letter'})).data;
  assert.match(draft.content,/Ian Example/);assert.match(draft.content,/Built TypeScript tools for analysts/);assert.doesNotMatch(draft.content,/\d+%|years of/);
  assert.equal((await q(`/api/documents/${draft.id}`,'PUT',{content:'My reviewed letter.'})).status,200);
  assert.equal((await q(`/api/jobs/${job.id}`,'PUT',{status:'Interview'})).data.status,'Interview');
  await f.restart();const state=(await q('/api/state')).data;
  assert.equal(state.jobs[0].status,'Interview');assert.equal(state.documents[0].content,'My reviewed letter.');assert.equal(state.profile.email,profile.email);
  assert.equal((await q(`/api/jobs/${job.id}`,'DELETE')).status,200);
  assert.deepEqual((await q('/api/state')).data.documents,[]);
});

test('malformed imports reject atomically and valid backups round trip',async t=>{
  const {request:q}=await fixture(t);
  const job=(await q('/api/jobs','POST',{title:'Designer',company:'Studio'})).data;
  const backup=(await q('/api/export')).data;
  assert.equal(backup.schemaVersion,1);assert.equal(backup.extensionToken,undefined);
  const bad=structuredClone(backup);bad.profile.fullName='MUST NOT PERSIST';bad.jobs.push({...job});
  assert.equal((await q('/api/import','POST',bad)).status,400);
  assert.equal((await q('/api/state')).data.profile.fullName,'');
  assert.equal((await q('/api/import','POST',backup)).status,200);
  assert.equal((await q('/api/state')).data.jobs[0].id,job.id);
  assert.equal((await q('/api/jobs','POST',{title:'x',company:'x',url:'javascript:alert(1)'})).status,400);
  assert.equal((await q(`/api/jobs/${job.id}`,'PUT',{status:'Invented'})).status,400);
});

test('cross-origin access is denied and extension needs pairing token',async t=>{
  const f=await fixture(t),q=f.request,origin='chrome-extension://'+'a'.repeat(32);
  assert.equal((await q('/api/profile','PUT',{fullName:'Bad'},{Origin:'https://evil.example'})).status,403);
  assert.equal((await q('/api/state','GET',undefined,{Origin:'https://evil.example'})).status,403);
  assert.equal((await q('/api/extension-token','GET',undefined,{Origin:origin})).status,403);
  assert.equal((await q('/api/profile','GET',undefined,{Origin:origin})).status,401);
  const token=(await q('/api/extension-token')).data.token;
  const profile=await q('/api/profile','GET',undefined,{Origin:origin,Authorization:`Bearer ${token}`});
  assert.equal(profile.status,200);assert.equal(profile.headers.get('access-control-allow-origin'),origin);
  assert.equal((await q('/api/jobs','POST',{title:'Saved from extension',company:'Example'},{Origin:origin,Authorization:`Bearer ${token}`})).status,201);
  const preflight=await fetch(f.base+'/api/jobs',{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'Authorization,Content-Type'}});
  assert.equal(preflight.status,204);
  const forbiddenHost=await new Promise((resolve,reject)=>{http.get(f.base+'/api/state',{headers:{Host:'evil.example'}},r=>{r.resume();resolve(r.statusCode);}).on('error',reject);});
  assert.equal(forbiddenHost,403);
});

test('vault stores ciphertext only and resume import extracts text',async t=>{
  const f=await fixture(t),q=f.request;
  const vault={version:1,salt:Buffer.alloc(16,1).toString('base64'),iv:Buffer.alloc(12,2).toString('base64'),ciphertext:Buffer.alloc(32,3).toString('base64')};
  assert.equal((await q('/api/vault','PUT',vault)).status,200);assert.deepEqual((await q('/api/state')).data.vault,vault);
  assert.equal((await q('/api/vault','PUT',{password:'plaintext'})).status,400);
  const response=await fetch(f.base+'/api/resume/import',{method:'POST',headers:{'Content-Type':'text/plain','x-filename':'resume.txt'},body:'Ian Example\nTypeScript developer'});
  assert.equal(response.status,200);assert.match((await response.json()).text,/TypeScript developer/);
  assert.equal((await q('/api/vault','PUT',null)).status,200);
});

function pdf(text) {
  const stream=`BT /F1 12 Tf 50 700 Td (${text}) Tj ET`;
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let data='%PDF-1.4\n',offsets=[];objects.forEach((o,i)=>{offsets.push(Buffer.byteLength(data));data+=`${i+1} 0 obj\n${o}\nendobj\n`;});
  const xref=Buffer.byteLength(data);data+=`xref\n0 6\n0000000000 65535 f \n${offsets.map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(data);
}
test('real PDF dependency extracts a minimal text PDF',async()=>{
  assert.match(await extractResume(pdf('Ian Example Resume'),'resume.pdf'),/Ian Example Resume/);
  await assert.rejects(()=>extractResume(Buffer.from('invalid'),'resume.docx'),/Invalid DOCX/);
});

test('real DOCX dependency extracts Word document text',async()=>{
  const zip=new JSZip();
  zip.file('[Content_Types].xml','<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels','<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml','<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Ian Example DOCX resume</w:t></w:r></w:p></w:body></w:document>');
  const buffer=await zip.generateAsync({type:'nodebuffer'});
  assert.match(await extractResume(buffer,'resume.docx'),/Ian Example DOCX resume/);
});
