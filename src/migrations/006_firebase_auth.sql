ALTER TABLE users ADD COLUMN firebase_uid TEXT;
CREATE UNIQUE INDEX users_firebase_uid ON users(firebase_uid) WHERE firebase_uid IS NOT NULL;
