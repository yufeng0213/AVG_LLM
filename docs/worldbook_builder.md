# WorldBook Builder

`scripts/worldbook_builder.py` is a standalone helper to build importable worldbook JSON.

## 1) Create Template

```bash
python scripts/worldbook_builder.py init ./my_worldbook_source
```

It will create:

- `my_worldbook_source/book.json`
- `my_worldbook_source/portraits.txt`
- `my_worldbook_source/backgrounds.txt`
- `my_worldbook_source/assets/`

Zero-config option:

- If `portraits.txt/csv` is missing (or empty), builder auto-scans `assets/` by filename:
  - `name_emotion.png`
  - `name_emotion.jpg`
  - `name_emotion.webp`

## 2) Portrait Mapping Format

Use one line per portrait in `portraits.txt`:

```text
name_emotion_source
```

Examples:

```text
USER_default_./assets/user_default.png
Eve_happy_./assets/eve_happy.png
Eve_angry_https://example.com/eve_angry.png
```

Notes:

- `name`: `USER` / `lead` / `player` / `you` map to `userProfile`.
- `emotion`: recommended values are `default`, `happy`, `angry`, etc.
- `source`: local file path or `http/https` URL.

## 3) Background Mapping Format

Use one line per background in `backgrounds.txt`:

```text
bg_name_source
```

Examples:

```text
bg_library_./assets/backgrounds/bg_library.webp
bg_street_https://example.com/backgrounds/street.webp
```

Notes:

- `bg_` is required prefix.
- scene `background` should reference generated id, e.g. `bg_library`.
- In zero-config mode, builder can auto-scan `assets/` filenames:
  - `bg_library.png`
  - `bg_street.webp`

## 4) Validate

```bash
python scripts/worldbook_builder.py validate ./my_worldbook_source --asset-mode hybrid
```

Optional:

- `--strict` treat warnings as errors
- `--asset-mode hybrid|lite` (default: `hybrid`)
- `--embed-remote` download remote portrait URLs during validation (portraits only)
- `--no-auto-create-characters` fail if portrait name does not match an existing character
- `--scan-assets` always merge `assets/` filename scan even when portraits.txt/csv exists
- `--no-scan-assets` disable auto-scan fallback

## 5) Build

```bash
python scripts/worldbook_builder.py build ./my_worldbook_source -o ./my_worldbook.json --asset-mode hybrid
```

Default output path is:

- `./my_worldbook_source/worldbook_export.json`

Optional:

- `--asset-mode hybrid|lite` (default: `hybrid`)
- `--embed-remote` download remote portrait URLs and embed as data URL
- `--strict` treat warnings as errors
- `--scan-assets` always merge `assets/` filename scan even when portraits.txt/csv exists
- `--no-scan-assets` disable auto-scan fallback

## 6) Mode Recommendation

- `hybrid` (recommended): portraits embedded from local files, backgrounds keep external refs.
- `lite`: portraits/backgrounds all keep refs.

## 7) Portrait Resolution Recommendation

- `card` / `half_body`: `1080x1620`
- `full_body` / `leg_body`: `1080x1920`

Set style in `book.json`:

```json
{
  "portraitStyle": "card"
}
```
