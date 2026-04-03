-- Cloudflare D1 Schema for CoC Discord Bot (6th & 7th Edition)

CREATE TABLE IF NOT EXISTS Characters (
  id         TEXT     PRIMARY KEY,
  user_id    TEXT     NOT NULL,
  game       TEXT     NOT NULL DEFAULT 'coc7', -- 'coc7' | 'coc6'
  name       TEXT     NOT NULL,
  hp         INTEGER  NOT NULL DEFAULT 0,
  mp         INTEGER  NOT NULL DEFAULT 0,
  san        INTEGER  NOT NULL DEFAULT 0,
  luck       INTEGER  NOT NULL DEFAULT 0,
  stats      TEXT     NOT NULL DEFAULT '{}', -- JSON: {"STR":50,"DEX":60,...}
  skills     TEXT     NOT NULL DEFAULT '{}', -- JSON: {"目星":60,"図書館":70,...}
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Active_Characters (
  user_id      TEXT PRIMARY KEY,
  character_id TEXT NOT NULL,
  FOREIGN KEY (character_id) REFERENCES Characters(id)
);

CREATE TABLE IF NOT EXISTS Sessions (
  id          TEXT     PRIMARY KEY,
  guild_id    TEXT     NOT NULL,             -- Discordサーバー単位で管理
  name        TEXT     NOT NULL,
  kp_user_id  TEXT     NOT NULL,
  status      TEXT     NOT NULL DEFAULT 'active', -- 'active' | 'completed'
  system      TEXT     NOT NULL DEFAULT 'coc7',   -- 'coc7' | 'coc6'
  started_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at    DATETIME
);

CREATE TABLE IF NOT EXISTS Dice_Logs (
  id             INTEGER  PRIMARY KEY AUTOINCREMENT,
  session_id     TEXT     NOT NULL,
  user_id        TEXT     NOT NULL,
  character_name TEXT     NOT NULL,
  skill_name     TEXT     NOT NULL,
  target_value   INTEGER  NOT NULL,
  final_dice     INTEGER  NOT NULL,
  result_level   TEXT     NOT NULL, -- 'critical'|'extreme'|'hard'|'regular'|'failure'|'fumble'
  is_secret      INTEGER  NOT NULL DEFAULT 0, -- 0=false, 1=true
  timestamp      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES Sessions(id)
);

CREATE INDEX IF NOT EXISTS idx_dice_logs_session  ON Dice_Logs(session_id);
CREATE INDEX IF NOT EXISTS idx_dice_logs_user     ON Dice_Logs(user_id);
CREATE INDEX IF NOT EXISTS idx_characters_user    ON Characters(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_guild     ON Sessions(guild_id, status);
