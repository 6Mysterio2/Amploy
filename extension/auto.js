(()=>{
 'use strict';
 if(globalThis.__applyStudioAutomatic)return;
 globalThis.__applyStudioAutomatic=true;
 const core=globalThis.ApplyStudioCore;
 let context=null,contextAt=0,busy=false,queued=false,paused=false,lastURL=location.href,timer,failed=false,recognized=false;
 let personalCount=0,answerCount=0,host=null,shadow=null;
 const touched=new WeakSet(),filled=new Map(),attempted=new Set(),memo=new Map(),ids=new WeakMap();
 const api=async payload=>{const r=await chrome.runtime.sendMessage(payload);if(!r?.ok)throw new Error(r?.error||'Extension connection was interrupted. Reload this page.');return r;};
 function widget(message,state='ready') {
  if(!host){
   host=document.createElement('div');host.id='apply-studio-assistant';
   host.style.cssText='all:initial;position:fixed;bottom:18px;right:18px;z-index:2147483647;display:block';
   shadow=host.attachShadow({mode:'open'});
   shadow.innerHTML=`<style>:host{font-family:system-ui,sans-serif}section{box-sizing:border-box;width:310px;max-width:calc(100vw - 36px);padding:14px;background:#fff;color:#203d30;border:1px solid #d2dfd6;border-radius:12px;box-shadow:0 8px 32px #142f2225;font:12px/1.5 system-ui,sans-serif}strong{font-size:13px}p{margin:7px 0 10px}button{font:inherit;border:1px solid #d2dfd6;background:#f5f8f3;color:#203d30;border-radius:6px;padding:4px 9px;cursor:pointer;margin-right:5px}button:hover{background:#e8f0e4}small{display:block;color:#6a786d;margin-top:8px}</style><section aria-label="Apply Studio application assistant"><strong>Apply Studio</strong><p data-status role="status" aria-live="polite"></p><button data-action="pause">Pause site</button><button data-action="undo">Undo fills</button><button data-action="retry">Retry</button><small>Review before submitting. Nothing is submitted automatically.</small></section>`;
   shadow.querySelector('[data-action="pause"]').addEventListener('click',async()=>{paused=true;await api({type:'auto:pause'}).catch(()=>{});widget('Paused on this site. Resume from the extension popup.','paused');});
   shadow.querySelector('[data-action="undo"]').addEventListener('click',()=>{paused=true;let count=0;for(const [el,record] of filled){if(el.isConnected&&value(el)===record.after){setValue(el,record.before);touched.add(el);count++;}}filled.clear();widget(`Undid ${count} unchanged fields. Assistance paused until Retry.`,'paused');});
   shadow.querySelector('[data-action="retry"]').addEventListener('click',()=>{paused=false;failed=false;context=null;attempted.clear();schedule(0);});
   (document.body||document.documentElement).append(host);
  }
  shadow.querySelector('[data-status]').textContent=message;host.dataset.state=state;
 }
 function visible(el){const r=el.getBoundingClientRect(),s=getComputedStyle(el);return el.isConnected&&r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'&&s.opacity!=='0'&&!el.closest('[hidden],[inert]');}
 function value(el){return el.type==='radio'?el.checked:el.isContentEditable?el.textContent:el.value;}
 function setValue(el,v){
  if(el.type==='radio'){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'checked').set.call(el,v);}
  else if(el.isContentEditable)el.textContent=v;
  else {const proto=el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:el instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,v);}
  el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));
 }
 function blank(el){
  if(el.type==='radio'){const group=el.name?[...document.querySelectorAll('input[type="radio"]')].filter(n=>n.name===el.name&&n.form===el.form):[el];return !group.some(n=>n.checked||touched.has(n));}
  if(el instanceof HTMLSelectElement){const selected=el.selectedOptions[0];return !el.value||Boolean(selected&&(selected.disabled||/^(please )?(select|choose)( an?| your)?( option)?[ .…-]*$/i.test(selected.textContent.trim())));}
  return !String(value(el)||'').trim();
 }
 function fieldLabel(el){
  const labelledby=el.getAttribute('aria-labelledby');
  const aria=labelledby?labelledby.split(/\s+/).map(id=>document.getElementById(id)?.textContent||'').join(' '):'';
  const own=[...(el.labels||[])].map(n=>n.textContent.trim()).join(' ')||aria||el.getAttribute('aria-label')||el.placeholder||el.name||el.id;
  const legend=el.type==='radio'?el.closest('fieldset')?.querySelector('legend')?.textContent:'';
  return (legend?legend+' '+own:own||'').trim().slice(0,2000);
 }
 function scan(){
  const result=[];
  for(const el of document.querySelectorAll('input,textarea,select,[contenteditable="true"],[contenteditable=""]')){
   if(host?.contains(el)||!visible(el)||el.disabled||el.readOnly||touched.has(el)||!blank(el))continue;
   const type=el.isContentEditable?'contenteditable':el.tagName.toLowerCase()==='textarea'?'textarea':el.tagName.toLowerCase()==='select'?'select':el.type;
   if(!['text','email','tel','url','search','date','number','textarea','contenteditable','select','radio'].includes(type))continue;
   if(!ids.has(el))ids.set(el,crypto.randomUUID());
   result.push({el,id:ids.get(el),label:fieldLabel(el),name:el.name||'',autocomplete:el.autocomplete||'',type,maxLength:el.maxLength>0?Math.min(el.maxLength,4000):1200});
  }
  return result;
 }
 const normal=s=>String(s||'').trim().toLowerCase().replace(/[\s.,]+/g,' ');
 function localValue(field){
  const suggestion=core.suggestField(field,context.profile);if(!suggestion)return null;
  const el=field.el;
  if(el instanceof HTMLSelectElement){const option=[...el.options].find(o=>!o.disabled&&o.value&&(normal(o.textContent)===normal(suggestion.value)||normal(o.value)===normal(suggestion.value)));return option?option.value:null;}
  if(el.type==='radio'){
   const own=[...(el.labels||[])].map(n=>n.textContent.trim()).join(' ');
   return normal(own)===normal(suggestion.value)||normal(el.value)===normal(suggestion.value)?true:null;
  }
  if(field.type==='date'&&!/^\d{4}-\d{2}-\d{2}$/.test(suggestion.value))return null;
  return suggestion.value.length<=field.maxLength?suggestion.value:null;
 }
 function insert(field,v,ai=false){
  const el=field.el;if(paused||!visible(el)||el.disabled||el.readOnly||touched.has(el)||!blank(el))return false;
  if(typeof v==='string'&&(!v.trim()||v.length>field.maxLength))return false;
  const before=value(el);setValue(el,v);filled.set(el,{before,after:value(el)});
  if(ai){el.setAttribute('data-apply-studio-draft','true');el.setAttribute('title','AI draft from Apply Studio — review before submitting');answerCount++;}else personalCount++;
  return true;
 }
 function jobContext(){
  const headings=[...document.querySelectorAll('h1,h2')].map(n=>n.textContent).join(' ').slice(0,1500);
  // Never serialize forms or editable fields. A dedicated description or plain headings suffice.
  let description='';const source=document.querySelector('[itemprop="description"],.job-description,#job-description,[data-job-description]');
  if(source){const clone=source.cloneNode(true);clone.querySelectorAll('input,textarea,select,[contenteditable],script,style').forEach(n=>n.remove());description=(clone.textContent||'').trim().slice(0,12000);}
  return {title:headings||document.title,url:location.href,description};
 }
 async function run(){
  if(busy){queued=true;return;}if(paused||failed)return;
  busy=true;
  try{
   if(lastURL!==location.href){lastURL=location.href;attempted.clear();context=null;memo.clear();recognized=false;}
   let fields=scan();if(!fields.length)return;
   const job=jobContext();
   if(!recognized)recognized=core.applicationPage({title:document.title,url:location.href,headings:job.title,labels:[...document.querySelectorAll('input,textarea,select,[contenteditable]')].map(fieldLabel)});
   if(!recognized)return;
   if(!context||Date.now()-contextAt>120000){context=await api({type:'auto:context'});contextAt=Date.now();}
   if(!context.enabled){if(host)widget('Assistance is paused or not paired. Open the extension to connect.','paused');return;}
   for(const field of fields){const v=localValue(field);if(v!==null)insert(field,v);}
   fields=scan();
   const pending=[];let remaining=false;
   for(const field of fields){
    if(!['textarea','contenteditable','text'].includes(field.type)||!core.isOpenQuestion(field))continue;
    const key=JSON.stringify([job,field.label,field.maxLength]);
    if(memo.has(key)){insert(field,memo.get(key),true);continue;}
    if(!attempted.has(key)){if(pending.length<12){attempted.add(key);pending.push({...field,key});}else remaining=true;}
   }
   widget(`${personalCount} personal fields filled. ${answerCount?`Review ${answerCount} AI drafts.`:'Review the form before continuing.'}`);
   if(!pending.length)return;
   if(!context.aiConfigured){widget(`${personalCount} personal fields filled. Configure AI in the workspace's AI settings to draft ${pending.length} open-ended answers.`,'needs-ai');return;}
   widget(`${personalCount} personal fields filled. Drafting ${pending.length} answers…`,'drafting');
   const requestURL=location.href;
   const response=await api({type:'auto:answers',questions:pending.map(f=>({id:f.id,label:f.label,maxLength:f.maxLength})),jobContext:job});
   if(paused||requestURL!==location.href)return;
   for(const answer of response.answers||[]){const f=pending.find(f=>f.id===answer.id);if(f&&typeof answer.text==='string'){memo.set(f.key,answer.text);if(memo.size>100)memo.delete(memo.keys().next().value);insert(f,answer.text,true);}}
   widget(`${personalCount} personal fields filled. Review ${answerCount} AI drafts.${response.skipped?.length?' Some questions need your own details.':''}`,'ready');if(remaining)queued=true;
  }catch(error){failed=true;widget(error.message||'Could not assist. Check the connection and use Retry.','error');}
  finally{busy=false;if(queued){queued=false;schedule(300);}}
 }
 function schedule(delay=650){clearTimeout(timer);timer=setTimeout(run,delay);}
 document.addEventListener('input',event=>{if(event.isTrusted)touched.add(event.target);},true);
 document.addEventListener('change',event=>{if(event.isTrusted)touched.add(event.target);},true);
 const observer=new MutationObserver(records=>{if(records.some(r=>r.target!==host&&!host?.contains(r.target)))schedule();});
 observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['style','class','hidden','disabled','readonly','aria-label']});
 chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.applyStudioConnection){context=null;paused=false;failed=false;attempted.clear();schedule(0);}});
 window.addEventListener('popstate',()=>schedule(0));window.addEventListener('hashchange',()=>schedule(0));
 schedule(0);
})();
