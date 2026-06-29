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

  CREATE TABLE IF NOT EXISTS monitored_places (
    place_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    universe_id INTEGER NOT NULL,
    last_updated TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS user_keys (
    discord_id TEXT PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    roblox_id TEXT,
    hwid TEXT,
    last_reset_at TEXT,
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

const userKeyColumns = db.prepare("PRAGMA table_info(user_keys)").all() as Array<{ name: string }>;
const existingUserKeyColumns = new Set(userKeyColumns.map((column) => column.name));
if (!existingUserKeyColumns.has("last_reset_at")) {
  db.exec("ALTER TABLE user_keys ADD COLUMN last_reset_at TEXT");
  console.log("Database migration: user_keys.last_reset_at ditambahkan");
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

export function generateUniqueKey(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const segment = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `LEONX-${segment()}-${segment()}-${segment()}`;
}

export function getOrCreateUserKey(discordId: string): string {
  const existing = db.prepare("SELECT key FROM user_keys WHERE discord_id = ?").get(discordId) as { key: string } | undefined;
  if (existing) {
    return existing.key;
  }

  let newKey = generateUniqueKey();
  // Ensure uniqueness
  while (db.prepare("SELECT 1 FROM user_keys WHERE key = ?").get(newKey)) {
    newKey = generateUniqueKey();
  }

  db.prepare("INSERT INTO user_keys (discord_id, key) VALUES (?, ?)").run(discordId, newKey);
  return newKey;
}

export function forceGenerateUserKey(discordId: string): string {
  let newKey = generateUniqueKey();
  // Ensure uniqueness
  while (db.prepare("SELECT 1 FROM user_keys WHERE key = ?").get(newKey)) {
    newKey = generateUniqueKey();
  }

  db.prepare(`
    INSERT INTO user_keys (discord_id, key, roblox_id, hwid, last_reset_at)
    VALUES (?, ?, NULL, NULL, NULL)
    ON CONFLICT(discord_id) DO UPDATE SET
      key = excluded.key,
      roblox_id = NULL,
      hwid = NULL,
      last_reset_at = NULL
  `).run(discordId, newKey);

  return newKey;
}

export function validateUserKey(
  key: string,
  robloxId?: string,
  hwid?: string
): { valid: boolean; message: string; discordId?: string } {
  const row = db.prepare("SELECT * FROM user_keys WHERE key = ?").get(key) as {
    discord_id: string;
    key: string;
    roblox_id: string | null;
    hwid: string | null;
    created_at: string;
  } | undefined;

  if (!row) {
    return { valid: false, message: "Key tidak valid atau tidak terdaftar." };
  }

  // If key already has hwid registered, it must match
  if (row.hwid && hwid && row.hwid !== hwid) {
    return { valid: false, message: "Key ini sudah terdaftar untuk perangkat (HWID) lain." };
  }

  // Bind key to hwid if not yet bound, and update robloxId if it changed or was not set (without restricting)
  const updates: string[] = [];
  const params: any[] = [];

  if (robloxId && row.roblox_id !== robloxId) {
    updates.push("roblox_id = ?");
    params.push(robloxId);
  }
  if (!row.hwid && hwid) {
    updates.push("hwid = ?");
    params.push(hwid);
  }

  if (updates.length > 0) {
    params.push(key);
    db.prepare(`UPDATE user_keys SET ${updates.join(", ")} WHERE key = ?`).run(...params);
    return { valid: true, message: "Key berhasil divalidasi dan dikaitkan ke perangkat Anda.", discordId: row.discord_id };
  }

  return { valid: true, message: "Key valid.", discordId: row.discord_id };
}

export function resetUserKeyBinding(discordId: string): { success: boolean; message: string } {
  const row = db.prepare("SELECT last_reset_at, key FROM user_keys WHERE discord_id = ?").get(discordId) as { last_reset_at: string | null; key: string } | undefined;

  if (!row) {
    return { success: false, message: "Anda belum memiliki key yang terdaftar. Silakan gunakan `/script` terlebih dahulu." };
  }

  // Check 24 hour cooldown
  if (row.last_reset_at) {
    const lastReset = new Date(row.last_reset_at).getTime();
    const now = Date.now();
    const diffHours = (now - lastReset) / (1000 * 60 * 60);

    if (diffHours < 24) {
      const remainingHours = Math.ceil(24 - diffHours);
      return { success: false, message: `Anda hanya dapat mereset HWID sekali setiap 24 jam. Silakan coba lagi dalam ${remainingHours} jam.` };
    }
  }

  const nowString = new Date().toISOString();
  db.prepare("UPDATE user_keys SET roblox_id = NULL, hwid = NULL, last_reset_at = ? WHERE discord_id = ?")
    .run(nowString, discordId);

  return { success: true, message: "Berhasil mereset data HWID dan Roblox ID Anda. Silakan jalankan script kembali di Roblox untuk mengaitkannya ke perangkat/akun baru." };
}
