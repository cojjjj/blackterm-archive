# BLACKTERM // Recruitment Mode

## Deploy the update

Extract the updated-files ZIP. At https://github.com/cojjjj/blackterm-archive/upload/main , drag all of its extracted files and folders into the upload area at the repository root, and commit to `main`. The patch includes earlier desktop updates so it can install over either the Control Room or Desktop v3 release. Do not upload the ZIP itself or its outer directory.

The existing Vercel FastAPI entrypoint is preserved. The update adds `psycopg[binary]` to both dependency manifests. Let Vercel reinstall dependencies and deploy.

## Enable durable recruitment on Vercel

1. In your Vercel project's Storage area, connect a hosted PostgreSQL database, for example the Neon integration from the Vercel Marketplace: https://vercel.com/marketplace/neon/neon .
2. In **Settings → Environment Variables**, set `RECRUIT_DATABASE_URL` to the PostgreSQL connection string provided by the database. The app also accepts `DATABASE_URL` if the integration already sets it. Use the provider's production connection string with its TLS settings. Never commit a real connection string to GitHub.
3. Set `ARCHIVE_ADMIN_KEY` to a long random secret for reviewer access. Keep it private.
4. Set `RECRUIT_OPEN=true` to accept new candidates. Use `false` to close new enrollment while allowing existing candidates and reviewers to continue.
5. Apply the variables to your Production environment, then redeploy. Use a separate database for Preview deployments if you enable them there.
6. Visit `/recruitment`. When the database is reachable, the enrollment form appears. On the first database connection, the app creates the `blackterm_recruit_candidates` table automatically; its database user needs permission to create that table.

Production auditions remain closed until the hosted database is configured and reachable. The Archive's ordinary game continues working without it.

## Candidate experience

Share `https://YOUR-VERCEL-DOMAIN/recruitment`. A **Dev Audition** shortcut and launcher entry also open this page as a movable desktop app. Recruitment is optional and separate from ordinary Archive progress.

Candidates supply a display name, contact email, GitHub username, and consent to store audition data. The application generates a candidate-specific transmission and event fixture. Contact data, solved missions, the submitted revision, and human reviews live in the recruitment database.

The five stages:

1. **Signal recovery:** decode a Base64 JSON transmission and identify the recovered relay.
2. **Broken workstation:** reason about duplicate event IDs and service-name normalization, calculate the correct total, and explain the bug.
3. **Repair mission:** download the candidate-specific Python starter and repair its aggregation function against a written contract.
4. **Feature contract:** implement cross-stream merging with shared deduplication and validation, preserving inputs.
5. **Final debrief:** submit a GitHub repository or pull request URL, exact full commit SHA, repair/feature notes, observed tests, tradeoffs, and AI-use disclosure.

The starter includes five public tests, a sample fixture, and complete requirements. The first two stages are checked by the server. Code work is evaluated by the reviewer. Stages 3–5 are completed together when the final code submission is received.

Candidates receive a private recovery code once. Keep it safe: it restores the same application on another browser or device. Only its hash is stored in the database. Browser session cookies are HttpOnly and secure on Vercel. A candidate can resume, check application status, sign out, or delete their own application.

Unsubmitted writing drafts save only in the current browser. Signing out clears those drafts; it does not delete the saved application or completed missions. Submission locks the recorded revision for review. The suggested session is 45–60 minutes, with no hard timer or speed-based ranking. Puzzle attempts do not deduct rubric points.

## Reviewer workflow

Visit `/recruitment/review` or choose **Candidate Review** in the desktop start menu. Sign in using `ARCHIVE_ADMIN_KEY`.

The dashboard lists the latest 500 candidates with search, status filtering, submitted code, private debugging explanations, and rubric reviews. It does not fetch, verify, or execute GitHub code automatically. Confirm that the linked repository contains the recorded SHA and that you can access it.

For a submitted candidate:

1. Open their submitted repository or PR and inspect the exact recorded commit.
2. Download the candidate's **private reviewer tests** ZIP from the dashboard.
3. Use a disposable environment for candidate code. Copy `test_reviewer.py` into the project's tests directory and run `python -m unittest discover -s tests -v`.
4. Record how many of the 12 reviewer test methods passed. Some methods have several subcases; public tests are not included in this 12-method denominator.
5. Inspect the implementation, candidate-added tests, explanations, and AI disclosure. Have the candidate explain and modify their code before making your decision.
6. Enter the tested SHA, observed test count, 0–5 rubric ratings, private notes, and your decision. The tested SHA must match the recorded submission.

The weighted rubric is correctness 40%, code quality 25%, debugging/testing 20%, and communication 15%. Rating anchors: 0 no evidence, 1 substantial gaps, 2 partial, 3 meets brief, 4 strong, 5 exceptional evidence. The weighted total is calculated for your review. You choose reviewed, shortlisted, or declined; no automatic hiring decision or threshold is applied.

Candidates see application status but never your numeric rubric scores or private review notes. The review-test download is admin-protected. Assessment source code ships in the project and is readable if your GitHub repository is public; this is a code-quality audition, with live explanation recommended, rather than a secret exam.

## Storage and scope

Hosted PostgreSQL stores recruitment records independently of Vercel `/tmp` and the Archive player cookie. Recovery does not depend on an instance-local SQLite player ID. No outgoing messages or invitations are sent by this feature.

Local development uses `data/recruitment.db` unless `RECRUIT_SQLITE_PATH` is set. This file and SQLite journal files are ignored by Git. A local database is intended for development; Vercel does not accept candidate records without a hosted connection string.

This update does not migrate ordinary Archive puzzle progress, generated investigations, or Archive Studio content to PostgreSQL. Their pre-existing temporary-storage behavior is unchanged.

## Validation performed

- API integration: enrollment/consent, separate candidate sessions, objective prerequisites, starter ZIPs, GitHub URL/SHA validation, submission locking, admin access, score calculation, private data, recovery, deletion, and cross-origin write rejection.
- Headless Chromium: full candidate enrollment-to-submission and separate reviewer sign-in-to-review, status refresh, mobile rendering, and the desktop app iframe. No page errors.
- PostgreSQL path: psycopg against a PostgreSQL-wire PGlite test server; schema creation, writes, secure Vercel cookies, fresh-instance recovery with a different temporary path, resume, and deletion. A real hosted production database has not been connected from this build environment.
- Evaluation kit: a reference solution passes all 17 public/reviewer test methods; the intentionally broken starter fails.
- Existing Archive APIs and JavaScript/Python compilation checks pass.

To rerun the local API integration check, install the project's requirements plus `httpx`, then from the project root run `python -m tools.test_recruitment`. This uses a separate temporary test database and does not contact your hosted database.
