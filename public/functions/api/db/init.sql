-- 剑网3 个人收益工作台：一次性初始化 D1
-- 在 Cloudflare D1 控制台 Console 中整段粘贴执行，或使用：
-- npx wrangler d1 execute jw3-workbench-db --remote --file=db/init.sql

-- 剑网3 个人收益工作台 · D1 建表脚本
-- 在 Cloudflare D1 控制台或 wrangler d1 execute 中执行一次。
-- D1 默认启用并强制外键约束；本地 dev-server 会显式执行 PRAGMA foreign_keys = ON。

CREATE TABLE IF NOT EXISTS accounts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  note        TEXT    NOT NULL DEFAULT '',
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS characters (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id  INTEGER NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  name        TEXT    NOT NULL,
  server      TEXT    NOT NULL DEFAULT '',
  school      TEXT    NOT NULL DEFAULT '',
  active      INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  note        TEXT    NOT NULL DEFAULT '',
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (account_id, name, server)
);

CREATE TABLE IF NOT EXISTS dungeons (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL UNIQUE,
  total_bosses  INTEGER NOT NULL DEFAULT 3 CHECK (total_bosses >= 0),
  active        INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  sort_order    INTEGER NOT NULL DEFAULT 100
);

-- 事件类型独立成表，方便在设置页启用 / 停用。
CREATE TABLE IF NOT EXISTS event_types (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL UNIQUE,
  active      INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  sort_order  INTEGER NOT NULL DEFAULT 100
);

CREATE TABLE IF NOT EXISTS income_records (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  date          TEXT    NOT NULL,
  character_id  INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  category      TEXT    NOT NULL CHECK (category IN ('副本', '阵营', '其它')),
  title         TEXT    NOT NULL,
  income        REAL    NOT NULL DEFAULT 0 CHECK (income >= 0),
  expense       REAL    NOT NULL DEFAULT 0 CHECK (expense >= 0),
  net           REAL    NOT NULL DEFAULT 0,
  note          TEXT    NOT NULL DEFAULT '',
  dungeon_id    INTEGER REFERENCES dungeons(id) ON DELETE SET NULL,
  dungeon_name  TEXT    NOT NULL DEFAULT '',
  bosses_done   INTEGER CHECK (bosses_done IS NULL OR bosses_done >= 0),
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS event_records (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  date          TEXT    NOT NULL,
  character_id  INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  type          TEXT    NOT NULL,
  title         TEXT    NOT NULL,
  value         REAL,
  note          TEXT    NOT NULL DEFAULT '',
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_characters_account   ON characters(account_id);
CREATE INDEX IF NOT EXISTS idx_characters_active    ON characters(active);
CREATE INDEX IF NOT EXISTS idx_income_date          ON income_records(date);
CREATE INDEX IF NOT EXISTS idx_income_character     ON income_records(character_id, date);
CREATE INDEX IF NOT EXISTS idx_income_category      ON income_records(category, date);
CREATE INDEX IF NOT EXISTS idx_income_dungeon       ON income_records(dungeon_id, date);
CREATE INDEX IF NOT EXISTS idx_event_date           ON event_records(date);
CREATE INDEX IF NOT EXISTS idx_event_character      ON event_records(character_id, date);
CREATE INDEX IF NOT EXISTS idx_event_type           ON event_records(type, date);

-- ---------- 预置数据 ----------

-- 苍生铸世赛季预置数据（可重复执行）
-- 五人本首领数据以当前版本为准，默认 3 个；团队本默认 5 个。
-- 如游戏内数量不同，直接在设置页修改 total_bosses 即可。

INSERT OR IGNORE INTO dungeons (name, total_bosses, active, sort_order) VALUES
  ('南山马场', 3, 1, 10),
  ('玄元观',   3, 1, 20),
  ('昊渊极',   3, 1, 30),
  ('大阳津',   3, 1, 40),
  ('洛阳之战', 5, 1, 50);

INSERT OR IGNORE INTO event_types (name, active, sort_order) VALUES
  ('奇遇', 1, 10),
  ('资历', 1, 20),
  ('其它', 1, 30);
