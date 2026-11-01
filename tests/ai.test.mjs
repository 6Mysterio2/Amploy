import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { aiConfiguration,writeAiDraft } from '../lib/ai.mjs';
test('optional AI adapter sends only selected profile/job context and handles provider rejection',async()=>{
 assert.equal(aiConfiguration({}),null);
 assert.throws(()=>aiConfiguration({APPLY_STUDIO_AI_API_KEY:'fixture'}),/MODEL/);
 assert.throws(()=>aiConfiguration({APPLY_STUDIO_AI_API_KEY:'fixture',APPLY_STUDIO_AI_MODEL:'test',APPLY_STUDIO_AI_BASE_URL:'http://remote.example'}),/HTTPS/);
 let received,auth,reject=false;
 const server=http.createServer(async(req,res)=>{let body='';for await(const b of req)body+=b;received=JSON.parse(body);auth=req.headers.authorization;res.writeHead(reject?401:200,{'Content-Type':'application/json'});res.end(JSON.stringify({choices:[{message:{content:'A tailored fixture draft.'}}]}));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try {
  const config=aiConfiguration({APPLY_STUDIO_AI_API_KEY:'fixture-not-real',APPLY_STUDIO_AI_MODEL:'test-model',APPLY_STUDIO_AI_BASE_URL:`http://127.0.0.1:${server.address().port}/v1`});
  const p={fullName:'Alex',resumeText:'Built useful tools.',password:'must-not-send',email:'also-not-needed@example.test'};
  const result=await writeAiDraft(p,{title:'Engineer',company:'Example',description:'Build useful tools'},'cover-letter',config);
  assert.equal(result,'A tailored fixture draft.');assert.equal(auth,'Bearer fixture-not-real');assert.equal(received.model,'test-model');
  assert.ok(!JSON.stringify(received).includes('must-not-send'));assert.ok(!JSON.stringify(received).includes('also-not-needed'));assert.match(received.messages[0].content,/Never invent/);
  reject=true;await assert.rejects(()=>writeAiDraft(p,{},'resume',config),/HTTP 401/);
 }finally{await new Promise(r=>server.close(r));}
});
