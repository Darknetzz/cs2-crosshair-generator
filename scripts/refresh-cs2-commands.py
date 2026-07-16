#!/usr/bin/env python3
"""Fetch/parse a CS2 cvar dump and write data/cs2-commands.json.

Supported input formats:
  - Nihilnia markdown tables (| Command | Default | Flags | Description |)
  - ArminC markdown (| Name | Flags | Description | with Default: in help)
  - Native console cvarlist text (name : default : flags : help)
"""

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
# Fresher public dump (~2.7k) + older unhide dump (~5k) merged by default.
NIHILNIA_URL = (
    "https://raw.githubusercontent.com/Nihilnia/CounterStrike/main/"
    "Counter%20Strike%202/List%20of%20console%20commands%20and%20variables.md"
)
ARMINC_URL = (
    "https://raw.githubusercontent.com/ArmynC/ArminC-CS2-Cvars/main/cvars/cvarlist.md"
)
DEFAULT_URLS = (NIHILNIA_URL, ARMINC_URL)
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


def parse_cvarlist(text: str) -> list[dict]:
    """Auto-detect dump format and return command dicts (may include dupes)."""
    if "| Command |" in text or "|Command|" in text:
        return _parse_nihilnia_md(text)
    if "| Name |" in text or text.lstrip().startswith("Name |"):
        return _parse_arminc_md(text)
    return _parse_native_cvarlist(text)


def _strip_name(raw: str) -> str:
    return raw.strip().strip("`").strip()


def _parse_nihilnia_md(md: str) -> list[dict]:
    """| Command | Default Value | Flags | Description |"""
    commands: list[dict] = []
    for line in md.splitlines():
        line = line.strip()
        if "|" not in line:
            continue
        parts = [p.strip() for p in line.split("|")]
        while parts and parts[0] == "":
            parts.pop(0)
        while parts and parts[-1] == "":
            parts.pop()
        if len(parts) < 3:
            continue
        name = _strip_name(parts[0])
        if not name or name in {"Command", "----"} or set(name) <= {"-", ":", " "}:
            continue
        if name.startswith("---") or name.startswith(":--"):
            continue
        default_raw = parts[1].strip() if len(parts) > 1 else ""
        flags_raw = parts[2] if len(parts) > 2 else ""
        description = parts[3] if len(parts) > 3 else ""
        if len(parts) > 4:
            description = " | ".join(parts[3:])

        description = clean_help_text(description)
        flags = parse_flags(flags_raw)
        default_raw = default_raw.strip()
        if default_raw.lower() == "cmd":
            default = ""
            kind, accepted = "command", "command"
        else:
            default = default_raw
            kind, accepted = infer_kind_and_accepted(
                default if default else None, description, flags
            )

        commands.append(
            {
                "name": name,
                "flags": flags,
                "default": default,
                "description": description,
                "accepted": accepted,
                "kind": kind,
                "category": categorize_command(name),
            }
        )
    return commands


def _parse_arminc_md(md: str) -> list[dict]:
    """Name | Flags | Description (Default: embedded in help)."""
    commands: list[dict] = []
    for line in md.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "|" not in line:
            continue
        parts = [p.strip() for p in line.split("|")]
        while parts and parts[-1] == "":
            parts.pop()
        if len(parts) < 2:
            continue
        name = _strip_name(parts[0])
        if name in {"Name", "----"} or set(name) <= {"-", " "}:
            continue
        if name.startswith("---"):
            continue
        flags_raw = parts[1] if len(parts) > 1 else ""
        help_raw = parts[2] if len(parts) > 2 else ""
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


NATIVE_LINE_RE = re.compile(
    r"^(\S+)\s+:\s+(.*?)\s+:\s+(.*?)\s+:\s*(.*)$"
)


def _parse_native_cvarlist(text: str) -> list[dict]:
    """Console `cvarlist` lines: name : default : flags : description."""
    commands: list[dict] = []
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("cvar list") or set(line) <= {"-"}:
            continue
        # Strip optional [Console] prefix from pasted logs
        if line.startswith("[Console]"):
            line = line[len("[Console]") :].strip()
        match = NATIVE_LINE_RE.match(line)
        if not match:
            continue
        name, default_raw, flags_raw, description = match.groups()
        name = _strip_name(name)
        description = clean_help_text(description)
        flags = parse_flags(flags_raw)
        default_raw = default_raw.strip()
        if default_raw.lower() == "cmd":
            default = ""
            kind, accepted = "command", "command"
        else:
            default = default_raw
            kind, accepted = infer_kind_and_accepted(default or None, description, flags)
        commands.append(
            {
                "name": name,
                "flags": flags,
                "default": default,
                "description": description,
                "accepted": accepted,
                "kind": kind,
                "category": categorize_command(name),
            }
        )
    return commands


def merge_entry(base: dict, overlay: dict) -> dict:
    """Merge two records for the same cvar. Overlay fills gaps and updates fields."""
    b_flags = base.get("flags") or []
    o_flags = overlay.get("flags") or []
    b_desc = (base.get("description") or "").strip()
    o_desc = (overlay.get("description") or "").strip()
    b_default = base.get("default") or ""
    o_default = overlay.get("default") or ""
    b_accepted = base.get("accepted") or "—"
    o_accepted = overlay.get("accepted") or "—"

    # Prefer overlay default when it has real help text, or when base has none.
    # Avoid sparse newer dumps overwriting a known default with a bare "0".
    if o_default and (o_desc or not b_default):
        default = o_default
    else:
        default = b_default
    description = o_desc if (o_desc and (not b_desc or len(o_desc) >= len(b_desc))) else b_desc
    if o_accepted not in ("", "—"):
        accepted = o_accepted
    elif b_accepted not in ("", "—"):
        accepted = b_accepted
    else:
        accepted = "—"

    kind = overlay.get("kind") or base.get("kind") or "cvar"
    if accepted == "command" and not default:
        kind = "command"
    elif default or accepted == "bool":
        kind = "cvar"

    name = base["name"]
    return {
        "name": name,
        "flags": list(dict.fromkeys([*b_flags, *o_flags])),
        "default": default,
        "description": description,
        "accepted": accepted,
        "kind": kind,
        "category": categorize_command(name),
    }


def merge_command_lists(*lists: list[dict]) -> list[dict]:
    """Union by name. Earlier lists are the base; later lists overlay."""
    by_name: dict[str, dict] = {}
    for entries in lists:
        for entry in entries:
            name = entry["name"]
            if name not in by_name:
                by_name[name] = dict(entry)
                by_name[name]["category"] = categorize_command(name)
            else:
                by_name[name] = merge_entry(by_name[name], entry)
    return list(by_name.values())


def build_catalog(
    command_lists: list[list[dict]],
    enrichments: dict[str, str],
    sources: list[str],
) -> dict:
    commands = merge_command_lists(*command_lists)
    for entry in commands:
        enriched = enrichments.get(entry["name"])
        if enriched:
            entry["accepted"] = enriched
    commands.sort(key=lambda c: c["name"].lower())
    categories = sorted({c["category"] for c in commands}, key=str.lower)
    return {
        "meta": {
            "source": " + ".join(sources) if len(sources) > 1 else (sources[0] if sources else ""),
            "sources": sources,
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
        action="append",
        dest="urls",
        help="Dump URL (repeatable). Default: Nihilnia + ArminC merged",
    )
    parser.add_argument(
        "--input",
        action="append",
        type=Path,
        dest="inputs",
        help="Local dump path (repeatable): .md or native cvarlist .txt",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=OUT_PATH,
        help=f"Output JSON path (default: {OUT_PATH})",
    )
    args = parser.parse_args()

    sources: list[str] = []
    command_lists: list[list[dict]] = []

    if args.inputs:
        for path in args.inputs:
            print(f"Reading {path} …", file=sys.stderr)
            text = path.read_text(encoding="utf-8")
            sources.append(str(path))
            command_lists.append(parse_cvarlist(text))
    else:
        urls = args.urls if args.urls else list(DEFAULT_URLS)
        for url in urls:
            print(f"Fetching {url} …", file=sys.stderr)
            text = fetch_text(url)
            sources.append(url)
            command_lists.append(parse_cvarlist(text))

    # Overlay order: first list is base, later lists win on non-empty fields.
    # Put ArminC first (broader), Nihilnia second (fresher public values) when using defaults.
    if not args.inputs and not args.urls:
        # DEFAULT_URLS is (Nihilnia, ArminC) — reorder to ArminC base + Nihilnia overlay
        if len(command_lists) == 2 and sources[0] == NIHILNIA_URL and sources[1] == ARMINC_URL:
            command_lists = [command_lists[1], command_lists[0]]
            sources = [sources[1], sources[0]]

    enrichments = extract_section_enrichments(SECTION_GLOBS)
    catalog = build_catalog(command_lists, enrichments, sources)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(catalog, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    meta = catalog["meta"]
    print(
        f"Wrote {args.output} ({meta['count']} commands, "
        f"{meta['enrichmentCount']} enriched, {len(sources)} source(s))",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
