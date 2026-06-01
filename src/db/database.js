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
  runMigrations(database);

  return database;
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
    if (migration === '009_add_skip_planned_savings.sql' && tableHasColumn(db, 'households', 'skip_planned_savings')) {
      db.prepare('INSERT INTO schema_migrations (id) VALUES (?)').run(migration);
      continue;
    }
    if (migration === '010_add_category_budget_default_is_active.sql' && tableHasColumn(db, 'category_budget_defaults', 'is_active')) {
      db.prepare('INSERT INTO schema_migrations (id) VALUES (?)').run(migration);
      continue;
    }
    if (
      migration === '011_add_savings_goal_tracking_fields.sql' &&
      tableHasColumn(db, 'savings_goals', 'tracking_mode') &&
      tableHasColumn(db, 'savings_goals', 'goal_type') &&
      tableHasColumn(db, 'savings_goals', 'notes')
    ) {
      db.prepare('INSERT INTO schema_migrations (id) VALUES (?)').run(migration);
      continue;
    }
    if (
      migration === '012_add_savings_account_access_fields.sql' &&
      tableHasColumn(db, 'savings_accounts', 'available_for_household_cashflow') &&
      tableHasColumn(db, 'savings_accounts', 'access_type') &&
      tableHasColumn(db, 'savings_accounts', 'access_date') &&
      tableHasColumn(db, 'savings_accounts', 'access_age') &&
      tableHasColumn(db, 'savings_accounts', 'access_notes')
    ) {
      db.prepare('INSERT INTO schema_migrations (id) VALUES (?)').run(migration);
      continue;
    }
    if (migration === '013_add_household_forecast_adjustment.sql' && tableHasColumn(db, 'households', 'forecast_adjustment_pence')) {
      db.prepare('INSERT INTO schema_migrations (id) VALUES (?)').run(migration);
      continue;
    }

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

function tableHasColumn(db, tableName, columnName) {
  return db.prepare(`PRAGMA table_info(${tableName})`).all().some((column) => column.name === columnName);
}
