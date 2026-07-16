from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


HIDDEN_FOLDER_THRESHOLDS = [
    (3, "/archive/declassified"),
    (6, "/archive/internal"),
    (10, "/archive/operator"),
    (15, "/archive/restricted"),
    (20, "/archive/protocol-zero"),
]

STORY_BEATS = [
    {
        "threshold": 2,
        "id": "relay-memory",
        "title": "Relay Memory",
        "fragment": "The relays were authorized to listen. No directive authorized them to remember.",
    },
    {
        "threshold": 5,
        "id": "observer-rewrite",
        "title": "Observer Registry",
        "fragment": "Observer records cannot be deleted. They can only be reassigned.",
    },
    {
        "threshold": 9,
        "id": "voss-return",
        "title": "Operator Voss",
        "fragment": "Operator Voss authenticated three years after being declared missing.",
    },
    {
        "threshold": 14,
        "id": "protocol-zero",
        "title": "Protocol Zero",
        "fragment": "Protocol Zero appears in records that predate the Archive.",
    },
    {
        "threshold": 20,
        "id": "archive-awareness",
        "title": "The Archive",
        "fragment": "The Archive is no longer preserving the investigation. It is preserving the Observer.",
    },
]

GLOBAL_EVENT_THRESHOLDS = [
    {
        "threshold": 4,
        "id": "atlantic-grid-loss",
        "title": "ATLANTIC GRID DEGRADED",
        "detail": "Three Atlantic relays failed integrity verification within the same collection window.",
        "region": "Atlantic Collection Grid",
        "status": "DEGRADED",
    },
    {
        "threshold": 8,
        "id": "operator-voss-missing",
        "title": "OPERATOR VOSS // STATUS CONFLICT",
        "detail": "Credentials associated with Operator Voss appeared in a current relay session.",
        "region": "Northern Relay Mesh",
        "status": "UNRESOLVED",
    },
    {
        "threshold": 12,
        "id": "european-mesh-blackout",
        "title": "EUROPEAN MESH BLACKOUT",
        "detail": "All European collection nodes entered fail-safe isolation for 94 seconds.",
        "region": "European Mesh",
        "status": "RECOVERED",
    },
    {
        "threshold": 18,
        "id": "protocol-zero-reference",
        "title": "PROTOCOL ZERO REFERENCE",
        "detail": "An unsigned directive referenced Protocol Zero from an unregistered authority.",
        "region": "UNKNOWN",
        "status": "CLASSIFIED",
    },
]


def default_state() -> dict[str, Any]:
    return {
        "version": 2,
        "generated_cases": 0,
        "solved_cases": 0,
        "entities": {
            "relays": {},
            "operators": {},
            "protocols": {},
            "organizations": {
                "Archive Operations": {"appearances": 0},
                "Signals Directorate": {"appearances": 0},
                "Recovery Unit": {"appearances": 0},
                "Internal Oversight": {"appearances": 0},
                "Protocol Authority": {"appearances": 0},
            },
        },
        "lore_fragments": [],
        "unlocked_story_beats": [],
        "unlocked_folders": [],
        "global_events": [],
        "history": [],
        "observer_memory": {
            "relay_visits": {},
            "operator_encounters": {},
            "last_case_id": None,
            "last_seed": None,
        },
        "desktop_state": {
            "drift_level": 0,
            "mail_pulse": False,
            "relay_pulse": False,
            "wallpaper_glitch": False,
        },
    }


def load_state(path: Path) -> dict[str, Any]:
    if not path.exists():
        return default_state()

    state = json.loads(path.read_text(encoding="utf-8"))
    baseline = default_state()

    for key, value in baseline.items():
        state.setdefault(key, value)

    for key, value in baseline["entities"].items():
        state["entities"].setdefault(key, value)

    for key, value in baseline["observer_memory"].items():
        state["observer_memory"].setdefault(key, value)

    for key, value in baseline["desktop_state"].items():
        state["desktop_state"].setdefault(key, value)

    state["version"] = 2
    return state


def save_state(path: Path, state: dict[str, Any]) -> None:
    path.write_text(json.dumps(state, indent=2), encoding="utf-8")


def entity_summary(state: dict[str, Any]) -> dict[str, Any]:
    return {
        "generated_cases": state["generated_cases"],
        "solved_cases": state.get("solved_cases", 0),
        "known_relays": len(state["entities"]["relays"]),
        "known_operators": len(state["entities"]["operators"]),
        "known_protocols": len(state["entities"]["protocols"]),
        "unlocked_lore": len(state["unlocked_story_beats"]),
        "unlocked_folders": list(state["unlocked_folders"]),
        "global_events": list(state["global_events"]),
        "desktop_state": dict(state["desktop_state"]),
    }


def unlock_progression(state: dict[str, Any]) -> dict[str, list[Any]]:
    unlocked = {"folders": [], "story_beats": [], "global_events": []}
    count = state["generated_cases"]

    for threshold, folder in HIDDEN_FOLDER_THRESHOLDS:
        if count >= threshold and folder not in state["unlocked_folders"]:
            state["unlocked_folders"].append(folder)
            unlocked["folders"].append(folder)

    for beat in STORY_BEATS:
        if count >= beat["threshold"] and beat["id"] not in state["unlocked_story_beats"]:
            state["unlocked_story_beats"].append(beat["id"])
            if beat["fragment"] not in state["lore_fragments"]:
                state["lore_fragments"].append(beat["fragment"])
            unlocked["story_beats"].append(beat)

    known_event_ids = {item["id"] for item in state["global_events"]}
    for event in GLOBAL_EVENT_THRESHOLDS:
        if count >= event["threshold"] and event["id"] not in known_event_ids:
            payload = dict(event)
            payload["unlocked_at"] = datetime.now(timezone.utc).isoformat()
            state["global_events"].append(payload)
            unlocked["global_events"].append(payload)

    drift_level = min(5, count // 4)
    state["desktop_state"] = {
        "drift_level": drift_level,
        "mail_pulse": bool(unlocked["story_beats"] or unlocked["global_events"]),
        "relay_pulse": count >= 3,
        "wallpaper_glitch": count >= 9,
    }

    return unlocked


def record_generated_case(
    path: Path,
    *,
    seed: str,
    case_id: str,
    title: str,
    relay: str,
    relay_cluster: str,
    operator: str,
    protocol: str,
    location: str,
    organization: str,
    narrative: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, list[Any]]]:
    state = load_state(path)
    state["generated_cases"] += 1

    relay_record = state["entities"]["relays"].setdefault(
        relay,
        {
            "first_seen_seed": seed,
            "appearances": 0,
            "status": "UNKNOWN",
            "cluster": relay_cluster,
            "locations": [],
            "cases": [],
        },
    )
    relay_record["appearances"] += 1
    relay_record["status"] = narrative["threat_assessment"]["persistence"]
    relay_record["cluster"] = relay_cluster
    if location not in relay_record["locations"]:
        relay_record["locations"].append(location)
    if case_id not in relay_record["cases"]:
        relay_record["cases"].append(case_id)

    operator_record = state["entities"]["operators"].setdefault(
        operator,
        {
            "first_seen_seed": seed,
            "appearances": 0,
            "status": narrative["operator_profile"]["status"],
            "clearance": narrative["operator_profile"]["clearance"],
            "cases": [],
        },
    )
    operator_record["appearances"] += 1
    operator_record["status"] = narrative["operator_profile"]["status"]
    operator_record["clearance"] = narrative["operator_profile"]["clearance"]
    if case_id not in operator_record["cases"]:
        operator_record["cases"].append(case_id)

    protocol_record = state["entities"]["protocols"].setdefault(
        protocol,
        {
            "first_seen_seed": seed,
            "appearances": 0,
            "cases": [],
        },
    )
    protocol_record["appearances"] += 1
    if case_id not in protocol_record["cases"]:
        protocol_record["cases"].append(case_id)

    organization_record = state["entities"]["organizations"].setdefault(
        organization,
        {"appearances": 0},
    )
    organization_record["appearances"] += 1

    memory = state["observer_memory"]
    memory["relay_visits"][relay] = memory["relay_visits"].get(relay, 0) + 1
    memory["operator_encounters"][operator] = (
        memory["operator_encounters"].get(operator, 0) + 1
    )
    memory["last_case_id"] = case_id
    memory["last_seed"] = seed

    state["history"].append(
        {
            "seed": seed,
            "case_id": case_id,
            "title": title,
            "relay": relay,
            "operator": operator,
            "protocol": protocol,
            "organization": organization,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }
    )
    state["history"] = state["history"][-500:]

    fragment = narrative.get("lore_fragment")
    if fragment and fragment not in state["lore_fragments"]:
        state["lore_fragments"].append(fragment)

    unlocked = unlock_progression(state)
    save_state(path, state)
    return state, unlocked


def mark_case_solved(path: Path, case_id: str) -> dict[str, Any]:
    state = load_state(path)

    solved_ids = {
        item["case_id"]
        for item in state.get("solved_history", [])
    }
    if case_id not in solved_ids:
        state.setdefault("solved_history", []).append(
            {
                "case_id": case_id,
                "solved_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        state["solved_cases"] = int(state.get("solved_cases", 0)) + 1

    unlock_progression(state)
    save_state(path, state)
    return state


def build_case_continuity(
    path: Path,
    *,
    relay: str,
    operator: str,
    protocol: str,
) -> dict[str, Any]:
    state = load_state(path)
    relay_record = state["entities"]["relays"].get(relay)
    operator_record = state["entities"]["operators"].get(operator)
    protocol_record = state["entities"]["protocols"].get(protocol)

    references: list[str] = []
    if relay_record and relay_record["appearances"] > 0:
        references.append(
            f"{relay} appears in {relay_record['appearances']} prior Archive record(s)."
        )
    if operator_record and operator_record["appearances"] > 0:
        references.append(
            f"{operator} is associated with {operator_record['appearances']} previous investigation(s)."
        )
    if protocol_record and protocol_record["appearances"] > 0:
        references.append(
            f"{protocol} has been observed in {protocol_record['appearances']} earlier case(s)."
        )

    return {
        "references": references,
        "observer_relay_count": state["observer_memory"]["relay_visits"].get(relay, 0),
        "observer_operator_count": state["observer_memory"]["operator_encounters"].get(operator, 0),
    }
