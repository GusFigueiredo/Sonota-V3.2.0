-- # Memória curta dos chats de IA
-- Guarda apenas mensagens de conversa do próprio usuário. As tools continuam consultando
-- os dados reais no banco, portanto esta tabela não vira uma "segunda verdade" do Sonota.
CREATE TABLE ai_messages (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 channel TEXT NOT NULL CHECK(channel IN ('assistant','search')),
 role TEXT NOT NULL CHECK(role IN ('user','assistant')),
 content TEXT NOT NULL,
 metadata TEXT NOT NULL DEFAULT '{}',
 created_at TEXT NOT NULL
) STRICT;
CREATE INDEX ai_messages_owner ON ai_messages(user_id, channel, created_at DESC);

-- # Índice textual da Biblioteca
-- FTS5 complementa filtros exatos e embeddings. arrangement_id/user_id ficam UNINDEXED
-- porque servem apenas para relacionar o resultado textual ao registro original.
CREATE VIRTUAL TABLE arrangement_fts USING fts5(
 arrangement_id UNINDEXED,
 user_id UNINDEXED,
 content,
 tokenize='unicode61 remove_diacritics 2'
);
