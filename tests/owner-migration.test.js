import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { migrateOwners } from '../src/owner-migration.js';

test('Migração preserva dados antigos e relacionamentos, permitindo donos sem contas locais', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('PRAGMA foreign_keys=ON; CREATE TABLE migrations(name TEXT PRIMARY KEY,applied_at TEXT)');
    for (const name of readdirSync(new URL('../src/migrations/', import.meta.url)).filter(n=>n.endsWith('.sql')).sort()) db.exec(readFileSync(new URL('../src/migrations/'+name,import.meta.url),'utf8'));
    db.exec("INSERT INTO users(id,email,password_hash,name,created_at,updated_at) VALUES ('old','old@example.test','hash','Pessoa','2026-01-01','2026-01-01')");
    db.exec("INSERT INTO clients(id,user_id,name,type,status,created_at,updated_at) VALUES ('client','old','Cliente','Pessoa','Ativo','2026-01-01','2026-01-01')");
    migrateOwners(db);
    migrateOwners(db);
    assert.equal(db.prepare('SELECT user_id FROM clients').get().user_id,'old');
    assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys,1);
    assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
    db.exec("INSERT INTO owners(id) VALUES ('firebase-uid')");
    db.exec("UPDATE clients SET user_id='firebase-uid'");
    assert.equal(db.prepare('SELECT COUNT(*) n FROM users').get().n,1);
    assert.throws(()=>db.exec("UPDATE clients SET user_id='missing'"),/FOREIGN KEY/);
  } finally { db.close(); }
});
