-- V3.2.0: timestamps separados permitem estimar progresso/tempo restante no Laboratório.
ALTER TABLE jobs ADD COLUMN started_at TEXT;
ALTER TABLE jobs ADD COLUMN completed_at TEXT;
