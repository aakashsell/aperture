"""Real API + Postgres contract checks. Creates isolated projects; never resets a database."""
import os
import sys
import uuid
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import requests
import psycopg2

API = os.getenv('API_URL','http://localhost:8000')
DSN = os.environ['DATABASE_URL']
worker_path = Path('/worker')
if not worker_path.is_dir():
    worker_path = Path(__file__).resolve().parents[2] / 'worker'
sys.path.insert(0, str(worker_path))
from main import aggregate_metrics, compute_stats

class PipelineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.session=requests.Session()
        r=cls.session.post(API+'/auth/register',json={'email':f'{uuid.uuid4().hex}@test.example','password':'a-long-test-password','project':'Integration tests'},timeout=10)
        assert r.status_code==200,r.text
        cls.key=cls.session.get(API+'/auth/session',timeout=10).json()['publishable_key']
        cls.sdk=requests.Session();cls.sdk.headers['X-API-Key']=cls.key
        cls.other=requests.Session()
        r=cls.other.post(API+'/auth/register',json={'email':f'{uuid.uuid4().hex}@test.example','password':'another-test-password'},timeout=10)
        assert r.status_code==200,r.text
        cls.other_key=cls.other.get(API+'/auth/session',timeout=10).json()['publishable_key']

    def create(self,key=None):
        key=key or 'exp_'+uuid.uuid4().hex[:12]
        r=self.session.post(API+'/experiments',json={'key':key,'name':'Checkout','allocated_percentage':100,'attribution_days':7,'variants':[{'key':'control','allocation':50,'is_control':True},{'key':'treatment','allocation':50}],'primary_metric':{'name':'Purchase','event_name':'purchase','metric_type':'binary'}},timeout=10)
        self.assertEqual(r.status_code,200,r.text)
        return key

    def post(self,path,body=None,sdk=False):
        return (self.sdk if sdk else self.session).post(API+path,json=body or {},timeout=10)

    def test_auth_and_project_boundaries(self):
        self.assertEqual(requests.get(API+'/experiments',timeout=10).status_code,401)
        self.assertEqual(self.sdk.get(API+'/experiments',timeout=10).status_code,403)
        key=self.create()
        self.assertEqual(self.other.get(API+'/results/'+key,timeout=10).status_code,404)
        self.assertEqual(self.other.post(API+f'/experiments/{key}/start',json={},timeout=10).status_code,404)

    def test_invalid_experiment_is_atomic(self):
        key='invalid_'+uuid.uuid4().hex[:12]
        r=self.post('/experiments',{'key':key,'name':'Bad','allocated_percentage':100,'variants':[{'key':'same','allocation':50,'is_control':True},{'key':'same','allocation':50}]})
        self.assertEqual(r.status_code,400)
        self.assertEqual(self.session.get(API+'/results/'+key,timeout=10).status_code,404)

    def test_lifecycle_exposure_and_rollout(self):
        key=self.create();path=f'/experiments/{key}'
        self.assertIsNone(self.post(path+'/assign',{'user_id':'u'},True).json()['variant'])
        self.assertEqual(self.post(path+'/start').status_code,200)
        with ThreadPoolExecutor(max_workers=8) as pool:
            variants=list(pool.map(lambda _:requests.post(API+path+'/assign',headers={'X-API-Key':self.key},json={'user_id':'u'},timeout=10).json()['variant'],range(16)))
        self.assertEqual(len(set(variants)),1)
        variant=variants[0]
        self.assertEqual(self.post(path+'/expose',{'user_id':'u','variant':'wrong'},True).status_code,409)
        for _ in range(2):self.assertEqual(self.post(path+'/expose',{'user_id':'u','variant':variant},True).status_code,200)
        self.assertEqual(self.post(path+'/pause').status_code,200)
        self.assertEqual(self.post(path+'/assign',{'user_id':'u'},True).json()['variant'],variant)
        self.assertIsNone(self.post(path+'/assign',{'user_id':'new'},True).json()['variant'])
        self.assertEqual(self.post(path+'/metrics',{'metric_id':1,'is_primary':True}).status_code,409)
        self.assertEqual(self.post(path+'/rollout?variant_key=treatment').status_code,200)
        self.assertEqual(self.post(path+'/assign',{'user_id':'new'},True).json()['variant'],'treatment')
        self.assertEqual(self.post(path+'/expose',{'user_id':'u','variant':variant},True).status_code,409)
        self.assertEqual(self.post(path+'/start').status_code,409)

    def test_batch_atomicity_and_deduplication(self):
        event={'event_id':uuid.uuid4().hex,'user_id':'batch-user','event_name':'purchase'}
        self.assertEqual(self.post('/events/batch',{'events':[event,{'user_id':'invalid'}]},True).status_code,400)
        r=self.post('/events/track',event,True)
        self.assertEqual(r.json()['inserted'],1,r.text)
        self.assertEqual(self.post('/events/track',event,True).json()['inserted'],0)

    def test_rollout_is_stable_monotonic_private_and_versioned(self):
        key='gate_'+uuid.uuid4().hex[:12]
        r=self.post('/gates',{'key':key,'name':'New sync','description':'Chrome extension sync path','allocation_kind':'anonymous','rollout_percentage':5})
        self.assertEqual(r.status_code,200,r.text)
        path=f'/gates/{key}'
        # Draft rollouts always return the current behavior.
        identity={'kind':'anonymous','id':'installation-stable'}
        self.assertFalse(self.post(path+'/evaluate',{'allocation':identity},True).json()['enabled'])
        self.assertEqual(self.post(path+'/rollout',{'rollout_percentage':5,'expected_version':1}).status_code,200)
        at_five={}
        for i in range(200):
            allocation={'kind':'anonymous','id':f'chrome-installation-{i}'}
            first=self.post(path+'/evaluate',{'allocation':allocation},True).json()
            second=self.post(path+'/evaluate',{'allocation':allocation},True).json()
            self.assertEqual(first['enabled'],second['enabled'])
            at_five[i]=first['enabled']
        self.assertGreater(sum(at_five.values()),2)
        self.assertLess(sum(at_five.values()),20)
        # Expanding changes the version but preserves the deterministic audience prefix.
        with ThreadPoolExecutor(max_workers=2) as pool:
            attempts=list(pool.map(lambda _:requests.post(API+path+'/rollout',cookies=self.session.cookies.get_dict(),json={'rollout_percentage':50,'expected_version':2},timeout=10),range(2)))
        self.assertEqual(sorted(r.status_code for r in attempts),[200,409])
        at_fifty={}
        for i in range(200):
            allocation={'kind':'anonymous','id':f'chrome-installation-{i}'}
            decision=self.post(path+'/evaluate',{'allocation':allocation},True).json()
            at_fifty[i]=decision['enabled']
            self.assertFalse(at_five[i] and not decision['enabled'])
            exposure={'allocation':allocation,'enabled':decision['enabled'],'config_version':decision['config_version']}
            self.assertEqual(self.post(path+'/expose',exposure,True).status_code,200)
        self.assertGreater(sum(at_fifty.values()),70)
        self.assertLess(sum(at_fifty.values()),130)
        detail=self.session.get(API+path,timeout=10).json()
        self.assertEqual(detail['health_status'],'no_flags')
        # Health and exposure records must match a server decision and raw IDs are not stored.
        bad={'allocation':identity,'enabled':True,'config_version':999}
        self.assertEqual(self.post(path+'/expose',bad,True).status_code,409)
        unexposed={'kind':'anonymous','id':'evaluated-but-not-exposed'}
        unexposed_decision=self.post(path+'/evaluate',{'allocation':unexposed},True).json()
        premature={'allocation':unexposed,'enabled':unexposed_decision['enabled'],'config_version':unexposed_decision['config_version'],'event_id':uuid.uuid4().hex,'name':'sync-failed','severity':'error'}
        self.assertEqual(self.post(path+'/health',premature,True).status_code,409)
        enabled_index=next(i for i, enabled in at_fifty.items() if enabled)
        allocation={'kind':'anonymous','id':f'chrome-installation-{enabled_index}'}
        event={'allocation':allocation,'enabled':True,'config_version':3,'event_id':uuid.uuid4().hex,'name':'sync-failed','severity':'error'}
        self.assertTrue(self.post(path+'/health',event,True).json()['ingested'])
        self.assertFalse(self.post(path+'/health',event,True).json()['ingested'])
        conn=psycopg2.connect(DSN)
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT d.allocation_id_hash FROM gate_decisions d JOIN gates g ON g.id=d.gate_id WHERE g.key=%s LIMIT 1",(key,))
                stored=cur.fetchone()[0]
                self.assertNotIn('chrome-installation',stored)
                self.assertEqual(len(stored),64)
        finally:conn.close()
        self.assertEqual(self.post(path+'/disable',{'expected_version':3}).status_code,200)
        self.assertFalse(self.post(path+'/evaluate',{'allocation':identity},True).json()['enabled'])
        self.assertEqual(self.other.get(API+path,timeout=10).status_code,404)

    def test_gate_independent_crash_ingestion_dedup_and_private_query(self):
        allocation={'kind':'installation','id':'crash-install-'+uuid.uuid4().hex}
        event_id=uuid.uuid4().hex
        body={'allocation':allocation,'event_id':event_id,'name':'unhandled-rejection','severity':'fatal','exception':{'type':'TypeError','message':'startup failed','stack':'TypeError: startup failed\\n at worker.js:8'}}
        invalid_gate=dict(body,event_id=uuid.uuid4().hex,gate_key='not-this-project-gate',config_version=1)
        self.assertEqual(self.post('/crashes/ingest',invalid_gate,True).status_code,400)
        first=self.post('/crashes/ingest',body,True)
        self.assertEqual(first.status_code,200,first.text)
        self.assertTrue(first.json()['ingested'])
        retry=self.post('/crashes/ingest',body,True)
        self.assertTrue(retry.json()['duplicate'])
        second=dict(body,event_id=uuid.uuid4().hex)
        again=self.post('/crashes/ingest',second,True)
        self.assertTrue(again.json()['deduplicated'])
        self.assertEqual(again.json()['occurrences'],2)
        self.assertEqual(self.sdk.post(API+'/crashes/query',json={}).status_code,403)
        reports=self.session.post(API+'/crashes/query',json={'allocation_id':allocation['id'],'allocation_kind':'installation'},timeout=10)
        self.assertEqual(reports.status_code,200,reports.text)
        self.assertEqual(len(reports.json()),1)
        report=reports.json()[0]
        self.assertEqual(report['exception_type'],'TypeError')
        self.assertEqual(report['exception_message'],'startup failed')
        self.assertIn('worker.js:8',report['exception_stack'])
        self.assertEqual(report['occurrence_count'],2)
        self.assertIsNone(report['gate_key'])
        self.assertNotIn(allocation['id'],report['allocation_id_hash'])
        self.assertEqual(self.other.post(API+'/crashes/query',json={'allocation_id':allocation['id'],'allocation_kind':'installation'},timeout=10).json(),[])

    def test_project_scoped_pipeline(self):
        key=self.create();path=f'/experiments/{key}';self.post(path+'/start')
        # Both variants receive 40 users. Only treatment users convert in this project.
        counts={'control':0,'treatment':0}
        for i in range(1000):
            uid=f'{key}_user_{i}'
            variant=self.post(path+'/assign',{'user_id':uid},True).json()['variant']
            if counts[variant]>=40:continue
            counts[variant]+=1
            self.assertEqual(self.post(path+'/expose',{'user_id':uid,'variant':variant},True).status_code,200)
            # Same event and user in a different project must never affect this project.
            requests.post(API+'/events/track',headers={'X-API-Key':self.other_key},json={'event_id':uuid.uuid4().hex,'user_id':uid,'event_name':'purchase'},timeout=10).raise_for_status()
            if variant=='treatment':self.post('/events/track',{'event_id':uuid.uuid4().hex,'user_id':uid,'event_name':'purchase'},True).raise_for_status()
            if min(counts.values())==40:break
        conn=psycopg2.connect(DSN)
        try:aggregate_metrics(conn);compute_stats(conn)
        finally:conn.close()
        r=self.session.get(API+'/results/'+key,timeout=10);self.assertEqual(r.status_code,200,r.text)
        metric=r.json()['metrics'][0]
        self.assertEqual(metric['control']['mean'],0)
        self.assertEqual(metric['treatments'][0]['mean'],1)
        self.assertEqual(metric['control']['sample_size'],40)
        self.assertGreater(metric['treatments'][0]['lift_ci_lower'],0)
        self.assertEqual(r.json()['summary']['exposures'],80)

if __name__=='__main__':unittest.main()
