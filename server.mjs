import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { emptyState, fail, object, profilePatch, jobPatch, createJob, documentPatch, validateImport, vaultValue, matchJob, draftDocument } from './lib/model.mjs';
import { extractResume } from './lib/resume.mjs';
import { writeAiDraft, validateAiSettings, resolveAiSettings, describeAiSettings } from './lib/ai.mjs';
import { createAutofillService } from './lib/autofill.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.json':'application/json'};
function send(res, status, value) { res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value)); }
async function body(req, limit=8*1024*1024) {
  if (Number(req.headers['content-length']) > limit) fail('Request exceeds the upload limit.',413);
  const chunks=[];let size=0,tooLarge=false;
  for await (const chunk of req) {size+=chunk.length;if(size>limit)tooLarge=true;else chunks.push(chunk);}
  if (tooLarge) fail('Request exceeds the upload limit.',413);
  return Buffer.concat(chunks);
}
async function json(req) {
  if (!(req.headers['content-type']||'').startsWith('application/json')) fail('Content-Type must be application/json.',415);
  try {return JSON.parse((await body(req)).toString('utf8'));} catch(e) {if(e.status)throw e;fail('Invalid JSON.');}
}
function sameSecret(a,b) { const aa=Buffer.from(a),bb=Buffer.from(b);return aa.length===bb.length&&timingSafeEqual(aa,bb); }

export function createApp({dbPath=process.env.AMPLOY_DB||resolve(root,'data/amploy.sqlite'),publicDir=resolve(root,'public'),env=process.env}={}) {
  mkdirSync(dirname(dbPath),{recursive:true,mode:0o700});
  const db=new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS app (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  const query=db.prepare('SELECT value FROM app WHERE key=?');
  const put=db.prepare('INSERT INTO app(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
  if(!query.get('state'))put.run('state',JSON.stringify(emptyState()));
  if(!query.get('extensionToken'))put.run('extensionToken',randomBytes(32).toString('hex'));
  const token=query.get('extensionToken').value;
  const read=()=>JSON.parse(query.get('state').value);
  const write=(state)=>put.run('state',JSON.stringify(state));
  const localAi=()=>{const row=query.get('aiSettings');return row?JSON.parse(row.value):null;};
  const aiConfig=()=>resolveAiSettings(localAi(),env);
  const aiDescription=()=>describeAiSettings(localAi(),env);
  const answerQuestions=createAutofillService();
  const server=http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    try {
      const host=req.headers.host||'';
      const hostUrl=new URL(`http://${host}`);
      if(!['localhost','127.0.0.1','[::1]'].includes(hostUrl.hostname))fail('This personal server accepts loopback hosts only.',403);
      const url=new URL(req.url,hostUrl),path=url.pathname;
      const method=req.method;
      if(!path.startsWith('/api/')) {
        if(!['GET','HEAD'].includes(method))fail('Method not allowed.',405);
        let decoded;try{decoded=decodeURIComponent(path);}catch{fail('Invalid path.');}
        const target=resolve(publicDir,'.'+(decoded==='/'?'/index.html':decoded));
        if(!target.startsWith(resolve(publicDir)+sep))fail('Invalid asset path.',403);
        let content;try{content=await readFile(target);}catch{fail('Not found.',404);}
        res.writeHead(200,{'Content-Type':mime[extname(target)]||'application/octet-stream','Cache-Control':'no-cache'});
        res.end(method==='HEAD'?undefined:content);return;
      }
      const origin=req.headers.origin;
      const extension=typeof origin==='string'&&/^chrome-extension:\/\/[a-p]{32}$/.test(origin);
      if(origin && origin!==`http://${host}` && origin!==`https://${host}` && !extension)fail('This origin is not allowed.',403);
      if(extension) {
        if(!((['/api/profile','/api/capabilities'].includes(path)&&['GET','OPTIONS'].includes(method))||(['/api/jobs','/api/autofill/answers'].includes(path)&&['POST','OPTIONS'].includes(method))))fail('This endpoint is not available to extensions.',403);
        res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');
        if(method==='OPTIONS') {
          res.setHeader('Access-Control-Allow-Methods','GET, POST');res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');res.writeHead(204);res.end();return;
        }
        if(!sameSecret(req.headers.authorization||'',`Bearer ${token}`))fail('Pair the extension using the token from Settings.',401);
      } else if(method==='OPTIONS') {res.writeHead(204);res.end();return;}
      if(path==='/api/autofill/answers'&&!sameSecret(req.headers.authorization||'',`Bearer ${token}`))fail('Pair the extension using the token from Settings.',401);
      if(path==='/api/state'&&method==='GET')return send(res,200,read());
      if(path==='/api/capabilities'&&method==='GET'){const {configured}=aiDescription();return send(res,200,{aiConfigured:configured,draftMode:configured?'AI provider':'Local templates'});}
      if(path==='/api/ai-settings'&&method==='GET')return send(res,200,aiDescription());
      if(path==='/api/ai-settings'&&method==='PUT'){
        if(env.APPLY_STUDIO_AI_API_KEY)fail('AI is configured through environment variables. Update or remove those settings first.',409);
        const settings=validateAiSettings(await json(req),localAi()||{});put.run('aiSettings',JSON.stringify(settings));return send(res,200,aiDescription());
      }
      if(path==='/api/ai-settings'&&method==='DELETE'){
        db.prepare('DELETE FROM app WHERE key=?').run('aiSettings');return send(res,200,aiDescription());
      }
      if(path==='/api/autofill/answers'&&method==='POST'){
        const request=await json(req);return send(res,200,await answerQuestions(request,read().profile,aiConfig()));
      }
      if(path==='/api/profile'&&method==='GET')return send(res,200,read().profile);
      if(path==='/api/extension-token'&&method==='GET')return send(res,200,{token});
      if(path==='/api/export'&&method==='GET')return send(res,200,{schemaVersion:1,...read()});
      if(path==='/api/resume/import'&&method==='POST') {
        const filename=String(req.headers['x-filename']||'resume.txt');
        let text;try{text=await extractResume(await body(req,5*1024*1024),filename);}catch(e){if(e.status)throw e;fail('Could not read this document. Try a text file or paste the resume text.');}
        return send(res,200,{text});
      }
      if(path==='/api/import'&&method==='POST') {
        const imported=validateImport(await json(req));
        db.exec('BEGIN IMMEDIATE');try{write(imported);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
        return send(res,200,imported);
      }
      if(path==='/api/profile'&&method==='PUT') {
        const patch=profilePatch(await json(req)),state=read();state.profile={...state.profile,...patch};write(state);return send(res,200,state.profile);
      }
      if(path==='/api/vault'&&method==='PUT') {
        const vault=vaultValue(await json(req)),state=read();state.vault=vault;write(state);return send(res,200,{ok:true});
      }
      if(path==='/api/jobs'&&method==='POST') {
        const job=createJob(await json(req)),state=read();state.jobs.unshift(job);write(state);return send(res,201,job);
      }
      const jobMatch=path.match(/^\/api\/jobs\/([^/]+)$/);
      if(jobMatch && ['PUT','DELETE'].includes(method)) {
        const patch=method==='PUT'?jobPatch(await json(req)):null,state=read(),job=state.jobs.find(j=>j.id===jobMatch[1]);
        if(!job)fail('Job not found.',404);
        if(method==='DELETE'){state.jobs=state.jobs.filter(j=>j.id!==job.id);state.documents=state.documents.filter(d=>d.jobId!==job.id);write(state);return send(res,200,{ok:true});}
        Object.assign(job,patch,{updatedAt:new Date().toISOString()});
        if(!job.title.trim()||!job.company.trim())fail('A job title and company are required.');
        write(state);return send(res,200,job);
      }
      if(path==='/api/match'&&method==='POST') {
        const input=object(await json(req)),state=read(),job=state.jobs.find(j=>j.id===input.jobId);if(!job)fail('Job not found.',404);
        return send(res,200,matchJob(state.profile,job));
      }
      if(path==='/api/documents'&&method==='POST') {
        const input=object(await json(req)),state=read(),job=state.jobs.find(j=>j.id===input.jobId);if(!job)fail('Job not found.',404);
        const doc=draftDocument(state.profile,job,input.type),config=aiConfig();
        doc.generation=config?'AI draft':'Local template';
        if(config)doc.content=await writeAiDraft(state.profile,job,input.type,config);
        // An AI request may take time. Re-read state to retain unrelated edits made meanwhile.
        const latest=read();if(!latest.jobs.some(j=>j.id===job.id))fail('This job was deleted while the draft was being prepared.',409);
        latest.documents.unshift(doc);write(latest);return send(res,201,doc);
      }
      const documentMatch=path.match(/^\/api\/documents\/([^/]+)$/);
      if(documentMatch && ['PUT','DELETE'].includes(method)) {
        const patch=method==='PUT'?documentPatch(await json(req)):null,state=read(),doc=state.documents.find(d=>d.id===documentMatch[1]);if(!doc)fail('Document not found.',404);
        if(method==='DELETE'){state.documents=state.documents.filter(d=>d.id!==doc.id);write(state);return send(res,200,{ok:true});}
        Object.assign(doc,patch,{updatedAt:new Date().toISOString()});write(state);return send(res,200,doc);
      }
      fail('API endpoint not found.',404);
    } catch(error) {if(!res.headersSent)send(res,error.status||500,{error:error.status?error.message:'Unexpected server error.'});else res.end();if(!error.status)console.error(error);}
  });
  server.requestTimeout=30000;server.headersTimeout=15000;
  server.on('close',()=>db.close());
  return {server,db};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const {server}=createApp();
  server.listen(Number(process.env.PORT||3000),'127.0.0.1',()=>console.log(`Amploy Personal listening on 127.0.0.1:${server.address().port}`));
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close());
}
