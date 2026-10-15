-- Referências técnicas de arquivos do perfil remoto; nenhum dado de conta.
CREATE TABLE file_pins (
 file_id TEXT PRIMARY KEY REFERENCES files(id) ON DELETE CASCADE
) STRICT;
