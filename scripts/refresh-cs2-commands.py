#!/usr/bin/env python3
"""Fetch/parse ArminC CS2 cvarlist and write data/cs2-commands.json."""

from __future__ import annotations

import argparse
import html
import json
import re
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_URL = (
    "https://raw.githubusercontent.com/ArmynC/ArminC-CS2-Cvars/main/cvars/cvarlist.md"
)
OUT_PATH = ROOT / "data" / "cs2-commands.json"
SECTION_GLOBS = [
    ROOT / "js" / "crosshair-settings.js",
    *sorted((ROOT / "js" / "sections").glob("*.js")),
]

DEFAULT_RE = re.compile(r"^Default:\s*(\S+)\s*(.*)$", re.DOTALL)
HTML_TAG_RE = re.compile(r"<[^>]+>")
SETTING_START_RE = re.compile(r"(?P<name>[a-zA-Z_][\w]*)\s*:\s*\{")
TYPE_RE = re.compile(r"\btype:\s*['\"](\w+)['\"]")
MIN_RE = re.compile(r"\bmin:\s*(-?\d+(?:\.\d+)?)")
MAX_RE = re.compile(r"\bmax:\s*(-?\d+(?:\.\d+)?)")
STEP_RE = re.compile(r"\bstep:\s*(-?\d+(?:\.\d+)?)")
OPTION_VALUE_RE = re.compile(r"value:\s*(-?\d+(?:\.\d+)?|['\"][^'\"]+['\"])")
SKIP_SETTING_NAMES = {"settings", "groups", "options", "enabledWhen"}
DEFAULT_CATEGORY = "Other"

# First matching rule wins. Patterns: exact name, prefix (endswith *), or regex (re:…).
CATEGORY_RULES: list[tuple[str, str]] = [
    # Crosshair
    ("cl_crosshair*", "Crosshair"),
    ("cl_grenadecrosshair*", "Crosshair"),
    ("cl_fixedcrosshair*", "Crosshair"),
    ("cl_sniper_delay_unscope", "Crosshair"),
    ("cl_sniper_show_inaccuracy", "Crosshair"),
    # Viewmodel
    ("viewmodel_*", "Viewmodel"),
    ("cl_righthand", "Viewmodel"),
    # Radar (before broader HUD cl_hud*)
    ("cl_radar*", "Radar"),
    ("cl_hud_radar*", "Radar"),
    # FPS / Performance (before broader HUD)
    ("fps_*", "FPS / Performance"),
    ("cl_showfps", "FPS / Performance"),
    ("cl_hud_telemetry*", "FPS / Performance"),
    ("r_show_build_info", "FPS / Performance"),
    ("cl_interp*", "FPS / Performance"),
    ("cl_updaterate", "FPS / Performance"),
    ("cl_cmdrate", "FPS / Performance"),
    ("rate", "FPS / Performance"),
    ("engine_no_focus_sleep", "FPS / Performance"),
    # HUD
    ("hud_*", "HUD"),
    ("cl_hud*", "HUD"),
    ("safezone*", "HUD"),
    ("cl_drawhud", "HUD"),
    ("cl_draw_only_deathnotices", "HUD"),
    ("cl_showloadout", "HUD"),
    ("cl_teamid*", "HUD"),
    ("cl_teamcounter*", "HUD"),
    ("cl_hide_avatar_images", "HUD"),
    ("cl_allow_animated_avatars", "HUD"),
    ("cl_scoreboard*", "HUD"),
    ("cl_show_clan*", "HUD"),
    # Mouse / Input
    ("sensitivity", "Mouse / Input"),
    ("zoom_sensitivity*", "Mouse / Input"),
    ("m_*", "Mouse / Input"),
    ("cl_mouselook", "Mouse / Input"),
    ("cl_pitch*", "Mouse / Input"),
    ("cl_yaw*", "Mouse / Input"),
    ("option_duck_method", "Mouse / Input"),
    ("option_speed_method", "Mouse / Input"),
    # Audio
    ("snd_*", "Audio"),
    ("voice_*", "Audio"),
    ("volume", "Audio"),
    ("dsp_*", "Audio"),
    ("adsp_*", "Audio"),
    ("sndplaydelay", "Audio"),
    # Graphics / Rendering
    ("r_*", "Graphics"),
    ("mat_*", "Graphics"),
    ("gpu_*", "Graphics"),
    ("csm_*", "Graphics"),
    ("cl_particle*", "Graphics"),
    ("cl_ragdoll*", "Graphics"),
    ("violence_*", "Graphics"),
    ("fog_*", "Graphics"),
    ("cl_disable_ragdolls", "Graphics"),
    # Network
    ("net_*", "Network"),
    ("cl_resend", "Network"),
    ("cl_timeout", "Network"),
    ("cl_lagcompensation", "Network"),
    ("cl_predict*", "Network"),
    ("mm_*", "Network"),
    ("connect", "Network"),
    ("disconnect", "Network"),
    ("retry", "Network"),
    # Server / Match
    ("sv_*", "Server / Match"),
    ("mp_*", "Server / Match"),
    ("bot_*", "Server / Match"),
    ("tv_*", "Server / Match"),
    ("spec_*", "Server / Match"),
    ("cash_*", "Server / Match"),
    ("ff_damage*", "Server / Match"),
    ("game_mode", "Server / Match"),
    ("game_type", "Server / Match"),
    ("map", "Server / Match"),
    ("map_workshop", "Server / Match"),
    ("changelevel", "Server / Match"),
    ("host_*", "Server / Match"),
    ("status", "Server / Match"),
    ("users", "Server / Match"),
    ("kickid", "Server / Match"),
    ("banid", "Server / Match"),
    # Demo / Replay
    ("demo*", "Demo / Replay"),
    ("record", "Demo / Replay"),
    ("stop", "Demo / Replay"),
    ("playdemo", "Demo / Replay"),
    ("timedemo*", "Demo / Replay"),
    ("ds_*", "Demo / Replay"),
    # Console / Config
    ("exec", "Console / Config"),
    ("execifexists", "Console / Config"),
    ("alias", "Console / Config"),
    ("con_*", "Console / Config"),
    ("cvarlist", "Console / Config"),
    ("find", "Console / Config"),
    ("help", "Console / Config"),
    ("clear", "Console / Config"),
    ("condump", "Console / Config"),
    ("key_listboundkeys", "Console / Config"),
    ("key_findbinding", "Console / Config"),
    # Binds / Input actions (+/- and bind family) — near end so specific prefixes win first
    ("bind", "Binds / Input actions"),
    ("bind_osx", "Binds / Input actions"),
    ("bindtoggle", "Binds / Input actions"),
    ("unbind", "Binds / Input actions"),
    ("unbindall", "Binds / Input actions"),
    ("re:^[+\\-].+", "Binds / Input actions"),
]


def categorize_command(name: str) -> str:
    lowered = name.lower()
    for pattern, category in CATEGORY_RULES:
        if pattern.startswith("re:"):
            if re.search(pattern[3:], name, re.IGNORECASE):
                return category
            continue
        if pattern.endswith("*"):
            if lowered.startswith(pattern[:-1].lower()):
                return category
            continue
        if lowered == pattern.lower():
            return category
    return DEFAULT_CATEGORY


def fetch_text(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "cs2-config-generator-refresh/1.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read().decode("utf-8")


# Drop markdown / dump escapes like \[ \] \| and "\ " before punctuation/whitespace.
MD_ESCAPE_RE = re.compile(r"\\([^A-Za-z0-9]|$)")


def clean_help_text(raw: str) -> str:
    """Normalize ArminC help text (<br>, HTML entities, markdown escapes)."""
    text = raw.replace("<br>", " ").replace("<br/>", " ").replace("<br />", " ")
    text = HTML_TAG_RE.sub(" ", text)
    text = html.unescape(text)
    text = MD_ESCAPE_RE.sub(r"\1", text)
    return re.sub(r"\s+", " ", text).strip()


def parse_flags(raw: str) -> list[str]:
    raw = raw.strip()
    if not raw:
        return []
    return [part.strip() for part in raw.split(",") if part.strip()]


def split_default(help_text: str) -> tuple[str | None, str]:
    text = clean_help_text(help_text)
    match = DEFAULT_RE.match(text)
    if not match:
        return None, text
    default, rest = match.group(1), match.group(2).strip()
    return default, rest


RANGE_IN_HELP_RE = re.compile(
    r"(?:Valid values are|values? (?:are|from))\s*(-?\d+(?:\.\d+)?)\s*(?:to|–|-)\s*(-?\d+(?:\.\d+)?)",
    re.IGNORECASE,
)
BRACKET_RANGE_RE = re.compile(r"\[\s*(-?\d+(?:\.\d+)?)\s*(?:to|–|-)\s*(-?\d+(?:\.\d+)?)\s*\]")


def accepted_from_help(description: str) -> str | None:
    for pattern in (RANGE_IN_HELP_RE, BRACKET_RANGE_RE):
        match = pattern.search(description)
        if match:
            return f"{match.group(1)} – {match.group(2)}"
    return None


def infer_kind_and_accepted(
    default: str | None, description: str, flags: list[str]
) -> tuple[str, str]:
    if default is None:
        return "command", "command"
    lowered = default.lower()
    if lowered in {"true", "false"}:
        return "cvar", "bool"
    from_help = accepted_from_help(description)
    if from_help:
        return "cvar", from_help
    return "cvar", "—"


def format_enrichment(meta: dict) -> str | None:
    kind = meta.get("type")
    if kind == "toggle":
        return "0 / 1"
    if kind == "range":
        mn, mx, step = meta.get("min"), meta.get("max"), meta.get("step")
        if mn is None or mx is None:
            return None
        if step is not None:
            return f"{mn} – {mx} (step {step})"
        return f"{mn} – {mx}"
    if kind == "select":
        values = meta.get("options") or []
        if not values:
            return None
        return " / ".join(str(v) for v in values)
    return None


def _brace_body(text: str, open_index: int) -> str | None:
    """Return object body after `{` at open_index, or None if unbalanced."""
    depth = 0
    for i in range(open_index, len(text)):
        ch = text[i]
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[open_index + 1 : i]
    return None


def iter_setting_blocks(text: str):
    for match in SETTING_START_RE.finditer(text):
        name = match.group("name")
        if name in SKIP_SETTING_NAMES:
            continue
        brace_at = match.end() - 1
        body = _brace_body(text, brace_at)
        if body is None:
            continue
        yield name, body


def extract_section_enrichments(paths: list[Path]) -> dict[str, str]:
    enrichments: dict[str, str] = {}
    skip_files = {"index.js", "binds.js"}

    for path in paths:
        if path.name in skip_files or not path.is_file():
            continue
        text = path.read_text(encoding="utf-8")
        for name, body in iter_setting_blocks(text):
            type_match = TYPE_RE.search(body)
            if not type_match:
                continue
            # Skip containers that nest other typed settings
            if body.count("type:") > 1 and name in {"settings"}:
                continue
            setting_type = type_match.group(1)
            if setting_type not in {"range", "toggle", "select"}:
                continue
            meta: dict = {"type": setting_type}
            if setting_type == "range":
                mn = MIN_RE.search(body)
                mx = MAX_RE.search(body)
                step = STEP_RE.search(body)
                if mn:
                    meta["min"] = _num(mn.group(1))
                if mx:
                    meta["max"] = _num(mx.group(1))
                if step:
                    meta["step"] = _num(step.group(1))
            elif setting_type == "select":
                values = []
                for opt in OPTION_VALUE_RE.finditer(body):
                    raw = opt.group(1)
                    if raw.startswith(("'", '"')):
                        values.append(raw[1:-1])
                    else:
                        values.append(_num(raw))
                meta["options"] = values
            accepted = format_enrichment(meta)
            if accepted:
                enrichments[name] = accepted
    return enrichments


def _num(raw: str):
    if "." in raw:
        return float(raw)
    return int(raw)


def parse_cvarlist(md: str) -> list[dict]:
    commands: list[dict] = []
    for line in md.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "|" not in line:
            continue
        parts = [p.strip() for p in line.split("|")]
        # Tolerate trailing empty from trailing pipe
        while parts and parts[-1] == "":
            parts.pop()
        if len(parts) < 2:
            continue
        name = parts[0]
        if name in {"Name", "----"} or set(name) <= {"-", " "}:
            continue
        if name.startswith("---"):
            continue
        flags_raw = parts[1] if len(parts) > 1 else ""
        help_raw = parts[2] if len(parts) > 2 else ""
        # Rejoin description if extra pipes appear in help text
        if len(parts) > 3:
            help_raw = " | ".join(parts[2:])

        flags = parse_flags(flags_raw)
        default, description = split_default(help_raw)
        kind, accepted = infer_kind_and_accepted(default, description, flags)
        commands.append(
            {
                "name": name,
                "flags": flags,
                "default": default if default is not None else "",
                "description": description,
                "accepted": accepted,
                "kind": kind,
                "category": categorize_command(name),
            }
        )
    return commands


def build_catalog(md: str, enrichments: dict[str, str], source: str) -> dict:
    commands = parse_cvarlist(md)
    for entry in commands:
        enriched = enrichments.get(entry["name"])
        if enriched:
            entry["accepted"] = enriched
    commands.sort(key=lambda c: c["name"].lower())
    categories = sorted({c["category"] for c in commands}, key=str.lower)
    return {
        "meta": {
            "source": source,
            "fetchedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "count": len(commands),
            "enrichmentCount": sum(1 for c in commands if c["name"] in enrichments),
            "categories": categories,
        },
        "commands": commands,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--url",
        default=DEFAULT_URL,
        help="Raw markdown URL (default: ArminC cvarlist.md)",
    )
    parser.add_argument(
        "--input",
        type=Path,
        help="Local cvarlist.md path (skips download)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=OUT_PATH,
        help=f"Output JSON path (default: {OUT_PATH})",
    )
    args = parser.parse_args()

    if args.input:
        source = str(args.input)
        md = args.input.read_text(encoding="utf-8")
    else:
        source = args.url
        print(f"Fetching {source} …", file=sys.stderr)
        md = fetch_text(args.url)

    enrichments = extract_section_enrichments(SECTION_GLOBS)
    catalog = build_catalog(md, enrichments, source)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(catalog, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    meta = catalog["meta"]
    print(
        f"Wrote {args.output} ({meta['count']} commands, "
        f"{meta['enrichmentCount']} enriched)",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
