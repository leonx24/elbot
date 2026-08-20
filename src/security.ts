import { IncomingMessage, ServerResponse } from "node:http";
import { Client, ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder } from "discord.js";
import { banIp, isIpBanned } from "./database.js";
import { config } from "./config.js";

interface IpRateLimit {
  count: number;
  resetAt: number;
}

interface FailedKeyTracker {
  count: number;
  lastAttempt: number;
  keys: string[];
}

const rateLimitMap = new Map<string, IpRateLimit>();
const failedKeyMap = new Map<string, FailedKeyTracker>();

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

export function getClientIp(req: IncomingMessage): string {
  const cfIp = req.headers["cf-connecting-ip"];
  if (typeof cfIp === "string" && cfIp.trim()) {
    return cfIp.trim();
  }

  const xRealIp = req.headers["x-real-ip"];
  if (typeof xRealIp === "string" && xRealIp.trim()) {
    return xRealIp.trim();
  }

  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    const parts = forwarded.split(",");
    if (parts[0]) return parts[0].trim();
  }

  const remoteAddress = req.socket?.remoteAddress;
  if (remoteAddress) {
    return remoteAddress.replace(/^.*:/, "") || "127.0.0.1";
  }

  return "Unknown IP";
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
  const targetChannelId = config.SECURITY_LOG_CHANNEL_ID || "1539927426199461918";
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
 * Catat kegagalan key untuk mendeteksi brute-force / bypass key
 */
export async function recordFailedKeyAttempt(
  ip: string,
  key: string,
  client?: Client,
  details?: { hwid?: string; robloxId?: string; username?: string }
) {
  if (!ip || ip === "127.0.0.1" || ip === "Unknown IP") return;

  const now = Date.now();
  let tracker = failedKeyMap.get(ip);

  if (!tracker || now - tracker.lastAttempt > 120_000) {
    tracker = { count: 0, lastAttempt: now, keys: [] };
  }

  tracker.count += 1;
  tracker.lastAttempt = now;
  if (!tracker.keys.includes(key)) {
    tracker.keys.push(key);
  }
  failedKeyMap.set(ip, tracker);

  // Jika gagal 5 kali dalam 2 menit -> Auto-Ban IP
  if (tracker.count >= 5) {
    const reason = `Key Brute-force / Bypass Attack (${tracker.count}x failed attempts with keys: ${tracker.keys.slice(-3).join(", ")})`;
    banIp(ip, reason);

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

  // 3. In-memory Rate Limiting (Maks 40 requests / 10 detik per IP)
  const now = Date.now();
  let rateInfo = rateLimitMap.get(ip);
  if (!rateInfo || now > rateInfo.resetAt) {
    rateInfo = { count: 1, resetAt: now + 10_000 };
  } else {
    rateInfo.count += 1;
  }
  rateLimitMap.set(ip, rateInfo);

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
