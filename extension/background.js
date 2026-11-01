import {validateBaseURL} from './mapping.mjs';

async function connection(sender) {
  if(sender.id!==chrome.runtime.id || !sender.tab || !/^https?:\/\//.test(sender.url||''))throw new Error('Unsupported extension sender.');
  const {applyStudioConnection:c}=await chrome.storage.local.get('applyStudioConnection');
  const site=new URL(sender.url).hostname;
  const ownApp=c?.baseURL&&new URL(sender.url).origin===validateBaseURL(c.baseURL);
  return {settings:c,site,enabled:!ownApp&&Boolean(c?.token)&&c.autoAssist!==false&&!c.pausedSites?.includes(site)};
}
async function request(c,path,data) {
  let response;
  try {response=await fetch(validateBaseURL(c.baseURL)+path,{method:data?'POST':'GET',headers:{Authorization:`Bearer ${c.token}`,...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(data?95000:12000)});}
  catch {throw new Error('Start Apply Studio on this computer. If an AI request timed out, use Retry when ready.');}
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(response.status===401?'Reconnect the extension using your workspace pairing token.':result.error||`Workspace returned HTTP ${response.status}.`);
  return result;
}
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  if(!message||!['auto:context','auto:answers','auto:pause'].includes(message.type))return;
  (async()=>{
    const {settings,site,enabled}=await connection(sender);
    if(message.type==='auto:pause') {
      if(!settings)return {enabled:false};
      const pausedSites=[...new Set([...(settings.pausedSites||[]),site])];
      await chrome.storage.local.set({applyStudioConnection:{...settings,pausedSites}});
      return {enabled:false};
    }
    if(!enabled)return {enabled:false};
    if(message.type==='auto:context') {
      const [profile,capabilities]=await Promise.all([request(settings,'/api/profile'),request(settings,'/api/capabilities')]);
      return {enabled:true,profile,aiConfigured:capabilities.aiConfigured};
    }
    if(!Array.isArray(message.questions)||message.questions.length>12)throw new Error('Too many questions in one request.');
    const questions=message.questions.map(q=>({id:String(q.id||'').slice(0,100),label:String(q.label||'').slice(0,2000),maxLength:Math.min(4000,Math.max(1,Number(q.maxLength)||1200))}));
    const context=message.jobContext||{};
    const jobContext={title:String(context.title||'').slice(0,500),url:sender.url,description:String(context.description||'').slice(0,12000)};
    return request(settings,'/api/autofill/answers',{questions,jobContext});
  })().then(result=>reply({ok:true,...result})).catch(error=>reply({ok:false,error:error.message}));
  return true;
});
