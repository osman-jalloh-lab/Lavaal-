'use strict';
const assert=require('assert/strict');
const {memoryStore}=require('../api/_chat/store');
const {createService,normalize,FIELDS}=require('../api/_chat/service');
const {createHandler,publicConfig}=require('../api/chat-inquiry');
const {payload,mockContactTransport}=require('../api/_chat/contact');
let checks=0;
function check(name,fn) { fn(); checks++; console.log('PASS '+name); }
async function rejects(name,fn,code) { await assert.rejects(fn,e=>e.code===code); checks++; console.log('PASS '+name); }
const fields={name:'TEST ONLY User',phone:'+12025550100',subject:'TEST ONLY'};
let clock=Date.UTC(2026,10,11),calls=0,alerts=0;
const options=()=>({store:memoryStore(),now:()=>clock,salt:'TEST ONLY salt',billing:()=>({enforced:true,publicBypass:false,allInCents:0,asOf:clock,month:'2026-11'}),alert:()=>alerts++,transport:async()=>{calls++;return {ok:true,json:async()=>({ok:true})};}});
async function prepared(s,ip='TEST ONLY IP') {const a=await s.start(ip),d=await s.draft(a.sessionId,fields,'test_event');const r=await s.review(a.sessionId,a.proof,a.csrf,d.draftId);return {...a,...r};}
const send=(s,a,changes={})=>{a={...a,...changes};return s.confirm(a.sessionId,a.proof,a.csrf,a.draftId,a.token,a.idempotencyKey);};
async function main(){
 check('default flags always off',()=>assert.deepEqual([publicConfig().CHAT_ENABLED,publicConfig().CHAT_VOICE_ENABLED,publicConfig().CHAT_BROWSER_VOICE_ENABLED],[false,false,false]));
 check('all existing fields offered',()=>assert.equal(FIELDS.length,19));
 check('name phone minimum; optional email remains optional',()=>assert.equal(normalize(fields).email,''));
 for(const x of [{...fields,phone:'abc'},{...fields,name:''},{...fields,email:'bad'},{...fields,routeTo:'bad'},{...fields,inquiryType:'invented'},{...fields,country:'invented'}]) check('invalid or arbitrary fields denied',()=>assert.throws(()=>normalize(x)));
 let o=options(),s=createService(o),a=await prepared(s);
 check('review includes every field and skipped fields',()=>{assert.equal(Object.keys(a.summary).length,19);assert(a.skipped.includes('email'));});
 await rejects('forged consent',()=>send(s,a,{token:'forged'}),'consent');
 await rejects('wrong session proof',()=>send(s,a,{proof:'forged'}),'session');
 await rejects('csrf binding',()=>send(s,a,{csrf:'forged'}),'csrf');
 const outcomes=await Promise.all([send(s,a),send(s,a),send(s,a)]);
 check('simultaneous clicks attempt once',()=>assert.equal(calls,1));
 check('stable retry final result',()=>assert(outcomes.every(r=>r.status==='accepted')));
 check('retry returns accepted without send',()=>assert.equal(outcomes[0].status,'accepted'));
 assert.equal((await send(s,a)).status,'accepted');assert.equal(calls,1);
 o=options();s=createService(o);a=await prepared(s);clock+=120001;
 await rejects('expired token',()=>send(s,a),'consent');
 s=createService(options());a=await prepared(s);await s.draft(a.sessionId,{...fields,message:'TEST ONLY edit'},'edit');
 await rejects('edited draft invalidates token',()=>send(s,a),'draft');
 await rejects('event replay changed content rejected',()=>s.draft(a.sessionId,fields,'edit'),'replay');
 for(const response of [{ok:true,json:async()=>({ok:false})},{ok:false,json:async()=>({ok:true})},{ok:true,json:async()=>{throw Error('TEST ONLY bad json');}}]) {
  let n=0; o=options();o.transport=async()=>{n++;return response;};s=createService(o);a=await prepared(s);
  assert.equal((await send(s,a)).status,'uncertain');assert.equal((await send(s,a)).status,'uncertain');
  check('HTTP and JSON contract failure uncertain and never resent',()=>assert.equal(n,1));
 }
 o=options();o.transport=async()=>{throw Error('TEST ONLY timeout');};s=createService(o);a=await prepared(s);
 check('timeout remains uncertain',()=>{});assert.equal((await send(s,a)).status,'uncertain');
 // Multiple handlers share one atomic store.
 o=options();const instances=[createService(o),createService(o)];
 const many=await Promise.allSettled(Array.from({length:100},(_,i)=>instances[i%2].start('TEST ONLY shared')));
 check('atomic shared hourly IP cap across instances',()=>assert.equal(many.filter(x=>x.status==='fulfilled').length,3));
 clock+=3600001;for(let i=0;i<3;i++)await instances[i%2].start('TEST ONLY shared');clock+=3600001;
 await rejects('daily IP ceiling six',()=>instances[0].start('TEST ONLY shared'),'quota');
 o=options();o.previewLimits=true;const previewStarts=createService(o);
 for(let i=0;i<7;i++)await previewStarts.start('TEST ONLY preview quota');
 check('preview allows more than six sessions per day',()=>assert.ok(true));
 const previewTurns=createService({...options(),previewLimits:true,chat:async()=>({text:'TEST ONLY reply',costUsd:0})});
 a=await previewTurns.start('TEST ONLY preview turns');
 for(let i=0;i<11;i++)await previewTurns.turn(a.sessionId,a.proof,'pturn'+i,undefined,a.csrf,'Tell me about iPhone 16');
 check('preview allows more than ten turns',()=>assert.ok(true));
 s=createService(options());a=await s.start('TEST ONLY turns');
 for(let i=0;i<10;i++)await s.turn(a.sessionId,a.proof,'turn'+i,1,a.csrf);
 assert.equal((await s.turn(a.sessionId,a.proof,'turn0',1,a.csrf)).allowed,true);
 await rejects('ten turns maximum',()=>s.turn(a.sessionId,a.proof,'turn11',1,a.csrf),'quota');
 o=options();s=createService(o);a=await s.start('TEST ONLY cost');alerts=0;
 await s.turn(a.sessionId,a.proof,'threshold',2000,a.csrf);await s.turn(a.sessionId,a.proof,'cap',500,a.csrf);
 check('80 percent alert once',()=>assert.equal(alerts,1));
 await rejects('all-in cap auto-off at 2500 cents',()=>s.turn(a.sessionId,a.proof,'over',1,a.csrf),'cost_cap');
 for(const b of [null,{enforced:true,publicBypass:false,allInCents:0,month:'2026-11'},{enforced:true,publicBypass:true,asOf:clock,allInCents:0,month:'2026-11'},{enforced:true,publicBypass:false,asOf:clock-60001,allInCents:0,month:'2026-11'}]) {
  o=options();o.billing=()=>b;s=createService(o);a=await s.start('TEST ONLY billing');
  await rejects('unverified stale or bypass billing fails closed',()=>s.turn(a.sessionId,a.proof,'test',1,a.csrf),'billing_unverified');
 }
 s=createService(options());for(let i=0;i<20;i++){a=await prepared(s,'TEST ONLY global'+i);await send(s,a);}a=await prepared(s,'TEST ONLY global cap');
 await rejects('global 20 submissions daily',()=>send(s,a),'quota');
 // Simulated handler crash after transport starts: persisted state forbids a resend.
 o=options(); let release; let attempts=0;
 o.transport=()=>{attempts++; return new Promise(resolve=>{release=resolve;});};
 s=createService(o);a=await prepared(s);const pending=send(s,a);
 await new Promise(resolve=>setImmediate(resolve));
 const other=createService(o);assert.equal((await send(other,a)).status,'uncertain');
 release({ok:true,json:async()=>({ok:true})});assert.equal((await pending).status,'uncertain');assert.equal((await send(other,a)).status,'uncertain');
 check('late transport and shared handler cannot resend',()=>assert.equal(attempts,1));
 o=options();s=createService(o);a=await prepared(s);clock+=1800001;
 await rejects('expired session and draft fail closed',()=>send(s,a),'session');
 const fs=require('fs'),vm=require('vm');let mailOptions;
 const router={PropertiesService:{getScriptProperties:()=>({getProperty:()=> 'TEST ONLY secret'})},GmailApp:{sendEmail:(to,subject,body,opts)=>{mailOptions=opts;}},ContentService:{MimeType:{JSON:'json'},createTextOutput:x=>({setMimeType(){return x;}})}};
 vm.createContext(router);vm.runInContext(fs.readFileSync(require.resolve('../scripts/email-router/contact-router.gs'),'utf8'),router);
 router.doPost({postData:{contents:JSON.stringify({...payload(normalize(fields),'TEST ONLY id','TEST ONLY secret',clock)})}});
 check('Apps Script phone-only omits replyTo entirely',()=>assert(!Object.hasOwn(mailOptions,'replyTo')));
 mailOptions=null;router.doPost({postData:{contents:JSON.stringify({secret:'TEST ONLY secret',routeTo:'evil@example.test'})}});
 check('Apps Script recipient allowlist unchanged',()=>assert.equal(mailOptions,null));
 const p=payload(normalize(fields),'TEST ONLY id','TEST ONLY secret',clock);
 check('single mailbox subject body convention preserved',()=>{assert.equal(p.routeTo,'support@lavaall.com');assert(p.subject.startsWith('[Lavaall Website'));assert(p.message.startsWith('New message from the LAVAALL website contact form.\nChannel: website chat'));});
 check('contact adapter is mock only',()=>assert.throws(()=>mockContactTransport({runtime:'production',fetchMock:()=>{}})));
 const res=()=>({headers:{},setHeader(k,v){this.headers[k]=v;return this;},status(n){this.code=n;return this;},send(x){this.body=JSON.parse(x);return this;}});
 for(const config of [{},{runtime:'production',CHAT_ENABLED:true,store:memoryStore(),transport:()=>{}},{runtime:'test',CHAT_ENABLED:true}]){let r=res();await createHandler(config)({method:'POST'},r);check('no durable production adapter remains off',()=>assert.equal(r.code,503));}
 o={...options(),runtime:'test',CHAT_ENABLED:true,trustedOrigins:['https://preview.test'],vendorSecret:'TEST_ONLY_'.repeat(5)};const h=createHandler(o);
 async function req(action,body,headers={}) {const r=res();await h({method:'POST',query:{action},body,headers:{'content-type':'application/json',origin:'https://preview.test',...headers}},r);return r;}
 check('arbitrary Host cannot authorize Origin',()=>{});assert.equal((await req('session',{}, {origin:'https://evil.test',host:'preview.test'})).code,403);
 assert.equal((await req('draft',{sessionId:'fake',fields,eventId:'test'})).code,403);
 let r=await req('session',{});const browser=r.body,cookie=r.headers['Set-Cookie'].split(';')[0];
 check('cookie proof HttpOnly SameSite Secure and never returned to agent',()=>{assert(r.headers['Set-Cookie'].includes('HttpOnly; SameSite=Strict'));assert(r.headers['Set-Cookie'].includes('Secure'));assert(!browser.proof);});
 const vendor={authorization:'Bearer '+o.vendorSecret};r=await req('draft',{sessionId:browser.sessionId,fields,eventId:'test'},vendor);const draftId=r.body.draftId;
 check('vendor can draft only no summary proof or consent',()=>assert.deepEqual(Object.keys(r.body),['draftId']));
 assert.equal((await req('review',{...browser,draftId},vendor)).code,403);
 r=await req('review',{...browser,draftId},{cookie});assert(r.body.token);
 assert.equal((await req('confirm',{...browser,draftId,confirmed:true},{cookie})).code,400);
 assert.equal((await req('session',{extra:'TEST ONLY'})).code,400);
 assert.equal((await req('session',{}, {'content-type':'text/plain'})).code,415);
 assert.equal((await req('session',{a:'x'.repeat(9000)})).code,413);
 check('browser origin vendor auth strict JSON size and model-consent denial',()=>{});
 console.log(`${checks}/${checks} passed`);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
