import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.mjs';

async function fixture(t,{env={}}={}) {
  const directory=await mkdtemp(join(tmpdir(),'apply-autofill-'));
  const requests=[];
  let mode='normal',gate=null,app;
  const provider=http.createServer(async(req,res)=>{
    let data='';for await(const b of req)data+=b;
    const body=JSON.parse(data),context=JSON.parse(body.messages.at(-1).content);
    requests.push({body,context,authorization:req.headers.authorization});
    if(gate)await gate;
    if(mode==='rejected'){res.writeHead(401);res.end('No');return;}
    let output;
    if(mode==='malformed')output='not valid JSON';
    else if(mode==='wrong-id')output=JSON.stringify({answers:[{id:'unrequested',text:'No.'}]});
    else if(mode==='oversized')output=JSON.stringify({answers:context.questions.map(q=>({id:q.id,text:'x'.repeat(q.maxLength+1)}))});
    else if(context.documentType)output='AI document based on the supplied research experience.';
    else output=JSON.stringify({answers:context.questions.map(q=>({id:q.id,text:'I have experience building accessible interfaces and conducting user research.'}))});
    res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({choices:[{message:{content:output}}]}));
  });
  await new Promise(r=>provider.listen(0,'127.0.0.1',r));
  const providerURL=`http://127.0.0.1:${provider.address().port}/v1`;
  const dbPath=join(directory,'app.sqlite');let base;
  async function start(){app=createApp({dbPath,env});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.server.address().port}`;}
  await start();
  const request=async(path,method='GET',data,headers={})=>{
    const res=await fetch(base+path,{method,headers:{...(data===undefined?{}:{'Content-Type':'application/json'}),...headers},...(data===undefined?{}:{body:JSON.stringify(data)})});
    return {status:res.status,data:await res.json()};
  };
  const token=(await request('/api/extension-token')).data.token;
  const auth={Authorization:`Bearer ${token}`},extension={...auth,Origin:'chrome-extension://'+'a'.repeat(32)};
  const settings={apiKey:'local-test-key-never-export',model:'fixture-model',baseURL:providerURL};
  const profile={fullName:'Alex Example',headline:'Product designer',summary:'I build accessible interfaces and conduct user research.',resumeText:'Design and research experience.',skills:'Design, research',email:'not-needed@example.test',phone:'do-not-send',workAuthorized:'yes',salaryExpectation:'do-not-send-salary'};
  const input={questions:[{id:'q1',label:'Tell us about your relevant experience.',maxLength:300}],jobContext:{title:'Product designer',url:'https://jobs.example.test/apply',description:'Design accessible applications.'}};
  t.after(async()=>{await new Promise(r=>app.server.close(r));await new Promise(r=>provider.close(r));await rm(directory,{recursive:true,force:true});});
  return {request,auth,extension,settings,profile,input,requests,env,providerURL,setMode(value){mode=value;},hold(){gate=new Promise(r=>this.release=r);},async restart(){await new Promise(r=>app.server.close(r));await start();}};
}

test('AI settings persist privately, support blank-key updates, and control document generation',async t=>{
  const f=await fixture(t),q=f.request;
  assert.deepEqual((await q('/api/ai-settings')).data,{configured:false,hasKey:false,source:'none',model:'',baseURL:'https://api.openai.com/v1'});
  assert.equal((await q('/api/ai-settings','PUT',f.settings,{Origin:'https://untrusted.example'})).status,403);
  assert.equal((await q('/api/ai-settings','GET',undefined,f.extension)).status,403);
  assert.equal((await q('/api/ai-settings','PUT',{...f.settings,baseURL:'http://remote.example/v1'})).status,400);
  const saved=await q('/api/ai-settings','PUT',f.settings);assert.equal(saved.status,200);assert.equal(saved.data.source,'local');assert.equal(saved.data.configured,true);
  assert.ok(!JSON.stringify(saved.data).includes(f.settings.apiKey));assert.equal(saved.data.apiKey,undefined);
  await q('/api/ai-settings','PUT',{apiKey:'',model:'new-model',baseURL:f.providerURL});
  await f.restart();assert.equal((await q('/api/ai-settings')).data.model,'new-model');
  assert.equal((await q('/api/capabilities','GET',undefined,f.extension)).data.aiConfigured,true);
  assert.ok(!JSON.stringify((await q('/api/export')).data).includes(f.settings.apiKey));
  await q('/api/profile','PUT',f.profile);const job=(await q('/api/jobs','POST',{title:'Designer',company:'Example'})).data;
  const doc=await q('/api/documents','POST',{jobId:job.id,type:'resume'});assert.equal(doc.status,201);assert.equal(doc.data.generation,'AI draft');assert.match(doc.data.content,/AI document/);
  assert.equal(f.requests[0].authorization,`Bearer ${f.settings.apiKey}`);
  await q('/api/ai-settings','DELETE');assert.equal((await q('/api/capabilities')).data.aiConfigured,false);
});

test('autofill requires token without Origin and reports missing AI configuration explicitly',async t=>{
  const f=await fixture(t),q=f.request;
  assert.equal((await q('/api/autofill/answers','POST',f.input)).status,401);
  assert.equal((await q('/api/autofill/answers','POST',f.input,{Authorization:'Bearer wrong'})).status,401);
  const absent=await q('/api/autofill/answers','POST',f.input,f.auth);assert.equal(absent.status,200);assert.equal(absent.data.aiConfigured,false);assert.deepEqual(absent.data.answers,[]);assert.match(absent.data.skipped[0].reason,/Configure/);
  await q('/api/ai-settings','PUT',f.settings);
  const noProfile=await q('/api/autofill/answers','POST',f.input,f.extension);assert.equal(noProfile.data.answers.length,0);assert.match(noProfile.data.skipped[0].reason,/resume/);assert.equal(f.requests.length,0);
  assert.equal((await q('/api/autofill/answers','POST',{...f.input,questions:Array.from({length:13},(_,i)=>({id:String(i),label:'Question'}))},f.auth)).status,400);
  assert.equal((await q('/api/autofill/answers','POST',{...f.input,questions:[{id:'x',label:'Q',maxLength:9000}]},f.auth)).status,400);
});

test('AI answers use relevant context, skip sensitive declarations, coalesce requests and invalidate changed profiles',async t=>{
  const f=await fixture(t),q=f.request;await q('/api/profile','PUT',f.profile);await q('/api/ai-settings','PUT',f.settings);
  const input={...f.input,questions:[...f.input.questions,{id:'salary',label:'What salary do you expect?'},{id:'legal',label:'Are you legally authorized to work?'},{id:'empty',label:''}],existingValues:{password:'never-send'}};
  f.hold();const first=q('/api/autofill/answers','POST',input,f.extension),second=q('/api/autofill/answers','POST',input,f.extension);
  // Release after both requests have reached the app, without repeated network retries.
  setImmediate(()=>f.release());
  const results=await Promise.all([first,second]);assert.equal(results[0].status,200);assert.equal(results[0].data.answers[0].source,'ai');assert.equal(results[0].data.skipped.length,3);assert.equal(f.requests.length,1);
  const wire=JSON.stringify(f.requests[0].body);assert.ok(!wire.includes('do-not-send'));assert.ok(!wire.includes('not-needed@example.test'));assert.ok(!wire.includes('never-send'));assert.ok(!wire.includes('workAuthorized'));
  assert.equal(f.requests[0].context.questions.length,1);assert.match(f.requests[0].body.messages[0].content,/Never invent/);
  await q('/api/autofill/answers','POST',input,f.auth);assert.equal(f.requests.length,1);
  await q('/api/profile','PUT',{summary:'Updated profile with product research experience.'});await q('/api/autofill/answers','POST',input,f.auth);assert.equal(f.requests.length,2);
});

test('provider failures and malformed answers are not cached or accepted; field lengths are enforced',async t=>{
  const f=await fixture(t),q=f.request;await q('/api/profile','PUT',f.profile);await q('/api/ai-settings','PUT',f.settings);
  for(const mode of ['rejected','malformed','wrong-id']){f.setMode(mode);const result=await q('/api/autofill/answers','POST',f.input,f.auth);assert.equal(result.status,502);assert.equal(result.data.answers,undefined);}
  assert.equal(f.requests.length,3);
  f.setMode('normal');const success=await q('/api/autofill/answers','POST',f.input,f.auth);assert.equal(success.status,200);assert.equal(success.data.answers.length,1);assert.equal(f.requests.length,4);
  f.setMode('oversized');const long=await q('/api/autofill/answers','POST',{...f.input,questions:[{id:'new',label:'Describe your work.',maxLength:50}]},f.auth);assert.equal(long.status,200);assert.equal(long.data.answers.length,0);assert.match(long.data.skipped[0].reason,/length/);
});

test('environment provider settings take precedence and never return credentials',async t=>{
  const f=await fixture(t),q=f.request;await q('/api/ai-settings','PUT',f.settings);
  f.env.APPLY_STUDIO_AI_API_KEY='environment-test-key';f.env.APPLY_STUDIO_AI_MODEL='env-model';f.env.APPLY_STUDIO_AI_BASE_URL=f.providerURL;
  const settings=await q('/api/ai-settings');assert.equal(settings.data.source,'environment');assert.equal(settings.data.model,'env-model');assert.ok(!JSON.stringify(settings).includes('environment-test-key'));
  assert.equal((await q('/api/ai-settings','PUT',f.settings)).status,409);
  await q('/api/ai-settings','DELETE');assert.equal((await q('/api/ai-settings')).data.source,'environment');
});
