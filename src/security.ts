import { IncomingMessage, ServerResponse } from "node:http";
import { Client, ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder } from "discord.js";
import {
  banIp,
  isIpBanned,
  isPrivateOrInternalIp,
  getRateLimit,
  upsertRateLimit,
  cleanupExpiredRateLimits,
  getFailedKeyAttempts,
  upsertFailedKeyAttempt,
  deleteFailedKeyAttempts,
  cleanupExpiredFailedAttempts,
  isKeyLocked,
  lockKey,
  cleanupExpiredKeyLocks,
  getGlobalKeyFailures,
  upsertGlobalKeyFailure,
  deleteGlobalKeyFailure
} from "./database.js";
import { config } from "./config.js";

// Malicious probe paths & file names often targeted by scanners and scrapers
const MALICIOUS_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\/\.env(\.|$)/i, reason: "Attempt to scrape environment variables (.env)" },
  { pattern: /\/\.git(\/|$)/i, reason: "Attempt to dump git repository metadata (.git)" },
  { pattern: /\/\.vscode(\/|$)/i, reason: "Attempt to access IDE config (.vscode)" },
  { pattern: /\/\.aws(\/|$)/i, reason: "Attempt to access AWS credentials (.aws)" },
  { pattern: /\/\.ssh(\/|$)/i, reason: "Attempt to access SSH keys (.ssh)" },
  { pattern: /\/\.bash_history/i, reason: "Attempt to access shell history" },
  { pattern: /\/wp-(login|admin|content|includes|config)/i, reason: "WordPress scanner probe" },
  { pattern: /\/(phpmyadmin|pma|adminer|mysqladmin)/i, reason: "Database admin scanner probe" },
  { pattern: /\/(eval|dump|shell|webshell|cmd|exec|c99|r57)\.php/i, reason: "Webshell / remote code execution probe" },
  { pattern: /\/(\.\.\/|\.\.\\)/, reason: "Directory traversal attack (../)" },
  { pattern: /\/(etc\/passwd|etc\/shadow|proc\/self\/environ|windows\/win\.ini)/i, reason: "LFI / System file access probe" },
  { pattern: /\/(config\.json|config\.ts|database\.sqlite|data\.db)/i, reason: "Attempt to access server database/config files" },
  { pattern: /\/(setup|install|xmlrpc|telescope|actuator)\.php/i, reason: "Vulnerability probe" }
];

const IP_REGEX = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$|^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;

/**
 * Get the real client IP address.
 * Prioritizes CF-Connecting-IP, X-Real-IP, and X-Forwarded-For (from Railway / Cloudflare),
 * filtering out internal private networks (e.g. Railway CGNAT 100.64.0.0/10, localhost).
 */
export function getClientIp(req: IncomingMessage): string {
  // 1. Cloudflare header (if present and public)
  const cfIp = req.headers["cf-connecting-ip"];
  if (typeof cfIp === "string") {
    const trimmed = cfIp.trim();
    if (IP_REGEX.test(trimmed) && !isPrivateOrInternalIp(trimmed)) return trimmed;
  }

  // 2. X-Real-IP header
  const realIp = req.headers["x-real-ip"];
  if (typeof realIp === "string") {
    const trimmed = realIp.trim();
    if (IP_REGEX.test(trimmed) && !isPrivateOrInternalIp(trimmed)) return trimmed;
  }

  // 3. X-Forwarded-For header (Railway edge proxy passes real client IP here)
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    const list = forwarded.split(",");
    for (const raw of list) {
      const trimmed = raw.trim();
      if (IP_REGEX.test(trimmed) && !isPrivateOrInternalIp(trimmed)) {
        return trimmed;
      }
    }
  }

  // 4. Remote socket address fallback
  const remoteAddress = req.socket?.remoteAddress;
  if (remoteAddress) {
    let clean = remoteAddress;
    if (clean.startsWith("::ffff:")) {
      clean = clean.slice(7);
    }
    if (IP_REGEX.test(clean) && !isPrivateOrInternalIp(clean)) {
      return clean;
    }
  }

  return "127.0.0.1";
}

/**
 * Kirim real-time Security Alert ke channel log Discord
 */
export async function sendSecurityAlert(
  client: Client,
  data: {
    ip: string;
    threatType: string;
    reason: string;
    pathname: string;
    userAgent?: string;
    hwid?: string;
    robloxId?: string;
    actionTaken: string;
  }
) {
  const targetChannelId = config.SECURITY_LOG_CHANNEL_ID;
  if (!targetChannelId) return;

  try {
    const channel = await client.channels.fetch(targetChannelId).catch(() => null);
    if (!channel || !("send" in channel) || typeof channel.send !== "function") return;

    const embed = new EmbedBuilder()
      .setTitle("🚨 Security Alert: Malicious Attack / Probe Blocked")
      .setColor(0xed4245)
      .setDescription(`Sistem anti-tamper mendeteksi aktivitas mencurigakan dan telah memblokir akses secara otomatis.`)
      .addFields(
        { name: "🌐 IP Address", value: `\`${data.ip}\``, inline: true },
        { name: "🛡️ Threat Type", value: `\`${data.threatType}\``, inline: true },
        { name: "⚠️ Alasan", value: `${data.reason}`, inline: false },
        { name: "📍 Path / Target", value: `\`${data.pathname}\``, inline: false },
        { name: "📱 User-Agent", value: `\`${(data.userAgent || "Unknown").slice(0, 100)}\``, inline: false },
        { name: "⚡ Tindakan", value: `**${data.actionTaken}**`, inline: false }
      )
      .setTimestamp()
      .setFooter({ text: "LeonX Hub • Anti-Tamper & Security Engine" });

    if (data.hwid) {
      embed.addFields({ name: "💻 HWID Terdeteksi", value: `\`${data.hwid}\``, inline: true });
    }
    if (data.robloxId) {
      embed.addFields({ name: "🎮 Roblox ID", value: `\`${data.robloxId}\``, inline: true });
    }

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`security:unban:${data.ip.replace(/:/g, "_")}`)
        .setLabel(`Unban IP (${data.ip.slice(0, 15)})`)
        .setEmoji("🔓")
        .setStyle(ButtonStyle.Secondary)
    );

    if (data.hwid) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`security:blacklist_hwid:${data.hwid.slice(0, 50)}`)
          .setLabel("Blacklist HWID")
          .setEmoji("⛔")
          .setStyle(ButtonStyle.Danger)
      );
    }

    await channel.send({
      embeds: [embed],
      components: [row]
    });
  } catch (err) {
    console.error("[Security Alert] Gagal mengirim alert ke Discord:", err);
  }
}

/**
 * Catat kegagalan key untuk mendeteksi brute-force / bypass key.
 * Uses persistent SQLite storage (survives restarts).
 * Also tracks global per-key failures for key locking.
 */
export async function recordFailedKeyAttempt(
  ip: string,
  key: string,
  client?: Client,
  details?: { hwid?: string; robloxId?: string; username?: string }
) {
  if (!ip || ip === "127.0.0.1" || ip === "Unknown IP") return;

  const now = Date.now();

  // ── Per-IP tracking (persistent in SQLite) ──
  let tracker = getFailedKeyAttempts(ip);

  if (!tracker || now - tracker.last_attempt > 120_000) {
    // Reset if older than 2 minutes
    tracker = { count: 0, last_attempt: now, keys_json: "[]" };
  }

  const count = tracker.count + 1;
  let keys: string[];
  try {
    keys = JSON.parse(tracker.keys_json) as string[];
  } catch {
    keys = [];
  }
  if (!keys.includes(key)) {
    keys.push(key);
  }

  upsertFailedKeyAttempt(ip, count, now, JSON.stringify(keys));

  // Jika gagal 5 kali dalam 2 menit -> Auto-Ban IP
  if (count >= 5) {
    const reason = `Key Brute-force / Bypass Attack (${count}x failed attempts with keys: ${keys.slice(-3).join(", ")})`;
    banIp(ip, reason);
    deleteFailedKeyAttempts(ip);

    if (client) {
      await sendSecurityAlert(client, {
        ip,
        threatType: "Key Brute-Force / Tampering",
        reason,
        pathname: "/api/validate-key or /load.php",
        hwid: details?.hwid,
        robloxId: details?.robloxId,
        actionTaken: "⛔ IP Auto-Banned & Blacklisted Permanently"
      });
    }
  }

  // ── Global per-key tracking (brute-force from multiple IPs) ──
  const globalTracker = getGlobalKeyFailures(key);
  const TEN_MINUTES = 10 * 60 * 1000;

  if (now - globalTracker.firstFailure > TEN_MINUTES) {
    // Reset window
    upsertGlobalKeyFailure(key, 1, now);
  } else {
    const newCount = globalTracker.count + 1;
    upsertGlobalKeyFailure(key, newCount, globalTracker.firstFailure);

    // If key fails >5 times globally, lock it with progressive escalation
    if (newCount > 5 && !isKeyLocked(key)) {
      let lockDuration = 30 * 60 * 1000; // 30 minutes default
      if (newCount > 15) {
        lockDuration = 24 * 60 * 60 * 1000; // 24 hours
      } else if (newCount > 10) {
        lockDuration = 2 * 60 * 60 * 1000; // 2 hours
      }

      const lockDurationText = lockDuration >= 86400000 ? "24 hours" : (lockDuration >= 7200000 ? "2 hours" : "30 minutes");
      const lockReason = `Key locked: ${newCount}x global failed attempts (${lockDurationText})`;
      lockKey(key, lockDuration, lockReason);
      // Fix #14: Do NOT delete global failure counter on lock to prevent lock-wait-repeat attack cycle

      if (client) {
        await sendSecurityAlert(client, {
          ip,
          threatType: "Key Brute-Force (Global Lock)",
          reason: lockReason,
          pathname: "/api/validate-key or /load.php",
          hwid: details?.hwid,
          robloxId: details?.robloxId,
          actionTaken: `🔒 Key Locked for ${lockDurationText} (multi-IP brute-force)`
        });
      }
    }
  }
}

/**
 * Middleware pemeriksaan keamanan untuk HTTP Server
 * Mengembalikan false jika request DITOLAK / DIBLOKIR.
 */
export async function handleSecurityCheck(
  req: IncomingMessage,
  res: ServerResponse,
  client?: Client
): Promise<boolean> {
  const ip = getClientIp(req);
  const rawUrl = req.url || "/";
  const userAgent = req.headers["user-agent"] || "Unknown";

  // 1. Cek apakah IP sudah ada di daftar Banned
  if (isIpBanned(ip)) {
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Access Denied: Your IP address is permanently banned due to security violations." }));
    return false;
  }

  // 2. Cek apakah ada pola path / scanner berbahaya
  const decodedUrl = decodeURIComponent(rawUrl.split("?")[0] || "");
  for (const item of MALICIOUS_PATTERNS) {
    if (item.pattern.test(decodedUrl) || item.pattern.test(rawUrl)) {
      banIp(ip, item.reason);

      if (client) {
        // Kirim alert async agar tidak blocking
        sendSecurityAlert(client, {
          ip,
          threatType: "Malicious File / Scanner Probing",
          reason: item.reason,
          pathname: decodedUrl,
          userAgent,
          actionTaken: "⛔ IP Auto-Banned & Request Blocked (403)"
        }).catch(() => null);
      }

      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Access Forbidden: Malicious request signature detected. Your IP has been banned." }));
      return false;
    }
  }

  // 3. Persistent Rate Limiting (Maks 40 requests / 10 detik per IP) — stored in SQLite
  const now = Date.now();
  let rateInfo = getRateLimit(ip);
  if (!rateInfo || now > rateInfo.reset_at) {
    rateInfo = { count: 1, reset_at: now + 10_000 };
  } else {
    rateInfo = { count: rateInfo.count + 1, reset_at: rateInfo.reset_at };
  }
  upsertRateLimit(ip, rateInfo.count, rateInfo.reset_at);

  if (rateInfo.count > 40) {
    // Jika spam sangat parah (> 100 req dlm 10 detik) -> Auto-Ban
    if (rateInfo.count > 100) {
      banIp(ip, `DoS / Excessive Request Flooding (${rateInfo.count} reqs in 10s)`);
      if (client) {
        sendSecurityAlert(client, {
          ip,
          threatType: "DoS / Request Flooding",
          reason: `Flooded server with ${rateInfo.count} requests in 10 seconds.`,
          pathname: decodedUrl,
          userAgent,
          actionTaken: "⛔ IP Auto-Banned for DoS Flooding"
        }).catch(() => null);
      }
    }

    res.writeHead(429, { "Content-Type": "application/json", "Retry-After": "10" });
    res.end(JSON.stringify({ error: "Too Many Requests. Please slow down." }));
    return false;
  }

  return true;
}

/**
 * Start periodic cleanup for security-related data.
 * Call this once at bot startup.
 * Cleans up: expired rate limits, expired failed key attempts, expired key locks.
 */
export function startSecurityCleanup(): void {
  const THIRTY_MINUTES = 30 * 60 * 1000;
  setInterval(() => {
    try {
      cleanupExpiredRateLimits();
      cleanupExpiredFailedAttempts();
      cleanupExpiredKeyLocks();
      console.log("[Security] Periodic cleanup completed.");
    } catch (err) {
      console.error("[Security] Cleanup error:", err);
    }
  }, THIRTY_MINUTES);
}
