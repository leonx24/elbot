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

  CREATE TABLE IF NOT EXISTS blacklist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    discord_id TEXT,
    roblox_id TEXT,
    hwid TEXT,
    reason TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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



export function addToBlacklist(data: {
  discordId?: string;
  robloxId?: string;
  hwid?: string;
  reason: string;
}): void {
  db.prepare(`
    INSERT INTO blacklist (discord_id, roblox_id, hwid, reason)
    VALUES (?, ?, ?, ?)
  `).run(
    data.discordId || null,
    data.robloxId || null,
    data.hwid || null,
    data.reason
  );
}

export function removeFromBlacklist(criteria: {
  discordId?: string;
  robloxId?: string;
  hwid?: string;
}): boolean {
  let result;
  if (criteria.discordId) {
    result = db.prepare("DELETE FROM blacklist WHERE discord_id = ?").run(criteria.discordId);
  } else if (criteria.robloxId) {
    result = db.prepare("DELETE FROM blacklist WHERE roblox_id = ?").run(criteria.robloxId);
  } else if (criteria.hwid) {
    result = db.prepare("DELETE FROM blacklist WHERE hwid = ?").run(criteria.hwid);
  } else {
    return false;
  }
  return result.changes > 0;
}

export function isBlacklisted(criteria: {
  discordId?: string;
  robloxId?: string;
  hwid?: string;
}): { blacklisted: boolean; reason?: string } {
  let row;
  if (criteria.discordId) {
    row = db.prepare("SELECT reason FROM blacklist WHERE discord_id = ? LIMIT 1").get(criteria.discordId) as { reason: string } | undefined;
  }
  if (!row && criteria.robloxId) {
    row = db.prepare("SELECT reason FROM blacklist WHERE roblox_id = ? LIMIT 1").get(criteria.robloxId) as { reason: string } | undefined;
  }
  if (!row && criteria.hwid) {
    row = db.prepare("SELECT reason FROM blacklist WHERE hwid = ? LIMIT 1").get(criteria.hwid) as { reason: string } | undefined;
  }

  if (row) {
    return { blacklisted: true, reason: row.reason };
  }
  return { blacklisted: false };
}

export function getBlacklistList(): Array<{
  id: number;
  discord_id: string | null;
  roblox_id: string | null;
  hwid: string | null;
  reason: string;
  created_at: string;
}> {
  return db.prepare("SELECT * FROM blacklist ORDER BY id DESC").all() as any;
}
