from __future__ import annotations

import base64
import hashlib
import io
import json
import math
import random
import re
import struct
import wave
import zipfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.narrative_engine import NarrativeContext, build_narrative
from app.living_world import record_generated_case

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:  # Pillow is optional; fallback PNG is included.
    Image = None
    ImageDraw = None
    ImageFont = None


SAFE_WORDS = [
    "EMBER", "HOLLOW", "ORBIT", "MIRROR", "SABLE", "ECHO", "STATIC",
    "CIPHER", "VEIL", "NIGHT", "LANTERN", "FROST", "DUST", "VECTOR",
]

TITLE_PATTERNS = [
    "THE {adjective} {noun}",
    "{noun} WITHOUT A SHADOW",
    "THE LAST {noun}",
    "{adjective} SIGNAL",
    "OPERATION {code}",
]

ADJECTIVES = [
    "HOLLOW", "VANISHED", "SILENT", "BROKEN", "FALSE", "FROZEN",
    "OBSIDIAN", "FORGOTTEN", "MIDNIGHT", "PHANTOM",
]

NOUNS = [
    "RELAY", "SIGNAL", "OBSERVER", "TIMESTAMP", "CHANNEL", "ARCHIVE",
    "TRANSMISSION", "NODE", "CIRCUIT", "MEMORY",
]

CATEGORIES = [
    "digital forensics",
    "network analysis",
    "log analysis",
    "cryptography",
    "signal intelligence",
]

OPERATORS = [
    "Operator Vale", "Operator Echo", "Director Knox", "Observer Nine",
    "Operator Sable", "Custodian Grey", "Analyst Meridian",
]

LOCATIONS = [
    ("Buffalo", "US-NY"),
    ("Berlin", "DE-BE"),
    ("Tokyo", "JP-13"),
    ("London", "GB-LND"),
    ("Sydney", "AU-NSW"),
    ("Reykjavik", "IS-1"),
    ("Oslo", "NO-03"),
]

PNG_FALLBACK = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAkAAAAGQCAYAAABvZOCEAAAACXBIWXMAAAsSAAALEgHS3X78"
    "AAAAGUlEQVR4nO3BMQEAAADCoPVPbQ0PoAAAAAAAAAAA4GkGAAABkX5mAAAAAElFTkSuQmCC"
)


@dataclass(frozen=True)
class GeneratorPaths:
    cases_path: Path
    artifacts_path: Path
    artifacts_dir: Path
    registry_path: Path
    world_state_path: Path


def normalize_seed(seed: str | None, rng: random.Random | None = None) -> str:
    if seed:
        cleaned = re.sub(r"[^A-Za-z0-9]", "", seed).upper()
        if len(cleaned) >= 8:
            return f"{cleaned[:4]}-{cleaned[4:8]}"
    source = rng or random.SystemRandom()
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(source.choice(alphabet) for _ in range(4)) + "-" + "".join(
        source.choice(alphabet) for _ in range(4)
    )


def seed_number(seed: str) -> int:
    return int(hashlib.sha256(seed.encode("utf-8")).hexdigest()[:16], 16)


def slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def hash_answer(answer: str, salt: str) -> str:
    normalized = " ".join(answer.strip().lower().split())
    return hashlib.sha256(f"{salt}:{normalized}".encode("utf-8")).hexdigest()


def write_json(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def make_text_artifact(path: Path, content: str) -> bytes:
    raw = content.encode("utf-8")
    path.write_bytes(raw)
    return raw


def make_png(path: Path, title: str, relay: str, clue: str, seed: str) -> bytes:
    if Image is None:
        path.write_bytes(PNG_FALLBACK)
        return PNG_FALLBACK

    image = Image.new("RGB", (1280, 720), "#06020d")
    draw = ImageDraw.Draw(image)

    # No external font files are distributed. Pillow's built-in font is used.
    font = ImageFont.load_default()
    glow = "#c47cff"
    muted = "#8c71a8"
    grid = "#20102d"

    for x in range(0, 1280, 48):
        draw.line((x, 0, x, 720), fill=grid, width=1)
    for y in range(0, 720, 48):
        draw.line((0, y, 1280, y), fill=grid, width=1)

    for radius in (90, 170, 250):
        draw.ellipse(
            (640 - radius, 360 - radius, 640 + radius, 360 + radius),
            outline="#351a49",
            width=2,
        )

    draw.line((640, 360, 1000, 110), fill="#6d3598", width=8)
    draw.ellipse((625, 345, 655, 375), fill=glow)
    draw.text((70, 60), "BLACKTERM // RECOVERED FRAME", fill=glow, font=font)
    draw.text((70, 104), title, fill="#f1e7ff", font=font)
    draw.text((70, 150), f"RELAY: {relay}", fill=muted, font=font)
    draw.text((70, 182), f"SEED: {seed}", fill=muted, font=font)
    draw.rectangle((70, 550, 1210, 650), outline="#6d3598", width=2)
    draw.text((95, 585), f"VISIBLE FRAGMENT: {clue}", fill=glow, font=font)

    output = io.BytesIO()
    image.save(output, format="PNG", optimize=True)
    raw = output.getvalue()
    path.write_bytes(raw)
    return raw


def make_wav(path: Path, encoded_word: str, rng: random.Random) -> bytes:
    sample_rate = 22050
    duration = 5.0
    frames: list[int] = []

    bit_stream = " ".join(f"{ord(char):08b}" for char in encoded_word)
    bit_index = 0

    for index in range(int(sample_rate * duration)):
        t = index / sample_rate
        base = 0.10 * math.sin(2 * math.pi * 120 * t)
        static = 0.02 * math.sin(2 * math.pi * (2800 + 200 * math.sin(t * 3)) * t)

        segment = int(t * 7)
        tone = 0.0
        if segment < len(bit_stream):
            char = bit_stream[segment]
            if char == "1":
                tone = 0.22 * math.sin(2 * math.pi * 760 * t)
            elif char == "0":
                tone = 0.13 * math.sin(2 * math.pi * 520 * t)

        fade = min(1.0, t * 4, (duration - t) * 4)
        noise = (rng.random() - 0.5) * 0.012
        value = max(-1.0, min(1.0, (base + tone + static + noise) * fade))
        frames.append(int(value * 32767))

    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(struct.pack("<" + "h" * len(frames), *frames))

    return path.read_bytes()


def checksum16(data: bytes) -> int:
    if len(data) % 2:
        data += b"\x00"
    total = sum(struct.unpack(f"!{len(data) // 2}H", data))
    while total >> 16:
        total = (total & 0xFFFF) + (total >> 16)
    return (~total) & 0xFFFF


def ipv4_packet(source: bytes, destination: bytes, protocol: int, payload: bytes, ident: int) -> bytes:
    version_ihl = 0x45
    total_length = 20 + len(payload)
    header = struct.pack(
        "!BBHHHBBH4s4s",
        version_ihl,
        0,
        total_length,
        ident,
        0,
        64,
        protocol,
        0,
        source,
        destination,
    )
    checksum = checksum16(header)
    return header[:10] + struct.pack("!H", checksum) + header[12:] + payload


def udp_segment(source_port: int, destination_port: int, payload: bytes) -> bytes:
    return struct.pack("!HHHH", source_port, destination_port, 8 + len(payload), 0) + payload


def ethernet_frame(payload: bytes, ethertype: int = 0x0800) -> bytes:
    destination = bytes.fromhex("001122334455")
    source = bytes.fromhex("66778899aabb")
    return destination + source + struct.pack("!H", ethertype) + payload


def make_pcap(path: Path, relay: str, token: str, year: int) -> bytes:
    packets: list[bytes] = []
    source = bytes([10, 13, 0, 27])
    destination = bytes([10, 13, 0, 1])

    messages = [
        f"BT-HELLO relay={relay}".encode(),
        f"retained-token={token}".encode(),
        f"archive-year={year}".encode(),
        b"status=preserved",
    ]

    for index, message in enumerate(messages, start=1):
        udp = udp_segment(31337, 31338, message)
        ip = ipv4_packet(source, destination, 17, udp, index)
        packets.append(ethernet_frame(ip))

    output = io.BytesIO()
    # Little-endian PCAP, Ethernet.
    output.write(struct.pack("<IHHIIII", 0xA1B2C3D4, 2, 4, 0, 0, 65535, 1))
    epoch = 946684800 + (year % 20) * 86400

    for index, packet in enumerate(packets):
        output.write(struct.pack("<IIII", epoch + index, index * 1000, len(packet), len(packet)))
        output.write(packet)

    raw = output.getvalue()
    path.write_bytes(raw)
    return raw


def artifact_record(
    artifact_id: str,
    filename: str,
    virtual_path: str,
    title: str,
    description: str,
    mime_type: str,
    category: str,
    raw: bytes,
) -> dict[str, Any]:
    return {
        "id": artifact_id,
        "filename": filename,
        "virtual_path": virtual_path,
        "title": title,
        "description": description,
        "mime_type": mime_type,
        "category": category,
        "requires_solved": 0,
        "size": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
    }


def generate_investigation(
    paths: GeneratorPaths,
    *,
    seed: str | None,
    difficulty: int,
) -> dict[str, Any]:
    normalized_seed = normalize_seed(seed)
    numeric_seed = seed_number(normalized_seed)
    rng = random.Random(numeric_seed)
    difficulty = max(1, min(5, int(difficulty)))

    registry: list[dict[str, Any]] = []
    if paths.registry_path.exists():
        registry = json.loads(paths.registry_path.read_text(encoding="utf-8"))

    existing = next(
        (item for item in registry if item["seed"] == normalized_seed),
        None,
    )
    if existing:
        cases = json.loads(paths.cases_path.read_text(encoding="utf-8"))
        case = next(item for item in cases if item["id"] == existing["case_id"])
        return {
            "created": False,
            "seed": normalized_seed,
            "case": case,
            "artifact_ids": existing["artifact_ids"],
            "mail": existing["mail"],
        }

    cases = json.loads(paths.cases_path.read_text(encoding="utf-8"))
    artifacts = json.loads(paths.artifacts_path.read_text(encoding="utf-8"))

    sequence = max((item.get("sequence", 0) for item in cases), default=0) + 1
    relay_number = rng.choice([21, 23, 27, 31, 34, 39, 42, 47])
    relay = f"R-{relay_number}"
    operator = rng.choice(OPERATORS)
    location, region = rng.choice(LOCATIONS)
    year = rng.randint(1994, 2014)
    token = rng.choice(SAFE_WORDS)
    code = rng.choice(SAFE_WORDS)
    title = rng.choice(TITLE_PATTERNS).format(
        adjective=rng.choice(ADJECTIVES),
        noun=rng.choice(NOUNS),
        code=code,
    )
    category = rng.choice(CATEGORIES)
    case_id = f"proc-{normalized_seed.lower().replace('-', '')}"
    slug = slugify(title)

    narrative = build_narrative(
        rng,
        context=NarrativeContext(
            seed=normalized_seed,
            title=title,
            difficulty=difficulty,
            location=location,
            region=region,
            year=year,
            token=token,
            world_state_path=paths.world_state_path,
        ),
        operator=operator,
    )
    relay = narrative["indicators"]["relay_id"]

    generated_dir = paths.artifacts_dir / "generated" / normalized_seed
    generated_dir.mkdir(parents=True, exist_ok=True)

    prefix = normalized_seed.lower().replace("-", "")
    log_name = f"{prefix}_relay.log"
    json_name = f"{prefix}_manifest.json"
    png_name = f"{prefix}_frame.png"
    wav_name = f"{prefix}_transmission.wav"
    pcap_name = f"{prefix}_capture.pcap"
    zip_name = f"{prefix}_evidence.zip"
    dossier_name = f"{prefix}_intelligence_dossier.txt"

    technical = narrative["technical_observations"]
    indicators = narrative["indicators"]
    threat = narrative["threat_assessment"]
    custody = narrative["chain_of_custody"]

    timeline_lines = "\n".join(
        f"{item['time']} | {item['event']}"
        for item in narrative["timeline"]
    )

    log_content = "\n".join(
        [
            "ARCHIVE INTELLIGENCE DIRECTORATE",
            narrative["division"],
            "CLASSIFICATION=ARCHIVE // OBSERVER",
            f"SEED={normalized_seed}",
            f"CASE={title}",
            f"RELAY={relay}",
            f"CLUSTER={indicators['cluster']}",
            f"OPERATOR={operator}",
            f"LOCATION={location}",
            f"REGION={region}",
            f"LAST_CONFIRMED_YEAR={year}",
            f"PROTOCOL={indicators['protocol']}",
            f"ENCRYPTION={indicators['encryption']}",
            f"PACKETS_RECOVERED={technical['recovered_packets']}",
            f"MALFORMED_PACKETS={technical['malformed_packets']}",
            f"CLOCK_DRIFT_SECONDS={technical['clock_drift_seconds']}",
            f"PERSISTENCE={technical['persistence']}",
            f"ATTRIBUTION={threat['attribution']}",
            f"RETAINED_TOKEN={token}",
            "",
            "TIMELINE RECONSTRUCTION",
            timeline_lines,
            "",
            "ANALYST COMMENT",
            narrative["analyst_note"],
            "",
        ]
    )

    manifest = {
        "seed": normalized_seed,
        "title": title,
        "relay": relay,
        "operator": operator,
        "location": location,
        "region": region,
        "last_confirmed_year": year,
        "retained_token": token,
        "classification": narrative["classification"],
        "priority": narrative["priority"],
        "status": narrative["status"],
        "directorate": narrative["directorate"],
        "division": narrative["division"],
        "indicators": indicators,
        "technical_observations": technical,
        "threat_assessment": threat,
        "chain_of_custody": custody,
        "timeline": narrative["timeline"],
    }

    raw_log = make_text_artifact(generated_dir / log_name, log_content)
    raw_json = make_text_artifact(
        generated_dir / json_name,
        json.dumps(manifest, indent=2) + "\n",
    )
    raw_png = make_png(generated_dir / png_name, title, relay, token, normalized_seed)
    raw_wav = make_wav(generated_dir / wav_name, token, rng)
    raw_pcap = make_pcap(generated_dir / pcap_name, relay, token, year)

    dossier_sections = [
        narrative["directorate"],
        narrative["division"],
        "",
        f"CLASSIFICATION: {narrative['classification']}",
        f"PRIORITY: {narrative['priority']}",
        f"STATUS: {narrative['status']}",
        f"CASE DESIGNATION: {title}",
        f"SEED: {normalized_seed}",
        "",
        "EXECUTIVE SUMMARY",
        narrative["executive_summary"],
        "",
        "INCIDENT OVERVIEW",
        narrative["incident_overview"],
        "",
        "PRELIMINARY ASSESSMENT",
        narrative["preliminary_assessment"],
        "",
        "ANALYST COMMENT",
        narrative["analyst_note"],
        "",
        "THREAT ASSESSMENT",
        json.dumps(narrative["threat_assessment"], indent=2),
        "",
        "TECHNICAL OBSERVATIONS",
        json.dumps(narrative["technical_observations"], indent=2),
        "",
        "INDICATORS",
        json.dumps(narrative["indicators"], indent=2),
        "",
        "TIMELINE RECONSTRUCTION",
        "\n".join(
            f"{item['year']} {item['time']}  {item['event']}"
            for item in narrative["timeline"]
        ),
        "",
        "CHAIN OF CUSTODY",
        json.dumps(narrative["chain_of_custody"], indent=2),
        "",
        "DECLASSIFIED FRAGMENT",
        narrative["lore_fragment"],
    ]
    raw_dossier = make_text_artifact(
        generated_dir / dossier_name,
        "\n".join(dossier_sections) + "\n",
    )

    with zipfile.ZipFile(generated_dir / zip_name, "w", zipfile.ZIP_DEFLATED) as bundle:
        bundle.writestr("README.txt", (
            f"BLACKTERM GENERATED INVESTIGATION\n"
            f"SEED: {normalized_seed}\n"
            f"CASE: {title}\n\n"
            "All included network and media artifacts are synthetic and benign.\n"
        ))
        bundle.write(generated_dir / log_name, log_name)
        bundle.write(generated_dir / json_name, json_name)
        bundle.write(generated_dir / png_name, png_name)
        bundle.write(generated_dir / pcap_name, pcap_name)
        bundle.write(generated_dir / dossier_name, dossier_name)
    raw_zip = (generated_dir / zip_name).read_bytes()

    artifact_specs = [
        (f"{prefix}-log", log_name, "text/plain", "log", raw_log, "Recovered relay activity log."),
        (f"{prefix}-manifest", json_name, "application/json", "data", raw_json, "Recovered relay manifest."),
        (f"{prefix}-frame", png_name, "image/png", "image", raw_png, "Recovered surveillance-style clue frame."),
        (f"{prefix}-audio", wav_name, "audio/wav", "audio", raw_wav, "Synthetic encoded relay transmission."),
        (f"{prefix}-pcap", pcap_name, "application/vnd.tcpdump.pcap", "network", raw_pcap, "Safe synthetic packet capture."),
        (f"{prefix}-dossier", dossier_name, "text/plain", "intelligence", raw_dossier, "Generated intelligence dossier."),
        (f"{prefix}-bundle", zip_name, "application/zip", "archive", raw_zip, "Generated evidence bundle."),
    ]

    new_artifacts = []
    for artifact_id, filename, mime_type, artifact_category, raw, description in artifact_specs:
        new_artifacts.append(
            artifact_record(
                artifact_id,
                f"generated/{normalized_seed}/{filename}",
                f"/archive/generated/{normalized_seed}/{filename}",
                filename,
                description,
                mime_type,
                artifact_category,
                raw,
            )
        )

    salt_base = hashlib.sha256(normalized_seed.encode()).hexdigest()[:12]
    objective_values = [
        ("relay-id", "Identify the affected relay.", relay),
        ("operator", "Identify the assigned operator.", operator),
        ("retained-token", "Recover the retained token.", token),
    ]
    if difficulty >= 3:
        objective_values.append(
            ("last-year", "Determine the last confirmed year.", str(year))
        )
    if difficulty >= 5:
        objective_values.append(
            ("location", "Identify the relay's last confirmed city.", location)
        )

    objectives = []
    for objective_id, prompt, answer in objective_values:
        salt = f"{case_id}-{objective_id}-{salt_base}"
        objectives.append({
            "id": objective_id,
            "prompt": prompt,
            "salt": salt,
            "answer_hash": hash_answer(answer, salt),
        })

    evidence = [
        {
            "artifact_id": artifact["id"],
            "label": Path(artifact["filename"]).name,
            "description": artifact["description"],
        }
        for artifact in new_artifacts
    ]

    briefing = narrative["executive_summary"]

    reward = (
        f"CASE RESOLVED. {relay} retained token {token}. "
        f"Threat assessment remains {narrative['threat_assessment']['attribution']}. "
        f"Seed {normalized_seed} has been archived."
    )

    case = {
        "id": case_id,
        "sequence": sequence,
        "slug": slug,
        "title": title,
        "difficulty": difficulty,
        "category": category,
        "status": "active",
        "requires_solved_nodes": 0,
        "briefing": briefing,
        "objectives": objectives,
        "evidence": evidence,
        "reward": {
            "message": reward,
            "unlocks": [f"{case_id}-report.txt"],
        },
        "procedural": True,
        "seed": normalized_seed,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "narrative": narrative,
    }

    cases.append(case)
    cases.sort(key=lambda item: item["sequence"])
    artifacts.extend(new_artifacts)

    write_json(paths.cases_path, cases)
    write_json(paths.artifacts_path, artifacts)

    mail_body = "\n".join(
        [
            "CLASSIFICATION: ARCHIVE // OBSERVER",
            f"CASE: {title}",
            f"SEED: {normalized_seed}",
            "",
            "Observer,",
            "",
            (
                f"You have been assigned investigative authority over {relay}. "
                f"Preliminary evidence indicates {narrative['phenomenon']}."
            ),
            "",
            "ASSESSMENT:",
            narrative["preliminary_assessment"],
            "",
            f"OPERATIONAL RISK: {narrative['threat_assessment']['operational_risk']}",
            f"CONFIDENCE: {narrative['threat_assessment']['confidence']}",
            f"ATTRIBUTION: {narrative['threat_assessment']['attribution']}",
            "",
            (
                "All recovered artifacts have been mirrored to your workspace. "
                "Preserve original timestamps and chain-of-custody metadata."
            ),
            "",
            "ARCHIVE OPERATIONS",
            "",
        ]
    )

    mail = {
        "sender": rng.choice([
            "ARCHIVE OPERATIONS",
            "SIGNALS ANALYSIS DIVISION",
            "RELAY RECOVERY UNIT",
            "TECHNICAL COLLECTION DIRECTORATE",
        ]),
        "subject": f"Observer assignment // {relay} // {narrative['priority']}",
        "body": mail_body,
    }

    organization = rng.choice([
        "Archive Operations",
        "Signals Directorate",
        "Recovery Unit",
        "Internal Oversight",
        "Protocol Authority",
    ])
    world_state, world_unlocks = record_generated_case(
        paths.world_state_path,
        seed=normalized_seed,
        case_id=case_id,
        title=title,
        relay=relay,
        relay_cluster=narrative["indicators"]["cluster"],
        operator=operator,
        protocol=narrative["indicators"]["protocol"],
        location=location,
        organization=organization,
        narrative=narrative,
    )

    registry.append({
        "seed": normalized_seed,
        "case_id": case_id,
        "artifact_ids": [item["id"] for item in new_artifacts],
        "mail": mail,
        "generated_at": case["generated_at"],
        "world_state_count": world_state["generated_cases"],
    })
    write_json(paths.registry_path, registry)

    return {
        "created": True,
        "seed": normalized_seed,
        "case": case,
        "artifact_ids": [item["id"] for item in new_artifacts],
        "mail": mail,
        "world_unlocks": world_unlocks,
        "world_state": {
            "generated_cases": world_state["generated_cases"],
            "known_relays": len(world_state["entities"]["relays"]),
            "known_operators": len(world_state["entities"]["operators"]),
        },
    }


def list_generated(paths: GeneratorPaths) -> list[dict[str, Any]]:
    if not paths.registry_path.exists():
        return []
    return json.loads(paths.registry_path.read_text(encoding="utf-8"))
