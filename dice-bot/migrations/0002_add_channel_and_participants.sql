-- セッションをチャンネル単位で管理するための channel_id 追加
ALTER TABLE Sessions ADD COLUMN channel_id TEXT NOT NULL DEFAULT '';

-- 旧インデックスを削除して channel_id を含む複合インデックスに置き換え
DROP INDEX IF EXISTS idx_sessions_guild;
CREATE INDEX IF NOT EXISTS idx_sessions_guild_channel ON Sessions(guild_id, channel_id, status);

-- セッション参加者テーブル（/char set 実行時に自動登録）
CREATE TABLE IF NOT EXISTS Session_Participants (
  session_id   TEXT     NOT NULL,
  user_id      TEXT     NOT NULL,
  character_id TEXT     NOT NULL,
  joined_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (session_id, user_id),
  FOREIGN KEY (session_id) REFERENCES Sessions(id),
  FOREIGN KEY (character_id) REFERENCES Characters(id)
);
