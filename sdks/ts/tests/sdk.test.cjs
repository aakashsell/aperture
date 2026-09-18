const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Aperture}=require('../dist/index.js');
test('server assignment is the exact displayed exposure variant',async()=>{
 const calls=[];global.fetch=async(url,options)=>{calls.push({url,body:JSON.parse(options.body),headers:options.headers});return {ok:true,json:async()=>url.endsWith('/assign')?{variant:'server-choice'}:{exposed:true}}};
 const sdk=new Aperture({apiUrl:'http://test',publishableKey:'public'});
 assert.equal(await sdk.getVariant('checkout','user'),'server-choice');
 await sdk.expose('checkout','user');
 assert.equal(calls[1].body.variant,'server-choice');assert.equal(calls[0].headers['X-API-Key'],'public');
});
test('exposure without assignment fails rather than creating an assignment',async()=>{
 const sdk=new Aperture({apiUrl:'http://test',publishableKey:'public'});
 await assert.rejects(sdk.expose('x','new-user'),/Fetch an assignment/);
});
test('HTTP failure rejects and is observable',async()=>{
 const errors=[];global.fetch=async()=>({ok:false,status:503,text:async()=> 'unavailable'});
 const sdk=new Aperture({apiUrl:'http://test',publishableKey:'public',onError:e=>errors.push(e)});
 await assert.rejects(sdk.getVariant('x','u'),/503/);assert.equal(errors.length,1);
});
test('gate decisions are cached, refreshed, and required for exposure',async()=>{
 const calls=[];global.fetch=async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return {ok:true,json:async()=>url.endsWith('/evaluate')?{enabled:true,config_version:4,expires_at:new Date(Date.now()+60000).toISOString()}:{exposed:true}}};
 const sdk=new Aperture({apiUrl:'http://test',publishableKey:'public'});
 const allocation={kind:'installation',id:'install-1'};
 assert.equal(await sdk.gate('new-sync',allocation),true);
 assert.equal(await sdk.gate('new-sync',allocation),true);
 assert.equal(calls.length,1);
 await sdk.gate('new-sync',allocation,{refresh:true});
 await sdk.exposeGate('new-sync',true,allocation);
 assert.equal(calls.length,3);
 assert.equal(calls[2].body.config_version,4);
 await assert.rejects(sdk.exposeGate('new-sync',false,allocation),/must match/);
});
test('Chrome storage creates one persistent anonymous installation identity',async()=>{
 const storage={};
 global.chrome={storage:{local:{get(key,callback){callback({...storage});},set(items,callback){Object.assign(storage,items);callback();}}}};
 const seen=[];global.fetch=async(_url,options)=>{const body=JSON.parse(options.body);seen.push(body.allocation);return {ok:true,json:async()=>({enabled:false,config_version:1,expires_at:new Date(Date.now()+60000).toISOString()})}};
 const first=new Aperture({apiUrl:'http://test',publishableKey:'chrome-public'});
 const second=new Aperture({apiUrl:'http://test',publishableKey:'chrome-public'});
 const supportIdentity=await first.getAnonymousAllocation();
 assert.equal(supportIdentity.kind,'anonymous');
 await first.gate('new-sync');await second.gate('new-sync');
 assert.equal(seen[0].kind,'anonymous');
 assert.equal(seen[0].id,seen[1].id);
 assert.equal(supportIdentity.id,seen[0].id);
 assert.ok(seen[0].id.length>=16);
 delete global.chrome;
});
test('Node callers supply an explicit rollout identity',async()=>{
 const sdk=new Aperture({apiUrl:'http://test',publishableKey:'public'});
 await assert.rejects(sdk.gate('new-sync'),/requires an allocation unit/);
});
test('reportCrash works without a gate and deduplicates repeated exceptions',async()=>{
 const calls=[];global.fetch=async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return {ok:true,json:async()=>({ingested:true})}};
 const sdk=new Aperture({apiUrl:'http://test',publishableKey:'public'});
 const allocation={kind:'installation',id:'support-install-1'};
 const crash={eventId:'crash-1',name:'uncaught',severity:'fatal',exception:{type:'TypeError',message:'Cannot read property','stack':'TypeError: Cannot read property\n at worker.js:9'}};
 assert.equal(await sdk.reportCrash(crash,allocation),true);
 assert.equal(await sdk.reportCrash({...crash,eventId:'crash-2'},allocation),true);
 assert.equal(calls.length,1);
 assert.equal(calls[0].url,'http://test/crashes/ingest');
 assert.equal(calls[0].body.exception.stack,crash.exception.stack);
 assert.equal(calls[0].body.gate_key,undefined);
});
test('captureException normalizes Error and rejection values via crash ingestion',async()=>{
 const calls=[];global.fetch=async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return {ok:true,json:async()=>({ingested:true})}};
 const sdk=new Aperture({apiUrl:'http://test',publishableKey:'public'});
 const allocation={kind:'installation',id:'capture-install'};
 assert.equal(await sdk.captureException(new TypeError('worker failed'),{severity:'fatal',allocation,properties:{source:'worker'}}),true);
 assert.equal(calls[0].url,'http://test/crashes/ingest');
 assert.equal(calls[0].body.exception.type,'TypeError');
 assert.equal(calls[0].body.exception.message,'worker failed');
 assert.equal(calls[0].body.severity,'fatal');
 assert.equal(calls[0].body.allocation.id,'capture-install');
});
test('offline decision reuse is opt-in, bounded, and observable across SDK restarts',async()=>{
 const storage={};
 global.chrome={storage:{local:{get(key,callback){callback({...storage});},set(items,callback){Object.assign(storage,items);callback();}}}};
 const allocation={kind:'installation',id:'offline-install'};
 global.fetch=async()=>({ok:true,json:async()=>({enabled:true,config_version:9,expires_at:new Date(Date.now()+30000).toISOString()})});
 const first=new Aperture({apiUrl:'http://test',publishableKey:'offline-public',offlineDecisionTtlMs:60000});
 assert.equal(await first.gate('new-sync',allocation),true);
 let stale;
 global.fetch=async()=>{throw new TypeError('Failed to fetch')};
 const second=new Aperture({apiUrl:'http://test',publishableKey:'offline-public',offlineDecisionTtlMs:60000,onStaleDecision:(_key,enabled,age)=>{stale={enabled,age}}});
 assert.equal(await second.gate('new-sync',allocation),true);
 assert.equal(stale.enabled,true);
 assert.ok(stale.age>=0);
 const strict=new Aperture({apiUrl:'http://test',publishableKey:'offline-public'});
 await assert.rejects(strict.gate('new-sync',allocation),/Failed to fetch/);
 delete global.chrome;
});
