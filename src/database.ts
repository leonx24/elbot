import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";

mkdirSync("data", { recursive: true });

export const db = new Database("data/bot.db");
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS warnings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    moderator_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    channel_id TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL DEFAULT 'general',
    status TEXT NOT NULL DEFAULT 'open',
    claimed_by TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    closed_at TEXT,
    close_reason TEXT,
    rating INTEGER,
    rating_feedback TEXT
  );

  CREATE TABLE IF NOT EXISTS bug_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    steps TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS command_usage (
    command TEXT PRIMARY KEY,
    uses INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS changelogs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    author_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS bot_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS script_executions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    discord_id TEXT,
    roblox_username TEXT NOT NULL,
    roblox_id TEXT NOT NULL,
    place_id TEXT NOT NULL,
    executor TEXT NOT NULL,
    executed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

const ticketColumns = db.prepare("PRAGMA table_info(tickets)").all() as Array<{ name: string }>;
const existingTicketColumns = new Set(ticketColumns.map((column) => column.name));
const ticketMigrations: Array<[string, string]> = [
  ["category", "ALTER TABLE tickets ADD COLUMN category TEXT NOT NULL DEFAULT 'general'"],
  ["claimed_by", "ALTER TABLE tickets ADD COLUMN claimed_by TEXT"],
  ["close_reason", "ALTER TABLE tickets ADD COLUMN close_reason TEXT"],
  ["rating", "ALTER TABLE tickets ADD COLUMN rating INTEGER"],
  ["rating_feedback", "ALTER TABLE tickets ADD COLUMN rating_feedback TEXT"]
];

for (const [column, sql] of ticketMigrations) {
  if (!existingTicketColumns.has(column)) {
    db.exec(sql);
    console.log(`Database migration: tickets.${column} ditambahkan`);
  }
}

export function trackCommand(command: string): void {
  db.prepare(`
    INSERT INTO command_usage (command, uses) VALUES (?, 1)
    ON CONFLICT(command) DO UPDATE SET uses = uses + 1
  `).run(command);
}

export function logScriptExecution(data: {
  discordId?: string;
  robloxUsername: string;
  robloxId: string;
  placeId: string;
  executor: string;
}): void {
  db.prepare(`
    INSERT INTO script_executions (discord_id, roblox_username, roblox_id, place_id, executor)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    data.discordId || null,
    data.robloxUsername,
    data.robloxId,
    data.placeId,
    data.executor
  );
}

export function getScriptExecutionStats() {
  const total = (db.prepare("SELECT COUNT(*) as count FROM script_executions").get() as { count: number }).count;

  const last24h = (db.prepare(`
    SELECT COUNT(*) as count 
    FROM script_executions 
    WHERE executed_at >= datetime('now', '-24 hours')
  `).get() as { count: number }).count;

  const topExecutorRow = db.prepare(`
    SELECT executor, COUNT(*) as count
    FROM script_executions
    GROUP BY executor
    ORDER BY count DESC
    LIMIT 1
  `).get() as { executor: string; count: number } | undefined;

  const topGameRow = db.prepare(`
    SELECT place_id, COUNT(*) as count
    FROM script_executions
    GROUP BY place_id
    ORDER BY count DESC
    LIMIT 1
  `).get() as { place_id: string; count: number } | undefined;

  return {
    total,
    last24h,
    topExecutor: topExecutorRow ? `${topExecutorRow.executor} (${topExecutorRow.count}x)` : "Belum ada data",
    topGame: topGameRow ? `${topGameRow.place_id} (${topGameRow.count}x)` : "Belum ada data"
  };
}
