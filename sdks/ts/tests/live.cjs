// Runs the actual built SDK against the API, then computes and verifies its results.
const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
const {spawnSync} = require('node:child_process');
const path = require('node:path');
const {Aperture} = require('../dist/index.js');
const api = process.env.API_URL || 'http://localhost:8000';
(async()=>{
 const registration=await fetch(api+'/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:`sdk-${randomUUID()}@test.example`,password:'sdk-integration-password'})});
 assert.equal(registration.status,200);
 const cookie=registration.headers.get('set-cookie').split(';')[0];
 const management=async(route,body)=>{const res=await fetch(api+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Cookie:cookie},body:body?JSON.stringify(body):undefined});assert.equal(res.status,200,await res.clone().text());return res.json();};
 const session=await management('/auth/session');
 const rolloutKey='rollout_'+randomUUID().replaceAll('-','');
 await management('/gates',{key:rolloutKey,name:'Actual SDK rollout',description:'Chrome-compatible release path',allocation_kind:'installation',rollout_percentage:5});
 await management(`/gates/${rolloutKey}/rollout`,{rollout_percentage:5,expected_version:1});
 const sdk=new Aperture({apiUrl:api,publishableKey:session.publishable_key});
 const crashAllocation={kind:'installation',id:'sdk-crash-'+randomUUID()};
 await sdk.reportCrash({eventId:randomUUID(),name:'uncaught',severity:'fatal',exception:{type:'TypeError',message:'live SDK crash path',stack:'TypeError: live SDK crash path\\n at service-worker.js:4'}},crashAllocation);
 const crashReports=await management('/crashes/query',{allocation_id:crashAllocation.id,allocation_kind:crashAllocation.kind});
 assert.equal(crashReports.length,1);
 assert.equal(crashReports[0].exception_type,'TypeError');
 assert.equal(crashReports[0].exception_message,'live SDK crash path');
 assert.match(crashReports[0].exception_stack,/service-worker.js:4/);
 let enabledAtFive=0;
 for(let i=0;i<80;i++){
  const allocation={kind:'installation',id:'sdk-installation-'+i};
  const enabled=await sdk.gate(rolloutKey,allocation);
  enabledAtFive+=Number(enabled);
  await sdk.exposeGate(rolloutKey,enabled,allocation);
 }
 assert.ok(enabledAtFive>0&&enabledAtFive<15,`unexpected 5% audience: ${enabledAtFive}`);
 const rolloutAtFive=await management('/gates/'+rolloutKey);
 assert.equal(rolloutAtFive.exposures,80);
 await management(`/gates/${rolloutKey}/rollout`,{rollout_percentage:100,expected_version:2});
 for(let i=0;i<80;i++){
  const allocation={kind:'installation',id:'sdk-installation-'+i};
  assert.equal(await sdk.gate(rolloutKey,allocation,{refresh:true}),true);
 }
 if(process.env.SKIP_WORKER){
  console.log('Actual SDK → crash reporting → 5% rollout → 100% rollout: passed (worker stage skipped)');
  return;
 }
 const key='sdk_'+randomUUID().replaceAll('-','');
 await management('/experiments',{key,name:'Actual SDK pipeline',allocated_percentage:100,variants:[{key:'control',allocation:50,is_control:true},{key:'treatment',allocation:50}],primary_metric:{name:'Purchase',event_name:'purchase',metric_type:'binary'}});
 await management(`/experiments/${key}/start`,{});
 const counts={control:0,treatment:0};
 for(let i=0;i<80;i++){
  const user='sdk-user-'+i;const variant=await sdk.getVariant(key,user);assert.ok(variant);
  assert.equal(await sdk.getVariant(key,user),variant);counts[variant]++;
  await sdk.expose(key,user,variant);
  if(variant==='treatment')await sdk.track(randomUUID(),user,'purchase');
 }
 const worker=spawnSync(process.env.PYTHON||'python3',['-c','from main import run_once; run_once()'],{cwd:path.resolve(__dirname,'../../../worker'),env:process.env,encoding:'utf8'});
 assert.equal(worker.status,0,worker.stderr);
 const result=await management('/results/'+key);
 assert.equal(result.summary.exposures,80);
 assert.equal(result.metrics[0].control.mean,0);
 assert.equal(result.metrics[0].treatments[0].mean,1);
 assert.equal(result.metrics[0].control.sample_size,counts.control);
 console.log('Actual SDK → crash reporting → 5% rollout → 100% rollout → experiment results: passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
