# SQLite 表结构设计 — Android 端（全新开发）

## 设计原则

1. 不导出/导入兼容，不做数据迁移，从零开始
2. 不用 JSON 列存结构体，能扁平就扁平，代码最简
3. 图片/音频等大文件只存路径，文件放 Android 内部存储
4. 通用资源（如 sms_stickers）按世界书存一次，不挂在角色上
5. 不常用的深层嵌套结构（opening_dialogue、director_events）用 JSON 列，因为读写极少

---

## 1. world_books — 世界书主表

| 列名 | 类型 | 说明 |
|------|------|------|
| `id` | TEXT PRIMARY KEY | |
| `title` | TEXT NOT NULL | |
| `summary` | TEXT NOT NULL DEFAULT '' | |
| `is_default` | INTEGER NOT NULL DEFAULT 0 | 0/1 |
| `tags` | TEXT NOT NULL DEFAULT '' | 逗号分隔字符串，如 `奇幻,冒险` |
| `default_narrator_id` | TEXT NOT NULL DEFAULT '' | |
| `created_at` | TEXT NOT NULL | ISO 时间戳 |
| `updated_at` | TEXT NOT NULL | ISO 时间戳 |

---

## 2. world_book_entries — 世界设定（1对1）

| 列名 | 类型 | 说明 |
|------|------|------|
| `world_book_id` | TEXT PRIMARY KEY, FK → world_books.id | |
| `overview` | TEXT NOT NULL DEFAULT '' | |
| `era` | TEXT NOT NULL DEFAULT '' | |
| `regions` | TEXT NOT NULL DEFAULT '' | |
| `forces` | TEXT NOT NULL DEFAULT '' | |
| `rules` | TEXT NOT NULL DEFAULT '' | |
| `culture` | TEXT NOT NULL DEFAULT '' | |
| `conflict` | TEXT NOT NULL DEFAULT '' | |
| `secrets` | TEXT NOT NULL DEFAULT '' | |
| `story_hook` | TEXT NOT NULL DEFAULT '' | |

---

## 3. world_book_user_profiles — 用户档案（1对1）

| 列名 | 类型 | 说明 |
|------|------|------|
| `world_book_id` | TEXT PRIMARY KEY, FK → world_books.id | |
| `name` | TEXT NOT NULL DEFAULT '' | |
| `nickname` | TEXT NOT NULL DEFAULT '' | |
| `appearance` | TEXT NOT NULL DEFAULT '' | |
| `identity` | TEXT NOT NULL DEFAULT '' | |
| `background` | TEXT NOT NULL DEFAULT '' | |

---

## 4. world_book_portraits — 用户档案立绘（1对多）

| 列名 | 类型 | 说明 |
|------|------|------|
| `id` | TEXT PRIMARY KEY | |
| `world_book_id` | TEXT NOT NULL, FK → world_books.id | |
| `file_path` | TEXT NOT NULL | 图片在内部存储的路径 |
| `added_at` | TEXT NOT NULL | |

**索引：** `idx_user_portraits_book` ON (`world_book_id`)

---

## 5. characters — 角色表

| 列名 | 类型 | 说明 |
|------|------|------|
| `id` | TEXT PRIMARY KEY | |
| `world_book_id` | TEXT NOT NULL, FK → world_books.id | |
| `name` | TEXT NOT NULL | |
| `nickname` | TEXT NOT NULL DEFAULT '' | |
| `appearance` | TEXT NOT NULL DEFAULT '' | |
| `identity` | TEXT NOT NULL DEFAULT '' | |
| `background` | TEXT NOT NULL DEFAULT '' | |
| `notes` | TEXT NOT NULL DEFAULT '' | |
| `birthday` | TEXT NOT NULL DEFAULT '' | MM-DD |
| `sms_avatar_path` | TEXT | 短信头像文件路径 |
| `sms_bg_path` | TEXT | 短信背景文件路径 |
| `mbti` | TEXT NOT NULL DEFAULT '' | |
| `behavior_tags` | TEXT NOT NULL DEFAULT '' | 逗号分隔，如 `傲娇,毒舌,温柔` |
| `dim_se` | INTEGER NOT NULL DEFAULT 50 | 认知维度 0-100 |
| `dim_si` | INTEGER NOT NULL DEFAULT 50 | |
| `dim_ne` | INTEGER NOT NULL DEFAULT 50 | |
| `dim_ni` | INTEGER NOT NULL DEFAULT 50 | |
| `dim_te` | INTEGER NOT NULL DEFAULT 50 | |
| `dim_ti` | INTEGER NOT NULL DEFAULT 50 | |
| `dim_fe` | INTEGER NOT NULL DEFAULT 50 | |
| `dim_fi` | INTEGER NOT NULL DEFAULT 50 | |
| `favor` | INTEGER NOT NULL DEFAULT 50 | 好感度 -100~100 |
| `trust` | INTEGER NOT NULL DEFAULT 50 | 信任度 -100~100 |
| `stance` | INTEGER NOT NULL DEFAULT 0 | 立场 -100~100 |
| `voice_enabled` | INTEGER NOT NULL DEFAULT 0 | |
| `voice_id` | TEXT NOT NULL DEFAULT '' | |
| `voice_speed` | REAL NOT NULL DEFAULT 1.0 | |
| `voice_vol` | REAL NOT NULL DEFAULT 1.0 | |
| `voice_pitch` | REAL NOT NULL DEFAULT 0.0 | |
| `voice_emotion` | TEXT NOT NULL DEFAULT '' | |
| `voice_sample_rate` | INTEGER NOT NULL DEFAULT 32000 | |
| `voice_bitrate` | INTEGER NOT NULL DEFAULT 128000 | |
| `voice_format` | TEXT NOT NULL DEFAULT 'mp3' | mp3/wav/flac |
| `voice_channel` | INTEGER NOT NULL DEFAULT 1 | 1/2 |
| `voice_subtitle_enable` | INTEGER NOT NULL DEFAULT 0 | |
| `created_at` | TEXT NOT NULL | |
| `updated_at` | TEXT NOT NULL | |

**索引：**
- `idx_characters_book` ON (`world_book_id`)
- `idx_characters_name` ON (`world_book_id`, `name`)

> `pronunciationTone` 数组用 JSON 列存，因为这是变长字符串数组，拆表不值得：
> `voice_pronunciation_tone` TEXT — JSON 数组，如 `["拼音:声调", ...]`

---

## 6. character_portraits — 角色立绘（1对多）

| 列名 | 类型 | 说明 |
|------|------|------|
| `id` | TEXT PRIMARY KEY | |
| `character_id` | TEXT NOT NULL, FK → characters.id | |
| `label` | TEXT NOT NULL DEFAULT '' | 显示标签 |
| `emotion` | TEXT NOT NULL DEFAULT 'default' | 情绪标识 |
| `file_path` | TEXT NOT NULL | 图片在内部存储的路径 |
| `added_at` | TEXT NOT NULL | |

**索引：** `idx_portraits_character` ON (`character_id`)

> 图片本身存在 Android 内部存储目录（如 `data/data/com.your.app/files/portraits/`），数据库只存路径。

---

## 7. scenes — 场景（1对多）

| 列名 | 类型 | 说明 |
|------|------|------|
| `id` | TEXT PRIMARY KEY | |
| `world_book_id` | TEXT NOT NULL, FK → world_books.id | |
| `name` | TEXT NOT NULL | 场景名称 |
| `background_path` | TEXT NOT NULL DEFAULT '' | 场景背景图路径 |
| `description` | TEXT NOT NULL DEFAULT '' | 场景描述 |
| `created_at` | TEXT NOT NULL | |

**索引：** `idx_scenes_book` ON (`world_book_id`)

---

## 8. background_assets — 背景资源库（1对多）

| 列名 | 类型 | 说明 |
|------|------|------|
| `id` | TEXT PRIMARY KEY | |
| `world_book_id` | TEXT NOT NULL, FK → world_books.id | |
| `name` | TEXT NOT NULL | |
| `path` | TEXT NOT NULL | 图片路径 |
| `label` | TEXT NOT NULL DEFAULT '' | |

**索引：** `idx_bg_assets_book` ON (`world_book_id`)

> **与 scenes 的区别：** scenes 是"地点概念"（如"王宫大厅"、"深夜便利店"），有名称+描述+可选背景图，用于游戏剧情定位。background_assets 是纯图片资源库，用于快速切换背景图，没有"场景"的语义含义。两者用途不同，但都只存文件路径。

---

## 9. world_book_display_settings — 显示设置（1对1）

| 列名 | 类型 | 说明 |
|------|------|------|
| `world_book_id` | TEXT PRIMARY KEY, FK → world_books.id | |
| `portrait_style` | TEXT NOT NULL DEFAULT 'card' | |
| `active_card_border_id` | TEXT NOT NULL DEFAULT '' | |

---

## 10. card_borders — 卡牌边框（1对多）

| 列名 | 类型 | 说明 |
|------|------|------|
| `id` | TEXT PRIMARY KEY | |
| `world_book_id` | TEXT NOT NULL, FK → world_books.id | |
| `name` | TEXT NOT NULL DEFAULT '' | |
| `file_path` | TEXT NOT NULL | 图片路径 |
| `crop_x` | INTEGER NOT NULL DEFAULT 0 | |
| `crop_y` | INTEGER NOT NULL DEFAULT 0 | |
| `crop_w` | INTEGER NOT NULL DEFAULT 0 | |
| `crop_h` | INTEGER NOT NULL DEFAULT 0 | |
| `added_at` | TEXT NOT NULL | |

**索引：** `idx_card_borders_book` ON (`world_book_id`)

---

## 11. sms_stickers — 短信表情包（1对多，按世界书存）

| 列名 | 类型 | 说明 |
|------|------|------|
| `id` | TEXT PRIMARY KEY | |
| `world_book_id` | TEXT NOT NULL, FK → world_books.id | |
| `description` | TEXT NOT NULL | 描述标签 |
| `file_path` | TEXT NOT NULL | 图片路径 |

**索引：** `idx_sms_stickers_book` ON (`world_book_id`)

> 这是所有角色共享的。一个世界书一套表情包。

---

## 12. world_book_config — 世界书配置（1对1）

把低频读写的字段合在一起：

| 列名 | 类型 | 说明 |
|------|------|------|
| `world_book_id` | TEXT PRIMARY KEY, FK → world_books.id | |
| `opening_dialogue_mode` | TEXT NOT NULL DEFAULT 'auto' | auto/custom |
| `opening_dialogue` | TEXT | JSON 数组（只在游戏启动时读一次） |
| `director_events` | TEXT | JSON 数组（只在触发时读） |

> 这两个结构只在特定时刻读写一次，用 JSON 列完全够用，不需要为了"纯关系型"硬拆表。

---

## 13. relationships — 角色关系

| 列名 | 类型 | 说明 |
|------|------|------|
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | |
| `world_book_id` | TEXT NOT NULL, FK → world_books.id | |
| `from_id` | TEXT NOT NULL | 主体（角色ID 或 __player__） |
| `to_id` | TEXT NOT NULL | 目标 |
| `score` | INTEGER NOT NULL DEFAULT 0 | 0-1000 |
| `description` | TEXT NOT NULL DEFAULT '' | |
| `updated_at` | TEXT NOT NULL | |

**索引：**
- `idx_relationships_book` ON (`world_book_id`)
- `idx_relationships_pair` ON (`world_book_id`, `from_id`, `to_id`) — UNIQUE

---

## 全局索引总览

```sql
CREATE INDEX idx_characters_book ON characters(world_book_id);
CREATE INDEX idx_characters_name ON characters(world_book_id, name);
CREATE INDEX idx_user_portraits_book ON world_book_portraits(world_book_id);
CREATE INDEX idx_portraits_character ON character_portraits(character_id);
CREATE INDEX idx_scenes_book ON scenes(world_book_id);
CREATE INDEX idx_bg_assets_book ON background_assets(world_book_id);
CREATE INDEX idx_card_borders_book ON card_borders(world_book_id);
CREATE INDEX idx_sms_stickers_book ON sms_stickers(world_book_id);
CREATE INDEX idx_relationships_book ON relationships(world_book_id);
CREATE INDEX idx_relationships_pair ON relationships(world_book_id, from_id, to_id);
```

---

## 文件存储目录规划（Android 内部存储）

```
data/data/com.your.app/files/
  ├── portraits/          # 角色立绘
  │   ├── {character_id}/
  │   │   ├── portrait_xxx.png
  │   │   └── ...
  ├── user_portraits/     # 用户档案立绘
  │   └── {world_book_id}/
  ├── sms_avatars/        # 短信头像
  │   └── {character_id}.png
  ├── sms_bgs/            # 短信背景
  │   └── {world_book_id}/
  ├── sms_stickers/       # 短信表情包
  │   └── {world_book_id}/
  ├── backgrounds/        # 场景背景图
  │   └── {world_book_id}/
  └── card_borders/       # 卡牌边框
      └── {world_book_id}/
```

所有路径列存相对于 `files/` 的相对路径，如 `portraits/char_123/portrait_456.png`。

---

## 典型查询

### 书架列表
```sql
SELECT id, title, summary, is_default, tags FROM world_books ORDER BY is_default DESC, created_at;
```

### 联系人列表（角色基本信息）
```sql
SELECT id, name, nickname, identity, birthday, sms_avatar_path, sms_bg_path
FROM characters WHERE world_book_id = ?;
```

### 完整加载一个世界书（所有表）
```sql
-- 1. 主表 + entries + profile + display + config（JOIN 5 张 1:1 表）
SELECT * FROM world_books wb
LEFT JOIN world_book_entries e ON e.world_book_id = wb.id
LEFT JOIN world_book_user_profiles p ON p.world_book_id = wb.id
LEFT JOIN world_book_display_settings d ON d.world_book_id = wb.id
LEFT JOIN world_book_config c ON c.world_book_id = wb.id
WHERE wb.id = ?;

-- 2. 角色列表
SELECT * FROM characters WHERE world_book_id = ?;

-- 3. 角色立绘
SELECT * FROM character_portraits WHERE character_id IN (...);

-- 4. 场景、背景资源、卡牌边框、短信表情包、关系
SELECT * FROM scenes/world_book_portraits/background_assets/card_borders/sms_stickers/relationships
WHERE world_book_id = ?;
```

### 更新角色好感度
```sql
UPDATE characters SET favor = ?, updated_at = ? WHERE id = ?;
-- 只改一行，不需要重写整个 JSON
```

### 添加角色立绘
```sql
INSERT INTO character_portraits (id, character_id, label, emotion, file_path, added_at)
VALUES (?, ?, ?, ?, ?, ?);
```
