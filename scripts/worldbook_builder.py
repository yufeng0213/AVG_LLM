#!/usr/bin/env python3
"""
WorldBook Builder (standalone script)

Goal:
- Let creators build importable worldbook JSON from a simple source folder.
- Support portrait sources from:
  1) local files/folders
  2) image-bed URLs (http/https)
- Support background sources from:
  1) local files/folders
  2) image-bed URLs (http/https)
- Portrait mapping format:
  name_emotion_source
  Example:
    USER_default_./assets/user_default.png
    Eve_happy_https://example.com/eve_happy.png
- Background mapping format:
  bg_name_source
  Example:
    bg_library_./assets/backgrounds/bg_library.webp
    bg_street_https://example.com/backgrounds/street.webp
"""

from __future__ import annotations

import argparse
import base64
import csv
import json
import mimetypes
import re
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

try:
    import yaml  # type: ignore
except Exception:
    yaml = None

try:
    from PIL import Image  # type: ignore
except Exception:
    Image = None


ENTRY_KEYS = [
    "overview",
    "era",
    "regions",
    "forces",
    "rules",
    "culture",
    "conflict",
    "secrets",
    "storyHook",
]

VALID_PORTRAIT_STYLES = {"card", "half_body", "full_body", "leg_body"}
VALID_ASSET_MODES = {"hybrid", "lite"}
VALID_EMOTIONS = {
    "default",
    "happy",
    "angry",
    "sad",
    "surprised",
    "fear",
    "disgust",
    "neutral",
    "shy",
    "thinking",
    "sleepy",
    "excited",
    "worried",
    "confident",
    "custom",
}

IMAGE_FILE_EXTENSIONS = {
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".gif",
    ".bmp",
    ".avif",
}

USER_ALIASES = {"user", "lead", "player", "you", "main", "protagonist", "主角", "你", "用户", "玩家", "USER"}


class BuilderError(Exception):
    pass


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def slugify(text: str, fallback: str = "item") -> str:
    value = re.sub(r"[^a-zA-Z0-9_-]+", "_", text.strip()).strip("_")
    return value or fallback


def to_str(value: Any, default: str = "") -> str:
    if value is None:
        return default
    return str(value).strip()


def load_manifest(source_dir: Path) -> Dict[str, Any]:
    candidates = [source_dir / "book.json", source_dir / "book.yaml", source_dir / "book.yml"]
    found = [path for path in candidates if path.exists()]
    if not found:
        raise BuilderError("Cannot find book.json / book.yaml / book.yml in source directory.")

    manifest_path = found[0]
    raw_text = manifest_path.read_text(encoding="utf-8")
    if manifest_path.suffix.lower() == ".json":
        data = json.loads(raw_text)
    else:
        if yaml is None:
            raise BuilderError(
                "YAML manifest detected but PyYAML is not installed. Run: pip install pyyaml"
            )
        data = yaml.safe_load(raw_text)

    if not isinstance(data, dict):
        raise BuilderError(f"Manifest must be an object: {manifest_path}")
    return data


def normalize_entries(raw_entries: Any) -> Dict[str, str]:
    entries = raw_entries if isinstance(raw_entries, dict) else {}
    result: Dict[str, str] = {}
    for key in ENTRY_KEYS:
        result[key] = to_str(entries.get(key, ""))
    return result


def normalize_existing_portraits(raw_portraits: Any) -> List[Dict[str, Any]]:
    if not isinstance(raw_portraits, list):
        return []
    output: List[Dict[str, Any]] = []
    ts = now_iso()
    for index, item in enumerate(raw_portraits):
        if not isinstance(item, dict):
            continue
        file_path = to_str(item.get("filePath", ""))
        if not file_path:
            continue
        emotion = to_str(item.get("emotion", "default"), "default")
        output.append(
            {
                "id": to_str(item.get("id", f"portrait_existing_{index+1}")),
                "label": to_str(item.get("label", emotion)) or emotion,
                "emotion": emotion,
                "filePath": file_path,
                "fileName": to_str(item.get("fileName", Path(file_path).name)),
                "addedAt": to_str(item.get("addedAt", ts), ts),
            }
        )
    return output


def normalize_existing_background_assets(raw_assets: Any) -> List[Dict[str, Any]]:
    if not isinstance(raw_assets, list):
        return []

    output: List[Dict[str, Any]] = []
    for index, item in enumerate(raw_assets):
        if not isinstance(item, dict):
            continue
        bg_id = to_str(item.get("id", f"bg_{index+1}"))
        path = to_str(item.get("path", ""))
        if not path:
            continue
        name = to_str(item.get("name", bg_id))
        output.append(
            {
                "id": bg_id,
                "name": name,
                "path": path,
                "label": to_str(item.get("label", name), name),
            }
        )
    return output


def normalize_user_profile(raw_user: Any) -> Dict[str, Any]:
    user = raw_user if isinstance(raw_user, dict) else {}
    return {
        "name": to_str(user.get("name", "")),
        "nickname": to_str(user.get("nickname", "")),
        "appearance": to_str(user.get("appearance", "")),
        "identity": to_str(user.get("identity", "")),
        "background": to_str(user.get("background", "")),
        "portraits": normalize_existing_portraits(user.get("portraits", [])),
    }


def normalize_characters(raw_characters: Any) -> List[Dict[str, Any]]:
    if not isinstance(raw_characters, list):
        return []
    ts = now_iso()
    output: List[Dict[str, Any]] = []
    for index, item in enumerate(raw_characters):
        if not isinstance(item, dict):
            continue
        name = to_str(item.get("name", ""))
        if not name:
            continue
        char_id = to_str(item.get("id", f"char_{slugify(name, f'char_{index+1}')}_{index+1}"))
        output.append(
            {
                "id": char_id,
                "name": name,
                "nickname": to_str(item.get("nickname", "")),
                "appearance": to_str(item.get("appearance", "")),
                "identity": to_str(item.get("identity", "")),
                "background": to_str(item.get("background", "")),
                "notes": to_str(item.get("notes", "")),
                "portraits": normalize_existing_portraits(item.get("portraits", [])),
                "createdAt": to_str(item.get("createdAt", ts), ts),
                "updatedAt": to_str(item.get("updatedAt", ts), ts),
            }
        )
    return output


def normalize_opening_dialogue(raw_dialogue: Any) -> List[Dict[str, Any]]:
    if not isinstance(raw_dialogue, list):
        return []
    output: List[Dict[str, Any]] = []
    for item in raw_dialogue:
        if not isinstance(item, dict):
            continue
        text = to_str(item.get("text", ""))
        if not text:
            continue
        speaker = to_str(item.get("speaker", "Narrator"), "Narrator")
        emotion_raw = item.get("emotion", None)
        emotion = None if emotion_raw is None else to_str(emotion_raw, None)  # type: ignore[arg-type]
        output.append({"speaker": speaker, "text": text, "emotion": emotion})
    return output


def normalize_scenes(raw_scenes: Any) -> List[Dict[str, Any]]:
    if not isinstance(raw_scenes, list):
        return []
    output: List[Dict[str, Any]] = []
    ts = now_iso()
    for index, item in enumerate(raw_scenes):
        if not isinstance(item, dict):
            continue
        scene_name = to_str(item.get("name", ""))
        scene_background = to_str(item.get("background", ""))
        if not scene_name and not scene_background:
            continue
        scene_id = to_str(item.get("id", f"scene_{index+1}"))
        output.append(
            {
                "id": scene_id,
                "name": scene_name or f"Scene {index+1}",
                "background": scene_background,
                "description": to_str(item.get("description", "")),
                "createdAt": to_str(item.get("createdAt", ts), ts),
            }
        )
    return output


def normalize_portrait_style(manifest: Dict[str, Any], warnings: List[str]) -> str:
    style = to_str(
        (manifest.get("displaySettings") or {}).get("portraitStyle")
        if isinstance(manifest.get("displaySettings"), dict)
        else manifest.get("portraitStyle", "card"),
        "card",
    )
    if style not in VALID_PORTRAIT_STYLES:
        warnings.append(f"Unknown portraitStyle '{style}', fallback to 'card'.")
        return "card"
    return style


def build_worldbook_from_manifest(manifest: Dict[str, Any]) -> Tuple[Dict[str, Any], List[str]]:
    warnings: List[str] = []
    ts = now_iso()
    title = to_str(manifest.get("title", "Untitled WorldBook"), "Untitled WorldBook")
    summary = to_str(manifest.get("summary", ""))
    portrait_style = normalize_portrait_style(manifest, warnings)
    user_profile = normalize_user_profile(manifest.get("userProfile", {}))
    characters = normalize_characters(manifest.get("characters", []))
    scenes = normalize_scenes(manifest.get("scenes", []))
    background_assets = normalize_existing_background_assets(manifest.get("backgroundAssets", []))
    opening_dialogue = normalize_opening_dialogue(manifest.get("openingDialogue", []))

    worldbook = {
        "id": to_str(manifest.get("id", f"world_book_{int(datetime.now(timezone.utc).timestamp())}")),
        "title": title,
        "summary": summary,
        "isDefault": False,
        "createdAt": to_str(manifest.get("createdAt", ts), ts),
        "updatedAt": ts,
        "entries": normalize_entries(manifest.get("entries", {})),
        "userProfile": user_profile,
        "characters": characters,
        "scenes": scenes,
        "backgroundAssets": background_assets,
        "displaySettings": {"portraitStyle": portrait_style},
        "openingDialogue": opening_dialogue,
    }
    return worldbook, warnings


def parse_portraits_txt(path: Path) -> List[Dict[str, Any]]:
    records: List[Dict[str, Any]] = []
    lines = path.read_text(encoding="utf-8").splitlines()
    for index, line in enumerate(lines, 1):
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        parts = stripped.split("_", 2)
        if len(parts) != 3:
            raise BuilderError(
                f"Invalid portrait line in {path}:{index}. Expected format: name_emotion_source"
            )
        name, emotion, source = (item.strip() for item in parts)
        if not name or not emotion or not source:
            raise BuilderError(
                f"Invalid portrait line in {path}:{index}. name/emotion/source cannot be empty."
            )
        records.append(
            {
                "name": name,
                "emotion": emotion,
                "source": source,
                "from": f"{path.name}:{index}",
            }
        )
    return records


def parse_portraits_csv(path: Path) -> List[Dict[str, Any]]:
    records: List[Dict[str, Any]] = []
    with path.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames:
            return records
        names = {item.strip().lower() for item in reader.fieldnames if item}
        required = {"name", "emotion", "source"}
        if not required.issubset(names):
            raise BuilderError(
                f"{path} must include CSV headers: name,emotion,source"
            )
        for row_index, row in enumerate(reader, 2):
            name = to_str(row.get("name", ""))
            emotion = to_str(row.get("emotion", ""))
            source = to_str(row.get("source", ""))
            if not name and not emotion and not source:
                continue
            if not name or not emotion or not source:
                raise BuilderError(
                    f"Invalid row in {path}:{row_index}. name/emotion/source cannot be empty."
                )
            records.append(
                {
                    "name": name,
                    "emotion": emotion,
                    "source": source,
                    "from": f"{path.name}:{row_index}",
                }
            )
    return records


def parse_name_emotion_from_filename(file_path: Path) -> Optional[Tuple[str, str]]:
    stem = file_path.stem.strip()
    if "_" not in stem:
        return None
    name, emotion = stem.rsplit("_", 1)
    name = name.strip()
    emotion = emotion.strip()
    if not name or not emotion:
        return None
    return (name, emotion)


def scan_portraits_from_assets(source_dir: Path) -> Tuple[List[Dict[str, Any]], int]:
    assets_dir = source_dir / "assets"
    if not assets_dir.exists() or not assets_dir.is_dir():
        return [], 0

    records: List[Dict[str, Any]] = []
    skipped = 0
    for file_path in sorted(assets_dir.rglob("*")):
        if not file_path.is_file():
            continue
        if file_path.suffix.lower() not in IMAGE_FILE_EXTENSIONS:
            continue
        if file_path.stem.strip().lower().startswith("bg_"):
            # Background assets should not be parsed as portraits.
            continue
        parsed = parse_name_emotion_from_filename(file_path)
        if not parsed:
            skipped += 1
            continue
        name, emotion = parsed
        relative_source = file_path.relative_to(source_dir).as_posix()
        records.append(
            {
                "name": name,
                "emotion": emotion,
                "source": f"./{relative_source}",
                "from": f"assets-scan:{relative_source}",
            }
        )
    return records, skipped


def load_portrait_records(
    source_dir: Path,
    auto_scan_assets: bool = True,
    force_scan_assets: bool = False,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    records: List[Dict[str, Any]] = []
    csv_path = source_dir / "portraits.csv"
    txt_path = source_dir / "portraits.txt"
    has_csv = csv_path.exists()
    has_txt = txt_path.exists()

    if has_csv:
        records.extend(parse_portraits_csv(csv_path))
    if has_txt:
        records.extend(parse_portraits_txt(txt_path))

    used_asset_scan = False
    scanned_count = 0
    skipped_assets_count = 0

    should_scan_assets = auto_scan_assets and (force_scan_assets or len(records) == 0)
    if should_scan_assets:
        scanned_records, skipped_assets_count = scan_portraits_from_assets(source_dir)
        if scanned_records:
            records.extend(scanned_records)
            used_asset_scan = True
            scanned_count = len(scanned_records)

    return records, {
        "has_csv": has_csv,
        "has_txt": has_txt,
        "used_asset_scan": used_asset_scan,
        "scanned_count": scanned_count,
        "skipped_assets_count": skipped_assets_count,
    }


def normalize_bg_id(name: str, fallback_index: int = 1) -> str:
    base = re.sub(r"\s+", "_", to_str(name, f"bg_{fallback_index}")).strip("_")
    if not base:
        base = f"bg_{fallback_index}"
    if not base.lower().startswith("bg_"):
        base = f"bg_{base}"
    return base


def parse_backgrounds_txt(path: Path) -> List[Dict[str, Any]]:
    records: List[Dict[str, Any]] = []
    lines = path.read_text(encoding="utf-8").splitlines()
    for index, line in enumerate(lines, 1):
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        parts = stripped.split("_", 2)
        if len(parts) != 3:
            raise BuilderError(
                f"Invalid background line in {path}:{index}. Expected format: bg_name_source"
            )
        prefix, name, source = (item.strip() for item in parts)
        if prefix.lower() != "bg":
            raise BuilderError(
                f"Invalid background line in {path}:{index}. Must start with 'bg_'."
            )
        if not name or not source:
            raise BuilderError(
                f"Invalid background line in {path}:{index}. name/source cannot be empty."
            )
        records.append(
            {
                "id": normalize_bg_id(name, index),
                "name": name,
                "source": source,
                "from": f"{path.name}:{index}",
            }
        )
    return records


def parse_backgrounds_csv(path: Path) -> List[Dict[str, Any]]:
    records: List[Dict[str, Any]] = []
    with path.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames:
            return records
        names = {item.strip().lower() for item in reader.fieldnames if item}
        required = {"name", "source"}
        if not required.issubset(names):
            raise BuilderError(f"{path} must include CSV headers: name,source (id optional)")

        for row_index, row in enumerate(reader, 2):
            name = to_str(row.get("name", ""))
            source = to_str(row.get("source", ""))
            if not name and not source:
                continue
            if not name or not source:
                raise BuilderError(
                    f"Invalid row in {path}:{row_index}. name/source cannot be empty."
                )
            bg_id = to_str(row.get("id", normalize_bg_id(name, row_index)))
            records.append(
                {
                    "id": bg_id,
                    "name": name,
                    "source": source,
                    "from": f"{path.name}:{row_index}",
                }
            )
    return records


def scan_backgrounds_from_assets(source_dir: Path) -> Tuple[List[Dict[str, Any]], int]:
    assets_dirs = [source_dir / "assets", source_dir / "assets" / "backgrounds"]
    existing_dirs = [item for item in assets_dirs if item.exists() and item.is_dir()]
    if not existing_dirs:
        return [], 0

    records: List[Dict[str, Any]] = []
    seen_paths: set[str] = set()
    skipped = 0

    for assets_dir in existing_dirs:
        for file_path in sorted(assets_dir.rglob("*")):
            if not file_path.is_file():
                continue
            if file_path.suffix.lower() not in IMAGE_FILE_EXTENSIONS:
                continue
            relative_source = file_path.relative_to(source_dir).as_posix()
            if relative_source in seen_paths:
                continue
            seen_paths.add(relative_source)

            stem = file_path.stem.strip()
            if not stem.lower().startswith("bg_") or len(stem) <= 3:
                skipped += 1
                continue
            bg_name = stem[3:].strip()
            if not bg_name:
                skipped += 1
                continue
            records.append(
                {
                    "id": normalize_bg_id(bg_name, len(records) + 1),
                    "name": bg_name,
                    "source": f"./{relative_source}",
                    "from": f"assets-bg-scan:{relative_source}",
                }
            )

    return records, skipped


def load_background_records(
    source_dir: Path,
    auto_scan_assets: bool = True,
    force_scan_assets: bool = False,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    records: List[Dict[str, Any]] = []
    csv_path = source_dir / "backgrounds.csv"
    txt_path = source_dir / "backgrounds.txt"
    has_csv = csv_path.exists()
    has_txt = txt_path.exists()

    if has_csv:
        records.extend(parse_backgrounds_csv(csv_path))
    if has_txt:
        records.extend(parse_backgrounds_txt(txt_path))

    used_asset_scan = False
    scanned_count = 0
    skipped_assets_count = 0
    should_scan_assets = auto_scan_assets and (force_scan_assets or len(records) == 0)

    if should_scan_assets:
        scanned_records, skipped_assets_count = scan_backgrounds_from_assets(source_dir)
        if scanned_records:
            records.extend(scanned_records)
            used_asset_scan = True
            scanned_count = len(scanned_records)

    return records, {
        "has_csv": has_csv,
        "has_txt": has_txt,
        "used_asset_scan": used_asset_scan,
        "scanned_count": scanned_count,
        "skipped_assets_count": skipped_assets_count,
    }


def is_http_url(text: str) -> bool:
    lower = text.lower()
    return lower.startswith("http://") or lower.startswith("https://")


def file_name_from_source(source: str) -> str:
    if is_http_url(source):
        path = urllib.parse.urlparse(source).path
        name = Path(path).name
        return name or "remote_image"
    if source.startswith("data:image"):
        return "embedded_image"
    return Path(source).name or "image"


def local_file_to_data_url(file_path: Path) -> str:
    if not file_path.exists() or not file_path.is_file():
        raise BuilderError(f"Local image not found: {file_path}")
    raw = file_path.read_bytes()
    mime = mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
    encoded = base64.b64encode(raw).decode("ascii")
    return f"data:{mime};base64,{encoded}"


def remote_url_to_data_url(url: str, timeout_seconds: int = 20) -> str:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "avg-llm-worldbook-builder/1.0",
            "Accept": "image/*,*/*;q=0.8",
        },
    )
    with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
        payload = response.read()
        content_type = response.headers.get("Content-Type", "").split(";")[0].strip()
        if not content_type:
            guessed = mimetypes.guess_type(urllib.parse.urlparse(url).path)[0]
            content_type = guessed or "application/octet-stream"
    encoded = base64.b64encode(payload).decode("ascii")
    return f"data:{content_type};base64,{encoded}"


def get_target_profile(
    worldbook: Dict[str, Any],
    character_name: str,
    auto_create_characters: bool,
    auto_created_names: List[str],
) -> Optional[Dict[str, Any]]:
    if character_name in USER_ALIASES or character_name.lower() in {item.lower() for item in USER_ALIASES}:
        return worldbook["userProfile"]

    for char in worldbook.get("characters", []):
        aliases = {to_str(char.get("name", "")), to_str(char.get("nickname", "")), to_str(char.get("id", ""))}
        if character_name in aliases:
            return char

    if not auto_create_characters:
        return None

    ts = now_iso()
    new_char = {
        "id": f"char_{slugify(character_name, 'char')}_{len(worldbook.get('characters', [])) + 1}",
        "name": character_name,
        "nickname": "",
        "appearance": "",
        "identity": "",
        "background": "",
        "notes": "",
        "portraits": [],
        "createdAt": ts,
        "updatedAt": ts,
    }
    worldbook.setdefault("characters", []).append(new_char)
    auto_created_names.append(character_name)
    return new_char


def recommend_resolution(style: str) -> Tuple[int, int]:
    if style in {"card", "half_body"}:
        return (1080, 1620)
    return (1080, 1920)


def inspect_local_resolution(file_path: Path, style: str) -> Optional[str]:
    if Image is None:
        return None
    try:
        with Image.open(file_path) as img:
            width, height = img.size
    except Exception:
        return None

    rec_w, rec_h = recommend_resolution(style)
    warnings: List[str] = []
    if width < int(rec_w * 0.66) or height < int(rec_h * 0.66):
        warnings.append(f"low resolution {width}x{height} (recommended >= {rec_w}x{rec_h})")

    ratio = width / height if height else 0
    if style in {"card", "half_body"}:
        target = 2 / 3
    else:
        target = 9 / 16
    if abs(ratio - target) > 0.28:
        warnings.append(f"aspect ratio {ratio:.3f} differs from recommended {target:.3f}")

    if not warnings:
        return None
    return "; ".join(warnings)


def resolve_local_asset_path(source: str, source_dir: Path) -> Path:
    local_path = Path(source)
    if not local_path.is_absolute():
        local_path = (source_dir / local_path).resolve()
    return local_path


def to_relative_source_if_possible(local_path: Path, source_dir: Path) -> str:
    try:
        relative_path = local_path.relative_to(source_dir).as_posix()
        return f"./{relative_path}"
    except ValueError:
        return str(local_path)


def resolve_portrait_source(
    source: str,
    source_dir: Path,
    embed_remote: bool,
    asset_mode: str,
) -> Tuple[str, Optional[Path]]:
    if source.startswith("data:image"):
        return source, None

    if is_http_url(source):
        if embed_remote:
            return remote_url_to_data_url(source), None
        return source, None

    local_path = resolve_local_asset_path(source, source_dir)
    if not local_path.exists() or not local_path.is_file():
        raise BuilderError(f"Local portrait file not found: {local_path}")

    if asset_mode == "lite":
        return to_relative_source_if_possible(local_path, source_dir), local_path

    return local_file_to_data_url(local_path), local_path


def build_portraits(
    worldbook: Dict[str, Any],
    records: List[Dict[str, Any]],
    source_dir: Path,
    embed_remote: bool,
    asset_mode: str,
    auto_create_characters: bool,
    warnings: List[str],
    errors: List[str],
) -> Dict[str, Any]:
    auto_created_names: List[str] = []
    added_count = 0
    ts = now_iso()
    style = to_str((worldbook.get("displaySettings") or {}).get("portraitStyle"), "card")

    for index, item in enumerate(records, 1):
        name = to_str(item.get("name", ""))
        emotion = to_str(item.get("emotion", "default"), "default")
        source = to_str(item.get("source", ""))
        origin = to_str(item.get("from", f"record#{index}"))

        if emotion not in VALID_EMOTIONS:
            warnings.append(f"[{origin}] unknown emotion '{emotion}', it will still be kept as custom value.")

        target = get_target_profile(worldbook, name, auto_create_characters, auto_created_names)
        if target is None:
            errors.append(f"[{origin}] character '{name}' not found. Add it in manifest or enable auto-create.")
            continue

        try:
            resolved_source, local_path = resolve_portrait_source(source, source_dir, embed_remote, asset_mode)
        except Exception as exc:
            errors.append(f"[{origin}] failed to resolve source '{source}': {exc}")
            continue

        if local_path is not None:
            resolution_warning = inspect_local_resolution(local_path, style)
            if resolution_warning:
                warnings.append(f"[{origin}] {resolution_warning}")

        portrait_item = {
            "id": f"portrait_{int(datetime.now(timezone.utc).timestamp())}_{index}",
            "label": emotion,
            "emotion": emotion,
            "filePath": resolved_source,
            "fileName": file_name_from_source(source),
            "addedAt": ts,
        }
        target.setdefault("portraits", []).append(portrait_item)
        added_count += 1

    return {
        "added_count": added_count,
        "auto_created_names": auto_created_names,
    }


def resolve_background_source(source: str, source_dir: Path) -> Tuple[str, str]:
    if source.startswith("data:image"):
        return source, "data"
    if is_http_url(source):
        return source, "url"

    local_path = resolve_local_asset_path(source, source_dir)
    if not local_path.exists() or not local_path.is_file():
        raise BuilderError(f"Local background file not found: {local_path}")
    return to_relative_source_if_possible(local_path, source_dir), "local"


def find_background_asset_match(
    background_assets: List[Dict[str, Any]],
    raw_background: str,
) -> Optional[Dict[str, Any]]:
    lookup = to_str(raw_background, "")
    if not lookup:
        return None

    lower_lookup = lookup.lower()
    for item in background_assets:
        if to_str(item.get("id", "")) == lookup:
            return item
    for item in background_assets:
        if to_str(item.get("name", "")).lower() == lower_lookup:
            return item
    for item in background_assets:
        if to_str(item.get("path", "")) == lookup:
            return item
    return None


def build_background_assets(
    worldbook: Dict[str, Any],
    records: List[Dict[str, Any]],
    source_dir: Path,
    warnings: List[str],
    errors: List[str],
) -> Dict[str, Any]:
    existing_assets = normalize_existing_background_assets(worldbook.get("backgroundAssets", []))
    assets: List[Dict[str, Any]] = [*existing_assets]
    id_counts: Dict[str, int] = {}

    for item in assets:
        bg_id = to_str(item.get("id", ""))
        id_counts[bg_id] = max(id_counts.get(bg_id, 0), 1)

    added_count = 0
    for index, item in enumerate(records, 1):
        bg_name = to_str(item.get("name", ""))
        bg_source = to_str(item.get("source", ""))
        bg_id_raw = to_str(item.get("id", normalize_bg_id(bg_name, index)))
        origin = to_str(item.get("from", f"background#{index}"))

        if not bg_name or not bg_source:
            errors.append(f"[{origin}] background name/source cannot be empty.")
            continue

        try:
            resolved_source, source_type = resolve_background_source(bg_source, source_dir)
        except Exception as exc:
            errors.append(f"[{origin}] failed to resolve background source '{bg_source}': {exc}")
            continue

        if source_type == "data":
            warnings.append(
                f"[{origin}] background uses data URL. This can make JSON very large; hybrid mode recommends URL/local path."
            )

        bg_id = bg_id_raw
        if bg_id in id_counts:
            id_counts[bg_id] += 1
            bg_id = f"{bg_id}_{id_counts[bg_id]}"
            warnings.append(f"[{origin}] duplicated background id, renamed to '{bg_id}'.")
        else:
            id_counts[bg_id] = 1

        assets.append(
            {
                "id": bg_id,
                "name": bg_name,
                "path": resolved_source,
                "label": bg_name,
                "sourceType": source_type,
            }
        )
        added_count += 1

    worldbook["backgroundAssets"] = assets

    scene_mapped_count = 0
    unresolved_scene_count = 0
    for scene in worldbook.get("scenes", []):
        raw_bg = to_str(scene.get("background", ""))
        if not raw_bg:
            continue
        matched = find_background_asset_match(assets, raw_bg)
        if matched:
            scene["background"] = to_str(matched.get("id", raw_bg))
            scene_mapped_count += 1
        else:
            unresolved_scene_count += 1
            warnings.append(
                f"[scene:{to_str(scene.get('name', 'unnamed'))}] background '{raw_bg}' has no mapping in background assets."
            )

    return {
        "added_count": added_count,
        "total_count": len(assets),
        "scene_mapped_count": scene_mapped_count,
        "scene_unresolved_count": unresolved_scene_count,
    }


def build_export_payload(worldbook: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "version": "1.0",
        "exportedAt": now_iso(),
        "worldBook": worldbook,
    }


def run_build(
    source_dir: Path,
    out_file: Optional[Path],
    asset_mode: str,
    embed_remote: bool,
    auto_create_characters: bool,
    auto_scan_assets: bool,
    force_scan_assets: bool,
    strict: bool,
    dry_run: bool,
) -> int:
    warnings: List[str] = []
    errors: List[str] = []

    try:
        if asset_mode not in VALID_ASSET_MODES:
            raise BuilderError(f"Unsupported asset mode '{asset_mode}'. Choose: {', '.join(sorted(VALID_ASSET_MODES))}")
        if asset_mode == "lite":
            warnings.append("lite mode keeps local file refs; Android/mobile imports may fail if paths are not accessible.")
        manifest = load_manifest(source_dir)
        worldbook, wb_warnings = build_worldbook_from_manifest(manifest)
        warnings.extend(wb_warnings)
        portrait_records, portrait_records_meta = load_portrait_records(
            source_dir,
            auto_scan_assets=auto_scan_assets,
            force_scan_assets=force_scan_assets,
        )
        background_records, background_records_meta = load_background_records(
            source_dir,
            auto_scan_assets=auto_scan_assets,
            force_scan_assets=force_scan_assets,
        )
        portrait_report = build_portraits(
            worldbook=worldbook,
            records=portrait_records,
            source_dir=source_dir,
            embed_remote=embed_remote,
            asset_mode=asset_mode,
            auto_create_characters=auto_create_characters,
            warnings=warnings,
            errors=errors,
        )
        background_report = build_background_assets(
            worldbook=worldbook,
            records=background_records,
            source_dir=source_dir,
            warnings=warnings,
            errors=errors,
        )
    except Exception as exc:
        print(f"[ERROR] {exc}")
        return 1

    if warnings:
        print(f"[WARN] {len(warnings)} warning(s):")
        for item in warnings:
            print(f"  - {item}")

    if errors:
        print(f"[ERROR] {len(errors)} error(s):")
        for item in errors:
            print(f"  - {item}")
        return 1

    if strict and warnings:
        print("[ERROR] Strict mode enabled. Warnings are treated as errors.")
        return 1

    payload = build_export_payload(worldbook)
    if not dry_run:
        if out_file is None:
            out_file = source_dir / "worldbook_export.json"
        out_file.parent.mkdir(parents=True, exist_ok=True)
        out_file.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"[OK] Built worldbook JSON: {out_file}")
    else:
        print("[OK] Validate passed.")

    print(f"[INFO] title: {worldbook.get('title')}")
    print(f"[INFO] asset mode: {asset_mode}")
    print(f"[INFO] portrait style: {(worldbook.get('displaySettings') or {}).get('portraitStyle')}")
    print(
        "[INFO] portrait sources: "
        f"portraits.csv={'yes' if portrait_records_meta.get('has_csv') else 'no'}, "
        f"portraits.txt={'yes' if portrait_records_meta.get('has_txt') else 'no'}, "
        f"assets-scan={'yes' if portrait_records_meta.get('used_asset_scan') else 'no'}"
    )
    if portrait_records_meta.get("used_asset_scan"):
        print(
            f"[INFO] portrait assets scan matched {portrait_records_meta.get('scanned_count', 0)} file(s), "
            f"skipped {portrait_records_meta.get('skipped_assets_count', 0)} file(s) without name_emotion pattern"
        )
    print(
        "[INFO] background sources: "
        f"backgrounds.csv={'yes' if background_records_meta.get('has_csv') else 'no'}, "
        f"backgrounds.txt={'yes' if background_records_meta.get('has_txt') else 'no'}, "
        f"assets-scan={'yes' if background_records_meta.get('used_asset_scan') else 'no'}"
    )
    if background_records_meta.get("used_asset_scan"):
        print(
            f"[INFO] background assets scan matched {background_records_meta.get('scanned_count', 0)} file(s), "
            f"skipped {background_records_meta.get('skipped_assets_count', 0)} file(s) without bg_name pattern"
        )

    print(f"[INFO] portrait records: {len(portrait_records)}")
    print(f"[INFO] portraits added: {portrait_report.get('added_count', 0)}")
    if portrait_report.get("auto_created_names"):
        unique_names = sorted(set(portrait_report["auto_created_names"]))
        print(f"[INFO] auto-created characters: {', '.join(unique_names)}")
    print(f"[INFO] background records: {len(background_records)}")
    print(
        f"[INFO] background assets total: {background_report.get('total_count', 0)} "
        f"(added {background_report.get('added_count', 0)})"
    )
    print(
        f"[INFO] scene background mapping: matched {background_report.get('scene_mapped_count', 0)}, "
        f"unresolved {background_report.get('scene_unresolved_count', 0)}"
    )

    rec_w, rec_h = recommend_resolution((worldbook.get("displaySettings") or {}).get("portraitStyle", "card"))
    print(f"[INFO] recommended portrait resolution for current style: {rec_w}x{rec_h}")
    return 0


def write_init_files(target_dir: Path, force: bool) -> None:
    if target_dir.exists():
        if not target_dir.is_dir():
            raise BuilderError(f"Target exists but is not a directory: {target_dir}")
        has_files = any(target_dir.iterdir())
        if has_files and not force:
            raise BuilderError(
                f"Target directory is not empty: {target_dir}. Use --force to continue."
            )
    target_dir.mkdir(parents=True, exist_ok=True)
    (target_dir / "assets").mkdir(parents=True, exist_ok=True)

    template_manifest = {
        "title": "My WorldBook",
        "summary": "Short summary here.",
        "portraitStyle": "card",
        "entries": {key: "" for key in ENTRY_KEYS},
        "userProfile": {
            "name": "",
            "nickname": "Player",
            "appearance": "",
            "identity": "",
            "background": "",
        },
        "characters": [
            {
                "name": "Eve",
                "nickname": "",
                "appearance": "",
                "identity": "",
                "background": "",
                "notes": "",
            }
        ],
        "scenes": [
            {"id": "scene_1", "name": "Library", "background": "bg_library", "description": ""},
            {"id": "scene_2", "name": "Street", "background": "bg_street", "description": ""},
        ],
        "openingDialogue": [
            {"speaker": "Narrator", "text": "The rain hits the window quietly.", "emotion": None},
            {"speaker": "Eve", "text": "You finally arrived.", "emotion": "neutral"},
        ],
    }

    portraits_txt = """# Format: name_emotion_source
# You can use USER (or lead/player/you) for userProfile portraits.
# source can be local file path (relative to this folder) or remote URL.
# Zero-config mode is also supported: if portraits.txt/csv is empty or missing,
# the builder will auto-scan ./assets with filename pattern: name_emotion.png
#
# Examples:
# USER_default_./assets/user_default.png
# Eve_happy_./assets/eve_happy.png
# Eve_angry_https://example.com/eve_angry.png
"""

    backgrounds_txt = """# Format: bg_name_source
# source can be local file path (relative to this folder) or remote URL.
# Example scene.background should use generated id, like: bg_library
#
# Examples:
# bg_library_./assets/backgrounds/bg_library.webp
# bg_street_https://example.com/backgrounds/street.webp
"""

    (target_dir / "book.json").write_text(
        json.dumps(template_manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (target_dir / "portraits.txt").write_text(portraits_txt, encoding="utf-8")
    (target_dir / "backgrounds.txt").write_text(backgrounds_txt, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Build importable worldbook JSON from a simple source folder."
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p_init = sub.add_parser("init", help="Create a source template folder.")
    p_init.add_argument("source_dir", help="Template output directory")
    p_init.add_argument(
        "--force",
        action="store_true",
        help="Allow writing template into a non-empty directory.",
    )

    p_validate = sub.add_parser("validate", help="Validate source folder.")
    p_validate.add_argument("source_dir", help="Worldbook source directory")
    p_validate.add_argument(
        "--asset-mode",
        choices=sorted(VALID_ASSET_MODES),
        default="hybrid",
        help="Asset strategy. hybrid=portraits embedded, backgrounds keep external refs. lite=all keep refs.",
    )
    p_validate.add_argument(
        "--embed-remote",
        action="store_true",
        help="Download remote portrait URLs and validate as embedded data URL (portraits only).",
    )
    p_validate.add_argument(
        "--scan-assets",
        action="store_true",
        help="Force scan ./assets for name_emotion.ext and merge into portrait records.",
    )
    p_validate.add_argument(
        "--no-scan-assets",
        action="store_true",
        help="Disable auto-scan fallback for ./assets.",
    )
    p_validate.add_argument(
        "--no-auto-create-characters",
        action="store_true",
        help="Disable auto-create for unknown portrait character names.",
    )
    p_validate.add_argument(
        "--strict",
        action="store_true",
        help="Treat warnings as errors.",
    )

    p_build = sub.add_parser("build", help="Build final worldbook JSON.")
    p_build.add_argument("source_dir", help="Worldbook source directory")
    p_build.add_argument(
        "--asset-mode",
        choices=sorted(VALID_ASSET_MODES),
        default="hybrid",
        help="Asset strategy. hybrid=portraits embedded, backgrounds keep external refs. lite=all keep refs.",
    )
    p_build.add_argument(
        "-o",
        "--out",
        help="Output json file path. Default: <source_dir>/worldbook_export.json",
    )
    p_build.add_argument(
        "--embed-remote",
        action="store_true",
        help="Download remote portrait URLs and embed into data URL.",
    )
    p_build.add_argument(
        "--scan-assets",
        action="store_true",
        help="Force scan ./assets for name_emotion.ext and merge into portrait records.",
    )
    p_build.add_argument(
        "--no-scan-assets",
        action="store_true",
        help="Disable auto-scan fallback for ./assets.",
    )
    p_build.add_argument(
        "--no-auto-create-characters",
        action="store_true",
        help="Disable auto-create for unknown portrait character names.",
    )
    p_build.add_argument(
        "--strict",
        action="store_true",
        help="Treat warnings as errors.",
    )

    args = parser.parse_args()

    if args.command == "init":
        target = Path(args.source_dir).resolve()
        try:
            write_init_files(target, force=bool(args.force))
        except Exception as exc:
            print(f"[ERROR] {exc}")
            return 1
        print(f"[OK] Template created: {target}")
        print(f"[NEXT] Edit {target / 'book.json'}, {target / 'portraits.txt'}, {target / 'backgrounds.txt'}")
        return 0

    if args.command == "validate":
        return run_build(
            source_dir=Path(args.source_dir).resolve(),
            out_file=None,
            asset_mode=to_str(args.asset_mode, "hybrid"),
            embed_remote=bool(args.embed_remote),
            auto_create_characters=not bool(args.no_auto_create_characters),
            auto_scan_assets=not bool(args.no_scan_assets),
            force_scan_assets=bool(args.scan_assets),
            strict=bool(args.strict),
            dry_run=True,
        )

    if args.command == "build":
        out_file = Path(args.out).resolve() if args.out else None
        return run_build(
            source_dir=Path(args.source_dir).resolve(),
            out_file=out_file,
            asset_mode=to_str(args.asset_mode, "hybrid"),
            embed_remote=bool(args.embed_remote),
            auto_create_characters=not bool(args.no_auto_create_characters),
            auto_scan_assets=not bool(args.no_scan_assets),
            force_scan_assets=bool(args.scan_assets),
            strict=bool(args.strict),
            dry_run=False,
        )

    print("[ERROR] Unknown command.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
