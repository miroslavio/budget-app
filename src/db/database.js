import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');
const defaultDatabasePath = path.join(projectRoot, 'data', 'budget.sqlite');
const schemaPath = path.join(__dirname, 'schema.sql');
const migrationsDirectory = path.join(__dirname, 'migrations');

let database;

export function getDatabase() {
  if (database) return database;

  const databasePath = process.env.DB_PATH || defaultDatabasePath;
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });

  database = new DatabaseSync(databasePath);
  database.exec('PRAGMA foreign_keys = ON;');
  database.exec('PRAGMA journal_mode = WAL;');
  database.exec(fs.readFileSync(schemaPath, 'utf8'));
  seedDefaultCategories(database);
  runMigrations(database);

  return database;
}

function seedDefaultCategories(db) {
  const defaults = [
    ['Salary', 'income'],
    ['Other income', 'income'],
    ['Rent', 'expense'],
    ['Mortgage', 'expense'],
    ['Mortgage overpayment', 'expense'],
    ['Council tax', 'expense'],
    ['Energy bill', 'expense'],
    ['Broadband', 'expense'],
    ['Mobile phone', 'expense'],
    ['TV licence', 'expense'],
    ['Utilities', 'expense'],
    ['Groceries', 'expense'],
    ['Transport', 'expense'],
    ['Insurance', 'expense'],
    ['Subscriptions', 'expense'],
    ['Gym membership', 'expense'],
    ['Discretionary spending', 'expense'],
    ['Debt repayment', 'debt'],
    ['Emergency fund', 'savings'],
    ['ISA', 'savings'],
    ['Savings', 'savings']
  ];

  const statement = db.prepare('INSERT OR IGNORE INTO categories (name, kind) VALUES (?, ?)');
  for (const [name, kind] of defaults) statement.run(name, kind);
}

export function runMigrations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  if (!fs.existsSync(migrationsDirectory)) return;

  const migrations = fs
    .readdirSync(migrationsDirectory)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  for (const migration of migrations) {
    const alreadyApplied = db.prepare('SELECT id FROM schema_migrations WHERE id = ?').get(migration);
    if (alreadyApplied) continue;

    db.exec('BEGIN');
    try {
      db.exec(fs.readFileSync(path.join(migrationsDirectory, migration), 'utf8'));
      db.prepare('INSERT INTO schema_migrations (id) VALUES (?)').run(migration);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}
