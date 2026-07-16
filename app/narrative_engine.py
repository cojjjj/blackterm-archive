from __future__ import annotations

import json
import random
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.living_world import build_case_continuity, load_state


INCIDENT_ARCHETYPES = [
    {
        "id": "unauthorized-persistence",
        "phenomenon": "unauthorized persistence",
        "initial_event": "an unscheduled firmware integrity verification",
        "anomaly": "telemetry continued after network isolation was confirmed",
        "assessment": "Behavior is consistent with an execution chain operating below the authenticated relay service.",
        "attribution": "UNRESOLVED",
        "recommendation": "CONTINUE COLLECTION",
    },
    {
        "id": "temporal-desynchronization",
        "phenomenon": "temporal desynchronization",
        "initial_event": "a clock-integrity fault affecting signed telemetry",
        "anomaly": "multiple packets appear to predate relay activation",
        "assessment": "Recovered timing data indicates deliberate sequence manipulation rather than environmental clock drift.",
        "attribution": "UNKNOWN",
        "recommendation": "PRESERVE ORIGINAL TIMESTAMPS",
    },
    {
        "id": "identity-drift",
        "phenomenon": "observer identity drift",
        "initial_event": "an authentication database reconciliation",
        "anomaly": "the same credential fingerprint maps to multiple observer identities",
        "assessment": "The observed credential conflict cannot be explained by standard replication delay.",
        "attribution": "INTERNAL ORIGIN POSSIBLE",
        "recommendation": "RESTRICT CREDENTIAL REPLICATION",
    },
    {
        "id": "recursive-beacon",
        "phenomenon": "recursive beacon activity",
        "initial_event": "an outbound synchronization attempt",
        "anomaly": "the relay received responses matching packets it had not yet transmitted",
        "assessment": "Traffic structure suggests a closed command loop or replay source with access to future sequence values.",
        "attribution": "UNRESOLVED",
        "recommendation": "ISOLATE COMMAND CHANNEL",
    },
    {
        "id": "phantom-collection",
        "phenomenon": "phantom collection",
        "initial_event": "a passive acquisition task",
        "anomaly": "new evidence continued to appear after the collection interface was disabled",
        "assessment": "Evidence creation persisted without a registered collection source.",
        "attribution": "UNKNOWN COLLECTION SOURCE",
        "recommendation": "VALIDATE CHAIN OF CUSTODY",
    },
]

RELAYS = [
    {"id": "R-13", "cluster": "Northern Relay Mesh"},
    {"id": "R-21", "cluster": "Atlantic Collection Grid"},
    {"id": "R-27", "cluster": "Central Signals Corridor"},
    {"id": "R-31", "cluster": "Obsidian Relay Cluster"},
    {"id": "R-42", "cluster": "Eastern Archive Mesh"},
    {"id": "R-47", "cluster": "Remote Recovery Segment"},
]

PROTOCOLS = ["ARP-7", "BTSYNC-4", "SIGMA-13", "VOID/2", "ARC-LINK", "ECHO-6"]
ENCRYPTION = ["AES-256", "CHACHA20", "ARCHIVE WRAP-4", "UNKNOWN / HIGH ENTROPY"]
COLLECTION_METHODS = [
    "Passive Acquisition",
    "Cold Archive Recovery",
    "Relay Memory Reconstruction",
    "Packet Stream Preservation",
]
DIVISIONS = [
    "SIGNALS ANALYSIS DIVISION",
    "CYBER OPERATIONS ASSESSMENT CELL",
    "RELAY RECOVERY UNIT",
    "TECHNICAL COLLECTION DIRECTORATE",
]
PRIORITIES = ["ROUTINE", "ELEVATED", "HIGH", "CRITICAL"]
CONFIDENCE = ["LOW", "MODERATE", "HIGH"]
RISK = ["LOW", "MODERATE", "HIGH", "SEVERE"]

WORLD_OPERATORS = [
    "Operator Vale",
    "Operator Echo",
    "Director Knox",
    "Operator Sable",
    "Custodian Grey",
    "Analyst Meridian",
    "Operator Voss",
    "Analyst Chen",
]

LORE_FRAGMENTS = [
    "The relays were authorized to listen. No directive authorized them to remember.",
    "Observer records cannot be deleted. They can only be reassigned.",
    "The first compromise report was filed before the Archive entered service.",
    "A relay marked destroyed may continue to answer authenticated queries.",
    "Protocol Zero is referenced in records that predate its creation.",
]


@dataclass(frozen=True)
class NarrativeContext:
    seed: str
    title: str
    difficulty: int
    location: str
    region: str
    year: int
    token: str
    world_state_path: Path


def load_world_state(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {
            "version": 1,
            "generated_cases": 0,
            "entities": {
                "relays": {},
                "operators": {},
                "protocols": {},
            },
            "lore_fragments": [],
            "history": [],
        }

    return json.loads(path.read_text(encoding="utf-8"))


def save_world_state(path: Path, state: dict[str, Any]) -> None:
    path.write_text(json.dumps(state, indent=2), encoding="utf-8")


def build_timeline(
    rng: random.Random,
    *,
    relay_id: str,
    year: int,
    archetype: dict[str, str],
) -> list[dict[str, str]]:
    hour = rng.randint(1, 4)
    minute = rng.randint(4, 24)

    def clock(offset: int) -> str:
        total = hour * 60 + minute + offset
        return f"{(total // 60) % 24:02}:{total % 60:02} UTC"

    events = [
        (0, f"{relay_id} entered authenticated service."),
        (rng.randint(7, 16), f"Archive scheduled {archetype['initial_event']}."),
        (rng.randint(18, 29), "Unknown beacon observed outside approved protocol set."),
        (rng.randint(31, 42), "Authentication integrity check failed."),
        (rng.randint(44, 56), "Upstream carrier terminated without negotiated disconnect."),
        (rng.randint(58, 71), f"Unauthorized traffic associated with {archetype['phenomenon']} persisted."),
        (rng.randint(75, 96), "Recovery Unit initiated passive acquisition."),
    ]
    events.sort(key=lambda item: item[0])

    return [
        {
            "time": clock(offset),
            "year": str(year),
            "event": event,
        }
        for offset, event in events
    ]


def build_narrative(
    rng: random.Random,
    *,
    context: NarrativeContext,
    operator: str,
) -> dict[str, Any]:
    archetype = rng.choice(INCIDENT_ARCHETYPES)
    world_state = load_state(context.world_state_path)

    known_relays = list(world_state["entities"]["relays"])
    known_operators = list(world_state["entities"]["operators"])
    known_protocols = list(world_state["entities"]["protocols"])

    if known_relays and rng.random() < 0.65:
        relay_id = rng.choice(known_relays)
        known_record = world_state["entities"]["relays"][relay_id]
        relay = {
            "id": relay_id,
            "cluster": known_record.get("cluster", "UNKNOWN RELAY CLUSTER"),
        }
    else:
        relay = rng.choice(RELAYS)

    if known_protocols and rng.random() < 0.55:
        protocol = rng.choice(known_protocols)
    else:
        protocol = rng.choice(PROTOCOLS)

    if known_operators and rng.random() < 0.65:
        operator = rng.choice(known_operators)
    encryption = rng.choice(ENCRYPTION)
    collection_method = rng.choice(COLLECTION_METHODS)
    division = rng.choice(DIVISIONS)

    priority_index = min(3, max(0, context.difficulty - 1))
    priority = PRIORITIES[priority_index]
    risk = RISK[priority_index]
    confidence = CONFIDENCE[min(2, max(0, context.difficulty // 2))]

    packet_count = rng.randint(4200, 28000)
    malformed = max(7, int(packet_count * rng.uniform(0.004, 0.032)))
    unknown_frames = rng.randint(2, 17)
    recovered_sessions = rng.randint(3, 12)
    integrity = rng.randint(82, 99)
    clock_drift = round(rng.uniform(4.2, 31.8), 2)
    broadcast_hours = rng.randint(9, 48)
    acquisition_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    executive_summary = (
        f"{relay['id']} terminated authenticated communications following "
        f"{archetype['initial_event']}. Although network isolation was confirmed, "
        f"the relay continued broadcasting encrypted synchronization telemetry for "
        f"approximately {broadcast_hours} hours. Recovered traffic references "
        f"credentials and sequence values that do not reconcile with Archive registration "
        f"records. Current evidence does not support ordinary hardware failure."
    )

    incident_overview = (
        f"The affected node was operating within the {relay['cluster']} near "
        f"{context.location}, {context.region}. The relay was assigned to {operator}. "
        f"Continuity ended without negotiated disconnect. Subsequent passive acquisition "
        f"identified {archetype['anomaly']}."
    )

    analyst_note = (
        f"No approved firmware revision permits the observed behavior. "
        f"{archetype['assessment']} Do not assume recovered timestamps represent "
        f"chronological order. Do not execute unknown recovered binaries outside an "
        f"isolated analysis environment."
    )

    recommended_actions = [
        "Recover the final authenticated transmission.",
        "Reconstruct the compromise timeline from original packet order.",
        "Validate credential and relay identifiers against Archive registration records.",
        "Preserve all evidence with original timestamps and hashes.",
        archetype["recommendation"].title() + ".",
    ]

    timeline = build_timeline(
        rng,
        relay_id=relay["id"],
        year=context.year,
        archetype=archetype,
    )

    indicators = {
        "relay_id": relay["id"],
        "cluster": relay["cluster"],
        "collection_source": f"{relay['id']} // {context.location}",
        "collection_method": collection_method,
        "protocol": protocol,
        "encryption": encryption,
        "last_contact": timeline[4]["time"],
        "location": context.location,
        "region": context.region,
    }

    technical_observations = {
        "recovered_packets": packet_count,
        "malformed_packets": malformed,
        "unknown_protocol_frames": unknown_frames,
        "recovered_sessions": recovered_sessions,
        "clock_drift_seconds": clock_drift,
        "persistence": "CONFIRMED",
        "authenticated": "NO",
        "integrity_confidence": integrity,
    }

    threat_assessment = {
        "operational_risk": risk,
        "confidence": confidence,
        "evidence_integrity": f"{integrity}%",
        "persistence": "CONFIRMED",
        "attribution": archetype["attribution"],
        "recommendation": archetype["recommendation"],
    }

    chain_of_custody = {
        "collected_by": "ARCHIVE RECOVERY UNIT",
        "acquired": acquisition_date,
        "storage": "COLD ARCHIVE",
        "integrity": "VERIFIED",
        "classification": "ARCHIVE // OBSERVER",
        "collection_method": collection_method,
    }

    lore_fragment = rng.choice(LORE_FRAGMENTS)
    continuity = build_case_continuity(
        context.world_state_path,
        relay=relay["id"],
        operator=operator,
        protocol=protocol,
    )

    continuity_note = " ".join(continuity["references"])
    if continuity_note:
        analyst_note = f"{analyst_note} PRIOR ARCHIVE CORRELATION: {continuity_note}"

    return {
        "directorate": "ARCHIVE INTELLIGENCE DIRECTORATE",
        "division": division,
        "classification": "ARCHIVE // OBSERVER",
        "priority": priority,
        "status": "ACTIVE INVESTIGATION",
        "designation": context.title,
        "incident_archetype": archetype["id"],
        "phenomenon": archetype["phenomenon"],
        "executive_summary": executive_summary,
        "incident_overview": incident_overview,
        "preliminary_assessment": archetype["assessment"],
        "analyst_note": analyst_note,
        "recommended_actions": recommended_actions,
        "technical_observations": technical_observations,
        "indicators": indicators,
        "threat_assessment": threat_assessment,
        "timeline": timeline,
        "chain_of_custody": chain_of_custody,
        "lore_fragment": lore_fragment,
        "continuity": continuity,
        "operator_profile": {
            "name": operator,
            "status": rng.choice(["MISSING", "UNCONFIRMED", "ARCHIVED", "OFFLINE"]),
            "last_login": timeline[3]["time"],
            "clearance": rng.randint(2, 5),
            "note": (
                f"Reported anomalous traffic associated with {archetype['phenomenon']} "
                "before relay continuity failed."
            ),
        },
    }


def update_world_state(
    path: Path,
    *,
    seed: str,
    case_id: str,
    narrative: dict[str, Any],
) -> dict[str, Any]:
    state = load_world_state(path)
    state["generated_cases"] = int(state.get("generated_cases", 0)) + 1

    relay_id = narrative["indicators"]["relay_id"]
    operator = narrative["operator_profile"]["name"]
    protocol = narrative["indicators"]["protocol"]

    relay_record = state["entities"]["relays"].setdefault(
        relay_id,
        {
            "first_seen_seed": seed,
            "appearances": 0,
            "status": "UNKNOWN",
            "cases": [],
        },
    )
    relay_record["appearances"] += 1
    relay_record["status"] = narrative["threat_assessment"]["persistence"]
    if case_id not in relay_record["cases"]:
        relay_record["cases"].append(case_id)

    operator_record = state["entities"]["operators"].setdefault(
        operator,
        {
            "first_seen_seed": seed,
            "appearances": 0,
            "status": narrative["operator_profile"]["status"],
            "cases": [],
        },
    )
    operator_record["appearances"] += 1
    operator_record["status"] = narrative["operator_profile"]["status"]
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

    fragment = narrative["lore_fragment"]
    if fragment not in state["lore_fragments"]:
        state["lore_fragments"].append(fragment)

    state["history"].append(
        {
            "seed": seed,
            "case_id": case_id,
            "relay": relay_id,
            "operator": operator,
            "protocol": protocol,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }
    )
    state["history"] = state["history"][-250:]

    save_world_state(path, state)
    return state
