"""Developer auditions. Candidate code is reviewed externally, never executed on this server."""
from __future__ import annotations

import base64
import hashlib
import io
import json
import logging
import os
import re
import secrets
import sqlite3
import threading
import zipfile
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable
from urllib.parse import urlsplit

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, StreamingResponse, JSONResponse
from pydantic import BaseModel, Field, field_validator

SCHEMA = """
CREATE TABLE IF NOT EXISTS blackterm_recruit_candidates (
    id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    email TEXT NOT NULL,
    github_handle TEXT NOT NULL,
    consent_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    variant TEXT NOT NULL,
    signal_solved INTEGER NOT NULL DEFAULT 0,
    debug_solved INTEGER NOT NULL DEFAULT 0,
    signal_attempts INTEGER NOT NULL DEFAULT 0,
    debug_attempts INTEGER NOT NULL DEFAULT 0,
    debug_reason TEXT NOT NULL DEFAULT '',
    submission TEXT,
    submitted_at TEXT,
    status TEXT NOT NULL DEFAULT 'in_progress',
    review TEXT,
    reviewed_at TEXT
)
"""
COOKIE = 'archive_candidate'
WEIGHTS = {'correctness': 40, 'code_quality': 25, 'testing': 20, 'communication': 15}
STAGES = [
    {'id': 'signal', 'title': 'Signal recovery', 'description': 'Decode a recovered transmission.'},
    {'id': 'debug', 'title': 'Broken workstation', 'description': 'Diagnose the event aggregation defect.'},
    {'id': 'repair', 'title': 'Repair mission', 'description': 'Fix the starter project and demonstrate tests.'},
    {'id': 'feature', 'title': 'Feature contract', 'description': 'Implement stream merging from a written brief.'},
    {'id': 'debrief', 'title': 'Final debrief', 'description': 'Submit your code, reasoning, and AI disclosure.'},
]


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def token_hash(value: str) -> str:
    return hashlib.sha256(value.encode('utf-8')).hexdigest()


class Enrollment(BaseModel):
    display_name: str = Field(min_length=2, max_length=80)
    email: str = Field(min_length=5, max_length=200)
    github_handle: str = Field(min_length=1, max_length=39)
    consent: bool

    @field_validator('display_name', 'email', 'github_handle', mode='before')
    @classmethod
    def trim(cls, value: str) -> str:
        return value.strip() if isinstance(value, str) else value

    @field_validator('email')
    @classmethod
    def check_email(cls, value: str) -> str:
        if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', value):
            raise ValueError('Enter a valid contact email.')
        return value.lower()

    @field_validator('github_handle')
    @classmethod
    def check_handle(cls, value: str) -> str:
        if not re.fullmatch(r'[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?', value):
            raise ValueError('Enter your GitHub username, without a URL or @.')
        return value


class ResumeInput(BaseModel):
    recovery_code: str = Field(min_length=40, max_length=100)


class MissionAnswer(BaseModel):
    answer: str = Field(min_length=1, max_length=300)
    reasoning: str = Field(default='', max_length=4000)


class CodeSubmission(BaseModel):
    github_url: str = Field(min_length=10, max_length=300)
    commit_sha: str = Field(min_length=40, max_length=40)
    repair_notes: str = Field(min_length=40, max_length=6000)
    feature_notes: str = Field(min_length=40, max_length=6000)
    tests_notes: str = Field(min_length=20, max_length=4000)
    explanation: str = Field(min_length=80, max_length=8000)
    ai_usage: str = Field(min_length=2, max_length=2000)

    @field_validator('github_url')
    @classmethod
    def validate_url(cls, value: str) -> str:
        value = value.strip()
        parsed = urlsplit(value)
        if parsed.scheme != 'https' or parsed.netloc != 'github.com' or parsed.query or parsed.fragment:
            raise ValueError('Use an https://github.com repository or pull request URL.')
        if not re.fullmatch(r'/[A-Za-z0-9-]+/[A-Za-z0-9_.-]+(?:/pull/[1-9][0-9]*)?/?', parsed.path):
            raise ValueError('Use a repository URL or a pull request URL.')
        return value.rstrip('/')

    @field_validator('commit_sha')
    @classmethod
    def validate_sha(cls, value: str) -> str:
        if not re.fullmatch(r'[0-9a-fA-F]{40}', value):
            raise ValueError('Enter the full 40-character Git commit SHA.')
        return value.lower()

    @field_validator('repair_notes', 'feature_notes', 'tests_notes', 'explanation', 'ai_usage', mode='before')
    @classmethod
    def useful_text(cls, value: str) -> str:
        if not isinstance(value, str):
            return value
        if not value.strip():
            raise ValueError('This field cannot be blank.')
        return value.strip()


class CandidateReview(BaseModel):
    correctness: int = Field(ge=0, le=5)
    code_quality: int = Field(ge=0, le=5)
    testing: int = Field(ge=0, le=5)
    communication: int = Field(ge=0, le=5)
    decision: str
    notes: str = Field(min_length=20, max_length=12000)
    tested_commit_sha: str = Field(min_length=40, max_length=40)
    tests_passed: int = Field(ge=0, le=12)
    tests_total: int = Field(default=12, ge=12, le=12)

    @field_validator('decision')
    @classmethod
    def check_decision(cls, value: str) -> str:
        if value not in {'reviewed', 'shortlisted', 'declined'}:
            raise ValueError('Choose reviewed, shortlisted, or declined.')
        return value

    @field_validator('notes', mode='before')
    @classmethod
    def trim_notes(cls, value: str) -> str:
        return value.strip() if isinstance(value, str) else value

    @field_validator('tested_commit_sha')
    @classmethod
    def check_sha(cls, value: str) -> str:
        return CodeSubmission.validate_sha(value)


class SQLConnection:
    def __init__(self, connection: Any, postgres: bool):
        self.connection = connection
        self.postgres = postgres

    def execute(self, query: str, parameters: tuple = ()) -> Any:
        return self.connection.execute(query.replace('?', '%s') if self.postgres else query, parameters)


class RecruitmentStore:
    def __init__(self, storage_root: Path, is_vercel: bool):
        self.url = os.getenv('RECRUIT_DATABASE_URL') or os.getenv('DATABASE_URL', '')
        self.is_vercel = is_vercel
        self.local_path = Path(os.getenv('RECRUIT_SQLITE_PATH', str(storage_root / 'data' / 'recruitment.db')))
        self.configured = bool(self.url) or not is_vercel
        self.accepting = os.getenv('RECRUIT_OPEN', 'true').lower() in {'true', '1', 'yes', 'on'}
        self.initialized = False
        self.lock = threading.Lock()

    @contextmanager
    def connect(self):
        if not self.configured:
            raise HTTPException(503, 'Developer auditions are not open yet. Please check back later.')
        connection = None
        try:
            if self.url:
                import psycopg
                from psycopg.rows import dict_row
                connection = psycopg.connect(self.url, row_factory=dict_row, connect_timeout=5)
            else:
                self.local_path.parent.mkdir(parents=True, exist_ok=True)
                connection = sqlite3.connect(self.local_path, timeout=15)
                connection.row_factory = sqlite3.Row
            with connection:
                sql = SQLConnection(connection, bool(self.url))
                if not self.initialized:
                    with self.lock:
                        if not self.initialized:
                            sql.execute(SCHEMA)
                            # Commit schema independently so a rejected request cannot roll it back.
                            connection.commit()
                            self.initialized = True
                yield sql
        except HTTPException:
            raise
        except Exception:
            logging.getLogger(__name__).error('Recruitment storage request failed; check database configuration and availability.')
            raise HTTPException(503, 'Recruitment storage is temporarily unavailable. Please try again.') from None
        finally:
            if connection is not None:
                connection.close()

    def get(self, token: str) -> dict:
        if not token or len(token) > 100:
            raise HTTPException(401, 'No candidate session. Start an audition or use your recovery code.')
        with self.connect() as sql:
            row = sql.execute('SELECT * FROM blackterm_recruit_candidates WHERE token_hash = ?', (token_hash(token),)).fetchone()
        if not row:
            raise HTTPException(401, 'Candidate session not found. Use your recovery code.')
        return dict(row)


def assignment(variant: str) -> dict:
    seed = int(variant[:12], 16)
    service = ['relay', 'archive', 'mail', 'index'][seed % 4]
    first, second, other = 3 + seed % 19, 4 + (seed // 19) % 23, 2 + (seed // 437) % 13
    relay = f'R-{seed % 9000 + 1000}'
    events = [
        {'id': 'evt-alpha', 'service': f' {service.upper()} ', 'count': first},
        {'id': 'evt-beta', 'service': service, 'count': second},
        {'id': 'evt-alpha', 'service': f' {service.upper()} ', 'count': first},
        {'id': 'evt-gamma', 'service': 'observer', 'count': other},
    ]
    encoded = base64.b64encode(json.dumps({'relay': relay, 'network': 'BLACKTERM', 'decoy': 'IGNORE-000'}).encode()).decode()
    return {'service': service, 'relay': relay, 'events': events, 'expected_total': first + second, 'transmission': encoded}


REQUIREMENTS = '''# Event recovery contract

Implement these functions in `archive_events.py`:

## summarize_events(events)
- Accept a list of event dictionaries. Return a dictionary of normalized service -> total count.
- Each event has `id`, `service`, and `count`. Extra fields may be ignored.
- IDs and service names must be non-empty strings after stripping whitespace. IDs are case-sensitive; normalize service names with strip().lower().
- Counts must be non-negative integers. Booleans are not valid counts.
- Count the first occurrence of each stripped ID once. A repeated ID with the same normalized service and count is a duplicate and is ignored. A repeated ID with a different service or count raises ValueError.
- A non-list input, non-dictionary event, missing required field, invalid name, or invalid count raises ValueError. Empty input returns {}.
- Do not mutate input objects. No network, database, or third-party dependencies are needed.

## merge_streams(streams)
- Accept a list of event lists. Apply the same validation and deduplication across all streams, then return normalized service totals.
- Empty outer and inner lists are allowed. Invalid outer/inner container types raise ValueError.
- Do not mutate the streams or their events.

Run public tests: `python -m unittest discover -s tests -v`.

Your deliverable is a GitHub repository or pull request plus its exact 40-character commit SHA. Include meaningful additional tests. AI tools are allowed; disclose how you used them and be ready to explain and change your code live.

The suggested session is 45–60 minutes. You may pause and return. No speed-based ranking or automated hiring decision is used. The code and explanation will be reviewed by a person.
'''
STARTER = '''"""Recovered event processor — repair this file according to README.md."""


def summarize_events(events):
    totals = {}
    for event in events:
        service = event["service"]
        totals[service] = totals.get(service, 0) + event["count"]
    return totals


def merge_streams(streams):
    raise NotImplementedError("Restore cross-stream recovery")
'''
PUBLIC_TESTS = '''import unittest
from archive_events import summarize_events, merge_streams

class PublicTests(unittest.TestCase):
    def test_empty(self):
        self.assertEqual(summarize_events([]), {})
    def test_normalization(self):
        self.assertEqual(summarize_events([{"id":"a","service":" Relay ","count":3}]), {"relay":3})
    def test_duplicate(self):
        event = {"id":"a","service":"relay","count":3}
        self.assertEqual(summarize_events([event, dict(event)]), {"relay":3})
    def test_merge(self):
        self.assertEqual(merge_streams([[{"id":"a","service":"relay","count":2}], [{"id":"b","service":"relay","count":4}]]), {"relay":6})
    def test_negative(self):
        with self.assertRaises(ValueError):
            summarize_events([{"id":"a","service":"relay","count":-1}])

if __name__ == '__main__': unittest.main()
'''


def reviewer_tests(candidate: dict) -> str:
    a = assignment(candidate['variant'])
    return '''import unittest
from copy import deepcopy
from archive_events import summarize_events, merge_streams

class ReviewerTests(unittest.TestCase):
    def test_candidate_fixture(self):
        events = EVENTS
        self.assertEqual(summarize_events(events), EXPECTED)
    def test_normalized_duplicate(self):
        self.assertEqual(summarize_events([{"id":" x ","service":" Relay ","count":2},{"id":"x","service":"relay","count":2}]), {"relay":2})
    def test_conflicting_count(self):
        with self.assertRaises(ValueError): summarize_events([{"id":"x","service":"relay","count":2},{"id":"x","service":"relay","count":3}])
    def test_conflicting_service(self):
        with self.assertRaises(ValueError): summarize_events([{"id":"x","service":"relay","count":2},{"id":"x","service":"mail","count":2}])
    def test_invalid_counts(self):
        for count in [-1, True, False, 1.5, "3", None]:
            with self.subTest(count=count), self.assertRaises(ValueError): summarize_events([{"id":"x","service":"relay","count":count}])
    def test_invalid_names(self):
        for field in ["id", "service"]:
            for value in [None, "", " ", 123]:
                event = {"id":"x","service":"relay","count":2}; event[field] = value
                with self.subTest(field=field,value=value), self.assertRaises(ValueError): summarize_events([event])
    def test_missing_fields_and_events(self):
        for event in [None, 3, [], {}, {"id":"x","service":"relay"}, {"id":"x","count":2}]:
            with self.subTest(event=event), self.assertRaises(ValueError): summarize_events([event])
    def test_invalid_containers(self):
        for value in [None, {}, "text", ()]:
            with self.subTest(value=value), self.assertRaises(ValueError): summarize_events(value)
            with self.subTest(value=value), self.assertRaises(ValueError): merge_streams(value)
        with self.assertRaises(ValueError): merge_streams([{}])
    def test_input_not_mutated(self):
        events = [{"id":" x ","service":" Relay ","count":2}]; original = deepcopy(events)
        summarize_events(events); self.assertEqual(events, original)
        streams = [events, []]; original = deepcopy(streams)
        merge_streams(streams); self.assertEqual(streams, original)
    def test_cross_stream_deduplication(self):
        self.assertEqual(merge_streams([[{"id":"x","service":"relay","count":2}], [{"id":"x","service":" RELAY ","count":2},{"id":"y","service":"relay","count":5}]]), {"relay":7})
    def test_merge_conflict(self):
        with self.assertRaises(ValueError): merge_streams([[{"id":"x","service":"relay","count":2}], [{"id":"x","service":"mail","count":2}]])
    def test_zero_empty_and_case_sensitive_ids(self):
        self.assertEqual(merge_streams([[],[]]), {})
        self.assertEqual(summarize_events([{"id":"x","service":"relay","count":0},{"id":"X","service":"relay","count":3}]), {"relay":3})

if __name__ == '__main__': unittest.main()
'''.replace('events = EVENTS', 'events = ' + repr(a['events'])).replace('EXPECTED', repr({a['service']: a['expected_total'], 'observer': a['events'][-1]['count']}))


def zip_response(files: dict[str, str], name: str) -> StreamingResponse:
    content = io.BytesIO()
    with zipfile.ZipFile(content, 'w', zipfile.ZIP_DEFLATED) as archive:
        for path, value in files.items():
            archive.writestr(path, value)
    content.seek(0)
    return StreamingResponse(content, media_type='application/zip', headers={'Content-Disposition': f'attachment; filename="{name}"', 'Cache-Control': 'no-store'})


def public_candidate(candidate: dict) -> dict:
    a = assignment(candidate['variant'])
    submitted = bool(candidate['submission'])
    completed = [bool(candidate['signal_solved']), bool(candidate['debug_solved']), submitted, submitted, submitted]
    return {
        'id': candidate['id'], 'display_name': candidate['display_name'], 'created_at': candidate['created_at'],
        'status': candidate['status'], 'submitted_at': candidate['submitted_at'],
        'stages': [{**stage, 'complete': completed[i], 'unlocked': i == 0 or completed[min(i - 1, 1)]} for i, stage in enumerate(STAGES)],
        'mission': {'transmission': a['transmission'], 'service': a['service'], 'events': a['events'], 'broken_source': STARTER, 'contract': REQUIREMENTS},
        'attempts': {'signal': candidate['signal_attempts'], 'debug': candidate['debug_attempts']},
        'submission': json.loads(candidate['submission']) if submitted else None,
    }


def attach_recruitment(app: FastAPI, storage_root: Path, is_vercel: bool, require_admin: Callable) -> RecruitmentStore:
    store = RecruitmentStore(storage_root, is_vercel)
    secure = is_vercel or os.getenv('ARCHIVE_SECURE_COOKIES', '').lower() in {'true', '1', 'yes', 'on'}
    static = Path(__file__).resolve().parent.parent / 'static' / 'recruitment'

    def candidate(request: Request) -> dict:
        return store.get(request.cookies.get(COOKIE, ''))

    def set_session(response: Response, token: str) -> None:
        response.set_cookie(COOKIE, token, httponly=True, secure=secure, samesite='strict', max_age=60 * 60 * 24 * 30)

    @app.middleware('http')
    async def private_recruitment_responses(request: Request, call_next):
        if request.url.path.startswith('/api/recruitment') and request.method not in {'GET', 'HEAD', 'OPTIONS'}:
            # JSON endpoints plus SameSite cookies; explicitly reject cross-origin form/API writes.
            origin = request.headers.get('origin')
            if origin and (urlsplit(origin).scheme not in {'https', 'http'} or urlsplit(origin).netloc.lower() != request.headers.get('host', '').lower()):
                return JSONResponse(status_code=403, content={'detail': 'Cross-origin recruitment request rejected.'}, headers={'Cache-Control': 'no-store'})
        response = await call_next(request)
        if request.url.path.startswith('/api/recruitment'):
            response.headers['Cache-Control'] = 'no-store'
        return response

    @app.get('/recruitment')
    def recruitment_page():
        return FileResponse(static / 'index.html')

    @app.get('/recruitment/review')
    def recruitment_review_page():
        return FileResponse(static / 'review.html')

    @app.get('/api/recruitment/status')
    def recruitment_status():
        healthy = False
        if store.configured:
            try:
                with store.connect() as sql:
                    sql.execute('SELECT 1')
                healthy = True
            except HTTPException:
                pass
        return {'available': healthy, 'accepting': healthy and store.accepting, 'stages': STAGES, 'weights': WEIGHTS, 'estimated_minutes': '45–60', 'storage': 'postgres' if store.url else ('unconfigured' if is_vercel else 'local')}

    @app.post('/api/recruitment/enroll', status_code=201)
    def enroll(payload: Enrollment, request: Request, response: Response):
        if not store.accepting:
            raise HTTPException(403, 'New auditions are currently closed. Existing candidates can resume.')
        if not payload.consent:
            raise HTTPException(400, 'Consent is required to start an audition.')
        existing = request.cookies.get(COOKIE)
        if existing:
            try:
                store.get(existing)
            except HTTPException as error:
                if error.status_code != 401:
                    raise
            else:
                raise HTTPException(409, 'You already have an audition. Resume it rather than creating another.')
        token, identity, timestamp = secrets.token_urlsafe(32), 'BT-' + secrets.token_hex(6).upper(), now()
        with store.connect() as sql:
            sql.execute('INSERT INTO blackterm_recruit_candidates (id, token_hash, display_name, email, github_handle, consent_at, created_at, variant) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                        (identity, token_hash(token), payload.display_name, payload.email, payload.github_handle, timestamp, timestamp, secrets.token_hex(16)))
        set_session(response, token)
        return {'candidate': public_candidate(store.get(token)), 'recovery_code': token}

    @app.post('/api/recruitment/resume')
    def resume(payload: ResumeInput, response: Response):
        token = payload.recovery_code.strip()
        record = store.get(token)
        set_session(response, token)
        return public_candidate(record)

    @app.get('/api/recruitment/me')
    def me(request: Request):
        return public_candidate(candidate(request))

    @app.post('/api/recruitment/logout')
    def logout(response: Response):
        response.delete_cookie(COOKIE, secure=secure, httponly=True, samesite='strict')
        return {'logged_out': True}

    @app.delete('/api/recruitment/me')
    def delete_own_candidate(request: Request, response: Response):
        record = candidate(request)
        with store.connect() as sql:
            sql.execute('DELETE FROM blackterm_recruit_candidates WHERE id = ?', (record['id'],))
        response.delete_cookie(COOKIE, secure=secure, httponly=True, samesite='strict')
        return {'deleted': True}

    @app.post('/api/recruitment/missions/{stage}/answer')
    def answer(stage: str, payload: MissionAnswer, request: Request):
        if stage not in {'signal', 'debug'}:
            raise HTTPException(404, 'Mission not found.')
        record = candidate(request)
        if record['submission']:
            raise HTTPException(409, 'This audition has been submitted.')
        if stage == 'debug' and not record['signal_solved']:
            raise HTTPException(403, 'Recover the signal first.')
        if stage == 'debug' and len(payload.reasoning.strip()) < 20:
            raise HTTPException(400, 'Explain the defect in at least 20 characters.')
        a = assignment(record['variant'])
        correct = payload.answer.strip().upper() == a['relay'] if stage == 'signal' else payload.answer.strip() == str(a['expected_total'])
        with store.connect() as sql:
            # Column choice is constrained by the allowlist above, never arbitrary request text.
            sql.execute(f'UPDATE blackterm_recruit_candidates SET {stage}_attempts = {stage}_attempts + 1, {stage}_solved = CASE WHEN ? = 1 THEN 1 ELSE {stage}_solved END WHERE id = ?', (int(correct), record['id']))
            if stage == 'debug':
                sql.execute('UPDATE blackterm_recruit_candidates SET debug_reason = ? WHERE id = ?', (payload.reasoning.strip(), record['id']))
        return {'correct': correct, 'message': 'Mission recovered. Next stage unlocked.' if correct else 'That fragment does not match. Re-check the evidence; attempts do not reduce your review score.', 'candidate': public_candidate(candidate(request))}

    @app.get('/api/recruitment/starter.zip')
    def starter(request: Request):
        record = candidate(request)
        if not record['debug_solved']:
            raise HTTPException(403, 'Complete signal recovery and debugging before downloading your project.')
        a = assignment(record['variant'])
        return zip_response({'README.md': f'# Archive developer audition / {record["id"]}\n\n' + REQUIREMENTS, 'archive_events.py': STARTER, 'tests/test_public.py': PUBLIC_TESTS, 'sample_events.json': json.dumps(a['events'], indent=2), '.gitignore': '__pycache__/\n*.pyc\n.venv/\n'}, f'archive-audition-{record["id"]}.zip')

    @app.post('/api/recruitment/submit')
    def submit(payload: CodeSubmission, request: Request):
        record = candidate(request)
        if not record['signal_solved'] or not record['debug_solved']:
            raise HTTPException(403, 'Complete the first two missions before submitting code.')
        with store.connect() as sql:
            result = sql.execute("UPDATE blackterm_recruit_candidates SET submission = ?, submitted_at = ?, status = 'submitted' WHERE id = ? AND submission IS NULL", (json.dumps(payload.model_dump()), now(), record['id']))
            if result.rowcount != 1:
                raise HTTPException(409, 'This audition is already submitted. A reviewer will assess the recorded commit.')
        return public_candidate(candidate(request))

    def admin_record(identity: str) -> dict:
        with store.connect() as sql:
            record = sql.execute('SELECT * FROM blackterm_recruit_candidates WHERE id = ?', (identity,)).fetchone()
        if not record:
            raise HTTPException(404, 'Candidate not found.')
        return dict(record)

    @app.post('/api/recruitment/admin/logout')
    def admin_logout(response: Response):
        response.delete_cookie('archive_admin', secure=secure, httponly=True, samesite='strict')
        return {'logged_out': True}

    @app.get('/api/recruitment/admin/candidates')
    def candidates(request: Request):
        require_admin(request)
        with store.connect() as sql:
            rows = sql.execute('SELECT id, display_name, github_handle, created_at, submitted_at, status, signal_solved, debug_solved, review FROM blackterm_recruit_candidates ORDER BY created_at DESC LIMIT 500').fetchall()
        results = []
        for row in rows:
            item = dict(row)
            item['review'] = json.loads(item['review']) if item['review'] else None
            results.append(item)
        return {'candidates': results, 'limit': 500, 'weights': WEIGHTS, 'storage': 'postgres' if store.url else 'local'}

    @app.get('/api/recruitment/admin/candidates/{identity}')
    def candidate_detail(identity: str, request: Request):
        require_admin(request)
        record = admin_record(identity)
        return {**public_candidate(record), 'email': record['email'], 'github_handle': record['github_handle'], 'consent_at': record['consent_at'], 'debug_reason': record['debug_reason'], 'review': json.loads(record['review']) if record['review'] else None, 'reviewed_at': record['reviewed_at']}

    @app.get('/api/recruitment/admin/candidates/{identity}/reviewer-tests.zip')
    def private_tests(identity: str, request: Request):
        require_admin(request)
        record = admin_record(identity)
        if not record['submission']:
            raise HTTPException(409, 'Wait for a code submission before downloading review tests.')
        submission = json.loads(record['submission'])
        instructions = f'''# Review kit / {identity}\n\nSubmitted URL: {submission['github_url']}\nRecorded commit: {submission['commit_sha']}\n\nUse a disposable environment to review candidate code. This server never executes submissions.\n\nCheck out the exact recorded commit, copy `test_reviewer.py` into its tests directory, then run:\n\n`python -m unittest discover -s tests -v`\n\nThe private suite contains 12 test methods; some include multiple subcases. Record how many of these 12 methods passed, rather than including public tests in the denominator. Inspect the implementation, added tests, explanation, and AI disclosure. Enter observations and the tested SHA into the reviewer dashboard. Scores assist a human decision; they do not select or reject candidates automatically.\n\nRubric: correctness 40%, code quality 25%, testing 20%, communication 15%. Each criterion is 0–5. Suggested anchors: 0 = no evidence; 1 = substantial gaps; 2 = partial; 3 = meets brief; 4 = strong; 5 = exceptional evidence.\n'''
        return zip_response({'REVIEW.md': instructions, 'test_reviewer.py': reviewer_tests(record)}, f'archive-review-{identity}.zip')

    @app.post('/api/recruitment/admin/candidates/{identity}/review')
    def review(identity: str, payload: CandidateReview, request: Request):
        require_admin(request)
        record = admin_record(identity)
        if not record['submission']:
            raise HTTPException(409, 'A code submission is required before review.')
        submission = json.loads(record['submission'])
        if payload.tested_commit_sha != submission['commit_sha']:
            raise HTTPException(400, 'The tested commit must match the candidate’s recorded submission.')
        values = payload.model_dump()
        values['weighted_score'] = round(sum(values[key] / 5 * weight for key, weight in WEIGHTS.items()), 1)
        values['review_source'] = 'human'
        with store.connect() as sql:
            sql.execute('UPDATE blackterm_recruit_candidates SET review = ?, reviewed_at = ?, status = ? WHERE id = ?', (json.dumps(values), now(), payload.decision, identity))
        return {'saved': True, 'review': values}

    return store
