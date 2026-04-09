-- Dice_Logs に extra_value 列を追加（SANチェック時のSAN減少量）
ALTER TABLE Dice_Logs ADD COLUMN extra_value INTEGER;
