// Separa a propriedade dos dados de negócio das antigas contas locais.
export function migrateOwners(db) {
  if (db.prepare("SELECT 1 FROM migrations WHERE name='008_cloud_owners'").get()) return;
  db.exec('PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE');
  try {
    db.exec('CREATE TABLE owners(id TEXT PRIMARY KEY, firebase_uid TEXT UNIQUE) STRICT; INSERT INTO owners SELECT id,firebase_uid FROM users');
    const tables = db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' AND sql LIKE '%REFERENCES users%'").all().filter(t => t.name !== 'sessions');
    for (const table of tables) {
      const indexes = db.prepare("SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name=? AND sql IS NOT NULL").all(table.name);
      const name = table.name;
      if (!/^[a-z_]+$/.test(name)) throw new Error('Nome de tabela inválido');
      db.exec(table.sql.replace(new RegExp(`CREATE TABLE ${name}\\b`), `CREATE TABLE ${name}_new`).replaceAll('REFERENCES users', 'REFERENCES owners'));
      db.exec(`INSERT INTO ${name}_new SELECT * FROM ${name}; DROP TABLE ${name}; ALTER TABLE ${name}_new RENAME TO ${name}`);
      for (const index of indexes) db.exec(index.sql);
    }
    // Mantém compatibilidade para dados históricos e testes do sistema anterior.
    db.exec('CREATE TRIGGER user_owner AFTER INSERT ON users BEGIN INSERT OR IGNORE INTO owners(id) VALUES (NEW.id); END');
    if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Migração de proprietários violou relacionamentos');
    db.prepare('INSERT INTO migrations VALUES (?,?)').run('008_cloud_owners', new Date().toISOString());
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  finally { db.exec('PRAGMA foreign_keys=ON'); }
}
