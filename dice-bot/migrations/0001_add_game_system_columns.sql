-- Add game system support (CoC 6th & 7th edition)
ALTER TABLE Characters ADD COLUMN game TEXT NOT NULL DEFAULT 'coc7';
ALTER TABLE Sessions ADD COLUMN system TEXT NOT NULL DEFAULT 'coc7';
