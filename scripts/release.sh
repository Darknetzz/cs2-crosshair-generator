#!/usr/bin/env bash
# Cut a SemVer release: rotate CHANGELOG.md [Unreleased], commit, annotated tag.
# Does not push. See AGENTS.md → Releases & changelog.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

CHANGELOG="CHANGELOG.md"
DRY_RUN=0
SUGGEST=0

usage() {
  cat <<'EOF'
Usage: scripts/release.sh [--dry-run] [--suggest] [--help]

  Interactive SemVer release. Prompts for version; default is patch+1
  from the latest vX.Y.Z tag (or 0.1.0 if none).

  VERSION=1.2.0 scripts/release.sh   Skip prompt (scripted / non-TTY)
  --dry-run                          Show actions without writing/committing
  --suggest                          Print git-cliff --bumped-version and exit
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --suggest) SUGGEST=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ "$SUGGEST" -eq 1 ]]; then
  if command -v git-cliff >/dev/null 2>&1; then
    git-cliff --bumped-version || true
  else
    echo "git-cliff is not installed" >&2
    exit 1
  fi
  exit 0
fi

if [[ ! -f "$CHANGELOG" ]]; then
  echo "Missing $CHANGELOG" >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree is dirty. Commit or stash changes before releasing." >&2
  git status --short >&2
  exit 1
fi

# Latest vX.Y.Z tag (version sort), or empty
latest_tag() {
  git tag -l 'v[0-9]*' --sort=-v:refname | head -n1
}

# Suggest next version: patch+1, or 0.1.0 if no tags
default_version() {
  local tag
  tag="$(latest_tag)"
  if [[ -z "$tag" ]]; then
    echo "0.1.0"
    return
  fi
  local ver="${tag#v}"
  if [[ ! "$ver" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
    echo "0.1.0"
    return
  fi
  local major="${BASH_REMATCH[1]}"
  local minor="${BASH_REMATCH[2]}"
  local patch="${BASH_REMATCH[3]}"
  echo "${major}.${minor}.$((patch + 1))"
}

normalize_version() {
  local v="$1"
  v="${v#v}"
  v="${v#"${v%%[![:space:]]*}"}"
  v="${v%"${v##*[![:space:]]}"}"
  echo "$v"
}

valid_version() {
  [[ "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]
}

DEFAULT_VER="$(default_version)"
CHOSEN=""

if [[ -n "${VERSION:-}" ]]; then
  CHOSEN="$(normalize_version "$VERSION")"
elif [[ -t 0 ]]; then
  read -r -p "Version [${DEFAULT_VER}]: " input || true
  if [[ -z "${input:-}" ]]; then
    CHOSEN="$DEFAULT_VER"
  else
    CHOSEN="$(normalize_version "$input")"
  fi
else
  # Non-interactive: use default patch bump
  CHOSEN="$DEFAULT_VER"
  echo "No TTY and VERSION unset; using default ${CHOSEN}" >&2
fi

if ! valid_version "$CHOSEN"; then
  echo "Invalid version '${CHOSEN}'. Expected X.Y.Z" >&2
  exit 1
fi

TAG="v${CHOSEN}"
if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "Tag ${TAG} already exists." >&2
  exit 1
fi

# Require at least one markdown bullet under [Unreleased]
if ! python3 - "$CHANGELOG" <<'PY'
import re, sys
path = sys.argv[1]
text = open(path, encoding="utf-8").read()
m = re.search(r"^## \[Unreleased\]\s*\n(.*?)(?=^## \[|\Z)", text, re.M | re.S)
if not m:
    print("No ## [Unreleased] section found in CHANGELOG.md", file=sys.stderr)
    sys.exit(1)
body = m.group(1)
if not re.search(r"^\s*[-*+]\s+\S", body, re.M):
    print("## [Unreleased] has no bullet items. Add release notes before releasing.", file=sys.stderr)
    sys.exit(1)
PY
then
  exit 1
fi

DATE="$(date -u +%Y-%m-%d)"

echo "Will release ${TAG} (${DATE})"
if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "Dry run — no changes written."
  exit 0
fi

python3 - "$CHANGELOG" "$CHOSEN" "$DATE" <<'PY'
import re
import sys
from pathlib import Path

path = Path(sys.argv[1])
version = sys.argv[2]
date = sys.argv[3]
text = path.read_text(encoding="utf-8")

match = re.search(
    r"^(## \[Unreleased\]\s*\n)(.*?)(?=^## \[|\Z)",
    text,
    re.M | re.S,
)
if not match:
    raise SystemExit("No ## [Unreleased] section found")

body = match.group(2)

# Keep only subsections that contain at least one bullet
sections = re.split(r"(?=^### )", body, flags=re.M)
kept = []
for section in sections:
    if not section.strip():
        continue
    if re.match(r"^### ", section) and not re.search(r"^\s*[-*+]\s+\S", section, re.M):
        continue
    kept.append(section.rstrip() + "\n")
released_body = "\n".join(kept).rstrip() + "\n"
if not re.search(r"^\s*[-*+]\s+\S", released_body, re.M):
    raise SystemExit("## [Unreleased] has no bullet items after cleanup")

empty_unreleased = (
    "## [Unreleased]\n"
    "\n"
    "### Added\n"
    "\n"
    "### Changed\n"
    "\n"
    "### Fixed\n"
    "\n"
    "### Removed\n"
    "\n"
)

release_header = f"## [{version}] - {date}\n"

new_text = (
    text[: match.start()]
    + empty_unreleased
    + release_header
    + released_body
    + text[match.end() :]
)

path.write_text(new_text, encoding="utf-8")
print(f"Updated {path} → [{version}] - {date}")
PY

git add "$CHANGELOG"
git commit -m "$(cat <<EOF
chore(release): ${TAG}

EOF
)"
git tag -a "$TAG" -m "Release ${TAG}"

echo
echo "Released ${TAG}."
echo "Push when ready:"
echo "  git push origin HEAD"
echo "  git push origin ${TAG}"
