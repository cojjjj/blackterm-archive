from __future__ import annotations

import hashlib
import json
import os
import secrets
import shutil
import sqlite3
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from app.generator import GeneratorPaths, generate_investigation, list_generated
from app.living_world import entity_summary, load_state, mark_case_solved

BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "static"
SEED_DATA_DIR = BASE_DIR / "data"
SEED_ARTIFACTS_DIR = BASE_DIR / "artifacts"

# Local development uses the project directories. Production can point this
# at a persistent volume such as /app/storage.
STORAGE_ROOT = Path(os.getenv("ARCHIVE_STORAGE_DIR", str(BASE_DIR))).resolve()
DATA_DIR = (
    STORAGE_ROOT / "data"
    if STORAGE_ROOT != BASE_DIR
    else SEED_DATA_DIR
)
ARTIFACTS_DIR = (
    STORAGE_ROOT / "artifacts"
    if STORAGE_ROOT != BASE_DIR
    else SEED_ARTIFACTS_DIR
)

DB_PATH = DATA_DIR / "archive.db"
CHALLENGES_PATH = DATA_DIR / "challenges.json"
ARTIFACTS_PATH = DATA_DIR / "artifacts.json"
CASES_PATH = DATA_DIR / "cases.json"
DESKTOP_STORY_PATH = DATA_DIR / "desktop_story.json"
GENERATED_INVESTIGATIONS_PATH = DATA_DIR / "generated_investigations.json"

ADMIN_KEY = os.getenv("ARCHIVE_ADMIN_KEY", "blackterm-local-admin")
SECURE_COOKIES = os.getenv("ARCHIVE_SECURE_COOKIES", "false").lower() in {
    "1",
    "true",
    "yes",
    "on",
}


app = FastAPI(title="The Archive", version="0.1.0")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.middleware("http")
async def archive_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Archive-Observation"] = "the-header-is-a-decoy"
    response.headers["X-Archive-Network"] = "BLACKTERM"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "same-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    return response


class AnswerSubmission(BaseModel):
    answer: str


class TerminalCommand(BaseModel):
    command: str


class CaseAnswerSubmission(BaseModel):
    objective_id: str
    answer: str


class InvestigationGenerationInput(BaseModel):
    seed: str | None = None
    difficulty: int = 3


class AdminLogin(BaseModel):
    key: str


class AdminObjectiveInput(BaseModel):
    id: str
    prompt: str
    answer: str


class AdminEvidenceInput(BaseModel):
    artifact_id: str
    label: str
    description: str = ""


class AdminCaseInput(BaseModel):
    id: str
    sequence: int
    slug: str
    title: str
    difficulty: int
    category: str
    status: str = "active"
    requires_solved_nodes: int = 0
    briefing: str
    objectives: list[AdminObjectiveInput]
    evidence: list[AdminEvidenceInput] = []
    reward_message: str


def bootstrap_persistent_storage() -> None:
    """Initialize a persistent volume with the repository's seed content."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)

    if DATA_DIR.resolve() != SEED_DATA_DIR.resolve():
        for source in SEED_DATA_DIR.iterdir():
            destination = DATA_DIR / source.name
            if destination.exists():
                continue
            if source.is_dir():
                shutil.copytree(source, destination)
            else:
                shutil.copy2(source, destination)

    if ARTIFACTS_DIR.resolve() != SEED_ARTIFACTS_DIR.resolve():
        for source in SEED_ARTIFACTS_DIR.iterdir():
            destination = ARTIFACTS_DIR / source.name
            if destination.exists():
                continue
            if source.is_dir():
                shutil.copytree(source, destination)
            else:
                shutil.copy2(source, destination)


def db() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def init_db() -> None:
    DATA_DIR.mkdir(exist_ok=True)

    with db() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS players (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                token TEXT UNIQUE NOT NULL,
                codename TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS solves (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                player_id INTEGER NOT NULL,
                challenge_id TEXT NOT NULL,
                attempts INTEGER NOT NULL DEFAULT 0,
                solved_at DATETIME,
                UNIQUE(player_id, challenge_id),
                FOREIGN KEY(player_id) REFERENCES players(id)
            )
            """
        )

        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS terminal_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                player_id INTEGER NOT NULL,
                command TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(player_id) REFERENCES players(id)
            )
            """
        )

        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS case_objectives (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                player_id INTEGER NOT NULL,
                case_id TEXT NOT NULL,
                objective_id TEXT NOT NULL,
                attempts INTEGER NOT NULL DEFAULT 0,
                solved_at DATETIME,
                UNIQUE(player_id, case_id, objective_id),
                FOREIGN KEY(player_id) REFERENCES players(id)
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS case_progress (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                player_id INTEGER NOT NULL,
                case_id TEXT NOT NULL,
                opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                completed_at DATETIME,
                UNIQUE(player_id, case_id),
                FOREIGN KEY(player_id) REFERENCES players(id)
            )
            """
        )

        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS observer_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                player_id INTEGER NOT NULL,
                event_type TEXT NOT NULL,
                title TEXT NOT NULL,
                detail TEXT NOT NULL,
                is_read INTEGER NOT NULL DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(player_id) REFERENCES players(id)
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS observer_mail (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                player_id INTEGER NOT NULL,
                sender TEXT NOT NULL,
                subject TEXT NOT NULL,
                body TEXT NOT NULL,
                is_read INTEGER NOT NULL DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(player_id) REFERENCES players(id)
            )
            """
        )


def require_admin(request: Request) -> None:
    supplied = request.headers.get("X-Archive-Admin-Key", "")
    if not secrets.compare_digest(supplied, ADMIN_KEY):
        raise HTTPException(status_code=401, detail="Admin authorization rejected.")


def save_cases(cases: list[dict[str, Any]]) -> None:
    CASES_PATH.write_text(
        json.dumps(cases, indent=2),
        encoding="utf-8",
    )


def build_case_record(payload: AdminCaseInput) -> dict[str, Any]:
    case_id = payload.id.strip().lower()
    slug = payload.slug.strip().lower().replace(" ", "-")

    objectives = []
    for index, objective in enumerate(payload.objectives, start=1):
        objective_id = objective.id.strip().lower().replace(" ", "-")
        salt = f"{case_id}-{objective_id}-{secrets.token_hex(6)}"
        objectives.append(
            {
                "id": objective_id,
                "prompt": objective.prompt.strip(),
                "salt": salt,
                "answer_hash": hash_answer(objective.answer, salt),
            }
        )

    return {
        "id": case_id,
        "sequence": payload.sequence,
        "slug": slug,
        "title": payload.title.strip(),
        "difficulty": payload.difficulty,
        "category": payload.category.strip(),
        "status": payload.status.strip().lower(),
        "requires_solved_nodes": payload.requires_solved_nodes,
        "briefing": payload.briefing.strip(),
        "objectives": objectives,
        "evidence": [
            {
                "artifact_id": evidence.artifact_id.strip(),
                "label": evidence.label.strip(),
                "description": evidence.description.strip(),
            }
            for evidence in payload.evidence
        ],
        "reward": {
            "message": payload.reward_message.strip(),
            "unlocks": [f"{case_id}-report.txt"],
        },
    }


def ensure_living_archive_seed(
    connection: sqlite3.Connection,
    player: sqlite3.Row,
) -> None:
    event_count = connection.execute(
        "SELECT COUNT(*) AS count FROM observer_events WHERE player_id = ?",
        (player["id"],),
    ).fetchone()["count"]

    if event_count == 0:
        connection.executemany(
            """
            INSERT INTO observer_events (
                player_id,
                event_type,
                title,
                detail
            )
            VALUES (?, ?, ?, ?)
            """,
            [
                (
                    player["id"],
                    "system",
                    "IDENTITY SYNCHRONIZED",
                    f"Observer {player['codename']} was accepted by the Archive.",
                ),
                (
                    player["id"],
                    "transmission",
                    "SIGNAL RECOVERED",
                    "A damaged transmission was reconstructed from Relay 13.",
                ),
            ],
        )

    mail_count = connection.execute(
        "SELECT COUNT(*) AS count FROM observer_mail WHERE player_id = ?",
        (player["id"],),
    ).fetchone()["count"]

    if mail_count == 0:
        connection.executemany(
            """
            INSERT INTO observer_mail (
                player_id,
                sender,
                subject,
                body
            )
            VALUES (?, ?, ?, ?)
            """,
            [
                (
                    player["id"],
                    "ARCHIVE",
                    "Observer registration",
                    (
                        f"Observer {player['codename']},\n\n"
                        "Your identity has been recorded.\n"
                        "The Archive values persistence over certainty.\n"
                    ),
                ),
                (
                    player["id"],
                    "ECHO",
                    "Do not trust the first timestamp",
                    (
                        "Observer,\n\n"
                        "Relay 13 did not fail when the logs claim it did.\n"
                        "Someone preserved an older date inside the record.\n\n"
                        "- Echo\n"
                    ),
                ),
                (
                    player["id"],
                    "UNKNOWN",
                    "You are not alone",
                    (
                        "Another observer accessed this network before you.\n"
                        "Their identifier was removed.\n"
                        "Their commands were not.\n"
                    ),
                ),
            ],
        )


def record_observer_event(
    connection: sqlite3.Connection,
    player_id: int,
    event_type: str,
    title: str,
    detail: str,
) -> None:
    connection.execute(
        """
        INSERT INTO observer_events (
            player_id,
            event_type,
            title,
            detail
        )
        VALUES (?, ?, ?, ?)
        """,
        (player_id, event_type, title, detail),
    )


def accessible_artifact_ids(
    connection: sqlite3.Connection,
    player_id: int,
) -> set[str]:
    solved_nodes = connection.execute(
        """
        SELECT COUNT(*) AS count
        FROM solves
        WHERE player_id = ? AND solved_at IS NOT NULL
        """,
        (player_id,),
    ).fetchone()["count"]

    accessible = {
        artifact["id"]
        for artifact in load_artifacts()
        if solved_nodes >= artifact["requires_solved"]
    }

    for case in load_cases():
        if solved_nodes < case["requires_solved_nodes"]:
            continue

        for evidence in case.get("evidence", []):
            accessible.add(evidence["artifact_id"])

    return accessible


def get_case_state(
    connection: sqlite3.Connection,
    player_id: int,
    case: dict[str, Any],
) -> dict[str, Any]:
    rows = connection.execute(
        """
        SELECT objective_id, attempts, solved_at
        FROM case_objectives
        WHERE player_id = ? AND case_id = ?
        """,
        (player_id, case["id"]),
    ).fetchall()

    states = {
        row["objective_id"]: {
            "attempts": row["attempts"],
            "solved": row["solved_at"] is not None,
        }
        for row in rows
    }

    objectives = []
    for objective in case["objectives"]:
        state = states.get(objective["id"], {"attempts": 0, "solved": False})
        objectives.append(
            {
                "id": objective["id"],
                "prompt": objective["prompt"],
                "attempts": state["attempts"],
                "solved": state["solved"],
            }
        )

    solved_count = sum(1 for objective in objectives if objective["solved"])
    completed = solved_count == len(objectives)

    return {
        "objectives": objectives,
        "solved_objectives": solved_count,
        "total_objectives": len(objectives),
        "completed": completed,
        "progress": round((solved_count / len(objectives)) * 100)
        if objectives
        else 100,
    }


def public_case(
    case: dict[str, Any],
    state: dict[str, Any],
    unlocked: bool,
) -> dict[str, Any]:
    return {
        "id": case["id"],
        "sequence": case["sequence"],
        "slug": case["slug"],
        "title": case["title"],
        "difficulty": case["difficulty"],
        "category": case["category"],
        "status": case["status"],
        "briefing": case["briefing"] if unlocked else "CASE SEALED",
        "evidence": case["evidence"] if unlocked else [],
        "objectives": state["objectives"] if unlocked else [],
        "solved_objectives": state["solved_objectives"],
        "total_objectives": state["total_objectives"],
        "progress": state["progress"],
        "completed": state["completed"],
        "unlocked": unlocked,
        "reward": case["reward"] if state["completed"] else None,
        "procedural": case.get("procedural", False),
        "seed": case.get("seed"),
        "narrative": case.get("narrative") if unlocked else None,
    }


def build_virtual_filesystem(player: sqlite3.Row, solved_ids: set[str]) -> dict[str, Any]:
    solved_count = len(solved_ids)

    node_files: dict[str, Any] = {}
    for challenge in load_challenges():
        node_id = challenge["id"]
        unlocked = set(challenge.get("requires", [])).issubset(solved_ids)
        if not unlocked:
            continue

        node_files[f"node-{challenge['sequence']:03}.txt"] = {
            "type": "file",
            "content": (
                f"NODE {challenge['sequence']:03}\n"
                f"TITLE: {challenge['title']}\n"
                f"CATEGORY: {challenge['category']}\n"
                f"STATUS: {'RESOLVED' if node_id in solved_ids else 'ACTIVE'}\n\n"
                f"{challenge['briefing']}\n"
            ),
            "permissions": "r--",
        }

    classified_access = solved_count >= 3

    with db() as connection:
        case_directories: dict[str, Any] = {}

        for case in load_cases():
            unlocked = solved_count >= case["requires_solved_nodes"]
            state = get_case_state(connection, player["id"], case)

            if not unlocked:
                case_directories[f"CASE-{case['sequence']:03}-{case['slug']}"] = {
                    "type": "directory",
                    "permissions": "---",
                    "locked": True,
                    "children": {},
                }
                continue

            evidence_children: dict[str, Any] = {}
            artifacts_by_id = {
                artifact["id"]: artifact
                for artifact in load_artifacts()
            }

            for evidence in case["evidence"]:
                artifact = artifacts_by_id.get(evidence["artifact_id"])
                if not artifact:
                    continue

                evidence_children[evidence["label"]] = {
                    "type": "artifact",
                    "permissions": "r--",
                    "artifact_id": artifact["id"],
                    "mime_type": artifact["mime_type"],
                    "size": artifact["size"],
                    "sha256": artifact["sha256"],
                    "content": (
                        f"EVIDENCE: {evidence['label']}\n"
                        f"DESCRIPTION: {evidence['description']}\n"
                        f"SHA256: {artifact['sha256']}\n"
                        f"DOWNLOAD: /api/artifacts/{artifact['id']}/download\n"
                    ),
                }

            objective_lines = []
            for index, objective in enumerate(state["objectives"], start=1):
                marker = "[SOLVED]" if objective["solved"] else "[OPEN]"
                objective_lines.append(
                    f"{index}. {marker} {objective['id']}\n"
                    f"   {objective['prompt']}"
                )

            case_children: dict[str, Any] = {
                "briefing.txt": {
                    "type": "file",
                    "permissions": "r--",
                    "content": (
                        f"CASE-{case['sequence']:03}: {case['title']}\n"
                        f"CATEGORY: {case['category']}\n"
                        f"DIFFICULTY: {case['difficulty']}\n\n"
                        f"{case['briefing']}\n"
                    ),
                },
                "objectives.txt": {
                    "type": "file",
                    "permissions": "r--",
                    "content": "\n\n".join(objective_lines) + "\n",
                },
                "evidence": {
                    "type": "directory",
                    "permissions": "r-x",
                    "children": evidence_children,
                },
            }

            if state["completed"]:
                case_children["resolution.txt"] = {
                    "type": "file",
                    "permissions": "r--",
                    "content": case["reward"]["message"] + "\n",
                }

            case_directories[f"CASE-{case['sequence']:03}-{case['slug']}"] = {
                "type": "directory",
                "permissions": "r-x",
                "children": case_children,
            }

    return {
        "type": "directory",
        "permissions": "r-x",
        "children": {
            "archive": {
                "type": "directory",
                "permissions": "r-x",
                "children": {
                    "nodes": {
                        "type": "directory",
                        "permissions": "r-x",
                        "children": node_files,
                    },
                    "transmissions": {
                        "type": "directory",
                        "permissions": "r-x",
                        "children": {
                            "001-arrival.txt": {
                                "type": "file",
                                "permissions": "r--",
                                "content": (
                                    "TRANSMISSION 001\n\n"
                                    "The observer arrived before the signal.\n"
                                    "No invitation was recorded.\n"
                                    "Access was granted anyway.\n"
                                ),
                            },
                            "007-surface.txt": {
                                "type": "file",
                                "permissions": "r--",
                                "content": (
                                    "TRANSMISSION 007\n\n"
                                    "Visible systems provide visible answers.\n"
                                    "The Archive was not built for visible systems.\n"
                                ),
                            },
                            ".fragment": {
                                "type": "file",
                                "permissions": "r--",
                                "hidden": True,
                                "content": "13 15 19 20 20 18 21 19 20 20 8 5 16 1 20 8\n",
                            },
                        },
                    },
                    "cases": {
                        "type": "directory",
                        "permissions": "r-x",
                        "children": case_directories,
                    },
                    "artifacts": {
                        "type": "directory",
                        "permissions": "r-x",
                        "children": {
                            artifact["filename"]: {
                                "type": "artifact",
                                "permissions": "r--",
                                "artifact_id": artifact["id"],
                                "mime_type": artifact["mime_type"],
                                "size": artifact["size"],
                                "sha256": artifact["sha256"],
                                "content": (
                                    f"ARTIFACT: {artifact['title']}\n"
                                    f"TYPE: {artifact['category']}\n"
                                    f"SIZE: {artifact['size']} bytes\n"
                                    f"SHA256: {artifact['sha256']}\n"
                                    f"DESCRIPTION: {artifact['description']}\n"
                                    f"DOWNLOAD: /api/artifacts/{artifact['id']}/download\n"
                                ),
                            }
                            for artifact in load_artifacts()
                            if solved_count >= artifact["requires_solved"]
                        },
                    },
                    "classified": {
                        "type": "directory",
                        "permissions": "r-x" if classified_access else "---",
                        "locked": not classified_access,
                        "children": {
                            "project-blackterm.txt": {
                                "type": "file",
                                "permissions": "r--",
                                "content": (
                                    "PROJECT BLACKTERM\n"
                                    "CLEARANCE: OBSERVER-3\n\n"
                                    "The Archive does not measure intelligence.\n"
                                    "It measures whether a person continues after certainty disappears.\n"
                                ),
                            },
                            "observer-zero.log": {
                                "type": "file",
                                "permissions": "r--",
                                "content": (
                                    "[ENTRY CORRUPTED]\n"
                                    "Observer Zero did not complete the Archive.\n"
                                    "Observer Zero created it.\n"
                                ),
                            },
                        },
                    },
                },
            },
            "logs": {
                "type": "directory",
                "permissions": "r-x",
                "children": {
                    "system.log": {
                        "type": "file",
                        "permissions": "r--",
                        "content": (
                            "[OK] archive network online\n"
                            "[OK] observer identity synchronized\n"
                            "[WARN] one historical entry missing\n"
                        ),
                    },
                    "access.log": {
                        "type": "file",
                        "permissions": "r--",
                        "content": f"observer={player['codename']} access=granted\n",
                    },
                },
            },
            "users": {
                "type": "directory",
                "permissions": "r-x",
                "children": {
                    player["codename"]: {
                        "type": "directory",
                        "permissions": "r-x",
                        "children": {
                            "identity.txt": {
                                "type": "file",
                                "permissions": "r--",
                                "content": (
                                    f"OBSERVER: {player['codename']}\n"
                                    f"NODES RESOLVED: {solved_count}\n"
                                    f"TRUST LEVEL: {min(9, 1 + solved_count)}\n"
                                ),
                            },
                            "notes.txt": {
                                "type": "file",
                                "permissions": "rw-",
                                "content": "The first pattern is rarely the important one.\n",
                            },
                            "discoveries.log": {
                                "type": "file",
                                "permissions": "r--",
                                "content": "\n".join(sorted(solved_ids)) + ("\n" if solved_ids else ""),
                            },
                        },
                    }
                },
            },
            "README": {
                "type": "file",
                "permissions": "r--",
                "content": (
                    "BLACKTERM VIRTUAL FILESYSTEM\n\n"
                    "The terminal is an interface.\n"
                    "The filesystem is the environment.\n\n"
                    "Begin with: ls\n"
                ),
            },
        },
    }


def load_desktop_story() -> list[dict[str, Any]]:
    return json.loads(DESKTOP_STORY_PATH.read_text(encoding="utf-8"))


def load_cases() -> list[dict[str, Any]]:
    return json.loads(CASES_PATH.read_text(encoding="utf-8"))


def load_artifacts() -> list[dict[str, Any]]:
    return json.loads(ARTIFACTS_PATH.read_text(encoding="utf-8"))


def load_challenges() -> list[dict[str, Any]]:
    return json.loads(CHALLENGES_PATH.read_text(encoding="utf-8"))


def public_challenge(challenge: dict[str, Any], solved: bool) -> dict[str, Any]:
    return {
        "id": challenge["id"],
        "sequence": challenge["sequence"],
        "title": challenge["title"],
        "briefing": challenge["briefing"],
        "difficulty": challenge["difficulty"],
        "category": challenge["category"],
        "artifact": challenge.get("artifact"),
        "solved": solved,
    }


def normalize_answer(value: str) -> str:
    return " ".join(value.strip().lower().split())


def hash_answer(value: str, salt: str) -> str:
    payload = f"{salt}:{normalize_answer(value)}".encode()
    return hashlib.sha256(payload).hexdigest()


def get_player(request: Request) -> sqlite3.Row:
    token = request.cookies.get("archive_token")
    if not token:
        raise HTTPException(status_code=401, detail="No active identity.")

    with db() as connection:
        player = connection.execute(
            "SELECT * FROM players WHERE token = ?", (token,)
        ).fetchone()

    if not player:
        raise HTTPException(status_code=401, detail="Identity rejected.")

    return player


@app.on_event("startup")
def startup() -> None:
    bootstrap_persistent_storage()
    init_db()


@app.get("/")
def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.post("/api/session")
def create_session(response: Response) -> dict[str, str]:
    token = secrets.token_urlsafe(32)
    codename = f"OBS-{secrets.randbelow(90000) + 10000}"

    with db() as connection:
        connection.execute(
            "INSERT INTO players (token, codename) VALUES (?, ?)",
            (token, codename),
        )

    response.set_cookie(
        key="archive_token",
        value=token,
        httponly=True,
        samesite="lax",
        secure=SECURE_COOKIES,
        max_age=60 * 60 * 24 * 30,
    )
    return {"codename": codename}


@app.get("/api/me")
def read_me(request: Request) -> dict[str, Any]:
    player = get_player(request)

    with db() as connection:
        solved = connection.execute(
            "SELECT COUNT(*) AS count FROM solves WHERE player_id = ? AND solved_at IS NOT NULL",
            (player["id"],),
        ).fetchone()["count"]

    total = len(load_challenges())
    return {
        "codename": player["codename"],
        "solved": solved,
        "total": total,
        "progress": round((solved / total) * 100) if total else 0,
        "rank": "Observer" if solved == 0 else "Initiate",
        "joined_at": player["created_at"],
    }


@app.get("/api/challenges")
def list_challenges(request: Request) -> list[dict[str, Any]]:
    player = get_player(request)
    challenges = load_challenges()

    with db() as connection:
        ensure_living_archive_seed(connection, player)
        solved_rows = connection.execute(
            "SELECT challenge_id FROM solves WHERE player_id = ? AND solved_at IS NOT NULL",
            (player["id"],),
        ).fetchall()

    solved_ids = {row["challenge_id"] for row in solved_rows}
    unlocked: list[dict[str, Any]] = []

    for challenge in challenges:
        prerequisites = set(challenge.get("requires", []))
        if prerequisites.issubset(solved_ids):
            unlocked.append(public_challenge(challenge, challenge["id"] in solved_ids))

    return unlocked


@app.post("/api/challenges/{challenge_id}/submit")
def submit_answer(
    challenge_id: str,
    submission: AnswerSubmission,
    request: Request,
) -> dict[str, Any]:
    player = get_player(request)
    challenges = load_challenges()
    challenge = next((c for c in challenges if c["id"] == challenge_id), None)

    if not challenge:
        raise HTTPException(status_code=404, detail="Challenge not found.")

    with db() as connection:
        solved_ids = {
            row["challenge_id"]
            for row in connection.execute(
                "SELECT challenge_id FROM solves WHERE player_id = ? AND solved_at IS NOT NULL",
                (player["id"],),
            ).fetchall()
        }

        if not set(challenge.get("requires", [])).issubset(solved_ids):
            raise HTTPException(status_code=403, detail="Path remains sealed.")

        connection.execute(
            """
            INSERT INTO solves (player_id, challenge_id, attempts)
            VALUES (?, ?, 1)
            ON CONFLICT(player_id, challenge_id)
            DO UPDATE SET attempts = attempts + 1
            """,
            (player["id"], challenge_id),
        )

        candidate_hash = hash_answer(submission.answer, challenge["salt"])
        correct = secrets.compare_digest(candidate_hash, challenge["answer_hash"])

        if correct:
            connection.execute(
                """
                UPDATE solves
                SET solved_at = COALESCE(solved_at, CURRENT_TIMESTAMP)
                WHERE player_id = ? AND challenge_id = ?
                """,
                (player["id"], challenge_id),
            )

    return {
        "correct": correct,
        "message": (
            challenge["success_message"]
            if correct
            else "The Archive does not recognize that sequence."
        ),
    }


@app.get("/robots.txt")
def robots() -> FileResponse:
    return FileResponse(STATIC_DIR / "robots.txt", media_type="text/plain")


@app.get("/sitemap.xml")
def sitemap() -> FileResponse:
    return FileResponse(STATIC_DIR / "sitemap.xml", media_type="application/xml")


@app.get("/restricted/")
def restricted() -> FileResponse:
    return FileResponse(STATIC_DIR / "restricted" / "index.html")


@app.get("/admin")
def admin_page() -> FileResponse:
    return FileResponse(STATIC_DIR / "admin" / "index.html")


@app.post("/api/admin/login")
def admin_login(payload: AdminLogin, response: Response) -> dict[str, bool]:
    if not secrets.compare_digest(payload.key, ADMIN_KEY):
        raise HTTPException(status_code=401, detail="Invalid admin key.")

    response.set_cookie(
        key="archive_admin",
        value=payload.key,
        httponly=True,
        samesite="strict",
        secure=SECURE_COOKIES,
        max_age=60 * 60 * 8,
    )
    return {"authenticated": True}


def require_admin_cookie(request: Request) -> None:
    supplied = request.cookies.get("archive_admin", "")
    if not secrets.compare_digest(supplied, ADMIN_KEY):
        raise HTTPException(status_code=401, detail="Admin authorization rejected.")


@app.get("/api/os/desktop-files")
def desktop_story_files(request: Request) -> list[dict[str, Any]]:
    get_player(request)
    return load_desktop_story()


@app.get("/api/living/boot")
def living_boot(request: Request) -> dict[str, Any]:
    player = get_player(request)

    with db() as connection:
        ensure_living_archive_seed(connection, player)

        unread_mail = connection.execute(
            """
            SELECT COUNT(*) AS count
            FROM observer_mail
            WHERE player_id = ? AND is_read = 0
            """,
            (player["id"],),
        ).fetchone()["count"]

        unread_events = connection.execute(
            """
            SELECT COUNT(*) AS count
            FROM observer_events
            WHERE player_id = ? AND is_read = 0
            """,
            (player["id"],),
        ).fetchone()["count"]

        solved_cases = connection.execute(
            """
            SELECT COUNT(*) AS count
            FROM case_progress
            WHERE player_id = ? AND completed_at IS NOT NULL
            """,
            (player["id"],),
        ).fetchone()["count"]

        downloads = connection.execute(
            """
            SELECT COUNT(*) AS count
            FROM terminal_events
            WHERE player_id = ? AND command LIKE 'download %'
            """,
            (player["id"],),
        ).fetchone()["count"]

        last_command = connection.execute(
            """
            SELECT command, created_at
            FROM terminal_events
            WHERE player_id = ?
            ORDER BY id DESC
            LIMIT 1
            """,
            (player["id"],),
        ).fetchone()

    sequences = [
        [
            {"text": "Mounting /archive", "state": "OK"},
            {"text": "Mounting /relay", "state": "OK"},
            {"text": "Scanning /transmissions", "state": "19 FOUND"},
            {"text": "Scanning /ghost", "state": "CORRUPTED"},
            {"text": "Repairing damaged index", "state": "RECOVERED"},
            {"text": "Verifying observer signature", "state": "ACCEPTED"},
        ],
        [
            {"text": "Reassembling damaged sectors", "state": "OK"},
            {"text": "Comparing timeline anomalies", "state": "3 FOUND"},
            {"text": "Recovering deleted transmissions", "state": "2 RESTORED"},
            {"text": "Checking relay integrity", "state": "97%"},
            {"text": "Reopening sealed channels", "state": "PARTIAL"},
            {"text": "Synchronizing Archive time", "state": "COMPLETE"},
        ],
        [
            {"text": "Locating previous session", "state": "FOUND"},
            {"text": "Scanning abandoned relays", "state": "4 ONLINE"},
            {"text": "Recovering observer profile", "state": "COMPLETE"},
            {"text": "Checking archive integrity", "state": "98%"},
            {"text": "Verifying command history", "state": "RETAINED"},
            {"text": "Signal synchronization", "state": "STABLE"},
        ],
    ]

    selected = sequences[player["id"] % len(sequences)]

    anomalies = [
        None,
        None,
        None,
        "Observer mismatch detected. Revalidating identity...",
        "Unknown process found in /relay. Process terminated.",
        "Archive clock drift detected. Correction applied.",
    ]
    anomaly = anomalies[(player["id"] + unread_events + unread_mail) % len(anomalies)]

    return {
        "codename": player["codename"],
        "joined_at": player["created_at"],
        "unread_mail": unread_mail,
        "unread_events": unread_events,
        "completed_cases": solved_cases,
        "downloads": downloads,
        "boot_steps": selected,
        "anomaly": anomaly,
        "last_command": last_command["command"] if last_command else None,
        "last_command_at": last_command["created_at"] if last_command else None,
    }


@app.get("/api/living/status")
def living_status(request: Request) -> dict[str, Any]:
    player = get_player(request)

    with db() as connection:
        ensure_living_archive_seed(connection, player)

        unread_mail = connection.execute(
            """
            SELECT COUNT(*) AS count
            FROM observer_mail
            WHERE player_id = ? AND is_read = 0
            """,
            (player["id"],),
        ).fetchone()["count"]

        unread_events = connection.execute(
            """
            SELECT COUNT(*) AS count
            FROM observer_events
            WHERE player_id = ? AND is_read = 0
            """,
            (player["id"],),
        ).fetchone()["count"]

        completed_cases = connection.execute(
            """
            SELECT COUNT(*) AS count
            FROM case_progress
            WHERE player_id = ? AND completed_at IS NOT NULL
            """,
            (player["id"],),
        ).fetchone()["count"]

        solved_nodes = connection.execute(
            """
            SELECT COUNT(*) AS count
            FROM solves
            WHERE player_id = ? AND solved_at IS NOT NULL
            """,
            (player["id"],),
        ).fetchone()["count"]

    heartbeat_states = [
        "ONLINE",
        "SYNCING",
        "OBSERVING",
        "MONITORING",
        "INDEXING",
    ]

    return {
        "heartbeat": heartbeat_states[
            (player["id"] + unread_events + unread_mail) % len(heartbeat_states)
        ],
        "unread_mail": unread_mail,
        "unread_events": unread_events,
        "completed_cases": completed_cases,
        "solved_nodes": solved_nodes,
        "archive_integrity": max(91, 100 - unread_events),
        "trust_level": min(9, 1 + completed_cases + solved_nodes),
    }


@app.get("/api/living/events")
def living_events(
    request: Request,
    limit: int = 20,
) -> list[dict[str, Any]]:
    player = get_player(request)

    with db() as connection:
        ensure_living_archive_seed(connection, player)
        rows = connection.execute(
            """
            SELECT id, event_type, title, detail, is_read, created_at
            FROM observer_events
            WHERE player_id = ?
            ORDER BY id DESC
            LIMIT ?
            """,
            (player["id"], min(max(limit, 1), 100)),
        ).fetchall()

    return [dict(row) for row in rows]


@app.post("/api/living/events/{event_id}/read")
def mark_event_read(
    event_id: int,
    request: Request,
) -> dict[str, bool]:
    player = get_player(request)

    with db() as connection:
        connection.execute(
            """
            UPDATE observer_events
            SET is_read = 1
            WHERE id = ? AND player_id = ?
            """,
            (event_id, player["id"]),
        )

    return {"updated": True}


@app.get("/api/living/mail")
def living_mail(request: Request) -> list[dict[str, Any]]:
    player = get_player(request)

    with db() as connection:
        ensure_living_archive_seed(connection, player)
        rows = connection.execute(
            """
            SELECT id, sender, subject, is_read, created_at
            FROM observer_mail
            WHERE player_id = ?
            ORDER BY id DESC
            """,
            (player["id"],),
        ).fetchall()

    return [dict(row) for row in rows]


@app.get("/api/living/mail/{mail_id}")
def read_living_mail(
    mail_id: int,
    request: Request,
) -> dict[str, Any]:
    player = get_player(request)

    with db() as connection:
        row = connection.execute(
            """
            SELECT id, sender, subject, body, is_read, created_at
            FROM observer_mail
            WHERE id = ? AND player_id = ?
            """,
            (mail_id, player["id"]),
        ).fetchone()

        if not row:
            raise HTTPException(status_code=404, detail="Message not found.")

        connection.execute(
            """
            UPDATE observer_mail
            SET is_read = 1
            WHERE id = ? AND player_id = ?
            """,
            (mail_id, player["id"]),
        )

    return dict(row)


@app.get("/api/living/logs")
def living_logs(request: Request) -> list[str]:
    player = get_player(request)

    with db() as connection:
        terminal_rows = connection.execute(
            """
            SELECT command, created_at
            FROM terminal_events
            WHERE player_id = ?
            ORDER BY id DESC
            LIMIT 8
            """,
            (player["id"],),
        ).fetchall()

        event_rows = connection.execute(
            """
            SELECT title, created_at
            FROM observer_events
            WHERE player_id = ?
            ORDER BY id DESC
            LIMIT 8
            """,
            (player["id"],),
        ).fetchall()

    logs = [
        f"{row['created_at']} CMD {row['command']}"
        for row in terminal_rows
    ]
    logs.extend(
        f"{row['created_at']} EVT {row['title']}"
        for row in event_rows
    )
    logs.sort(reverse=True)
    return logs[:12]


@app.get("/api/admin/overview")
def admin_overview(request: Request) -> dict[str, Any]:
    require_admin_cookie(request)

    with db() as connection:
        players = connection.execute(
            "SELECT COUNT(*) AS count FROM players"
        ).fetchone()["count"]
        solves = connection.execute(
            "SELECT COUNT(*) AS count FROM solves WHERE solved_at IS NOT NULL"
        ).fetchone()["count"]
        completed_cases = connection.execute(
            "SELECT COUNT(*) AS count FROM case_progress WHERE completed_at IS NOT NULL"
        ).fetchone()["count"]

    return {
        "players": players,
        "node_solves": solves,
        "completed_cases": completed_cases,
        "cases": len(load_cases()),
        "artifacts": len(load_artifacts()),
    }


@app.get("/api/admin/cases")
def admin_list_cases(request: Request) -> list[dict[str, Any]]:
    require_admin_cookie(request)
    return load_cases()


@app.post("/api/admin/cases")
def admin_create_case(
    payload: AdminCaseInput,
    request: Request,
) -> dict[str, Any]:
    require_admin_cookie(request)
    cases = load_cases()

    if any(case["id"] == payload.id.strip().lower() for case in cases):
        raise HTTPException(status_code=409, detail="Case ID already exists.")

    if any(case["sequence"] == payload.sequence for case in cases):
        raise HTTPException(status_code=409, detail="Case sequence already exists.")

    artifact_ids = {artifact["id"] for artifact in load_artifacts()}
    missing = [
        evidence.artifact_id
        for evidence in payload.evidence
        if evidence.artifact_id not in artifact_ids
    ]
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown artifact IDs: {', '.join(missing)}",
        )

    record = build_case_record(payload)
    cases.append(record)
    cases.sort(key=lambda case: case["sequence"])
    save_cases(cases)
    return record


@app.put("/api/admin/cases/{case_id}")
def admin_update_case(
    case_id: str,
    payload: AdminCaseInput,
    request: Request,
) -> dict[str, Any]:
    require_admin_cookie(request)
    cases = load_cases()
    index = next(
        (i for i, case in enumerate(cases) if case["id"] == case_id),
        None,
    )

    if index is None:
        raise HTTPException(status_code=404, detail="Case not found.")

    record = build_case_record(payload)
    record["id"] = case_id
    cases[index] = record
    cases.sort(key=lambda case: case["sequence"])
    save_cases(cases)
    return record


@app.delete("/api/admin/cases/{case_id}")
def admin_delete_case(
    case_id: str,
    request: Request,
) -> dict[str, bool]:
    require_admin_cookie(request)
    cases = load_cases()
    filtered = [case for case in cases if case["id"] != case_id]

    if len(filtered) == len(cases):
        raise HTTPException(status_code=404, detail="Case not found.")

    save_cases(filtered)
    return {"deleted": True}


@app.get("/api/admin/artifacts")
def admin_list_artifacts(request: Request) -> list[dict[str, Any]]:
    require_admin_cookie(request)
    return load_artifacts()


def generator_paths() -> GeneratorPaths:
    return GeneratorPaths(
        cases_path=CASES_PATH,
        artifacts_path=ARTIFACTS_PATH,
        artifacts_dir=ARTIFACTS_DIR,
        registry_path=GENERATED_INVESTIGATIONS_PATH,
        world_state_path=DATA_DIR / "world_state.json",
    )


@app.get("/api/world/state")
def world_state(request: Request) -> dict[str, Any]:
    get_player(request)
    state = load_state(DATA_DIR / "world_state.json")
    return {
        "summary": entity_summary(state),
        "entities": state["entities"],
        "history": state["history"][-100:],
        "lore_fragments": state["lore_fragments"],
        "unlocked_story_beats": state["unlocked_story_beats"],
        "observer_memory": state["observer_memory"],
    }


@app.get("/api/world/map")
def world_map_state(request: Request) -> dict[str, Any]:
    get_player(request)
    state = load_state(DATA_DIR / "world_state.json")
    return {
        "relays": [
            {
                "id": relay_id,
                **record,
            }
            for relay_id, record in state["entities"]["relays"].items()
        ],
        "global_events": state["global_events"],
        "generated_cases": state["generated_cases"],
    }


@app.get("/api/world/lore")
def world_lore(request: Request) -> dict[str, Any]:
    get_player(request)
    state = load_state(DATA_DIR / "world_state.json")
    return {
        "fragments": state["lore_fragments"],
        "story_beats": state["unlocked_story_beats"],
        "folders": state["unlocked_folders"],
    }


@app.get("/api/generator/investigations")
def generated_investigations(request: Request) -> list[dict[str, Any]]:
    get_player(request)
    return list_generated(generator_paths())


@app.post("/api/generator/investigations")
def create_generated_investigation(
    payload: InvestigationGenerationInput,
    request: Request,
) -> dict[str, Any]:
    player = get_player(request)

    try:
        result = generate_investigation(
            generator_paths(),
            seed=payload.seed,
            difficulty=payload.difficulty,
        )
    except (ValueError, OSError, json.JSONDecodeError) as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Investigation generation failed: {exc}",
        ) from exc

    with db() as connection:
        mail = result["mail"]
        existing_mail = connection.execute(
            """
            SELECT id
            FROM observer_mail
            WHERE player_id = ? AND subject = ?
            LIMIT 1
            """,
            (player["id"], mail["subject"]),
        ).fetchone()

        if not existing_mail:
            connection.execute(
                """
                INSERT INTO observer_mail (
                    player_id,
                    sender,
                    subject,
                    body
                )
                VALUES (?, ?, ?, ?)
                """,
                (
                    player["id"],
                    mail["sender"],
                    mail["subject"],
                    mail["body"],
                ),
            )

            record_observer_event(
                connection,
                player["id"],
                "generated-case",
                f"{result['case']['title']} GENERATED",
                (
                    f"Seed {result['seed']} produced "
                    f"{len(result['artifact_ids'])} artifacts."
                ),
            )

    return result


@app.get("/api/cases")
def list_cases(request: Request) -> list[dict[str, Any]]:
    player = get_player(request)

    with db() as connection:
        solved_nodes = connection.execute(
            """
            SELECT COUNT(*) AS count
            FROM solves
            WHERE player_id = ? AND solved_at IS NOT NULL
            """,
            (player["id"],),
        ).fetchone()["count"]

        results = []
        for case in load_cases():
            unlocked = solved_nodes >= case["requires_solved_nodes"]
            state = get_case_state(connection, player["id"], case)
            results.append(public_case(case, state, unlocked))

    return results


@app.get("/api/cases/{case_id}")
def read_case(case_id: str, request: Request) -> dict[str, Any]:
    player = get_player(request)
    case = next((item for item in load_cases() if item["id"] == case_id), None)

    if not case:
        raise HTTPException(status_code=404, detail="Case not found.")

    with db() as connection:
        solved_nodes = connection.execute(
            """
            SELECT COUNT(*) AS count
            FROM solves
            WHERE player_id = ? AND solved_at IS NOT NULL
            """,
            (player["id"],),
        ).fetchone()["count"]

        unlocked = solved_nodes >= case["requires_solved_nodes"]
        state = get_case_state(connection, player["id"], case)

        if unlocked:
            connection.execute(
                """
                INSERT INTO case_progress (player_id, case_id)
                VALUES (?, ?)
                ON CONFLICT(player_id, case_id) DO NOTHING
                """,
                (player["id"], case["id"]),
            )

    return public_case(case, state, unlocked)


@app.post("/api/cases/{case_id}/submit")
def submit_case_answer(
    case_id: str,
    submission: CaseAnswerSubmission,
    request: Request,
) -> dict[str, Any]:
    player = get_player(request)
    case = next((item for item in load_cases() if item["id"] == case_id), None)

    if not case:
        raise HTTPException(status_code=404, detail="Case not found.")

    objective = next(
        (
            item
            for item in case["objectives"]
            if item["id"] == submission.objective_id
        ),
        None,
    )

    if not objective:
        raise HTTPException(status_code=404, detail="Objective not found.")

    with db() as connection:
        solved_nodes = connection.execute(
            """
            SELECT COUNT(*) AS count
            FROM solves
            WHERE player_id = ? AND solved_at IS NOT NULL
            """,
            (player["id"],),
        ).fetchone()["count"]

        if solved_nodes < case["requires_solved_nodes"]:
            raise HTTPException(status_code=403, detail="Case remains sealed.")

        connection.execute(
            """
            INSERT INTO case_progress (player_id, case_id)
            VALUES (?, ?)
            ON CONFLICT(player_id, case_id) DO NOTHING
            """,
            (player["id"], case["id"]),
        )

        connection.execute(
            """
            INSERT INTO case_objectives (
                player_id,
                case_id,
                objective_id,
                attempts
            )
            VALUES (?, ?, ?, 1)
            ON CONFLICT(player_id, case_id, objective_id)
            DO UPDATE SET attempts = attempts + 1
            """,
            (player["id"], case["id"], objective["id"]),
        )

        candidate = hash_answer(submission.answer, objective["salt"])
        correct = secrets.compare_digest(candidate, objective["answer_hash"])

        if correct:
            connection.execute(
                """
                UPDATE case_objectives
                SET solved_at = COALESCE(solved_at, CURRENT_TIMESTAMP)
                WHERE player_id = ?
                  AND case_id = ?
                  AND objective_id = ?
                """,
                (player["id"], case["id"], objective["id"]),
            )

        state = get_case_state(connection, player["id"], case)

        if state["completed"]:
            was_completed = connection.execute(
                """
                SELECT completed_at
                FROM case_progress
                WHERE player_id = ? AND case_id = ?
                """,
                (player["id"], case["id"]),
            ).fetchone()

            connection.execute(
                """
                UPDATE case_progress
                SET completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP)
                WHERE player_id = ? AND case_id = ?
                """,
                (player["id"], case["id"]),
            )

            if not was_completed or was_completed["completed_at"] is None:
                record_observer_event(
                    connection,
                    player["id"],
                    "case",
                    f"{case['title'].upper()} RESOLVED",
                    case["reward"]["message"],
                )

    return {
        "correct": correct,
        "completed": state["completed"],
        "progress": state["progress"],
        "message": (
            case["reward"]["message"]
            if state["completed"]
            else "Objective resolved."
            if correct
            else "Evidence does not support that conclusion."
        ),
    }


@app.get("/api/artifacts")
def list_artifacts(request: Request) -> list[dict[str, Any]]:
    player = get_player(request)

    with db() as connection:
        accessible_ids = accessible_artifact_ids(connection, player["id"])

    return [
        artifact
        for artifact in load_artifacts()
        if artifact["id"] in accessible_ids
    ]


@app.get("/api/artifacts/{artifact_id}")
def read_artifact_metadata(
    artifact_id: str,
    request: Request,
) -> dict[str, Any]:
    player = get_player(request)

    artifact = next(
        (item for item in load_artifacts() if item["id"] == artifact_id),
        None,
    )

    if not artifact:
        raise HTTPException(status_code=404, detail="Artifact not found.")

    with db() as connection:
        accessible_ids = accessible_artifact_ids(connection, player["id"])

    if artifact_id not in accessible_ids:
        raise HTTPException(status_code=403, detail="Artifact remains sealed.")

    return artifact


@app.get("/api/artifacts/{artifact_id}/download")
def download_artifact(
    artifact_id: str,
    request: Request,
) -> FileResponse:
    player = get_player(request)

    artifact = next(
        (item for item in load_artifacts() if item["id"] == artifact_id),
        None,
    )

    if not artifact:
        raise HTTPException(status_code=404, detail="Artifact not found.")

    with db() as connection:
        accessible_ids = accessible_artifact_ids(connection, player["id"])

    if artifact_id not in accessible_ids:
        raise HTTPException(status_code=403, detail="Artifact remains sealed.")

    path = (ARTIFACTS_DIR / artifact["filename"]).resolve()
    if ARTIFACTS_DIR.resolve() not in path.parents or not path.is_file():
        raise HTTPException(status_code=404, detail="Artifact bytes unavailable.")

    return FileResponse(
        path,
        media_type=artifact["mime_type"],
        filename=artifact["filename"],
    )


@app.get("/api/filesystem")
def read_virtual_filesystem(request: Request) -> dict[str, Any]:
    player = get_player(request)

    with db() as connection:
        rows = connection.execute(
            """
            SELECT challenge_id
            FROM solves
            WHERE player_id = ? AND solved_at IS NOT NULL
            """,
            (player["id"],),
        ).fetchall()

    solved_ids = {row["challenge_id"] for row in rows}
    return {
        "root": build_virtual_filesystem(player, solved_ids),
        "home": f"/users/{player['codename']}",
    }


@app.get("/api/terminal/context")
def terminal_context(request: Request) -> dict[str, Any]:
    player = get_player(request)
    challenges = load_challenges()

    with db() as connection:
        solved_rows = connection.execute(
            """
            SELECT challenge_id
            FROM solves
            WHERE player_id = ? AND solved_at IS NOT NULL
            """,
            (player["id"],),
        ).fetchall()

        recent_commands = connection.execute(
            """
            SELECT command
            FROM terminal_events
            WHERE player_id = ?
            ORDER BY id DESC
            LIMIT 12
            """,
            (player["id"],),
        ).fetchall()

    solved_ids = {row["challenge_id"] for row in solved_rows}
    nodes = [
        {
            "id": challenge["id"],
            "sequence": challenge["sequence"],
            "title": challenge["title"],
            "solved": challenge["id"] in solved_ids,
            "unlocked": set(challenge.get("requires", [])).issubset(solved_ids),
        }
        for challenge in challenges
    ]

    solved_count = len(solved_ids)
    total = len(challenges)

    return {
        "codename": player["codename"],
        "rank": "Observer" if solved_count == 0 else "Initiate",
        "solved": solved_count,
        "total": total,
        "progress": round((solved_count / total) * 100) if total else 0,
        "nodes": nodes,
        "recent_commands": [row["command"] for row in recent_commands],
        "signal": "STABLE",
        "trust_level": min(9, 1 + solved_count),
    }


@app.post("/api/terminal/event")
def record_terminal_event(
    payload: TerminalCommand,
    request: Request,
) -> dict[str, bool]:
    player = get_player(request)
    command = payload.command.strip()[:120]

    if not command:
        return {"recorded": False}

    with db() as connection:
        connection.execute(
            "INSERT INTO terminal_events (player_id, command) VALUES (?, ?)",
            (player["id"], command),
        )

    return {"recorded": True}


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "online"}
