import os, tempfile, json, io, zipfile, importlib.util, subprocess, sys
from pathlib import Path
os.environ['ARCHIVE_STORAGE_DIR']=tempfile.mkdtemp(prefix='archive-recruit-check-')
os.environ['ARCHIVE_ADMIN_KEY']='qa-private-admin-key'
os.environ.pop('RECRUIT_DATABASE_URL',None);os.environ.pop('DATABASE_URL',None);os.environ.pop('VERCEL',None)
from fastapi.testclient import TestClient
from app.main import app, recruitment_store
from app.recruitment import assignment, RecruitmentStore, CodeSubmission

def expect(response, code):
    assert response.status_code==code,(response.status_code,response.text)
    return response.json()

with TestClient(app) as client:
    expect(client.get('/api/recruitment/me'),401)
    expect(client.get('/api/recruitment/admin/candidates'),401)
    assert expect(client.get('/api/recruitment/status'),200)['accepting']
    expect(client.post('/api/recruitment/enroll',json={'display_name':'Test Developer','email':'test@example.com','github_handle':'tester','consent':False}),400)
    enrolled=expect(client.post('/api/recruitment/enroll',json={'display_name':'Test Developer','email':'test@example.com','github_handle':'tester','consent':True}),201)
    token=enrolled['recovery_code'];identity=enrolled['candidate']['id']
    assert 'HttpOnly' in client.cookies.jar._cookies['testserver.local']['/']['archive_candidate']._rest
    initial=expect(client.get('/api/recruitment/me'),200)
    assert 'token_hash' not in initial and 'review' not in initial and 'email' not in initial
    assert 'relay' not in initial['mission'] and 'expected_total' not in initial['mission']
    expect(client.post('/api/recruitment/enroll',json={'display_name':'Other Developer','email':'other@example.com','github_handle':'other','consent':True}),409)
    expect(client.get('/api/recruitment/starter.zip'),403)
    expect(client.post('/api/recruitment/missions/debug/answer',json={'answer':'4','reasoning':'The counter includes repeated events.'}),403)
    expect(client.post('/api/recruitment/missions/signal/answer',headers={'Origin':'https://attacker.invalid'},json={'answer':'no'}),403)
    wrong=expect(client.post('/api/recruitment/missions/signal/answer',json={'answer':'no'}),200)
    assert not wrong['correct'] and wrong['candidate']['attempts']['signal']==1
    record=recruitment_store.get(token);a=assignment(record['variant'])
    expect(client.post('/api/recruitment/missions/signal/answer',json={'answer':a['relay']}),200)
    expect(client.post('/api/recruitment/missions/debug/answer',json={'answer':str(a['expected_total']),'reasoning':'The processor keeps duplicate IDs and fails to strip and lowercase service names.'}),200)
    starter=client.get('/api/recruitment/starter.zip');expect_code=starter.status_code;assert expect_code==200
    with zipfile.ZipFile(io.BytesIO(starter.content)) as z:
        assert 'archive_events.py' in z.namelist() and 'test_reviewer.py' not in z.namelist()
        assert json.loads(z.read('sample_events.json'))==a['events']
    payload={'github_url':'https://github.com/tester/archive-audition/pull/1','commit_sha':'a'*40,'repair_notes':'Repaired service normalization, event validation, and ID de-duplication.','feature_notes':'Added cross-stream aggregation with shared validation and duplicate handling.','tests_notes':'Ran public tests plus conflict, empty and invalid input tests.','explanation':'The implementation separates validation from aggregation and keeps input data unchanged. I would add property-based tests next.','ai_usage':'None'}
    bad=dict(payload,github_url='https://github.com.evil.invalid/a/b');expect(client.post('/api/recruitment/submit',json=bad),422)
    submitted=expect(client.post('/api/recruitment/submit',json=payload),200)
    assert submitted['status']=='submitted' and all(s['complete'] for s in submitted['stages'])
    expect(client.post('/api/recruitment/submit',json=payload),409)
    expect(client.get('/api/recruitment/admin/candidates/'+identity+'/reviewer-tests.zip'),401)
    expect(client.post('/api/admin/login',json={'key':'qa-private-admin-key'}),200)
    listed=expect(client.get('/api/recruitment/admin/candidates'),200)
    assert len(listed['candidates'])==1 and 'token_hash' not in str(listed)
    detail=expect(client.get('/api/recruitment/admin/candidates/'+identity),200)
    assert detail['email']=='test@example.com' and detail['debug_reason']
    tests=client.get('/api/recruitment/admin/candidates/'+identity+'/reviewer-tests.zip');assert tests.status_code==200
    with zipfile.ZipFile(io.BytesIO(tests.content)) as z:
        private_source=z.read('test_reviewer.py').decode()
        compile(private_source,'private_tests','exec')
        assert private_source.count('    def test_')==12
    review={'correctness':4,'code_quality':3,'testing':5,'communication':4,'decision':'shortlisted','notes':'Reviewed the exact revision and observed solid validation and useful extra tests.','tested_commit_sha':'b'*40,'tests_passed':11}
    expect(client.post('/api/recruitment/admin/candidates/'+identity+'/review',json=review),400)
    review['tested_commit_sha']='a'*40
    scored=expect(client.post('/api/recruitment/admin/candidates/'+identity+'/review',json=review),200)
    assert scored['review']['weighted_score']==79.0 and scored['review']['review_source']=='human'
    mine=expect(client.get('/api/recruitment/me'),200);assert mine['status']=='shortlisted' and 'review' not in mine and 'notes' not in mine
    assert client.get('/api/recruitment/me').headers['cache-control']=='no-store'
    fresh=RecruitmentStore(Path(os.environ['ARCHIVE_STORAGE_DIR']),False)
    assert fresh.get(token)['id']==identity # independent store instance, same persisted database
    expect(client.post('/api/recruitment/logout'),200)
    expect(client.get('/api/recruitment/me'),401)
    expect(client.post('/api/recruitment/resume',json={'recovery_code':'z'*43}),401)
    expect(client.post('/api/recruitment/resume',json={'recovery_code':token}),200)
    expect(client.delete('/api/recruitment/me'),200)
    expect(client.post('/api/recruitment/resume',json={'recovery_code':token}),401)
    print('PASS: enrollment/consent, separate identity, objective locks, candidate-specific ZIP, GitHub validation, submission lock, admin privacy, tests/score, fresh-store persistence, resume, deletion, and CSRF checks.')
