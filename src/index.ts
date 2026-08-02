import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  GuildMember,
  Message,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  TextChannel,
  TextInputBuilder,
  TextInputStyle
} from "discord.js";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { db, trackCommand, addToBlacklist, removeFromBlacklist, isBlacklisted, getBlacklistList, getOrCreateUserKey, forceGenerateUserKey, validateUserKey, resetUserKeyBinding } from "./database.js";
import {
  createTicketPanel,
  createTicketChannel,
  closeTicket,
  createRatingButtons,
  getTicketStats,
  TICKET_CATEGORIES,
  type TicketCategory
} from "./ticket-system.js";
import {
  renderVerifyCard,
  renderStatusCard,
  renderKeyInfoCard,
  renderFaqCard,
  renderWebsiteCard,
  renderRobloxProfileCard,
  renderGameMonitorCard,
  renderGameServersCard,
  renderGameUpdateAlertCard,
  renderMonitorListCard,
  renderTicketPanelCard,
  renderTicketWelcomeCard,
  renderTicketCloseCard,
  renderTicketRatingCard,
  renderRatingThanksCard,
  renderTicketStatsCard,
  renderAdminStatsCard,
  renderBlacklistCard,
  renderLookupCard,
  renderBugReportCard,
  renderChangelogCard,
  renderAutoModCard,
  renderExecutionLogCard,
  renderRatingLogCard,
  renderAutoBanCard,
  renderWelcomeCard,
  renderGoodbyeCard,
  renderRulesCard,
  renderAiResponseCard,
  renderClaimCard,
} from "./canvas-cards.js";

/** Helper: wrap a canvas card Buffer into an EmbedBuilder + AttachmentBuilder pair */
function cardEmbed(buffer: Buffer, color: number = 0x2f3136, filename = "card.png") {
  const attachment = new AttachmentBuilder(buffer, { name: filename });
  const embed = new EmbedBuilder().setImage(`attachment://${filename}`).setColor(color);
  return { embed, attachment };
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const cooldowns = new Map<string, number>();
const ticketDeleteTimers = new Map<string, NodeJS.Timeout>();
const ownerOnlyCommands = new Set(["warn", "timeout", "kick", "ban", "stats", "setstatus", "setvoicechannel", "blacklist", "monitor", "send-rules", "generatekey", "lookup"]);
const faq: Record<string, string> = {
  script: "Gunakan `/script nama:LeonX Hub Loader`. Bot akan mengirimkannya lewat DM.",
  error: "Cek `/status`, pastikan versinya terbaru, lalu kirim `/bug-report` bila masih error.",
  ticket: "Gunakan `/ticket`, kemudian tekan tombol **Buka Ticket**.",
  website: "Silakan kunjungi website kami di https://leonthings.my.id. Untuk mengelola key dan reset HWID, silakan buka halaman console bot di https://leonthings.my.id/bot."
};

const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent`;
const GEMINI_MAX_RETRIES = 3;
const GEMINI_TIMEOUT_MS = 25_000;

async function callGeminiAPI(contents: Array<{ role: string; parts: Array<{ text: string }> }>): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  for (let attempt = 1; attempt <= GEMINI_MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(`${GEMINI_API_URL}?key=${config.GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents }),
        signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS)
      });

      if (response.ok) {
        const data = await response.json() as any;
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
        return { ok: true, text };
      }

      // Retry on 503 (overloaded) or 429 (rate limit)
      if ((response.status === 503 || response.status === 429) && attempt < GEMINI_MAX_RETRIES) {
        const backoffMs = Math.min(
          30000,
          Math.pow(2, attempt) * 1000 + Math.floor(Math.random() * 1000)
        );
        console.warn(`[Gemini] ${response.status} on attempt ${attempt}/${GEMINI_MAX_RETRIES}, retrying in ${backoffMs}ms...`);
        await new Promise(r => setTimeout(r, backoffMs));
        continue;
      }

      const errText = await response.text().catch(() => "(unreadable)");
      console.error(`[Gemini] API error ${response.status}:`, errText);
      return { ok: false, error: `API error ${response.status}` };
    } catch (err: any) {
      const isTimeout = err?.name === "TimeoutError" || err?.code === "UND_ERR_HEADERS_TIMEOUT" || err?.cause?.code === "UND_ERR_HEADERS_TIMEOUT";
      if (isTimeout && attempt < GEMINI_MAX_RETRIES) {
        const backoffMs = Math.min(
    30000,
    Math.pow(2, attempt) * 1000 + Math.floor(Math.random() * 1000)
);
        console.warn(`[Gemini] Timeout on attempt ${attempt}/${GEMINI_MAX_RETRIES}, retrying in ${backoffMs}ms...`);
        await new Promise(r => setTimeout(r, backoffMs));
        continue;
      }
      console.error(`[Gemini] Fetch failed (attempt ${attempt}):`, err);
      return { ok: false, error: isTimeout ? "timeout" : "fetch_failed" };
    }
  }
  return { ok: false, error: "max_retries_exceeded" };
}

const changelogTypes = {
  major: { label: "MAJOR UPDATE", emoji: "🚀", color: 0x7c3aed },
  feature: { label: "NEW FEATURES", emoji: "✨", color: 0x2563eb },
  fix: { label: "BUG FIXES", emoji: "🛠️", color: 0x16a34a },
  maintenance: { label: "MAINTENANCE", emoji: "⚙️", color: 0xf59e0b }
} as const;

function formatChangelogContent(content: string): string {
  const items = content
    .split(/\n|\|/)
    .map((item) => item.trim().replace(/^[-•]\s*/, ""))
    .filter(Boolean);

  return items.map((item) => `> • ${item}`).join("\n").slice(0, 4000);
}

function extractPlaceId(input: string): string {
  const cleanInput = input.trim();
  const match = cleanInput.match(/(?:games|places)\/(\d+)/i);
  if (match?.[1]) return match[1];
  return cleanInput.replace(/\D/g, "");
}

const changeSections = {
  NEW: { title: "Added", emoji: "✨" },
  FIX: { title: "Fixed", emoji: "🔧" },
  IMPR: { title: "Improved", emoji: "⚡" },
  REM: { title: "Removed", emoji: "🗑️" }
} as const;

function buildEnhancedChanges(content: string): string {
  const grouped: Record<keyof typeof changeSections, string[]> = {
    NEW: [],
    FIX: [],
    IMPR: [],
    REM: []
  };

  for (const rawItem of content.split(/\n|\|/)) {
    const item = rawItem.trim().replace(/^[-•]\s*/, "");
    if (!item) continue;

    const match = item.match(/^(NEW|IMPR|FIX|REM)\s*:\s*(.+)$/i);
    const key = (match?.[1]?.toUpperCase() ?? "NEW") as keyof typeof changeSections;
    const text = match?.[2]?.trim() ?? item;
    grouped[key].push(text);
  }

  const sections = Object.entries(changeSections)
    .filter(([key]) => grouped[key as keyof typeof changeSections].length > 0)
    .map(([key, section]) => {
      const itemsList = grouped[key as keyof typeof changeSections];
      const items = itemsList
        .map((item, index) => {
          const prefix = index === itemsList.length - 1 ? "└─" : "├─";
          return `\`${prefix}\` ${item}`;
        })
        .join("\n");
      return `${section.emoji} **${section.title}**\n${items}`;
    });

  return sections.join("\n\n").slice(0, 4000);
}

type TicketRecord = {
  id: number;
  guild_id: string;
  user_id: string;
  channel_id: string;
  category: string;
  status: string;
  claimed_by: string | null;
  ai_responded: number;
};

function getOrRecoverTicket(channel: TextChannel): TicketRecord | undefined {
  const selectTicket = db.prepare("SELECT * FROM tickets WHERE channel_id = ?");
  const existing = selectTicket.get(channel.id) as TicketRecord | undefined;
  if (existing) return existing;

  const topicMatch = channel.topic?.match(
    /^Ticket by .+ \((\d+)\) \| Category: ([a-z]+) \| Created:/
  );
  if (!topicMatch?.[1] || !topicMatch[2]) return undefined;

  db.prepare(`
    INSERT OR IGNORE INTO tickets (guild_id, user_id, channel_id, category)
    VALUES (?, ?, ?, ?)
  `).run(channel.guild.id, topicMatch[1], channel.id, topicMatch[2]);

  return selectTicket.get(channel.id) as TicketRecord | undefined;
}

function onCooldown(userId: string, action: string, duration = 5_000): boolean {
  const key = `${userId}:${action}`;
  const now = Date.now();
  const expires = cooldowns.get(key) ?? 0;
  if (expires > now) return true;
  cooldowns.set(key, now + duration);
  return false;
}

function verificationPanel() {
  const button = new ButtonBuilder()
    .setCustomId("verify:accept")
    .setLabel("Verify")
    .setEmoji("✅")
    .setStyle(ButtonStyle.Success);

  const embed = new EmbedBuilder()
    .setColor(0x2f3136)
    .setTitle("✅ Verification Panel - LeonX Hub")
    .setDescription(
      "Selamat datang di server **LeonX Hub**!\n\n" +
      "---\n\n" +
      "### 📋 Langkah Verifikasi\n" +
      "• Klik tombol `/verify` di bawah ini untuk memulai.\n" +
      "• Dengan menekan tombol verifikasi, Anda menyetujui seluruh **Rules & Guidelines** server.\n" +
      "• Anda akan mendapatkan role terverifikasi dan akses penuh ke seluruh channel."
    )
    .setFooter({ text: "LeonX Hub • Verification System" })
    .setTimestamp();

  return {
    embeds: [embed],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(button)]
  };
}

async function ensureVerificationPanel(): Promise<void> {
  const channel = await client.channels.fetch(config.VERIFY_CHANNEL_ID);
  if (!channel?.isTextBased() || !channel.isSendable() || channel.isDMBased()) {
    throw new Error("VERIFY_CHANNEL_ID bukan channel teks server yang dapat dikirimi pesan.");
  }

  const settingKey = `verification_message:${config.GUILD_ID}`;
  const saved = db.prepare("SELECT value FROM bot_settings WHERE key = ?")
    .get(settingKey) as { value: string } | undefined;

  if (saved) {
    const existing = await channel.messages.fetch(saved.value).catch(() => null);
    if (existing) return;
  }

  // Scan channel history for existing panel to handle database wipes on Railway redeployment
  const messages = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  if (messages) {
    const existingPanel = messages.find(
      (m) =>
        m.author.id === client.user?.id &&
        m.embeds.some((e) => e.title === "Verifikasi Member")
    );
    if (existingPanel) {
      db.prepare(`
        INSERT INTO bot_settings (key, value) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `).run(settingKey, existingPanel.id);
      console.log(`Panel verifikasi ditemukan (self-healing) di #${channel.id}, ID: ${existingPanel.id}`);
      return;
    }
  }

  const message = await channel.send(verificationPanel());
  db.prepare(`
    INSERT INTO bot_settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(settingKey, message.id);
  console.log(`Panel verifikasi dibuat di #${channel.id}`);
}

async function ensureTicketPanel(): Promise<void> {
  const ticketChannelId = config.TICKET_CHANNEL_ID || "1519681008834842724";
  const channel = await client.channels.fetch(ticketChannelId);
  if (!channel?.isTextBased() || !channel.isSendable() || channel.isDMBased()) {
    throw new Error("TICKET_CHANNEL_ID bukan channel teks server yang dapat dikirimi pesan.");
  }

  const settingKey = `ticket_panel_message:${config.GUILD_ID}`;
  const saved = db.prepare("SELECT value FROM bot_settings WHERE key = ?")
    .get(settingKey) as { value: string } | undefined;

  if (saved) {
    const existing = await channel.messages.fetch(saved.value).catch(() => null);
    if (existing) return;
  }

  // Scan channel history for existing panel to handle database wipes on Railway redeployment
  const messages = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  if (messages) {
    const existingPanel = messages.find(
      (m) =>
        m.author.id === client.user?.id &&
        m.embeds.some((e) => e.title === "🎫 Support Ticket System")
    );
    if (existingPanel) {
      db.prepare(`
        INSERT INTO bot_settings (key, value) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `).run(settingKey, existingPanel.id);
      console.log(`Panel ticket ditemukan (self-healing) di #${channel.id}, ID: ${existingPanel.id}`);
      return;
    }
  }

  const message = await channel.send(createTicketPanel());
  db.prepare(`
    INSERT INTO bot_settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(settingKey, message.id);
  console.log(`Panel ticket dibuat di #${channel.id}`);
}

async function updateVoiceChannelStatus(status?: string): Promise<void> {
  const dbChannelId = db.prepare("SELECT value FROM bot_settings WHERE key = 'status_voice_channel_id'").get() as { value: string } | undefined;
  const channelId = dbChannelId?.value || config.STATUS_VOICE_CHANNEL_ID;
  if (!channelId) return;

  try {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (channel && channel.type === ChannelType.GuildVoice) {
      const dbStatus = db.prepare("SELECT value FROM bot_settings WHERE key = 'script_status'").get() as { value: string } | undefined;
      const statusVal = status || dbStatus?.value || "operational";

      let targetName = "🟢 Bot: Online";
      if (statusVal === "testing") {
        targetName = "🟡 Bot: Testing";
      } else if (statusVal === "maintenance") {
        targetName = "🔴 Bot: Maint";
      }

      const currentName = channel.name;
      if (currentName !== targetName) {
        await channel.setName(targetName);
        console.log(`Voice channel status diperbarui menjadi: ${targetName}`);
      }
    }
  } catch (error) {
    console.error("Gagal memperbarui voice channel status:", error);
  }
}

async function checkMonitoredPlaces(): Promise<void> {
  const monitoredChannelId = "1519980835116286053";
  try {
    const list = db.prepare("SELECT * FROM monitored_places").all() as Array<{
      place_id: string;
      name: string;
      universe_id: number;
      last_updated: string;
    }>;

    if (list.length === 0) return;

    const channel = await client.channels.fetch(monitoredChannelId).catch(() => null);
    if (!channel || !channel.isTextBased() || !channel.isSendable()) {
      console.warn(`[Update Detector] Channel update-logs (${monitoredChannelId}) tidak ditemukan atau tidak dapat dikirimi pesan.`);
      return;
    }

    for (const item of list) {
      const response = await fetch(`https://games.roblox.com/v1/games?universeIds=${item.universe_id}`).catch(() => null);
      if (!response || !response.ok) continue;

      const result = await response.json() as {
        data: Array<{
          name: string;
          updated: string;
        }>
      };

      const gameData = result.data?.[0];
      if (!gameData) continue;

      const apiUpdated = gameData.updated;

      // Jika waktu pembaruan di API berbeda dengan yang disimpan di database
      if (apiUpdated !== item.last_updated) {
        // 1. Perbarui di database
        db.prepare("UPDATE monitored_places SET last_updated = ?, name = ? WHERE place_id = ?")
          .run(apiUpdated, gameData.name, item.place_id);

        const updatedDate = new Date(apiUpdated);
        const unixTimestamp = Math.floor(updatedDate.getTime() / 1000);

        // 2. Kirim pesan Embed Alert ke channel update-logs
        const embed = new EmbedBuilder()
          .setColor(0x2f3136)
          .setTitle("🚨 Game Update Detected!")
          .setDescription(
            `Sebuah pembaruan baru terdeteksi pada game yang sedang dipantau!\n\n` +
            "---\n\n" +
            "### 🎮 Detail Pembaruan Game\n" +
            `• \`Nama Game:\` **${gameData.name}**\n` +
            `• \`Place ID:\` \`${item.place_id}\`\n` +
            `• \`Universe ID:\` \`${item.universe_id}\`\n` +
            `• \`Waktu Pembaruan:\` <t:${unixTimestamp}:F> (<t:${unixTimestamp}:R>)\n\n` +
            "---\n\n" +
            "> ⚠️ **Status Bot Otomatis Diubah:** Status bot kini dialihkan ke **Testing/Updating**."
          )
          .setFooter({ text: "LeonX Hub • Auto-Update Detector" })
          .setTimestamp();

        await channel.send({ content: "@everyone", embeds: [embed] }).catch((err) => console.error("Gagal mengirim notifikasi update game:", err));

        // 3. Otomatis set status bot ke 'testing'
        db.prepare(`
          INSERT INTO bot_settings (key, value) VALUES (?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `).run("script_status", "testing");

        // 4. Perbarui voice channel status secara instan
        await updateVoiceChannelStatus().catch(() => null);
      }
    }
  } catch (error) {
    console.error("Gagal menjalankan polling Update Detector:", error);
  }
}

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Bot aktif sebagai ${readyClient.user.tag}`);
  await ensureVerificationPanel().catch((error) => {
    console.error("Gagal membuat panel verifikasi:", error);
  });
  await ensureTicketPanel().catch((error) => {
    console.error("Gagal membuat panel ticket:", error);
  });
  await updateVoiceChannelStatus().catch((error) => {
    console.error("Gagal menjalankan update voice channel status:", error);
  });

  // Jalankan detektor update game Roblox secara berkala
  checkMonitoredPlaces().catch((error) => {
    console.error("Gagal melakukan pengecekan update game awal:", error);
  });
  setInterval(() => {
    checkMonitoredPlaces().catch((error) => {
      console.error("Gagal melakukan pengecekan update game berkala:", error);
    });
  }, 5 * 60 * 1000);

  // Automatic key distribution check for verified role members
  if (config.VERIFIED_ROLE_ID) {
    (async () => {
      try {
        const guild = await readyClient.guilds.fetch(config.GUILD_ID);
        const members = await guild.members.fetch();
        const verifiedMembers = members.filter(m => !m.user.bot && m.roles.cache.has(config.VERIFIED_ROLE_ID!));
        
        console.log(`[STARTUP] Checking key delivery for ${verifiedMembers.size} verified members...`);
        
        for (const [memberId, member] of verifiedMembers) {
          const settingKey = `key_dm_sent:${memberId}`;
          const alreadySent = db.prepare("SELECT 1 FROM bot_settings WHERE key = ?").get(settingKey);
          
          if (!alreadySent) {
            try {
              const userKey = getOrCreateUserKey(memberId);
              const dmContent = 
                `**LeonX Hub Loader**\n` +
                `Halo <@${memberId}>, akun Anda terverifikasi di server LeonX Hub. Berikut adalah loader script khusus dan key lisensi Anda:\n` +
                `\`\`\`lua\n` +
                `_G.Key = "${userKey}"\n` +
                `loadstring(game:HttpGet("https://leonthings.my.id/loader.lua"))()\n` +
                `\`\`\`\n` +
                `Jangan bagikan key ini kepada siapapun!`;
                
              await member.send(dmContent);
              console.log(`[STARTUP] Successfully DMed key to ${member.user.tag}`);
              
              db.prepare("INSERT INTO bot_settings (key, value) VALUES (?, 'true')").run(settingKey);
            } catch (dmErr) {
              console.error(`[STARTUP] Failed to DM key to ${member.user.tag}:`, dmErr);
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
        console.log(`[STARTUP] Key delivery check completed.`);
      } catch (err) {
        console.error("[STARTUP] Error checking key delivery:", err);
      }
    })();
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (ownerOnlyCommands.has(interaction.commandName) &&
          interaction.user.id !== config.OWNER_ID) {
        await interaction.reply({
          content: "Command ini khusus owner bot.",
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      if (onCooldown(interaction.user.id, interaction.commandName)) {
        await interaction.reply({ content: "Tunggu beberapa detik sebelum memakai command lagi.", flags: MessageFlags.Ephemeral });
        return;
      }
      trackCommand(interaction.commandName);

      if (interaction.commandName === "verify") {
        await interaction.reply({
          content: `Silakan verifikasi di <#${config.VERIFY_CHANNEL_ID}>.`,
          flags: MessageFlags.Ephemeral
        });
      }

      if (interaction.commandName === "script") {
        const blacklistCheck = isBlacklisted({ discordId: interaction.user.id });
        if (blacklistCheck.blacklisted) {
          await interaction.reply({
            content: `❌ Akses ditolak: Akun Discord Anda berada dalam daftar blacklist.\nAlasan: *${blacklistCheck.reason}*`,
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        if (!(interaction.member instanceof GuildMember) ||
            !config.VERIFIED_ROLE_ID ||
            !interaction.member.roles.cache.has(config.VERIFIED_ROLE_ID)) {
          await interaction.reply({
            content: `Kamu harus verifikasi dahulu di <#${config.VERIFY_CHANNEL_ID}>.`,
            flags: MessageFlags.Ephemeral
          });
          return;
        }
        if (config.PREMIUM_ROLE_ID &&
            !interaction.member.roles.cache.has(config.PREMIUM_ROLE_ID)) {
          await interaction.reply({ content: "Kamu belum memiliki role yang diperlukan.", flags: MessageFlags.Ephemeral });
          return;
        }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const userKey = getOrCreateUserKey(interaction.user.id);
        const dmContent = 
          `**LeonX Hub Loader**\n` +
          `Berikut adalah loader script khusus untuk Anda. Jangan bagikan key ini kepada siapapun!\n` +
          `\`\`\`lua\n` +
          `_G.Key = "${userKey}"\n` +
          `loadstring(game:HttpGet("https://leonthings.my.id/loader.lua"))()\n` +
          `\`\`\`;`;
        await interaction.user.send(dmContent);
        await interaction.editReply("Script loader dan key khusus berhasil dikirim melalui DM.");
      }

      if (interaction.commandName === "resethwid") {
        const blacklistCheck = isBlacklisted({ discordId: interaction.user.id });
        if (blacklistCheck.blacklisted) {
          await interaction.reply({
            content: `❌ Akses ditolak: Akun Discord Anda berada dalam daftar blacklist.\nAlasan: *${blacklistCheck.reason}*`,
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        if (!(interaction.member instanceof GuildMember) ||
            !config.VERIFIED_ROLE_ID ||
            !interaction.member.roles.cache.has(config.VERIFIED_ROLE_ID)) {
          await interaction.reply({
            content: `Kamu harus verifikasi dahulu di <#${config.VERIFY_CHANNEL_ID}>.`,
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const result = resetUserKeyBinding(interaction.user.id);
        await interaction.editReply(result.message);
      }

      if (interaction.commandName === "keyinfo") {
        const blacklistCheck = isBlacklisted({ discordId: interaction.user.id });
        if (blacklistCheck.blacklisted) {
          await interaction.reply({
            content: `❌ Akses ditolak: Akun Discord Anda berada dalam daftar blacklist.\nAlasan: *${blacklistCheck.reason}*`,
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        const keyData = db.prepare("SELECT * FROM user_keys WHERE discord_id = ?").get(interaction.user.id) as {
          key: string;
          roblox_id: string | null;
          hwid: string | null;
          last_reset_at: string | null;
          created_at: string;
        } | undefined;

        if (!keyData) {
          await interaction.reply({
            content: "❌ Anda belum memiliki key yang terdaftar.\nSilakan gunakan perintah `/script` terlebih dahulu untuk membuat key baru.",
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const execCountRow = db.prepare("SELECT COUNT(*) as count FROM script_executions WHERE discord_id = ?").get(interaction.user.id) as { count: number };
        const totalExec = execCountRow ? execCountRow.count : 0;

        const lastExecutions = db.prepare("SELECT * FROM script_executions WHERE discord_id = ? ORDER BY executed_at DESC LIMIT 5").all(interaction.user.id) as Array<{
          roblox_username: string;
          roblox_id: string;
          place_id: string;
          executor: string;
          executed_at: string;
        }>;

        let cooldownText = "🟢 Tersedia (Bisa reset sekarang)";
        if (keyData.last_reset_at) {
          const lastReset = new Date(keyData.last_reset_at + " UTC").getTime();
          const now = Date.now();
          const diffMinutes = (now - lastReset) / (1000 * 60);
          if (diffMinutes < 10) {
            const remainingSeconds = Math.ceil(600 - (now - lastReset) / 1000);
            const minutes = Math.floor(remainingSeconds / 60);
            const seconds = remainingSeconds % 60;
            cooldownText = `⏳ Cooldown (${minutes}m ${seconds}s tersisa)`;
          }
        }

        let historyText = "Belum ada riwayat eksekusi.";
        if (lastExecutions.length > 0) {
          historyText = lastExecutions.map(ex => {
            const utcTime = ex.executed_at.includes("Z") || ex.executed_at.includes("UTC") ? ex.executed_at : ex.executed_at + " UTC";
            const date = new Date(utcTime).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" });
            return `• **${date}**\n  └─ Game: [${ex.place_id}](https://www.roblox.com/games/${ex.place_id}) | Executor: \`${ex.executor}\` | Roblox: [${ex.roblox_username || "Unknown"}](https://www.roblox.com/users/${ex.roblox_id}/profile)`;
          }).join("\n");
        }

        const embed = new EmbedBuilder()
          .setColor(0x2f3136)
          .setTitle("🔑 Informasi Key & Lisensi Anda")
          .setDescription(
            "Berikut adalah detail lisensi dan aktivitas penggunaan script Anda.\n\n" +
            "---\n\n" +
            "### 🔑 Detail Lisensi\n" +
            `• \`Key Lisensi:\` \`||${keyData.key}||\` *(Klik untuk menyalin)*\n` +
            `• \`Akun Roblox:\` ${keyData.roblox_id ? `[Profil Roblox](https://www.roblox.com/users/${keyData.roblox_id}/profile) (\`${keyData.roblox_id}\`)` : "🔴 Belum tertaut"}\n` +
            `• \`Perangkat (HWID):\` ${keyData.hwid ? `\`${keyData.hwid}\`` : "🔴 Belum tertaut"}\n` +
            `• \`Cooldown Reset:\` ${cooldownText}\n` +
            `• \`Total Eksekusi:\` \`${totalExec}\` kali\n` +
            `• \`Dibuat Pada:\` \`${new Date(keyData.created_at + " UTC").toLocaleString("id-ID", { dateStyle: "medium" })}\`\n\n` +
            "---\n\n" +
            "### 📜 Riwayat 5 Eksekusi Terakhir\n" +
            historyText
          )
          .setFooter({ text: "LeonX Hub • License System" })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      }

      if (interaction.commandName === "lookup") {
        const inputKey = interaction.options.getString("key");
        const inputUser = interaction.options.getUser("user");
        const inputRobloxId = interaction.options.getString("roblox_id");
        const inputHwid = interaction.options.getString("hwid");

        if (!inputKey && !inputUser && !inputRobloxId && !inputHwid) {
          await interaction.reply({
            content: "❌ Anda harus menentukan minimal satu opsi pencarian (key, user, roblox_id, atau hwid).",
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        let keyRows: any[] = [];
        let searchCriteria = "";

        if (inputKey) {
          searchCriteria = `Key: \`${inputKey}\``;
          const row = db.prepare("SELECT * FROM user_keys WHERE key = ?").get(inputKey);
          if (row) keyRows.push(row);
        } else if (inputUser) {
          searchCriteria = `Discord User: <@${inputUser.id}> (\`${inputUser.id}\`)`;
          const row = db.prepare("SELECT * FROM user_keys WHERE discord_id = ?").get(inputUser.id);
          if (row) keyRows.push(row);
        } else if (inputRobloxId) {
          searchCriteria = `Roblox ID: \`${inputRobloxId}\``;
          keyRows = db.prepare("SELECT * FROM user_keys WHERE roblox_id = ?").all(inputRobloxId);
        } else if (inputHwid) {
          searchCriteria = `HWID: \`${inputHwid}\``;
          keyRows = db.prepare("SELECT * FROM user_keys WHERE hwid = ?").all(inputHwid);
        }

        // Check blacklist status
        let blacklistStatus = "🟢 Clean / Tidak Ter-blacklist";
        const blacklistCheck = isBlacklisted({
          discordId: inputUser?.id || undefined,
          robloxId: inputRobloxId || undefined,
          hwid: inputHwid || undefined
        });

        if (blacklistCheck.blacklisted) {
          blacklistStatus = `🔴 **BLACKLISTED**\n└─ Alasan: *${blacklistCheck.reason}*`;
        }

        // Retrieve executions
        let targetDiscordIds = keyRows.map(r => r.discord_id);
        if (inputUser && !targetDiscordIds.includes(inputUser.id)) {
          targetDiscordIds.push(inputUser.id);
        }

        let executions: any[] = [];
        if (targetDiscordIds.length > 0) {
          const placeholders = targetDiscordIds.map(() => "?").join(",");
          executions = db.prepare(`
            SELECT * FROM script_executions 
            WHERE discord_id IN (${placeholders}) 
               OR (roblox_id = ? AND roblox_id IS NOT NULL)
            ORDER BY executed_at DESC LIMIT 5
          `).all(...targetDiscordIds, inputRobloxId || null);
        } else if (inputRobloxId) {
          executions = db.prepare(`
            SELECT * FROM script_executions 
            WHERE roblox_id = ? 
            ORDER BY executed_at DESC LIMIT 5
          `).all(inputRobloxId);
        }

        let executionsText = "Tidak ada riwayat eksekusi.";
        if (executions.length > 0) {
          executionsText = executions.map(ex => {
            const utcTime = ex.executed_at.includes("Z") || ex.executed_at.includes("UTC") ? ex.executed_at : ex.executed_at + " UTC";
            const date = new Date(utcTime).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" });
            return `• **${date}**\n  └─ Game: [${ex.place_id}](https://www.roblox.com/games/${ex.place_id})\n  └─ Exec: \`${ex.executor}\` | Roblox: [${ex.roblox_username || "Unknown"}](https://www.roblox.com/users/${ex.roblox_id}/profile) (\`${ex.roblox_id}\`)`;
          }).join("\n");
        }

        let keysFormatted = "❌ Tidak ditemukan data key/lisensi.";
        if (keyRows.length > 0) {
          keysFormatted = keyRows.map((row, idx) => {
            let resetTimeText = row.last_reset_at ? new Date(row.last_reset_at + " UTC").toLocaleString("id-ID") : "Belum pernah di-reset";
            return `• \`Key #${idx + 1}:\` \`${row.key}\`\n` +
                   `  └ Discord: <@${row.discord_id}> (\`${row.discord_id}\`)\n` +
                   `  └ Roblox: ${row.roblox_id ? `[Profil Roblox](https://www.roblox.com/users/${row.roblox_id}/profile) (\`${row.roblox_id}\`)` : "🔴 Belum tertaut"}\n` +
                   `  └ HWID: ${row.hwid ? `\`${row.hwid}\`` : "🔴 Belum tertaut"}\n` +
                   `  └ Reset Terakhir: \`${resetTimeText}\``;
          }).join("\n\n");
        }

        const embed = new EmbedBuilder()
          .setColor(0x2f3136)
          .setTitle("🔍 Hasil Lookup Data Lisensi")
          .setDescription(
            `Kriteria pencarian: ${searchCriteria}\n\n` +
            "---\n\n" +
            "### 🛡️ Status Blacklist\n" +
            `${blacklistStatus}\n\n` +
            "---\n\n" +
            "### 🔑 Data Lisensi / Key\n" +
            `${keysFormatted}\n\n` +
            "---\n\n" +
            "### 📊 Riwayat 5 Eksekusi Terakhir\n" +
            `${executionsText}`
          )
          .setFooter({ text: "LeonX Hub • Admin Tools" })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      }

      if (interaction.commandName === "ai") {
        if (!config.GEMINI_API_KEY) {
          await interaction.reply({
            content: "Fitur AI belum dikonfigurasi oleh owner bot (GEMINI_API_KEY kosong).",
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        const query = interaction.options.getString("tanya", true);
        await interaction.deferReply();

        try {
          const systemPrompt = `Anda adalah LeonX AI Assistant, sebuah bot pembantu cerdas untuk server Discord LeonX Hub (sebuah Roblox Script Hub premium).
Website Resmi: https://leonthings.my.id
Halaman Dashboard/Bot Console: https://leonthings.my.id/bot
Perintah Discord yang tersedia:
- /verify : Verifikasi akun Discord dan dapatkan role member terverifikasi.
- /script nama:LeonX Hub Loader : Mendapatkan key lisensi gratis dan loader script khusus yang dikirimkan lewat DM.
- /resethwid : Mereset kaitan perangkat/Roblox ID (cooldown reset adalah 10 menit sekali). Bisa juga dilakukan mandiri di website console.
- /website : Mendapatkan link website utama dan halaman bot console.
- /status : Cek status operational script LeonX Hub.
- /faq : Tanya jawab seputar permasalahan umum.
- /bug-report : Melaporkan bug/error langsung ke staff developer.
- /ticket : Membuat tiket keluhan bantuan jika ada masalah yang tidak terselesaikan.

Panduan penyelesaian masalah umum:
1. Script tidak berjalan atau gagal eksekusi:
   - Pastikan meletakkan \`_G.Key = "KEY_LISENSI_ANDA"\` di baris paling pertama sebelum baris loadstring.
   - Pastikan executor Roblox yang digunakan mendukung loadstring dan versi paling ter-update.
2. Key terdaftar di perangkat lain / HWID Error:
   - Gunakan command /resethwid di Discord atau buka website LeonThings bagian Bot Console -> My Key, lalu klik tombol "Reset HWID & Roblox ID". Ingat batas reset adalah 1x per 10 menit.
3. Mendapatkan Role Member:
   - Klik tombol verifikasi di channel verifikasi atau gunakan command /verify.
   - Member wajib mematuhi aturan server Discord (dilarang keras cracking loader, membagikan/leaking script LeonX, atau bypass ilegal dengan sanksi BANNED & BLACKLIST PERMANEN).

TINDAKAN KELUARAN KHUSUS (ACTION TAGS):
Anda dapat mengontrol tindakan bot secara langsung dengan menyertakan tag khusus ini tepat di akhir balasan Anda jika user memintanya (bot akan memprosesnya dan menggantinya dengan hasil nyata):
1. Jika pengguna meminta dikirimi script loader, key lisensi mereka, atau menyuruh "ambilin script", sertakan tag: [ACTION: SEND_SCRIPT]
2. Jika pengguna menanyakan statistik server bot, kapasitas, memori, atau performa bot, sertakan tag: [ACTION: GET_STATS]
3. Jika pengguna meminta untuk mereset HWID atau Roblox ID mereka, sertakan tag: [ACTION: RESET_HWID]
4. Jika pengguna menanyakan detail status key lisensi aktif mereka saat ini, sertakan tag: [ACTION: CHECK_MY_KEY]

Format balasan:
- Jawab secara singkat, padat, ramah, dan solutif.
- Gunakan bahasa Indonesia yang santai tapi sopan (sesuaikan bahasa jika ditanya dalam bahasa Inggris).
- Gunakan format markdown Discord (seperti cetak tebal, daftar, dll.) agar mudah dibaca.
- Jika ada pertanyaan di luar topik LeonX Hub, Roblox, scripting, executor, atau server Discord ini, jawab dengan ramah bahwa Anda hanya dapat membantu hal-hal terkait LeonX Hub.`;

          const geminiResult = await callGeminiAPI([
            { role: "user", parts: [{ text: `${systemPrompt}\n\nPertanyaan User: "${query}"` }] }
          ]);

          if (geminiResult.ok) {
            const replyText = geminiResult.text || "Maaf, saya tidak dapat memahami pertanyaan tersebut. Silakan coba lagi.";
            let finalReply = replyText.trim();

            const member = interaction.member instanceof GuildMember ? interaction.member : null;

            // 1. Action: SEND_SCRIPT
            if (finalReply.includes("[ACTION: SEND_SCRIPT]")) {
              const blacklistCheck = isBlacklisted({ discordId: interaction.user.id });
              if (blacklistCheck.blacklisted) {
                finalReply = finalReply.replace("[ACTION: SEND_SCRIPT]", `\n\n❌ **Akses ditolak:** Akun Discord Anda berada dalam daftar blacklist.\nAlasan: *${blacklistCheck.reason}*`);
              } else {
                const hasRole = member && config.VERIFIED_ROLE_ID && member.roles.cache.has(config.VERIFIED_ROLE_ID);
                if (!hasRole) {
                  finalReply = finalReply.replace("[ACTION: SEND_SCRIPT]", `\n\n❌ **Gagal:** Anda harus melakukan verifikasi terlebih dahulu di channel <#${config.VERIFY_CHANNEL_ID}>.`);
                } else {
                  try {
                    const userKey = getOrCreateUserKey(interaction.user.id);
                    const dmContent = 
                      `**LeonX Hub Loader**\n` +
                      `Berikut adalah loader script khusus untuk Anda. Jangan bagikan key ini kepada siapapun!\n` +
                      `\`\`\`lua\n` +
                      `_G.Key = "${userKey}"\n` +
                      `loadstring(game:HttpGet("https://leonthings.my.id/loader.lua"))()\n` +
                      `\`\`\`;`;
                    await interaction.user.send(dmContent);
                    finalReply = finalReply.replace("[ACTION: SEND_SCRIPT]", `\n\n🔑 **Sukses!** Loader script dan key lisensi Anda telah dikirimkan secara pribadi ke DM Anda. Silakan periksa pesan masuk Anda.`);
                  } catch (dmErr) {
                    finalReply = finalReply.replace("[ACTION: SEND_SCRIPT]", `\n\n❌ **Gagal:** Bot tidak dapat mengirim pesan ke DM Anda. Pastikan pengaturan privasi DM Anda untuk server ini diaktifkan.`);
                  }
                }
              }
            }

            // 2. Action: GET_STATS
            if (finalReply.includes("[ACTION: GET_STATS]")) {
              try {
                const guildCount = client.guilds.cache.size;
                const activeKeys = db.prepare("SELECT COUNT(*) as count FROM user_keys").get() as { count: number } | undefined;
                const totalKeys = activeKeys?.count || 0;
                const memoryUsageMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024 * 100) / 100;
                
                let uptimeString = "0s";
                if (client.uptime) {
                  const secs = Math.floor(client.uptime / 1000);
                  const mins = Math.floor(secs / 60);
                  const hours = Math.floor(mins / 60);
                  const days = Math.floor(hours / 24);
                  uptimeString = days > 0 
                    ? `${days}hari ${hours % 24}jam`
                    : hours > 0 
                    ? `${hours}jam ${mins % 60}menit`
                    : `${mins}menit ${secs % 60}detik`;
                }

                const statsBlock = 
                  `\n\n📊 **Statistik Live Server LeonX Bot:**\n` +
                  `• Jumlah Guild Server: \`${guildCount}\`\n` +
                  `• Pengguna Lisensi (Keys): \`${totalKeys}\`\n` +
                  `• Uptime Sistem: \`${uptimeString}\`\n` +
                  `• Penggunaan Memory: \`${memoryUsageMB} MB\``;
                  
                finalReply = finalReply.replace("[ACTION: GET_STATS]", statsBlock);
              } catch (statsErr) {
                finalReply = finalReply.replace("[ACTION: GET_STATS]", `\n\n❌ Gagal mengambil data statistik server saat ini.`);
              }
            }

            // 3. Action: RESET_HWID
            if (finalReply.includes("[ACTION: RESET_HWID]")) {
              const blacklistCheck = isBlacklisted({ discordId: interaction.user.id });
              if (blacklistCheck.blacklisted) {
                finalReply = finalReply.replace("[ACTION: RESET_HWID]", `\n\n❌ **Gagal:** Akun Anda di-blacklist.`);
              } else {
                const hasRole = member && config.VERIFIED_ROLE_ID && member.roles.cache.has(config.VERIFIED_ROLE_ID);
                if (!hasRole) {
                  finalReply = finalReply.replace("[ACTION: RESET_HWID]", `\n\n❌ **Gagal:** Silakan verifikasi terlebih dahulu.`);
                } else {
                  const resetResult = resetUserKeyBinding(interaction.user.id);
                  if (resetResult.success) {
                    finalReply = finalReply.replace("[ACTION: RESET_HWID]", `\n\n🔄 **HWID Reset Sukses!** Silakan jalankan kembali script di Roblox untuk menautkan perangkat/akun baru Anda.`);
                  } else {
                    finalReply = finalReply.replace("[ACTION: RESET_HWID]", `\n\n❌ **Gagal reset HWID:** ${resetResult.message}`);
                  }
                }
              }
            }

            // 4. Action: CHECK_MY_KEY
            if (finalReply.includes("[ACTION: CHECK_MY_KEY]")) {
              try {
                const row = db.prepare("SELECT * FROM user_keys WHERE discord_id = ?").get(interaction.user.id) as {
                  key: string;
                  roblox_id: string | null;
                  hwid: string | null;
                  last_reset_at: string | null;
                } | undefined;

                if (!row) {
                  finalReply = finalReply.replace("[ACTION: CHECK_MY_KEY]", `\n\n🔑 Anda belum memiliki key terdaftar. Silakan minta script terlebih dahulu agar key dibuat otomatis.`);
                } else {
                  let cooldownRemainingMinutes = 0;
                  if (row.last_reset_at) {
                    const lastReset = new Date(row.last_reset_at).getTime();
                    const now = Date.now();
                    const diffMinutes = (now - lastReset) / (1000 * 60);
                    if (diffMinutes < 10) {
                      cooldownRemainingMinutes = Math.ceil(10 - diffMinutes);
                    }
                  }

                  const infoBlock = 
                    `\n\n🔑 **Informasi Lisensi Key Anda:**\n` +
                    `• **Key**: \`LEONX-••••-••••-••••\` (Disensor demi keamanan, detail lengkap telah dikirimkan ke DM Anda!)\n` +
                    `• **Roblox ID**: \`${row.roblox_id || "Belum Terikat (Not Bound)"}\`\n` +
                    `• **HWID**: \`${row.hwid || "Belum Terikat (Not Bound)"}\`\n` +
                    `• **Cooldown Reset**: \`${cooldownRemainingMinutes > 0 ? `${cooldownRemainingMinutes} menit` : "Ready (Bebas Cooldown)"}\``;
                    
                  finalReply = finalReply.replace("[ACTION: CHECK_MY_KEY]", infoBlock);

                  try {
                    const dmContent = 
                      `🔑 **Informasi Lisensi Key Anda (Detail Privasi):**\n` +
                      `• **Key**: \`${row.key}\` (Jangan bagikan key ini kepada siapapun!)\n` +
                      `• **Roblox ID**: \`${row.roblox_id || "Belum Terikat (Not Bound)"}\`\n` +
                      `• **HWID**: \`${row.hwid || "Belum Terikat (Not Bound)"}\`\n` +
                      `• **Cooldown Reset**: \`${cooldownRemainingMinutes > 0 ? `${cooldownRemainingMinutes} menit` : "Ready"}\``;
                    await interaction.user.send(dmContent);
                  } catch (dmErr) {
                    console.log(`Failed to DM key info to ${interaction.user.tag}:`, dmErr);
                  }
                }
              } catch (keyErr) {
                finalReply = finalReply.replace("[ACTION: CHECK_MY_KEY]", `\n\n❌ Gagal memuat info key Anda.`);
              }
            }

            if (finalReply.length > 2000) {
              const chunks = finalReply.match(/[\s\S]{1,1950}/g) || [finalReply];
              for (let i = 0; i < chunks.length; i++) {
                if (i === 0) {
                  await interaction.editReply(chunks[i]!);
                } else {
                  await interaction.followUp(chunks[i]!);
                }
              }
            } else {
              await interaction.editReply(finalReply);
            }
          } else {
            const errMsg = geminiResult.error === "timeout"
              ? "AI sedang lambat merespons (timeout). Silakan coba lagi nanti."
              : "Gagal menghubungi AI. Silakan coba lagi nanti.";
            await interaction.editReply(errMsg);
          }
        } catch (err) {
          console.error("AI Command error:", err);
          await interaction.editReply("Terjadi error internal saat menghubungi AI.");
        }
      }


      if (interaction.commandName === "generatekey") {
        const user = interaction.options.getUser("user", true);
        const newKey = forceGenerateUserKey(user.id);

        await interaction.reply({
          content: `🔑 **Key Baru Berhasil Dihasilkan!**\nPengguna: <@${user.id}>\nKey: \`${newKey}\`\n\n*Catatan: Key lama (jika ada) telah dinonaktifkan, dan semua data binding (Roblox ID & HWID) untuk pengguna ini telah di-reset.*`,
          flags: MessageFlags.Ephemeral
        });

        // Kirim DM ke pengguna
        try {
          const dmContent = 
            `**LeonX Hub Loader (Key Baru)**\n` +
            `Administrator telah membuatkan/memperbarui key baru untuk Anda. Jangan bagikan key ini kepada siapapun!\n` +
            `\`\`\`lua\n` +
            `_G.Key = "${newKey}"\n` +
            `loadstring(game:HttpGet("https://api.leonthings.my.id/loader.lua"))()\n` +
            `\`\`\``;
          await user.send(dmContent);
        } catch {
          // Abaikan jika DM ditutup
        }
      }

      if (interaction.commandName === "status") {
        const dbStatus = db.prepare("SELECT value FROM bot_settings WHERE key = 'script_status'").get() as { value: string } | undefined;
        const dbReason = db.prepare("SELECT value FROM bot_settings WHERE key = 'script_status_reason'").get() as { value: string } | undefined;

        const statusVal = dbStatus?.value || "operational";
        const reasonVal = dbReason?.value || "Semua sistem berjalan dengan normal.";
        const statusColor = statusVal === "operational" ? 0x22c55e : statusVal === "testing" ? 0xeab308 : 0xef4444;

        let statusText = "🟢 Operational";
        if (statusVal === "testing") {
          statusText = "🟡 Testing / Updating";
        } else if (statusVal === "maintenance") {
          statusText = "🔴 Maintenance / Patched";
        }

        const embed = new EmbedBuilder()
          .setColor(0x2f3136)
          .setTitle("📊 Status Script & Bot System")
          .setDescription(
            "Berikut adalah status terkini dari seluruh infrastruktur LeonX Hub.\n\n" +
            "---\n\n" +
            "### 🟢 Status Layanan\n" +
            `• \`LeonX Hub Script:\` ${statusText}\n` +
            `• \`Bot Discord:\` 🟢 **Online**\n\n` +
            "---\n\n" +
            `### 📝 Catatan Sistem\n` +
            `*${reasonVal}*`
          )
          .setFooter({ text: "LeonX Hub • Status Monitor" })
          .setTimestamp();

        await interaction.reply({ embeds: [embed] });
      }

      if (interaction.commandName === "setstatus") {
        const status = interaction.options.getString("status", true);
        const reason = interaction.options.getString("catatan") || "Tidak ada catatan.";

        db.prepare(`
          INSERT INTO bot_settings (key, value) VALUES ('script_status', ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `).run(status);

        db.prepare(`
          INSERT INTO bot_settings (key, value) VALUES ('script_status_reason', ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `).run(reason);

        // Kirim respon dulu agar Discord tidak timeout (batas 3 detik)
        await interaction.reply({
          content: `✅ Status script berhasil diperbarui menjadi **${status}** dengan catatan: *${reason}*`,
          flags: MessageFlags.Ephemeral
        });

        // Jalankan pembaruan channel voice di background
        updateVoiceChannelStatus(status).catch((error) => {
          console.error("Gagal memperbarui voice channel status dari command:", error);
        });
      }

      if (interaction.commandName === "setvoicechannel") {
        const channel = interaction.options.getChannel("channel", true);
        if (channel.type !== ChannelType.GuildVoice) {
          await interaction.reply({
            content: "Channel yang Anda pilih bukan Voice Channel!",
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        db.prepare(`
          INSERT INTO bot_settings (key, value) VALUES ('status_voice_channel_id', ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `).run(channel.id);

        // Kirim respon dulu agar Discord tidak timeout
        await interaction.reply({
          content: `✅ Channel status bot berhasil diatur ke <#${channel.id}>.`,
          flags: MessageFlags.Ephemeral
        });

        // Jalankan pembaruan channel voice di background
        updateVoiceChannelStatus().catch((error) => {
          console.error("Gagal memperbarui voice channel status setelah mengganti channel:", error);
        });
      }

      if (interaction.commandName === "faq") {
        const topic = interaction.options.getString("topik", true);
        const faqAnswer = faq[topic];
        if (!faqAnswer) {
          await interaction.reply({ content: "Topik tidak ditemukan.", flags: MessageFlags.Ephemeral });
        } else {
          const embed = new EmbedBuilder()
            .setColor(0x2f3136)
            .setTitle(`💡 FAQ - ${topic}`)
            .setDescription(
              `Berikut adalah informasi mengenai topik **${topic}**:\n\n` +
              "---\n\n" +
              faqAnswer
            )
            .setFooter({ text: "LeonX Hub • FAQ System" })
            .setTimestamp();
          await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
      }

      if (interaction.commandName === "website") {
        const embed = new EmbedBuilder()
          .setColor(0x2f3136)
          .setTitle("🌐 LeonThings Official Website")
          .setDescription(
            "Silakan gunakan tautan resmi di bawah ini untuk mengakses layanan kami:\n\n" +
            "---\n\n" +
            "### 🔗 Link Resmi\n" +
            "• `/website` - **Website Utama:** https://leonthings.my.id\n" +
            "• `/console` - **Bot Console & HWID Reset:** https://leonthings.my.id/bot"
          )
          .setFooter({ text: "LeonX Hub • Official Links" })
          .setTimestamp();
        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      if (interaction.commandName === "ticket") {
        const sub = interaction.options.getSubcommand(false);

        if (!sub) {
          // Fallback jika somehow dipanggil tanpa subcommand
          await interaction.reply({
            content: "Gunakan subcommand: `/ticket panel`, `/ticket close`, `/ticket add`, `/ticket remove`, atau `/ticket stats`",
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        if (sub === "panel") {
          if (interaction.user.id !== config.OWNER_ID) {
            await interaction.reply({
              content: "Hanya owner yang dapat membuat panel ticket.",
              flags: MessageFlags.Ephemeral
            });
            return;
          }
          if (!interaction.channel?.isSendable()) {
            await interaction.reply({
              content: "Tidak bisa mengirim pesan di channel ini.",
              flags: MessageFlags.Ephemeral
            });
            return;
          }
          await interaction.channel.send(await createTicketPanel());
          await interaction.reply({
            content: "Panel ticket berhasil dibuat!",
            flags: MessageFlags.Ephemeral
          });
        }

        if (sub === "close") {
          if (!interaction.channel || interaction.channel.type !== ChannelType.GuildText) {
            await interaction.reply({
              content: "Command ini hanya bisa digunakan di channel ticket.",
              flags: MessageFlags.Ephemeral
            });
            return;
          }

          const ticketData = db.prepare("SELECT * FROM tickets WHERE channel_id = ?")
            .get(interaction.channel.id) as any;

          if (!ticketData) {
            await interaction.reply({
              content: "Ini bukan channel ticket.",
              flags: MessageFlags.Ephemeral
            });
            return;
          }

          const reason = interaction.options.getString("alasan");
          await interaction.reply("Menutup ticket dan menyimpan transcript...");

          const { transcript, ticketData: ticket } = await closeTicket(
            interaction.channel as TextChannel,
            interaction.user,
            reason || undefined
          );

          // Kirim transcript ke user
          const user = await client.users.fetch(ticket.user_id).catch(() => null);
          if (user) {
            const transcriptAttachment = new AttachmentBuilder(
              Buffer.from(transcript, "utf-8"),
              { name: `ticket-${ticket.id}-transcript.html` }
            );

            await user.send({
              content: `Transcript untuk ticket **#${ticket.id}** (${TICKET_CATEGORIES[ticket.category as TicketCategory]?.label || ticket.category})`,
              files: [transcriptAttachment]
            }).catch(() => console.log(`Tidak bisa mengirim transcript ke ${user.tag}`));
          }

          // Kirim rating prompt
          const ratingEmbed = new EmbedBuilder()
            .setColor(0x2f3136)
            .setTitle("📊 Beri Rating untuk Support Kami")
            .setDescription(
              "Bagaimana pengalaman Anda dengan layanan support kami?\n" +
              "Rating Anda sangat membantu kami untuk terus meningkatkan kualitas layanan."
            )
            .setFooter({ text: "Pilih rating bintang di bawah ini" });

          await interaction.channel.send({
            embeds: [ratingEmbed],
            components: [createRatingButtons()]
          });

          setTimeout(() => interaction.channel?.delete().catch(() => undefined), 10_000);
        }

        if (sub === "add") {
          if (!interaction.channel || interaction.channel.type !== ChannelType.GuildText) {
            await interaction.reply({
              content: "Command ini hanya bisa digunakan di channel ticket.",
              flags: MessageFlags.Ephemeral
            });
            return;
          }

          const user = interaction.options.getUser("user", true);
          await interaction.channel.permissionOverwrites.create(user.id, {
            ViewChannel: true,
            SendMessages: true,
            AttachFiles: true,
            EmbedLinks: true
          });

          await interaction.reply({
            content: `✅ <@${user.id}> telah ditambahkan ke ticket ini.`
          });
        }

        if (sub === "remove") {
          if (!interaction.channel || interaction.channel.type !== ChannelType.GuildText) {
            await interaction.reply({
              content: "Command ini hanya bisa digunakan di channel ticket.",
              flags: MessageFlags.Ephemeral
            });
            return;
          }

          const user = interaction.options.getUser("user", true);
          await interaction.channel.permissionOverwrites.delete(user.id);

          await interaction.reply({
            content: `✅ <@${user.id}> telah dihapus dari ticket ini.`
          });
        }

        if (sub === "stats") {
          const stats = getTicketStats();
          const categoryFormatted = stats.byCategory
            .map(c => `• \`${TICKET_CATEGORIES[c.category as TicketCategory]?.label || c.category}:\` **${c.count}** ticket`)
            .join("\n");

          const statsEmbed = new EmbedBuilder()
            .setColor(0x2f3136)
            .setTitle("📊 Statistik Support Ticket System")
            .setDescription(
              "Ringkasan statistik penggunaan ticket support:\n\n" +
              "---\n\n" +
              "### 📊 Ringkasan Ticket\n" +
              `• \`Total Ticket:\` **${stats.total}**\n` +
              `• \`Ticket Open:\` **${stats.open}**\n` +
              `• \`Ticket Closed:\` **${stats.closed}**\n` +
              `• \`Rata-rata Rating:\` **${stats.avgRating ? `${Number(stats.avgRating).toFixed(1)} / 5.0` : "Belum ada rating"}**\n\n` +
              "---\n\n" +
              "### 📂 Tiket Per Kategori\n" +
              (categoryFormatted || "Belum ada data")
            )
            .setFooter({ text: "LeonX Hub • Support System" })
            .setTimestamp();

          await interaction.reply({
            embeds: [statsEmbed],
            flags: MessageFlags.Ephemeral
          });
        }
      }

      if (interaction.commandName === "bug-report") {
        const modal = new ModalBuilder().setCustomId("bug:submit").setTitle("Laporan Bug");
        modal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId("title").setLabel("Judul singkat").setStyle(TextInputStyle.Short).setRequired(true)
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId("description").setLabel("Apa yang terjadi?").setStyle(TextInputStyle.Paragraph).setRequired(true)
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId("steps").setLabel("Cara mengulang bug").setStyle(TextInputStyle.Paragraph).setRequired(true)
          )
        );
        await interaction.showModal(modal);
      }

      if (interaction.commandName === "changelog") {
        const sub = interaction.options.getSubcommand();
        if (sub === "publish") {
          if (interaction.user.id !== config.OWNER_ID) {
            await interaction.reply({
              content: "Hanya owner yang dapat menerbitkan changelog.",
              flags: MessageFlags.Ephemeral
            });
            return;
          }
          const version = interaction.options.getString("versi", true);
          const title = interaction.options.getString("judul", true);
          const typeKey = interaction.options.getString("jenis", true) as keyof typeof changelogTypes;
          const content = interaction.options.getString("isi", true);
          const summary = interaction.options.getString("ringkasan") ??
            "Pembaruan baru telah hadir! Nikmati fitur terbaru, peningkatan performa, dan berbagai perbaikan untuk pengalaman yang lebih baik.";
          const type = changelogTypes[typeKey];
          const formattedContent = buildEnhancedChanges(content);
          const changelogTitle = `${version} — ${title}`;
          const botAvatar = client.user?.displayAvatarURL();
          const guildIcon = interaction.guild?.iconURL() ?? botAvatar;
          const dbStatus = db.prepare("SELECT value FROM bot_settings WHERE key = 'script_status'").get() as { value: string } | undefined;
          const statusVal = dbStatus?.value || "operational";
          let statusText = "🟢 **Operational**";
          let statusFooterText = "All systems operational";
          if (statusVal === "testing") {
            statusText = "🟡 **Testing / Updating**";
            statusFooterText = "Systems updating";
          } else if (statusVal === "maintenance") {
            statusText = "🔴 **Maintenance / Patched**";
            statusFooterText = "Systems under maintenance";
          }

          const gameName = interaction.options.getString("game") || "Universal";

          const changelogEmbed = new EmbedBuilder()
            .setColor(0x2f3136)
            .setTitle(`🚀 ${changelogTitle}`)
            .setDescription(
              `**Target Game:** ${gameName}\n` +
              `**Jenis Update:** ${type.emoji} ${type.label}\n\n` +
              `> ${summary}\n\n` +
              `### 📋 Change Details:\n` +
              formattedContent
            )
            .setFooter({ text: `LeonX Hub ${version} • ${statusFooterText}` })
            .setTimestamp();

          const buttonsList: ButtonBuilder[] = [];

          if (config.VERIFY_CHANNEL_ID) {
            buttonsList.push(
              new ButtonBuilder()
                .setLabel("Verify")
                .setEmoji("✅")
                .setStyle(ButtonStyle.Link)
                .setURL(`https://discord.com/channels/${config.GUILD_ID}/${config.VERIFY_CHANNEL_ID}`)
            );
          }

          const ticketChannelId = config.TICKET_CHANNEL_ID || "1519681008834842724";
          buttonsList.push(
            new ButtonBuilder()
              .setLabel("Support")
              .setEmoji("💬")
              .setStyle(ButtonStyle.Link)
              .setURL(`https://discord.com/channels/${config.GUILD_ID}/${ticketChannelId}`)
          );

          if (config.BUG_REPORT_CHANNEL_ID) {
            buttonsList.push(
              new ButtonBuilder()
                .setLabel("Bug Report")
                .setEmoji("🐛")
                .setStyle(ButtonStyle.Link)
                .setURL(`https://discord.com/channels/${config.GUILD_ID}/${config.BUG_REPORT_CHANNEL_ID}`)
            );
          }

          const links = new ActionRowBuilder<ButtonBuilder>().addComponents(buttonsList);

          const channel = await client.channels.fetch(config.CHANGELOG_CHANNEL_ID).catch(() => null);
          if (channel?.type === ChannelType.GuildForum) {
            await channel.threads.create({
              name: `${version} — ${title}`.slice(0, 100),
              message: {
                content: `@everyone  ${type.emoji} **${type.label}**`,
                embeds: [changelogEmbed],
                components: [links]
              },
              reason: `Changelog ${version}`
            });
          } else if (channel?.isSendable()) {
            await channel.send({
              content: `@everyone  ${type.emoji} **${type.label}**`,
              embeds: [changelogEmbed],
              components: [links]
            });
          } else {
            throw new Error("CHANGELOG_CHANNEL_ID bukan channel teks atau forum yang dapat digunakan.");
          }

          db.prepare("INSERT INTO changelogs (title, content, author_id) VALUES (?, ?, ?)")
            .run(changelogTitle, formattedContent, interaction.user.id);
          await interaction.reply({
            content: `Changelog berhasil diterbitkan di <#${config.CHANGELOG_CHANNEL_ID}>.`,
            flags: MessageFlags.Ephemeral
          });
        } else {
          const row = db.prepare("SELECT title, content, created_at FROM changelogs ORDER BY id DESC LIMIT 1")
            .get() as { title: string; content: string; created_at: string } | undefined;
          if (!row) {
            await interaction.reply({ content: "Belum ada changelog.", flags: MessageFlags.Ephemeral });
          } else {
            const embed = new EmbedBuilder()
              .setColor(0x2f3136)
              .setTitle(`🚀 ${row.title}`)
              .setDescription(row.content)
              .setFooter({ text: `Published on ${row.created_at}` });
            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
          }
        }
      }

      if (["warn", "timeout", "kick", "ban"].includes(interaction.commandName)) {
        const user = interaction.options.getUser("user", true);
        const member = await interaction.guild?.members.fetch(user.id).catch(() => null);
        const reason = interaction.options.getString("alasan") ?? "Tidak ada alasan";
        if (!member) {
          await interaction.reply({ content: "Member tidak ditemukan.", flags: MessageFlags.Ephemeral });
          return;
        }
        if (interaction.commandName === "warn") {
          db.prepare("INSERT INTO warnings (guild_id, user_id, moderator_id, reason) VALUES (?, ?, ?, ?)")
            .run(interaction.guildId, user.id, interaction.user.id, reason);
        }
        if (interaction.commandName === "timeout") {
          const minutes = interaction.options.getInteger("menit", true);
          await member.timeout(minutes * 60_000, reason);
        }
        if (interaction.commandName === "kick") await member.kick(reason);
        if (interaction.commandName === "ban") await member.ban({ reason });
        await interaction.reply({ content: `Tindakan **${interaction.commandName}** berhasil untuk ${user.tag}.`, flags: MessageFlags.Ephemeral });
      }

      if (interaction.commandName === "stats") {
        const openTickets = (db.prepare("SELECT COUNT(*) AS count FROM tickets WHERE status = 'open'").get() as { count: number }).count;
        const reports = (db.prepare("SELECT COUNT(*) AS count FROM bug_reports").get() as { count: number }).count;
        const uses = (db.prepare("SELECT COALESCE(SUM(uses), 0) AS count FROM command_usage").get() as { count: number }).count;

        const embed = new EmbedBuilder()
          .setColor(0x2f3136)
          .setTitle("📊 Statistik Admin Server")
          .setDescription(
            "Ringkasan statistik aktivitas bot dan server:\n\n" +
            "---\n\n" +
            "### 👥 Statistik Komunitas & Bot\n" +
            `• \`Total Member:\` **${interaction.guild?.memberCount ?? 0}** member\n` +
            `• \`Ticket Aktif:\` **${openTickets}** ticket\n` +
            `• \`Laporan Bug:\` **${reports}** laporan\n` +
            `• \`Command Dipakai:\` **${uses}** eksekusi`
          )
          .setFooter({ text: "LeonX Hub • Admin Dashboard" })
          .setTimestamp();

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      if (interaction.commandName === "blacklist") {
        const sub = interaction.options.getSubcommand();

        if (sub === "add") {
          const reason = interaction.options.getString("alasan", true);
          const user = interaction.options.getUser("user");
          const robloxId = interaction.options.getString("roblox_id");
          const hwid = interaction.options.getString("hwid");

          if (!user && !robloxId && !hwid) {
            await interaction.reply({
              content: "❌ Gagal: Anda harus menyertakan minimal salah satu dari parameter `user`, `roblox_id`, atau `hwid`.",
              flags: MessageFlags.Ephemeral
            });
            return;
          }

          addToBlacklist({
            discordId: user?.id,
            robloxId: robloxId || undefined,
            hwid: hwid || undefined,
            reason
          });

          let message = "✅ Berhasil menambahkan ke daftar blacklist:\n";
          if (user) message += `• Discord User: <@${user.id}>\n`;
          if (robloxId) message += `• Roblox ID: \`${robloxId}\`\n`;
          if (hwid) message += `• HWID: \`${hwid}\`\n`;
          message += `• Alasan: *${reason}*`;

          await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
        }

        if (sub === "remove") {
          const user = interaction.options.getUser("user");
          const robloxId = interaction.options.getString("roblox_id");
          const hwid = interaction.options.getString("hwid");

          if (!user && !robloxId && !hwid) {
            await interaction.reply({
              content: "❌ Gagal: Anda harus menyertakan minimal salah satu dari parameter `user`, `roblox_id`, atau `hwid`.",
              flags: MessageFlags.Ephemeral
            });
            return;
          }

          const removed = removeFromBlacklist({
            discordId: user?.id,
            robloxId: robloxId || undefined,
            hwid: hwid || undefined
          });

          if (removed) {
            await interaction.reply({
              content: "✅ Berhasil menghapus target dari daftar blacklist.",
              flags: MessageFlags.Ephemeral
            });
          } else {
            await interaction.reply({
              content: "❌ Gagal: Target tidak ditemukan dalam daftar blacklist.",
              flags: MessageFlags.Ephemeral
            });
          }
        }

        if (sub === "list") {
          const list = getBlacklistList();
          if (list.length === 0) {
            await interaction.reply({ content: "ℹ️ Daftar blacklist saat ini kosong.", flags: MessageFlags.Ephemeral });
            return;
          }

          const embed = new EmbedBuilder()
            .setColor(0x2f3136)
            .setTitle("🚫 Daftar Blacklist LeonX Hub")
            .setDescription(
              `Total target ter-blacklist: **${list.length}**\n\n` +
              "---\n\n" +
              "### 🛡️ List Target Blacklist\n\n" +
              list.map((item, idx) => {
                let detail = "";
                if (item.discord_id) detail += `Discord: <@${item.discord_id}> (\`${item.discord_id}\`) `;
                if (item.roblox_id) detail += `Roblox ID: \`${item.roblox_id}\` `;
                if (item.hwid) detail += `HWID: \`${item.hwid}\``;
                return `• \`Target #${idx + 1}:\` ${detail}\n  └ Alasan: *${item.reason}* (${item.created_at})`;
              }).join("\n\n")
            )
            .setFooter({ text: "LeonX Hub • Blacklist System" })
            .setTimestamp();

          await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
      }

      if (interaction.commandName === "roblox") {
        const username = interaction.options.getString("username", true);
        await interaction.deferReply();

        try {
          // 1. Get User ID from username
          const userSearchResponse = await fetch("https://users.roblox.com/v1/usernames/users", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ usernames: [username], excludeBannedUsers: false })
          });

          if (!userSearchResponse.ok) {
            throw new Error(`Roblox API error: ${userSearchResponse.statusText}`);
          }

          const searchResult = await userSearchResponse.json() as {
            data: Array<{ id: number; name: string; displayName: string; hasVerifiedBadge?: boolean }>
          };

          if (!searchResult.data || searchResult.data.length === 0) {
            await interaction.editReply(`❌ Pengguna Roblox dengan username \`${username}\` tidak ditemukan.`);
            return;
          }

          const robloxUser = searchResult.data[0];
          if (!robloxUser) {
            await interaction.editReply(`❌ Pengguna Roblox dengan username \`${username}\` tidak ditemukan.`);
            return;
          }
          const userId = robloxUser.id;

          // 2. Get User Details
          const userDetailsResponse = await fetch(`https://users.roblox.com/v1/users/${userId}`);
          if (!userDetailsResponse.ok) {
            throw new Error(`Roblox API error (details): ${userDetailsResponse.statusText}`);
          }

          const details = await userDetailsResponse.json() as {
            description: string;
            created: string;
            isBanned: boolean;
            displayName: string;
            name: string;
            hasVerifiedBadge?: boolean;
          };

          // 3. Get User Avatar Image
          const avatarResponse = await fetch(
            `https://thumbnails.roblox.com/v1/users/avatar?userIds=${userId}&size=150x150&format=Png&isCircular=false`
          );

          let avatarUrl: string | null = null;
          if (avatarResponse.ok) {
            const avatarResult = await avatarResponse.json() as {
              data: Array<{ imageUrl: string }>
            };
            const avatarObj = avatarResult.data?.[0];
            if (avatarObj) {
              avatarUrl = avatarObj.imageUrl;
            }
          }

          // 4. Fetch additional info in parallel
          const [
            followersRes,
            followingRes,
            friendsRes,
            collectiblesRes,
            historyRes
          ] = await Promise.all([
            fetch(`https://friends.roblox.com/v1/users/${userId}/followers/count`).catch(() => null),
            fetch(`https://friends.roblox.com/v1/users/${userId}/followings/count`).catch(() => null),
            fetch(`https://friends.roblox.com/v1/users/${userId}/friends/count`).catch(() => null),
            fetch(`https://inventory.roblox.com/v1/users/${userId}/assets/collectibles?limit=100`).catch(() => null),
            fetch(`https://users.roblox.com/v1/users/${userId}/username-history?limit=10`).catch(() => null)
          ]);

          // Parse Followers
          let followersCount = "N/A";
          if (followersRes?.ok) {
            const data = await followersRes.json() as { count: number };
            followersCount = data.count.toLocaleString("id-ID");
          }

          // Parse Following
          let followingCount = "N/A";
          if (followingRes?.ok) {
            const data = await followingRes.json() as { count: number };
            followingCount = data.count.toLocaleString("id-ID");
          }

          // Parse Friends
          let friendsCount = "N/A";
          if (friendsRes?.ok) {
            const data = await friendsRes.json() as { count: number };
            friendsCount = data.count.toLocaleString("id-ID");
          }

          // Parse RAP (Recent Average Price)
          let rapText = "None / 🔒 Private";
          if (collectiblesRes?.ok) {
            const data = await collectiblesRes.json() as {
              data: Array<{ recentAveragePrice?: number; value?: number }>
            };
            if (data.data && data.data.length > 0) {
              const totalRap = data.data.reduce((sum, item) => sum + (item.recentAveragePrice || item.value || 0), 0);
              rapText = totalRap > 0 ? `${totalRap.toLocaleString("id-ID")} Robux` : "None";
            } else {
              rapText = "None";
            }
          } else if (collectiblesRes?.status === 403) {
            rapText = "🔒 Private";
          }

          // Parse Username History
          let historyText = "Tidak ada riwayat nama.";
          if (historyRes?.ok) {
            const data = await historyRes.json() as {
              data: Array<{ name: string }>
            };
            if (data.data && data.data.length > 0) {
              historyText = data.data.map(item => `\`${item.name}\``).join(", ");
            }
          }

          const creationDate = new Date(details.created);

          const embed = new EmbedBuilder()
            .setColor(0x2f3136)
            .setTitle(`👤 Roblox Profile - ${details.displayName}${details.hasVerifiedBadge ? " ☑️" : ""}`)
            .setURL(`https://www.roblox.com/users/${userId}/profile`)
            .setDescription(
              `@${details.name} • \`ID:\` \`${userId}\` • Status: ${details.isBanned ? "🔴 **Banned**" : "🟢 **Aktif**"}\n\n` +
              (details.description ? `*${details.description.slice(0, 300)}*\n\n` : "") +
              "---\n\n" +
              "### 📊 Statistik Akun\n" +
              `• \`Teman:\` **${friendsCount}**\n` +
              `• \`Pengikut:\` **${followersCount}**\n` +
              `• \`Mengikuti:\` **${followingCount}**\n` +
              `• \`RAP Collectibles:\` **${rapText}**\n` +
              `• \`Tanggal Dibuat:\` **${creationDate.toLocaleDateString("id-ID")}**\n\n` +
              "---\n\n" +
              "### 🏷️ Riwayat Nama\n" +
              historyText
            )
            .setFooter({ text: "LeonX Hub • Roblox Lookup" })
            .setTimestamp();

          if (avatarUrl) {
            embed.setThumbnail(avatarUrl);
          }

          await interaction.editReply({ embeds: [embed] });
        } catch (error) {
          console.error("Gagal melakukan lookup Roblox:", error);
          await interaction.editReply("❌ Terjadi kesalahan saat menghubungi server Roblox. Silakan coba beberapa saat lagi.");
        }
      }

      if (interaction.commandName === "monitor-game") {
        const placeIdRaw = interaction.options.getString("place_id", true);
        const placeId = extractPlaceId(placeIdRaw);
        await interaction.deferReply();

        try {
          // 1. Get Universe ID from Place ID using public endpoint
          const detailsResponse = await fetch(`https://apis.roblox.com/universes/v1/places/${placeId}/universe`);
          if (!detailsResponse.ok) {
            throw new Error(`Place details fetch error: ${detailsResponse.statusText}`);
          }

          const universeInfo = await detailsResponse.json() as {
            universeId?: number | null;
          };

          if (!universeInfo || !universeInfo.universeId) {
            await interaction.editReply(`❌ Game dengan Place ID \`${placeId}\` tidak ditemukan.`);
            return;
          }

          const universeId = universeInfo.universeId;

          // 2. Fetch Universe details, votes, and icon in parallel
          const [gameRes, votesRes, iconRes] = await Promise.all([
            fetch(`https://games.roblox.com/v1/games?universeIds=${universeId}`).catch(() => null),
            fetch(`https://games.roblox.com/v1/games/${universeId}/votes`).catch(() => null),
            fetch(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${universeId}&size=150x150&format=Png&isCircular=false`).catch(() => null)
          ]);

          // Parse Game Info
          let playing = 0;
          let visits = 0;
          let favoritedCount = 0;
          let creatorName = "Unknown";
          let gameName = "Unknown Game";

          if (gameRes?.ok) {
            const gameData = await gameRes.json() as {
              data: Array<{
                name: string;
                playing: number;
                visits: number;
                favoritedCount: number;
                creator: { name: string };
              }>
            };
            const uData = gameData.data?.[0];
            if (uData) {
              gameName = uData.name;
              playing = uData.playing;
              visits = uData.visits;
              favoritedCount = uData.favoritedCount;
              creatorName = uData.creator.name;
            }
          }

          // Parse Votes (Likes & Dislikes)
          let likes = 0;
          let dislikes = 0;
          let likeRatio = "100%";
          if (votesRes?.ok) {
            const votesData = await votesRes.json() as { upVotes: number; downVotes: number };
            likes = votesData.upVotes;
            dislikes = votesData.downVotes;
            const totalVotes = likes + dislikes;
            if (totalVotes > 0) {
              likeRatio = `${((likes / totalVotes) * 100).toFixed(1)}%`;
            }
          }

          // Parse Icon
          let iconUrl: string | null = null;
          if (iconRes?.ok) {
            const iconData = await iconRes.json() as { data: Array<{ imageUrl: string }> };
            const iconObj = iconData.data?.[0];
            if (iconObj) {
              iconUrl = iconObj.imageUrl;
            }
          }

          const embed = new EmbedBuilder()
            .setColor(0x2f3136)
            .setTitle(`🎮 Game Monitor - ${gameName}`)
            .setURL(`https://www.roblox.com/games/${placeId}`)
            .setDescription(
              `Developer / Creator: **${creatorName}**\n` +
              `Place ID: \`${placeId}\` | Universe ID: \`${universeId}\`\n\n` +
              "---\n\n" +
              "### 🟢 Statistik Pemain & Performa\n" +
              `• \`Playing:\` **${playing.toLocaleString("id-ID")}** pemain\n` +
              `• \`Total Visits:\` **${visits.toLocaleString("id-ID")}**\n` +
              `• \`Favorites:\` **${favoritedCount.toLocaleString("id-ID")}**\n\n` +
              "---\n\n" +
              "### 👍 Rating & Suara\n" +
              `• \`Likes:\` **${likes.toLocaleString("id-ID")}**\n` +
              `• \`Dislikes:\` **${dislikes.toLocaleString("id-ID")}**\n` +
              `• \`Like Ratio:\` **${likeRatio}**`
            )
            .setFooter({ text: "LeonX Hub • Game Monitor" })
            .setTimestamp();

          if (iconUrl) {
            embed.setThumbnail(iconUrl);
          }

          await interaction.editReply({ embeds: [embed] });
        } catch (error) {
          console.error("Gagal memantau game Roblox:", error);
          await interaction.editReply("❌ Terjadi kesalahan saat mengambil data game. Silakan coba beberapa saat lagi.");
        }
      }

      if (interaction.commandName === "game-servers") {
        const placeIdRaw = interaction.options.getString("place_id", true);
        const placeId = extractPlaceId(placeIdRaw);
        await interaction.deferReply();

        try {
          // Fetch public server list from Roblox API (excluding full servers to ensure availability)
          const serverResponse = await fetch(`https://games.roblox.com/v1/games/${placeId}/servers/Public?limit=10&excludeFullGames=true`);
          if (!serverResponse.ok) {
            throw new Error(`Roblox Server API error: ${serverResponse.statusText}`);
          }

          const serverData = await serverResponse.json() as {
            data: Array<{
              id: string;
              maxPlayers: number;
              playing: number;
              fps: number;
              ping: number;
            }>;
          };

          if (!serverData.data || serverData.data.length === 0) {
            await interaction.editReply(`❌ Tidak ada server aktif yang ditemukan untuk Place ID \`${placeId}\`.`);
            return;
          }

          // Filter out full servers and get up to 5 servers
          const availableServers = serverData.data
            .filter((s) => s.playing < s.maxPlayers)
            .slice(0, 5);

          if (availableServers.length === 0) {
            await interaction.editReply(`❌ Semua server aktif saat ini penuh untuk Place ID \`${placeId}\`.`);
            return;
          }

          const serversList = availableServers.map((s, idx) => ({
            num: idx + 1,
            playing: s.playing,
            max: s.maxPlayers,
            fps: s.fps.toFixed(1),
            ping: `${s.ping}ms`,
            joinUrl: `roblox://experiences/start?placeId=${placeId}&gameInstanceId=${s.id}`
          }));

          const embed = new EmbedBuilder()
            .setColor(0x2f3136)
            .setTitle(`📈 Server Aktif — Place ID ${placeId}`)
            .setDescription(
              "Salin link di bawah ini, lalu buka di browser/Windows Run (Win + R) untuk langsung bergabung ke server:\n\n" +
              "---\n\n" +
              "### 🖥️ List Server Aktif\n\n" +
              serversList.map(srv =>
                `• \`Server #${srv.num}:\` (${srv.playing}/${srv.max} Players | FPS: ${srv.fps} | Ping: ${srv.ping})\n` +
                `\`\`\`text\n${srv.joinUrl}\n\`\`\``
              ).join("\n")
            )
            .setFooter({ text: "LeonX Hub • Server Tracker" })
            .setTimestamp();

          await interaction.editReply({ embeds: [embed] });
        } catch (error) {
          console.error("Gagal mendapatkan server game:", error);
          await interaction.editReply("❌ Terjadi kesalahan saat mengambil daftar server. Pastikan Place ID benar.");
        }
      }

      if (interaction.commandName === "send-rules") {
        if (interaction.user.id !== config.OWNER_ID) {
          await interaction.reply({
            content: "Hanya owner yang dapat mengirimkan rules.",
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        const channelId = "1515261709147705537";
        const channel = await client.channels.fetch(channelId).catch(() => null);

        if (!channel || !channel.isTextBased() || !channel.isSendable()) {
          await interaction.reply({
            content: "❌ Gagal: Channel rules tidak ditemukan atau bot tidak dapat mengirim pesan di sana.",
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
          const embedRules = new EmbedBuilder()
            .setColor(0x2f3136)
            .setTitle("📖 LeonX Hub - Server Rules & Guidelines")
            .setDescription(
              "✨ **Welcome to LeonX Hub Server** ✨\n" +
              "Selamat datang di server resmi LeonX Hub. Server ini adalah wadah diskusi, pembaruan script, laporan bug, serta layanan bantuan bagi seluruh pengguna LeonX Hub.\n\n" +
              "Harap luangkan waktu sejenak untuk membaca dan mematuhi peraturan kami demi menjaga kenyamanan bersama di dalam server ini.\n\n" +
              "---\n\n" +
              "📜 **SERVER RULES & GUIDELINES**\n" +
              "Dengan bergabung di server ini, Anda dianggap telah membaca dan menyetujui seluruh ketentuan di bawah ini:\n\n" +
              "🚫 **Larangan Keras Crack, Leak, & Bypass**\n" +
              "Dilarang keras mencoba melakukan cracking/dekripsi loader, membagikan/leaking script LeonX ke luar server, atau menggunakan bypass ilegal. Pelanggaran berat ini akan berakibat pada **Blacklist HWID + Roblox ID + Discord ID secara permanen** dari seluruh layanan kami.\n\n" +
              "🤝 **Saling Menghormati & Jaga Etika**\n" +
              "Gunakan bahasa yang sopan. Dilarang melakukan cyberbullying, harassment, memicu drama/debat kusir, toxic berlebih, SARA, atau mengirim konten NSFW/pornografi.\n\n" +
              "🛡️ **Saluran Chat Sesuai Fungsi**\n" +
              "Gunakan channel sesuai dengan tujuannya. Jangan melakukan spam chat, spam tag staf/developer tanpa alasan mendesak, atau membagikan iklan/link promosi server lain (Anti-Link aktif).\n\n" +
              "🎫 **Penggunaan Sistem Ticket & Bug Report**\n" +
              "Buka ticket support hanya untuk masalah teknis/transaksi yang mendesak. Kirim laporan bug nyata via `/bug-report`. Menyalahgunakan sistem tiket/laporan bug untuk spam atau bercanda akan dikenakan sanksi.\n\n" +
              "🔒 **Keamanan Akun & Transaksi Resmi**\n" +
              "Staf LeonX Hub **TIDAK PERNAH** meminta password akun Roblox atau token Discord Anda. Segala bentuk transaksi resmi hanya dilakukan melalui bot resmi atau langsung dengan Admin.\n\n" +
              "---\n\n" +
              "⚖️ **SISTEM SANKSI & KONSEKUENSI**\n" +
              "Moderator berhak mengambil keputusan mutlak berdasarkan pelanggaran yang Anda lakukan:\n" +
              "• `/warn` - Pelanggaran Ringan: Peringatan tertulis (Warning) via database bot.\n" +
              "• `/timeout` - Pelanggaran Sedang: Timeout (Mute otomatis) mulai dari 10 menit hingga 7 hari.\n" +
              "• `/blacklist` - Pelanggaran Berat: Kick, Banned permanen dari Discord, serta Blacklist HWID & Roblox ID di server database game.\n\n" +
              "---\n\n" +
              "> 📌 *Jika Anda belum terverifikasi, silakan selesaikan proses verifikasi dengan menekan tombol **Verify** di channel verifikasi.*"
            )
            .setFooter({ text: "LeonX Hub • Official Guidelines" })
            .setTimestamp();

          await (channel as TextChannel).send({ embeds: [embedRules] });
          await interaction.editReply({
            content: `✅ Sukses mengirimkan rules ke channel <#${channelId}>.`
          });
        } catch (error) {
          console.error("Gagal mengirimkan rules:", error);
          await interaction.editReply({
            content: "❌ Terjadi kesalahan saat mengirimkan rules ke channel."
          });
        }
      }

      if (interaction.commandName === "monitor") {
        const sub = interaction.options.getSubcommand();

        if (sub === "add") {
          const placeIdRaw = interaction.options.getString("place_id", true);
          const placeId = extractPlaceId(placeIdRaw);
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });

          try {
            // Get Universe ID from Place ID using public API
            const detailsResponse = await fetch(`https://apis.roblox.com/universes/v1/places/${placeId}/universe`);
            if (!detailsResponse.ok) {
              throw new Error(`Roblox API error: ${detailsResponse.statusText}`);
            }

            const universeInfo = await detailsResponse.json() as { universeId?: number | null };
            if (!universeInfo || !universeInfo.universeId) {
              await interaction.editReply(`❌ Game dengan Place ID \`${placeId}\` tidak ditemukan.`);
              return;
            }

            const universeId = universeInfo.universeId;

            // Get Game Name
            const gameDetailsResponse = await fetch(`https://games.roblox.com/v1/games?universeIds=${universeId}`);
            let gameName = "Unknown Game";
            let lastUpdated = new Date().toISOString();

            if (gameDetailsResponse.ok) {
              const gameDetails = await gameDetailsResponse.json() as {
                data: Array<{ name: string; updated: string }>
              };
              const firstItem = gameDetails.data[0];
              if (firstItem) {
                gameName = firstItem.name;
                lastUpdated = firstItem.updated;
              }
            }

            // Save to database
            db.prepare(`
              INSERT INTO monitored_places (place_id, name, universe_id, last_updated)
              VALUES (?, ?, ?, ?)
              ON CONFLICT(place_id) DO UPDATE SET
                name = excluded.name,
                universe_id = excluded.universe_id,
                last_updated = excluded.last_updated
            `).run(placeId, gameName, universeId, lastUpdated);

            await interaction.editReply(`✅ Berhasil menambahkan **${gameName}** (\`${placeId}\`) ke daftar pemantauan update game.`);
          } catch (error) {
            console.error("Gagal menambahkan game ke pemantauan:", error);
            await interaction.editReply("❌ Terjadi kesalahan saat mendaftarkan game ke pemantauan.");
          }
        }

        if (sub === "remove") {
          const placeIdRaw = interaction.options.getString("place_id", true);
          const placeId = extractPlaceId(placeIdRaw);
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });

          try {
            const result = db.prepare("DELETE FROM monitored_places WHERE place_id = ?").run(placeId);
            if (result.changes > 0) {
              await interaction.editReply(`✅ Berhasil menghapus Place ID \`${placeId}\` dari pemantauan.`);
            } else {
              await interaction.editReply(`❌ Place ID \`${placeId}\` tidak ditemukan dalam daftar pemantauan.`);
            }
          } catch (error) {
            console.error("Gagal menghapus game dari pemantauan:", error);
            await interaction.editReply("❌ Terjadi kesalahan saat menghapus game dari pemantauan.");
          }
        }

        if (sub === "list") {
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });

          try {
            const list = db.prepare("SELECT * FROM monitored_places ORDER BY created_at DESC").all() as Array<{
              place_id: string;
              name: string;
              universe_id: number;
              last_updated: string;
            }>;

            if (list.length === 0) {
              await interaction.editReply("ℹ️ Daftar pemantauan game saat ini kosong.");
              return;
            }

            const embed = new EmbedBuilder()
              .setColor(0x2f3136)
              .setTitle("🔍 Game Update Monitoring List")
              .setDescription(
                "Daftar game yang saat ini dipantau secara otomatis:\n\n" +
                "---\n\n" +
                "### 🎮 Game Dipantau\n\n" +
                list.map((item, idx) =>
                  `• \`${idx + 1}. ${item.name}:\` Place ID: \`${item.place_id}\` | Update: \`${new Date(item.last_updated).toLocaleString("id-ID")}\``
                ).join("\n")
              )
              .setFooter({ text: "LeonX Hub • Monitoring System" })
              .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
          } catch (error) {
            console.error("Gagal mengambil daftar pemantauan:", error);
            await interaction.editReply("❌ Terjadi kesalahan saat mengambil daftar pemantauan.");
          }
        }

        if (sub === "test") {
          const placeIdRaw = interaction.options.getString("place_id", true);
          const placeId = extractPlaceId(placeIdRaw);
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });

          try {
            const item = db.prepare("SELECT * FROM monitored_places WHERE place_id = ?").get(placeId) as {
              place_id: string;
              name: string;
              universe_id: number;
              last_updated: string;
            } | undefined;

            if (!item) {
              await interaction.editReply(`❌ Game dengan Place ID \`${placeId}\` tidak ditemukan dalam daftar pemantauan. Tambahkan terlebih dahulu menggunakan \`/monitor add\`.`);
              return;
            }

            // Set last_updated ke epoch agar loop mendeteksi perbedaan
            db.prepare("UPDATE monitored_places SET last_updated = ? WHERE place_id = ?")
              .run("1970-01-01T00:00:00.000Z", placeId);

            // Jalankan deteksi
            await checkMonitoredPlaces();

            await interaction.editReply(`✅ Berhasil mensimulasikan update untuk **${item.name}**! Silakan periksa channel <#1519980835116286053>.`);
          } catch (error) {
            console.error("Gagal menjalankan simulasi update:", error);
            await interaction.editReply("❌ Terjadi kesalahan saat mensimulasikan update.");
          }
        }
      }

      if (interaction.commandName === "lock") {
        const targetChannel = interaction.options.getChannel("channel") || interaction.channel;
        
        if (!targetChannel || targetChannel.type !== ChannelType.GuildText) {
          await interaction.reply({ content: "❌ Target harus berupa text channel.", flags: MessageFlags.Ephemeral });
          return;
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        try {
          const everyoneRole = interaction.guild!.roles.everyone;
          await (targetChannel as TextChannel).permissionOverwrites.edit(everyoneRole, {
            SendMessages: false
          });
          
          await interaction.editReply(`🔒 Channel <#${targetChannel.id}> berhasil dikunci.`);
          await (targetChannel as TextChannel).send("🔒 **Channel ini telah dikunci oleh administrator/staf.**");
        } catch (err: any) {
          console.error("Gagal mengunci channel:", err);
          await interaction.editReply(`❌ Gagal mengunci channel: ${err.message}`);
        }
      }

      if (interaction.commandName === "unlock") {
        const targetChannel = interaction.options.getChannel("channel") || interaction.channel;
        
        if (!targetChannel || targetChannel.type !== ChannelType.GuildText) {
          await interaction.reply({ content: "❌ Target harus berupa text channel.", flags: MessageFlags.Ephemeral });
          return;
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        try {
          const everyoneRole = interaction.guild!.roles.everyone;
          await (targetChannel as TextChannel).permissionOverwrites.edit(everyoneRole, {
            SendMessages: null
          });
          
          await interaction.editReply(`🔓 Kunci channel <#${targetChannel.id}> berhasil dibuka.`);
          await (targetChannel as TextChannel).send("🔓 **Kunci channel ini telah dibuka. Member dapat mengirim pesan kembali.**");
        } catch (err: any) {
          console.error("Gagal membuka kunci channel:", err);
          await interaction.editReply(`❌ Gagal membuka kunci channel: ${err.message}`);
        }
      }
    }

    if (interaction.isButton() && interaction.customId === "verify:accept") {
      if (!config.VERIFIED_ROLE_ID || !(interaction.member instanceof GuildMember)) {
        await interaction.reply({ content: "Role verifikasi belum dikonfigurasi oleh admin.", flags: MessageFlags.Ephemeral });
        return;
      }
      if (interaction.member.roles.cache.has(config.VERIFIED_ROLE_ID)) {
        await interaction.reply({ content: "Kamu sudah terverifikasi.", flags: MessageFlags.Ephemeral });
        return;
      }
      await interaction.member.roles.add(config.VERIFIED_ROLE_ID);
      await interaction.reply({ content: "Verifikasi berhasil. Selamat datang!", flags: MessageFlags.Ephemeral });
    }

    if (interaction.isStringSelectMenu() && interaction.customId === "ticket:category") {
      if (!interaction.guild) return;

      const category = interaction.values[0] as TicketCategory;

      // Render ulang select menu agar pilihan kembali ke placeholder.
      // Tanpa ini Discord menyimpan kategori terakhir, sehingga kategori yang
      // sama tidak dapat dipilih lagi setelah ticket ditutup.
      await interaction.message.edit(await createTicketPanel()).catch((error) => {
        console.error("Gagal mereset pilihan kategori ticket:", error);
      });

      const existing = db.prepare("SELECT channel_id FROM tickets WHERE guild_id = ? AND user_id = ? AND status = 'open'")
        .get(interaction.guild.id, interaction.user.id) as { channel_id: string } | undefined;

      if (existing) {
        await interaction.reply({
          content: `Kamu sudah memiliki ticket aktif di <#${existing.channel_id}>`,
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const channel = await createTicketChannel(interaction.guild, interaction.user, category);

      db.prepare("INSERT INTO tickets (guild_id, user_id, channel_id, category) VALUES (?, ?, ?, ?)")
        .run(interaction.guild.id, interaction.user.id, channel.id, category);

      await interaction.editReply({
        content: `✅ Ticket berhasil dibuat: ${channel}\nKategori: ${TICKET_CATEGORIES[category].label}`
      });
    }

    if (interaction.isButton() && interaction.customId === "ticket:claim") {
      if (!interaction.channel || interaction.channel.type !== ChannelType.GuildText) return;

      const ticketData = getOrRecoverTicket(interaction.channel);

      if (!ticketData) {
        await interaction.reply({
          content: "Data ticket tidak ditemukan. Pastikan tombol ini berada di channel ticket yang dibuat bot.",
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      if (ticketData.claimed_by) {
        await interaction.reply({
          content: `Ticket ini sudah di-claim oleh <@${ticketData.claimed_by}>`,
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      db.prepare("UPDATE tickets SET claimed_by = ? WHERE channel_id = ?")
        .run(interaction.user.id, interaction.channel.id);

      const claimEmbed = new EmbedBuilder()
        .setColor(0x2f3136)
        .setTitle("✋ Ticket Diklaim")
        .setDescription(`<@${interaction.user.id}> telah mengklaim ticket ini dan akan segera membantu menyelesaikan masalah Anda.`)
        .setTimestamp();

      await interaction.reply({ embeds: [claimEmbed] });
    }

    if (interaction.isButton() && interaction.customId === "ticket:close") {
      if (!interaction.channel || interaction.channel.type !== ChannelType.GuildText) return;

      const ticketData = getOrRecoverTicket(interaction.channel);

      if (!ticketData) {
        await interaction.reply({
          content: "Data ticket tidak ditemukan. Pastikan tombol ini berada di channel ticket yang dibuat bot.",
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      await interaction.reply("Menutup ticket dan menyimpan transcript...");

      const { transcript, ticketData: ticket } = await closeTicket(
        interaction.channel as TextChannel,
        interaction.user
      );

      // Kirim transcript ke user
      const user = await client.users.fetch(ticket.user_id).catch(() => null);
      if (user) {
        const transcriptAttachment = new AttachmentBuilder(
          Buffer.from(transcript, "utf-8"),
          { name: `ticket-${ticket.id}-transcript.html` }
        );

        await user.send({
          content: `Transcript untuk ticket **#${ticket.id}** (${TICKET_CATEGORIES[ticket.category as TicketCategory]?.label || ticket.category})`,
          files: [transcriptAttachment]
        }).catch(() => console.log(`Tidak bisa mengirim transcript ke ${user.tag}`));
      }

      // Kirim rating prompt
      const ratingBuf = await renderTicketRatingCard();
      const { embed: ratingEmbed, attachment: ratingAtt } = cardEmbed(ratingBuf, 0x2563eb, "ticket_rating.png");

      await interaction.channel.send({
        content: `<@${ticket.user_id}>`,
        embeds: [ratingEmbed],
        files: [ratingAtt],
        components: [createRatingButtons()]
      });

      const channelId = interaction.channel.id;
      const deleteTimer = setTimeout(() => {
        ticketDeleteTimers.delete(channelId);
        interaction.channel?.delete().catch(() => undefined);
      }, 10 * 60_000);
      ticketDeleteTimers.set(channelId, deleteTimer);
    }

    if (interaction.isButton() && interaction.customId.startsWith("rating:")) {
      const ratingStr = interaction.customId.split(":")[1];
      if (!ratingStr) return;

      const rating = parseInt(ratingStr);

      if (!interaction.channel || interaction.channel.type !== ChannelType.GuildText) return;

      const ticketData = db.prepare("SELECT * FROM tickets WHERE channel_id = ?")
        .get(interaction.channel.id) as any;

      if (!ticketData) {
        await interaction.reply({
          content: "Ticket data tidak ditemukan.",
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      if (interaction.user.id !== ticketData.user_id) {
        await interaction.reply({
          content: "Hanya pembuat ticket yang dapat memberikan rating.",
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      if (ticketData.rating !== null) {
        await interaction.reply({
          content: "Kamu sudah memberikan rating untuk ticket ini.",
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      db.prepare("UPDATE tickets SET rating = ? WHERE channel_id = ?")
        .run(rating, interaction.channel.id);

      const thanksEmbed = new EmbedBuilder()
        .setColor(0x22c55e)
        .setTitle("✅ Terima Kasih atas Rating Anda!")
        .setDescription(`Rating Anda: ${"⭐".repeat(rating)} (${rating}/5)\nKami akan terus berusaha meningkatkan kualitas pelayanan support kami.`)
        .setFooter({ text: "LeonX Hub • Support Feedback" });

      await interaction.reply({
        embeds: [thanksEmbed],
        flags: MessageFlags.Ephemeral
      });

      // Log rating jika ada LOG_CHANNEL_ID
      if (config.LOG_CHANNEL_ID) {
        const logChannel = await client.channels.fetch(config.LOG_CHANNEL_ID).catch(() => null);
        if (logChannel?.isSendable()) {
          const logEmbed = new EmbedBuilder()
            .setColor(0x2f3136)
            .setTitle("📊 Log Rating Ticket Baru")
            .setDescription(
              `Ulasan baru diterima untuk Ticket **#${ticketData.id}**!\n\n` +
              "---\n\n" +
              "### 📜 Detail Ulasan\n" +
              `• \`Ticket ID:\` **#${ticketData.id}**\n` +
              `• \`Kategori:\` **${TICKET_CATEGORIES[ticketData.category as TicketCategory]?.label || ticketData.category}**\n` +
              `• \`Rating:\` **${"⭐".repeat(rating)} (${rating}/5)**\n` +
              `• \`Pembuat Ticket:\` <@${ticketData.user_id}>\n` +
              `• \`Staff Claim:\` ${ticketData.claimed_by ? `<@${ticketData.claimed_by}>` : "Unclaimed"}`
            )
            .setFooter({ text: "LeonX Hub • Support Feedback" })
            .setTimestamp();

          await logChannel.send({ embeds: [logEmbed] });
        }
      }

      const pendingTimer = ticketDeleteTimers.get(interaction.channel.id);
      if (pendingTimer) clearTimeout(pendingTimer);
      ticketDeleteTimers.delete(interaction.channel.id);

      await interaction.channel.send(
        "✅ Rating diterima. Channel ticket akan dihapus dalam **15 detik**."
      );
      setTimeout(() => interaction.channel?.delete().catch(() => undefined), 15_000);
    }

    if (interaction.isModalSubmit() && interaction.customId === "bug:submit") {
      const title = interaction.fields.getTextInputValue("title");
      const description = interaction.fields.getTextInputValue("description");
      const steps = interaction.fields.getTextInputValue("steps");
      const result = db.prepare(
        "INSERT INTO bug_reports (guild_id, user_id, title, description, steps) VALUES (?, ?, ?, ?, ?)"
      ).run(interaction.guildId, interaction.user.id, title, description, steps);
      const channel = config.BUG_REPORT_CHANNEL_ID
        ? await client.channels.fetch(config.BUG_REPORT_CHANNEL_ID).catch(() => null)
        : null;
      const reportEmbed = new EmbedBuilder()
        .setColor(0x2f3136)
        .setTitle(`🐛 Laporan Bug #${result.lastInsertRowid}: ${title}`)
        .setDescription(
          `Dilaporkan oleh: <@${interaction.user.id}> (\`${interaction.user.id}\`)\n\n` +
          "---\n\n" +
          "### 📋 Deskripsi Masalah\n" +
          `${description}\n\n` +
          "---\n\n" +
          "### 🔄 Langkah Mengulang Bug\n" +
          `${steps}`
        )
        .setFooter({ text: "LeonX Hub • Bug Report System" })
        .setTimestamp();

      let reportUrl: string | null = null;
      if (channel?.type === ChannelType.GuildForum) {
        const thread = await channel.threads.create({
          name: `#${result.lastInsertRowid} ${title}`.slice(0, 100),
          message: {
            content:
              `Laporan dari <@${interaction.user.id}>\n` +
              "Silakan kirim screenshot atau video pendukung di bawah post ini.",
            embeds: [reportEmbed]
          },
          reason: `Bug report #${result.lastInsertRowid}`
        });
        reportUrl = thread.url;
      } else if (channel?.isSendable()) {
        const message = await channel.send({ embeds: [reportEmbed] });
        reportUrl = message.url;
      } else {
        throw new Error("BUG_REPORT_CHANNEL_ID bukan channel teks atau forum yang dapat digunakan.");
      }
      await interaction.reply({
        content:
          `Laporan bug #${result.lastInsertRowid} berhasil dibuat.\n` +
          `${reportUrl ? `[Buka laporan dan kirim gambar](${reportUrl})` : ""}`,
        flags: MessageFlags.Ephemeral
      });
    }
  } catch (error) {
    console.error(error);
    const message = { content: "Terjadi kesalahan saat menjalankan fitur ini.", flags: MessageFlags.Ephemeral } as const;
    if (interaction.isRepliable()) {
      if (interaction.replied || interaction.deferred) await interaction.followUp(message).catch(() => undefined);
      else await interaction.reply(message).catch(() => undefined);
    }
  }
});

const userSpamCache = new Map<string, {
  timestamps: number[];
  lastContent: string;
  repeatCount: number;
}>();

const FAQ_RULES = [
  {
    keywords: [
      "ambil script",
      "cara ambil script",
      "dapat script",
      "dapetin script",
      "dapat key",
      "cara dapat key",
      "cara dapetin key",
      "cara verifikasi",
      "get script",
      "how to get script",
      "get key"
    ],
    response: `Untuk mendapatkan script, silakan ikuti langkah berikut:\n` +
              `1. Verifikasi akun Anda di channel <#${config.VERIFY_CHANNEL_ID}> dengan menekan tombol verifikasi atau mengetik \`/verify\`.\n` +
              `2. Gunakan slash command \`/script\` di channel bot untuk mendapatkan loader script dan key khusus Anda melalui DM.\n` +
              `3. Jangan bagikan key tersebut kepada siapa pun!`
  },
  {
    keywords: [
      "script error",
      "ga jalan",
      "gagal execute",
      "tidak berfungsi",
      "tidak bisa di-execute",
      "gabisa di execute",
      "error execute",
      "script crash",
      "execute error"
    ],
    response: `Jika script tidak berjalan atau error, silakan periksa hal berikut:\n` +
              `- Pastikan Anda sudah mengatur \`_G.Key = "KEY_ANDA"\` di baris pertama sebelum baris \`loadstring\`.\n` +
              `- Pastikan executor Roblox Anda didukung dan versi terbaru.\n` +
              `- Jika masih terjadi kendala, silakan buat tiket bantuan di channel <#${config.TICKET_CHANNEL_ID || "support"}>.`
  },
  {
    keywords: [
      "reset hwid",
      "reset key",
      "ganti perangkat",
      "ganti device",
      "reset device",
      "hwid reset"
    ],
    response: `Anda dapat mereset data HWID atau Roblox ID yang tertaut pada key Anda menggunakan slash command \`/resethwid\` (Batas 1x / 10 menit). Setelah di-reset, jalankan kembali script di Roblox untuk menautkan perangkat/akun baru.`
  },
  {
    keywords: [
      "link website",
      "link web",
      "website leonthings",
      "web leonthings",
      "url website",
      "url web",
      "website bot",
      "web bot",
      "link bot",
      "halaman bot",
      "halaman web"
    ],
    response: `Silakan kunjungi website resmi kami di:\n` +
              `🌐 Website Utama: https://leonthings.my.id\n` +
              `🤖 Bot Console / Kelola Key & Reset HWID: https://leonthings.my.id/bot`
  }
];

async function handleTicketAiResponse(message: Message, ticket: TicketRecord) {
  if (!config.GEMINI_API_KEY) return;

  if ("sendTyping" in message.channel) {
    await (message.channel as TextChannel).sendTyping().catch(() => null);
  }

  try {
    const userMessage = message.content.trim();
    if (!userMessage) return;

    const catKey = ticket.category as TicketCategory;
    const categoryInfo = TICKET_CATEGORIES[catKey] || TICKET_CATEGORIES.general;
    const categoryLabel = categoryInfo.label;

    const systemPrompt = `Anda adalah LeonX AI Ticket Assistant, agen support otomatis cerdas untuk server Discord LeonX Hub (sebuah Roblox Script Hub premium).
Pengguna baru saja membuka tiket bantuan dengan kategori: "${categoryLabel}".
Berikut adalah deskripsi masalah/pertanyaan awal dari user:
"${userMessage}"

Tugas Anda:
1. Berikan analisis awal dan saran troubleshooting yang praktis, jelas, dan ramah sesuai kategori tiket.
2. Jika mereka memiliki kendala teknis (script error/tidak jalan), ingatkan mereka untuk:
   - Menaruh \`_G.Key = "KEY_LISENSI_ANDA"\` di baris paling pertama script sebelum baris loadstring.
   - Menggunakan executor Roblox yang ter-update dan kompatibel.
3. Jika masalah berkaitan dengan HWID Error / Key Terikat Perangkat Lain, jelaskan cara mereset HWID mereka menggunakan perintah /resethwid di Discord atau melalui panel Bot Console di website resmi kami (https://leonthings.my.id/bot).
4. Beri tahu mereka dengan ramah bahwa tim staff support manusia tetap akan datang untuk membantu secara langsung jika solusi otomatis ini tidak menyelesaikan masalah mereka.
5. Jawab secara singkat, padat, profesional, dan gunakan format markdown Discord (seperti bullet points, bold text, dll) agar mudah dibaca.
6. Berbahasa Indonesia secara sopan dan membantu.`;

    const geminiResult = await callGeminiAPI([
      { role: "user", parts: [{ text: systemPrompt }] }
    ]);

    if (geminiResult.ok) {
      const finalReply = (geminiResult.text || "Maaf, saya tidak dapat merespons secara otomatis saat ini.").trim();

      const embed = new EmbedBuilder()
        .setColor(0x2f3136)
        .setTitle("🤖 AI Support Assistant (Solusi Awal)")
        .setDescription(
          `${finalReply}\n\n` +
          "---\n\n" +
          "> 📌 *Tim support manusia akan segera membantu secara langsung jika masalah belum teratasi.*"
        )
        .setFooter({ text: "LeonX Hub • AI Support Assistant" });

      await message.reply({ embeds: [embed] });

      // Update database agar tidak merespons lagi di tiket ini
      db.prepare("UPDATE tickets SET ai_responded = 1 WHERE channel_id = ?").run(ticket.channel_id);
    } else {
      console.error("Gemini API Error in Ticket Assistant:", geminiResult.error);
    }
  } catch (err) {
    console.error("Error in handleTicketAiResponse:", err);
  }
}

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  const channelName = "name" in message.channel ? message.channel.name : "DM/Private";
  console.log(`[DEBUG] Message received from ${message.author.tag} in channel #${channelName} (${message.channel.id}): "${message.content}"`);

  if (!message.guild) return;

  const member = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
  if (!member) return;

  // Check if message is in a ticket channel
  if (message.channel.type === ChannelType.GuildText) {
    const ticketData = getOrRecoverTicket(message.channel as TextChannel);
    if (ticketData && ticketData.status === "open" && !ticketData.claimed_by && !ticketData.ai_responded) {
      if (message.author.id === ticketData.user_id) {
        await handleTicketAiResponse(message, ticketData);
        return;
      }
    }
  }

  // AI Chatbot Integration - Only trigger in the specified AI channel without requiring tag/prefix
  const isAiChannel = config.AI_CHANNEL_ID && message.channel.id === config.AI_CHANNEL_ID;

  if (isAiChannel && config.GEMINI_API_KEY) {
    if (onCooldown(message.author.id, "ai_chat", 5000)) {
      await message.react("⏳").catch(() => null);
      return;
    }
    // Show typing status
    await message.channel.sendTyping().catch(() => null);

    try {
      const userMessage = message.content.replace(new RegExp(`<@!?${client.user?.id}>`, 'g'), "").trim();
      if (!userMessage) return; // Ignore empty messages in AI channel

      const systemPrompt = `Anda adalah LeonX AI Assistant, sebuah bot pembantu cerdas untuk server Discord LeonX Hub (sebuah Roblox Script Hub premium).
Website Resmi: https://leonthings.my.id
Halaman Dashboard/Bot Console: https://leonthings.my.id/bot
Perintah Discord yang tersedia:
- /verify : Verifikasi akun Discord dan dapatkan role member terverifikasi.
- /script nama:LeonX Hub Loader : Mendapatkan key lisensi gratis dan loader script khusus yang dikirimkan lewat DM.
- /resethwid : Mereset kaitan perangkat/Roblox ID (cooldown reset adalah 10 menit sekali). Bisa juga dilakukan mandiri di website console.
- /website : Mendapatkan link website utama dan halaman bot console.
- /status : Cek status operational script LeonX Hub.
- /faq : Tanya jawab seputar permasalahan umum.
- /bug-report : Melaporkan bug/error langsung ke staff developer.
- /ticket : Membuat tiket keluhan bantuan jika ada masalah yang tidak terselesaikan.

Panduan penyelesaian masalah umum:
1. Script tidak berjalan atau gagal eksekusi:
   - Pastikan meletakkan \`_G.Key = "KEY_LISENSI_ANDA"\` di baris paling pertama sebelum baris loadstring.
   - Pastikan executor Roblox yang digunakan mendukung loadstring dan versi paling ter-update.
2. Key terdaftar di perangkat lain / HWID Error:
   - Gunakan command /resethwid di Discord atau buka website LeonThings bagian Bot Console -> My Key, lalu klik tombol "Reset HWID & Roblox ID". Ingat batas reset adalah 1x per 10 menit.
3. Mendapatkan Role Member:
   - Klik tombol verifikasi di channel verifikasi atau gunakan command /verify.
   - Member wajib mematuhi aturan server Discord (dilarang keras cracking loader, membagikan/leaking script LeonX, atau bypass ilegal dengan sanksi BANNED & BLACKLIST PERMANEN).

TINDAKAN KELUARAN KHUSUS (ACTION TAGS):
Anda dapat mengontrol tindakan bot secara langsung dengan menyertakan tag khusus ini tepat di akhir balasan Anda jika user memintanya (bot akan memprosesnya dan menggantinya dengan hasil nyata):
1. Jika pengguna meminta dikirimi script loader, key lisensi mereka, atau menyuruh "ambilin script", sertakan tag: [ACTION: SEND_SCRIPT]
2. Jika pengguna menanyakan statistik server bot, kapasitas, memori, atau performa bot, sertakan tag: [ACTION: GET_STATS]
3. Jika pengguna meminta untuk mereset HWID atau Roblox ID mereka, sertakan tag: [ACTION: RESET_HWID]
4. Jika pengguna menanyakan detail status key lisensi aktif mereka saat ini, sertakan tag: [ACTION: CHECK_MY_KEY]

Format balasan:
- Jawab secara singkat, padat, ramah, dan solutif.
- Gunakan bahasa Indonesia yang santai tapi sopan (sesuaikan bahasa jika ditanya dalam bahasa Inggris).
- Gunakan format markdown Discord (seperti cetak tebal, daftar, dll.) agar mudah dibaca.
- Jika ada pertanyaan di luar topik LeonX Hub, Roblox, scripting, executor, atau server Discord ini, jawab dengan ramah bahwa Anda hanya dapat membantu hal-hal terkait LeonX Hub.`;

      const geminiResult = await callGeminiAPI([
        { role: "user", parts: [{ text: `${systemPrompt}\n\nPertanyaan User: "${userMessage}"` }] }
      ]);

      if (geminiResult.ok) {
        const replyText = geminiResult.text || "Maaf, saya tidak dapat memahami pertanyaan tersebut. Silakan coba lagi.";
        let finalReply = replyText.trim();

        // 1. Action: SEND_SCRIPT
        if (finalReply.includes("[ACTION: SEND_SCRIPT]")) {
          const blacklistCheck = isBlacklisted({ discordId: message.author.id });
          if (blacklistCheck.blacklisted) {
            finalReply = finalReply.replace("[ACTION: SEND_SCRIPT]", `\n\n❌ **Akses ditolak:** Akun Discord Anda berada dalam daftar blacklist.\nAlasan: *${blacklistCheck.reason}*`);
          } else {
            const hasRole = config.VERIFIED_ROLE_ID && member.roles.cache.has(config.VERIFIED_ROLE_ID);
            if (!hasRole) {
              finalReply = finalReply.replace("[ACTION: SEND_SCRIPT]", `\n\n❌ **Gagal:** Anda harus melakukan verifikasi terlebih dahulu di channel <#${config.VERIFY_CHANNEL_ID}>.`);
            } else {
              try {
                const userKey = getOrCreateUserKey(message.author.id);
                const dmContent = 
                  `**LeonX Hub Loader**\n` +
                  `Berikut adalah loader script khusus untuk Anda. Jangan bagikan key ini kepada siapapun!\n` +
                  `\`\`\`lua\n` +
                  `_G.Key = "${userKey}"\n` +
                  `loadstring(game:HttpGet("https://leonthings.my.id/loader.lua"))()\n` +
                  `\`\`\`;`;
                await message.author.send(dmContent);
                finalReply = finalReply.replace("[ACTION: SEND_SCRIPT]", `\n\n🔑 **Sukses!** Loader script dan key lisensi Anda telah dikirimkan secara pribadi ke DM Anda. Silakan periksa pesan masuk Anda.`);
              } catch (dmErr) {
                finalReply = finalReply.replace("[ACTION: SEND_SCRIPT]", `\n\n❌ **Gagal:** Bot tidak dapat mengirim pesan ke DM Anda. Pastikan pengaturan privasi DM Anda untuk server ini diaktifkan.`);
              }
            }
          }
        }

        // 2. Action: GET_STATS
        if (finalReply.includes("[ACTION: GET_STATS]")) {
          try {
            const guildCount = client.guilds.cache.size;
            const activeKeys = db.prepare("SELECT COUNT(*) as count FROM user_keys").get() as { count: number } | undefined;
            const totalKeys = activeKeys?.count || 0;
            const memoryUsageMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024 * 100) / 100;
            
            let uptimeString = "0s";
            if (client.uptime) {
              const secs = Math.floor(client.uptime / 1000);
              const mins = Math.floor(secs / 60);
              const hours = Math.floor(mins / 60);
              const days = Math.floor(hours / 24);
              uptimeString = days > 0 
                ? `${days}hari ${hours % 24}jam`
                : hours > 0 
                ? `${hours}jam ${mins % 60}menit`
                : `${mins}menit ${secs % 60}detik`;
            }

            const statsBlock = 
              `\n\n📊 **Statistik Live Server LeonX Bot:**\n` +
              `• Jumlah Guild Server: \`${guildCount}\`\n` +
              `• Pengguna Lisensi (Keys): \`${totalKeys}\`\n` +
              `• Uptime Sistem: \`${uptimeString}\`\n` +
              `• Penggunaan Memory: \`${memoryUsageMB} MB\``;
              
            finalReply = finalReply.replace("[ACTION: GET_STATS]", statsBlock);
          } catch (statsErr) {
            finalReply = finalReply.replace("[ACTION: GET_STATS]", `\n\n❌ Gagal mengambil data statistik server saat ini.`);
          }
        }

        // 3. Action: RESET_HWID
        if (finalReply.includes("[ACTION: RESET_HWID]")) {
          const blacklistCheck = isBlacklisted({ discordId: message.author.id });
          if (blacklistCheck.blacklisted) {
            finalReply = finalReply.replace("[ACTION: RESET_HWID]", `\n\n❌ **Gagal:** Akun Anda di-blacklist.`);
          } else {
            const hasRole = config.VERIFIED_ROLE_ID && member.roles.cache.has(config.VERIFIED_ROLE_ID);
            if (!hasRole) {
              finalReply = finalReply.replace("[ACTION: RESET_HWID]", `\n\n❌ **Gagal:** Silakan verifikasi terlebih dahulu.`);
            } else {
              const resetResult = resetUserKeyBinding(message.author.id);
              if (resetResult.success) {
                finalReply = finalReply.replace("[ACTION: RESET_HWID]", `\n\n🔄 **HWID Reset Sukses!** Silakan jalankan kembali script di Roblox untuk menautkan perangkat/akun baru Anda.`);
              } else {
                finalReply = finalReply.replace("[ACTION: RESET_HWID]", `\n\n❌ **Gagal reset HWID:** ${resetResult.message}`);
              }
            }
          }
        }

        // 4. Action: CHECK_MY_KEY
        if (finalReply.includes("[ACTION: CHECK_MY_KEY]")) {
          try {
            const row = db.prepare("SELECT * FROM user_keys WHERE discord_id = ?").get(message.author.id) as {
              key: string;
              roblox_id: string | null;
              hwid: string | null;
              last_reset_at: string | null;
            } | undefined;

            if (!row) {
              finalReply = finalReply.replace("[ACTION: CHECK_MY_KEY]", `\n\n🔑 Anda belum memiliki key terdaftar. Silakan minta script terlebih dahulu agar key dibuat otomatis.`);
            } else {
              let cooldownRemainingMinutes = 0;
              if (row.last_reset_at) {
                const lastReset = new Date(row.last_reset_at).getTime();
                const now = Date.now();
                const diffMinutes = (now - lastReset) / (1000 * 60);
                if (diffMinutes < 10) {
                  cooldownRemainingMinutes = Math.ceil(10 - diffMinutes);
                }
              }

              const infoBlock = 
                `\n\n🔑 **Informasi Lisensi Key Anda:**\n` +
                `• **Key**: \`LEONX-••••-••••-••••\` (Disensor demi keamanan, detail lengkap telah dikirimkan ke DM Anda!)\n` +
                `• **Roblox ID**: \`${row.roblox_id || "Belum Terikat (Not Bound)"}\`\n` +
                `• **HWID**: \`${row.hwid || "Belum Terikat (Not Bound)"}\`\n` +
                `• **Cooldown Reset**: \`${cooldownRemainingMinutes > 0 ? `${cooldownRemainingMinutes} menit` : "Ready (Bebas Cooldown)"}\``;
                
              finalReply = finalReply.replace("[ACTION: CHECK_MY_KEY]", infoBlock);

              try {
                const dmContent = 
                  `🔑 **Informasi Lisensi Key Anda (Detail Privasi):**\n` +
                  `• **Key**: \`${row.key}\` (Jangan bagikan key ini kepada siapapun!)\n` +
                  `• **Roblox ID**: \`${row.roblox_id || "Belum Terikat (Not Bound)"}\`\n` +
                  `• **HWID**: \`${row.hwid || "Belum Terikat (Not Bound)"}\`\n` +
                  `• **Cooldown Reset**: \`${cooldownRemainingMinutes > 0 ? `${cooldownRemainingMinutes} menit` : "Ready"}\``;
                await message.author.send(dmContent);
              } catch (dmErr) {
                console.log(`Failed to DM key info to ${message.author.tag}:`, dmErr);
              }
            }
          } catch (keyErr) {
            finalReply = finalReply.replace("[ACTION: CHECK_MY_KEY]", `\n\n❌ Gagal memuat info key Anda.`);
          }
        }

        if (finalReply.length > 2000) {
          const chunks = finalReply.match(/[\s\S]{1,1950}/g) || [finalReply];
          for (const chunk of chunks) {
            await message.reply(chunk);
          }
        } else {
          await message.reply(finalReply);
        }
      } else {
        const errMsg = geminiResult.error === "timeout"
          ? "Maaf, AI sedang lambat merespons (timeout). Silakan coba lagi nanti."
          : "Maaf, terjadi kesalahan koneksi saat menghubungi modul AI saya. Silakan coba sesaat lagi.";
        await message.reply(errMsg);
      }
    } catch (err) {
      console.error("AI Chatbot error:", err);
      await message.reply("Maaf, terjadi error internal dalam sistem chatbot AI. Hubungi staf jika masalah berlanjut.");
    }
    return;
  }

  // Lewati pengecekan jika pengirim adalah owner atau staf dengan permission ManageMessages
  if (
    member.permissions.has(PermissionFlagsBits.ManageMessages) ||
    member.id === config.OWNER_ID
  ) {
    return;
  }

  // 0. Auto-Ban Kata Terlarang (selingkuh)
  if (message.content.toLowerCase().includes("selingkuh")) {
    try {
      await message.delete().catch(() => null);
      await message.author.send("Anda telah di-ban secara otomatis dari server karena mengucapkan kata terlarang (selingkuh).").catch(() => null);
      await member.ban({ reason: "Mengucapkan kata terlarang (selingkuh) - Auto Ban" });
      await message.channel.send(`🚨 <@${message.author.id}> telah di-ban secara otomatis karena mengucapkan kata terlarang.`);
      
        if (config.LOG_CHANNEL_ID) {
          const logChannel = await client.channels.fetch(config.LOG_CHANNEL_ID).catch(() => null);
          if (logChannel?.isSendable()) {
            const embed = new EmbedBuilder()
              .setColor(0x2f3136)
              .setTitle("🛡️ Auto Mod: Banned User")
              .setDescription(`Pengguna <@${message.author.id}> di-ban otomatis karena menulis kata terlarang (selingkuh).`)
              .setFooter({ text: "LeonX Hub • Auto Mod" })
              .setTimestamp();
            await logChannel.send({ embeds: [embed] });
          }
        }
    } catch (err) {
      console.error("Gagal melakukan auto-ban:", err);
    }
    return;
  }

  // 0. Auto-Reply FAQ
  const contentLower = message.content.toLowerCase();
  for (const rule of FAQ_RULES) {
    if (rule.keywords.some(keyword => contentLower.includes(keyword))) {
      await message.reply({
        content: `💡 **Auto FAQ:**\n${rule.response}`
      });
      return;
    }
  }

  // 1. Anti-Link Invite Server Lain
  const inviteRegex = /(discord\.(gg|io|me|li)\/.+|discord(app)?\.com\/invite\/.+)/i;
  if (inviteRegex.test(message.content)) {
    try {
      await message.delete();
      const warnMsg = await message.channel.send(`❌ <@${message.author.id}>, dilarang menyebarkan link server lain!`);
      setTimeout(() => warnMsg.delete().catch(() => null), 5000);

      // Catat warning ke Database SQLite
      db.prepare(`
        INSERT INTO warnings (guild_id, user_id, moderator_id, reason)
        VALUES (?, ?, ?, ?)
      `).run(message.guild.id, message.author.id, client.user?.id || "System", "Mengirim link invite server lain (Auto Mod)");

      // Kirim log ke LOG_CHANNEL_ID jika diset
      if (config.LOG_CHANNEL_ID) {
        const logChannel = await client.channels.fetch(config.LOG_CHANNEL_ID).catch(() => null);
        if (logChannel?.isSendable()) {
          const embed = new EmbedBuilder()
            .setColor(0x2f3136)
            .setTitle("🛡️ Auto Mod: Link Terblokir")
            .setDescription(`Pesan dari <@${message.author.id}> otomatis dihapus karena mengandung link invite server lain.\nChannel: <#${message.channel.id}>`)
            .setFooter({ text: "LeonX Hub • Auto Mod" })
            .setTimestamp();
          await logChannel.send({ embeds: [embed] });
        }
      }
    } catch (err) {
      console.error("Gagal menjalankan Anti-Link:", err);
    }
    return;
  }

  // 2. Anti-Spam
  const now = Date.now();
  const userId = message.author.id;
  let userData = userSpamCache.get(userId);

  if (!userData) {
    userData = {
      timestamps: [],
      lastContent: "",
      repeatCount: 0
    };
    userSpamCache.set(userId, userData);
  }

  // Bersihkan timestamp yang lebih lama dari 5 detik
  userData.timestamps = userData.timestamps.filter((t) => now - t < 5000);
  userData.timestamps.push(now);

  // Periksa pesan duplikat
  const normalizedContent = message.content.trim().toLowerCase();
  if (normalizedContent === userData.lastContent && normalizedContent.length > 3) {
    userData.repeatCount++;
  } else {
    userData.lastContent = normalizedContent;
    userData.repeatCount = 1;
  }

  const isSpammingFast = userData.timestamps.length > 5;
  const isSpammingRepeat = userData.repeatCount > 3;

  if (isSpammingFast || isSpammingRepeat) {
    try {
      await message.delete();
      const warnMsg = await message.channel.send(`⚠️ <@${message.author.id}>, mohon jangan melakukan spam di server!`);
      setTimeout(() => warnMsg.delete().catch(() => null), 5000);

      // Jika spam terus berlanjut (timestamps > 7), lakukan timeout selama 10 menit
      if (userData.timestamps.length > 7 && member.moderatable) {
        await member.timeout(10 * 60 * 1000, "Spamming (Auto Mod)");
        const timeoutMsg = await message.channel.send(`🔇 <@${message.author.id}> telah di-timeout selama 10 menit karena melakukan spam.`);
        setTimeout(() => timeoutMsg.delete().catch(() => null), 10000);

        // Catat warning ke database warnings
        db.prepare(`
          INSERT INTO warnings (guild_id, user_id, moderator_id, reason)
          VALUES (?, ?, ?, ?)
        `).run(message.guild.id, message.author.id, client.user?.id || "System", "Spamming berlebih (Auto Mod Timeout)");

        // Kirim log ke LOG_CHANNEL_ID
        if (config.LOG_CHANNEL_ID) {
          const logChannel = await client.channels.fetch(config.LOG_CHANNEL_ID).catch(() => null);
          if (logChannel?.isSendable()) {
            const embed = new EmbedBuilder()
              .setColor(0x2f3136)
              .setTitle("🛡️ Auto Mod: Timeout User")
              .setDescription(`Pengguna <@${message.author.id}> otomatis di-timeout selama 10 menit karena spamming berlebih.`)
              .setFooter({ text: "LeonX Hub • Auto Mod" })
              .setTimestamp();
            await logChannel.send({ embeds: [embed] });
          }
        }
      }
    } catch (err) {
      console.error("Gagal menjalankan Anti-Spam:", err);
    }
  }
});

// Helper functions for Roblox API integration
async function getRobloxUserInfo(robloxId: string): Promise<{ username: string; displayName: string } | null> {
  try {
    const res = await fetch(`https://users.roblox.com/v1/users/${robloxId}`);
    if (res.ok) {
      const data = await res.json() as { name: string; displayName: string };
      return {
        username: data.name,
        displayName: data.displayName
      };
    }
  } catch (error) {
    console.error(`Failed to fetch Roblox user info for ${robloxId}:`, error);
  }
  return null;
}

async function getRobloxAvatarUrl(robloxId: string): Promise<string | null> {
  try {
    const res = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${robloxId}&size=150x150&format=Png&isCircular=false`);
    if (res.ok) {
      const data = await res.json() as { data?: Array<{ imageUrl?: string }> };
      const url = data.data?.[0]?.imageUrl;
      if (url) {
        return url;
      }
    }
  } catch (error) {
    console.error(`Failed to fetch Roblox avatar for ${robloxId}:`, error);
  }
  return null;
}

// Spin up a lightweight stats HTTP server for web dashboard integration
const serverPort = process.env.PORT || 3000;
http.createServer(async (req, res) => {
  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Parse path and query params
  const urlObj = new URL(req.url!, `http://${req.headers.host || "localhost"}`);
  const pathname = urlObj.pathname;
  if (pathname === "/loader.lua" && req.method === "GET") {
    const loaderPath = path.join(process.cwd(), "lua", "loader.lua");
    try {
      if (fs.existsSync(loaderPath)) {
        const content = fs.readFileSync(loaderPath, "utf8");
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(content);
      } else {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(`warn("Gagal memuat script loader: file loader.lua tidak ditemukan di server.")`);
      }
    } catch (error: any) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(`warn("Internal server error: ${error.message.replace(/"/g, '\\"')}")`);
    }
  }
  else if (pathname === "/load.php" && req.method === "GET") {
    const key = urlObj.searchParams.get("key");
    const robloxId = urlObj.searchParams.get("roblox_id") || undefined;
    const hwid = urlObj.searchParams.get("hwid") || undefined;
    const username = urlObj.searchParams.get("username") || "Unknown";
    const executor = urlObj.searchParams.get("executor") || "Unknown";
    const placeId = urlObj.searchParams.get("place_id") || "Unknown";

    if (!key) {
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(`game:GetService("Players").LocalPlayer:Kick("Parameter 'key' wajib diisi.")`);
      return;
    }

    try {
      const result = validateUserKey(key, robloxId, hwid);
      if (!result.valid) {
        res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(`game:GetService("Players").LocalPlayer:Kick("Akses ditolak: ${result.message.replace(/"/g, '\\"')}")`);
        return;
      }

      if (result.discordId) {
        const guild = client.guilds.cache.get(config.GUILD_ID);
        const member = await guild?.members.fetch(result.discordId).catch(() => null);

        if (!member) {
          res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
          res.end(`game:GetService("Players").LocalPlayer:Kick("Akses ditolak: Pengguna tidak ditemukan di server Discord.")`);
          return;
        }

        if (config.VERIFIED_ROLE_ID && !member.roles.cache.has(config.VERIFIED_ROLE_ID)) {
          res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
          res.end(`game:GetService("Players").LocalPlayer:Kick("Akses ditolak: Pengguna tidak lagi memiliki role terverifikasi.")`);
          return;
        }
      }

      // Catat log eksekusi ke database SQLite
      try {
        db.prepare(`
          INSERT INTO script_executions (discord_id, roblox_username, roblox_id, place_id, executor, executed_at)
          VALUES (?, ?, ?, ?, ?, datetime('now'))
        `).run(result.discordId || null, username, robloxId || null, placeId, executor);
      } catch (dbErr) {
        console.error("Gagal mencatat log eksekusi ke database:", dbErr);
      }

      // Kirim log eksekusi ke channel Discord
      const logChannelId = "1521734378877616289";
      try {
        const logChannel = await client.channels.fetch(logChannelId).catch(() => null);
        if (logChannel?.isSendable()) {
          const logEmbed = new EmbedBuilder()
            .setColor(0x2f3136)
            .setTitle("📊 In-Game Script Executed!")
            .setDescription(
              `Script loader baru saja dieksekusi di dalam game Roblox!\n\n` +
              "---\n\n" +
              "### 🎮 Detail Eksekusi\n" +
              `• \`Discord User:\` ${result.discordId ? `<@${result.discordId}>` : "Unknown"}\n` +
              `• \`Roblox User:\` [${username}](https://www.roblox.com/users/${robloxId || 0}/profile) (\`${robloxId || "N/A"}\`)\n` +
              `• \`Place ID:\` [${placeId}](https://www.roblox.com/games/${placeId})\n` +
              `• \`Executor:\` \`${executor}\`\n` +
              `• \`Perangkat (HWID):\` \`${hwid || "N/A"}\``
            )
            .setFooter({ text: "LeonX Hub • Execution Log" })
            .setTimestamp();
          await logChannel.send({ embeds: [logEmbed] });
        }
      } catch (logErr) {
        console.error("Gagal mengirim log eksekusi ke Discord:", logErr);
      }

      // Serve the main.lua file
      const mainLuaPath = path.join(process.cwd(), "lua", "main.lua");
      if (fs.existsSync(mainLuaPath)) {
        const content = fs.readFileSync(mainLuaPath, "utf8");
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(content);
      } else {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(`warn("Gagal memuat script utama: file main.lua tidak ditemukan di server.")`);
      }
    } catch (error: any) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(`game:GetService("Players").LocalPlayer:Kick("Internal server error: ${error.message.replace(/"/g, '\\"')}")`);
    }
  }
  else if (pathname === "/api/validate-key" && req.method === "GET") {
    const key = urlObj.searchParams.get("key");
    const robloxId = urlObj.searchParams.get("roblox_id") || undefined;
    const hwid = urlObj.searchParams.get("hwid") || undefined;

    if (!key) {
      res.writeHead(400);
      res.end(JSON.stringify({ valid: false, error: "Parameter 'key' wajib diisi." }));
      return;
    }

    try {
      const result = validateUserKey(key, robloxId, hwid);
      if (!result.valid) {
        res.writeHead(403);
        res.end(JSON.stringify({ valid: false, error: result.message }));
        return;
      }

      if (result.discordId) {
        const guild = client.guilds.cache.get(config.GUILD_ID);
        const member = await guild?.members.fetch(result.discordId).catch(() => null);

        if (!member) {
          res.writeHead(403);
          res.end(JSON.stringify({ valid: false, error: "Akses ditolak: Pengguna tidak ditemukan di server Discord." }));
          return;
        }

        if (config.VERIFIED_ROLE_ID && !member.roles.cache.has(config.VERIFIED_ROLE_ID)) {
          res.writeHead(403);
          res.end(JSON.stringify({ valid: false, error: "Akses ditolak: Pengguna tidak lagi memiliki role terverifikasi." }));
          return;
        }
      }

      res.writeHead(200);
      res.end(JSON.stringify({ valid: true, message: result.message }));
    } catch (error: any) {
      res.writeHead(500);
      res.end(JSON.stringify({ valid: false, error: error.message }));
    }
  }
  else if (pathname === "/api/my-key" && req.method === "GET") {
    const token = urlObj.searchParams.get("token") || req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      res.writeHead(400);
      res.end(JSON.stringify({ hasKey: false, error: "Access token is required." }));
      return;
    }

    try {
      const discordRes = await fetch("https://discord.com/api/users/@me", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!discordRes.ok) {
        res.writeHead(401);
        res.end(JSON.stringify({ hasKey: false, error: "Unauthorized access token." }));
        return;
      }

      const user = await discordRes.json() as { id: string; username: string };
      const row = db.prepare("SELECT * FROM user_keys WHERE discord_id = ?").get(user.id) as {
        key: string;
        roblox_id: string | null;
        hwid: string | null;
        last_reset_at: string | null;
      } | undefined;

      if (!row) {
        res.writeHead(200);
        res.end(JSON.stringify({ hasKey: false, message: "Anda belum memiliki key terdaftar. Silakan gunakan `/script` terlebih dahulu di Discord." }));
        return;
      }

      let cooldownRemainingMinutes = 0;
      let cooldownRemainingHours = 0;
      if (row.last_reset_at) {
        const lastReset = new Date(row.last_reset_at).getTime();
        const now = Date.now();
        const diffMinutes = (now - lastReset) / (1000 * 60);
        if (diffMinutes < 10) {
          cooldownRemainingMinutes = Math.ceil(10 - diffMinutes);
          cooldownRemainingHours = Math.ceil(cooldownRemainingMinutes / 60);
        }
      }

      let robloxUsername: string | null = null;
      let robloxDisplayName: string | null = null;
      let robloxAvatarUrl: string | null = null;

      if (row.roblox_id) {
        const robloxUser = await getRobloxUserInfo(row.roblox_id);
        if (robloxUser) {
          robloxUsername = robloxUser.username;
          robloxDisplayName = robloxUser.displayName;
        }
        robloxAvatarUrl = await getRobloxAvatarUrl(row.roblox_id);
      }

      res.writeHead(200);
      res.end(JSON.stringify({
        hasKey: true,
        key: row.key,
        robloxId: row.roblox_id,
        robloxUsername,
        robloxDisplayName,
        robloxAvatarUrl,
        hwid: row.hwid,
        lastResetAt: row.last_reset_at,
        cooldownRemainingMinutes,
        cooldownRemainingHours
      }));
    } catch (error: any) {
      res.writeHead(500);
      res.end(JSON.stringify({ hasKey: false, error: error.message }));
    }
  }
  else if (pathname === "/api/reset-my-hwid" && req.method === "POST") {
    const token = urlObj.searchParams.get("token") || req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      res.writeHead(400);
      res.end(JSON.stringify({ success: false, error: "Access token is required." }));
      return;
    }

    try {
      const discordRes = await fetch("https://discord.com/api/users/@me", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!discordRes.ok) {
        res.writeHead(401);
        res.end(JSON.stringify({ success: false, error: "Unauthorized access token." }));
        return;
      }

      const user = await discordRes.json() as { id: string };
      const result = resetUserKeyBinding(user.id);
      if (result.success) {
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, message: result.message }));
      } else {
        res.writeHead(400);
        res.end(JSON.stringify({ success: false, error: result.message }));
      }
    } catch (error: any) {
      res.writeHead(500);
      res.end(JSON.stringify({ success: false, error: error.message }));
    }
  }
  else if (pathname === "/api/stats" && req.method === "GET") {
    const memoryUsageMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024 * 100) / 100;
    
    // Retrieve tables dynamically from SQLite database
    let totalTickets = 0;
    let totalWarnings = 0;
    let commandUsage: any[] = [];
    let blacklist: any[] = [];
    let recentTickets: any[] = [];
    let recentWarnings: any[] = [];

    try {
      const ticketsRow = db.prepare("SELECT COUNT(*) as count FROM tickets").get() as { count: number };
      totalTickets = ticketsRow?.count || 0;
      
      const warningsRow = db.prepare("SELECT COUNT(*) as count FROM warnings").get() as { count: number };
      totalWarnings = warningsRow?.count || 0;

      commandUsage = db.prepare("SELECT * FROM command_usage ORDER BY uses DESC").all();
      blacklist = db.prepare("SELECT * FROM blacklist ORDER BY id DESC").all();
      recentTickets = db.prepare("SELECT * FROM tickets ORDER BY id DESC LIMIT 10").all();
      recentWarnings = db.prepare("SELECT * FROM warnings ORDER BY id DESC LIMIT 10").all();
    } catch (e: any) {
      console.error("Database query failed inside HTTP server:", e);
    }

    const guildsList = client.guilds.cache.map(guild => ({
      name: guild.name,
      id: guild.id,
      members: guild.memberCount,
      icon: guild.iconURL({ size: 128 }) || null
    }));

    res.writeHead(200);
    res.end(JSON.stringify({
      status: "ONLINE",
      ping: client.ws.ping || 14,
      guilds: client.guilds.cache.size,
      users: client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0),
      uptime: client.uptime || 0,
      memory: memoryUsageMB,
      stats: {
        tickets: totalTickets,
        warnings: totalWarnings
      },
      avatar: client.user?.displayAvatarURL({ size: 128 }) || null,
      botTag: client.user?.tag || "El Bot#8981",
      guildsList,
      commandUsage,
      blacklist,
      tickets: recentTickets,
      warnings: recentWarnings
    }));
  } 
  else if (pathname === "/api/changelogs" && req.method === "GET") {
    try {
      const params = new URL(req.url || "", `http://${req.headers.host}`).searchParams;
      const page = Math.max(1, parseInt(params.get("page") || "1", 10));
      const limit = Math.min(20, Math.max(1, parseInt(params.get("limit") || "3", 10)));
      const offset = (page - 1) * limit;

      const totalRow = db.prepare("SELECT COUNT(*) as count FROM changelogs").get() as { count: number };
      const totalCount = totalRow?.count || 0;
      const totalPages = Math.ceil(totalCount / limit);

      const rows = db.prepare(
        "SELECT id, title, content, author_id, created_at FROM changelogs ORDER BY id DESC LIMIT ? OFFSET ?"
      ).all(limit, offset) as { id: number; title: string; content: string; author_id: string; created_at: string }[];

      res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify({ success: true, changelogs: rows, page, totalPages, totalCount }));
    } catch (error: any) {
      res.writeHead(500, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify({ success: false, error: error.message }));
    }
  }
  else if (pathname === "/api/blacklist" && req.method === "POST") {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => {
      try {
        const data = JSON.parse(body);
        if (!data.discordId && !data.robloxId) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: "discordId or robloxId required" }));
          return;
        }
        addToBlacklist({
          discordId: data.discordId,
          robloxId: data.robloxId,
          hwid: data.hwid,
          reason: data.reason || "Banned from Web Panel"
        });
        res.writeHead(200);
        res.end(JSON.stringify({ success: true }));
      } catch (err: any) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  } 
  else if (pathname === "/api/blacklist" && req.method === "DELETE") {
    const discordId = urlObj.searchParams.get("discord_id");
    const id = urlObj.searchParams.get("id");
    try {
      if (discordId) {
        db.prepare("DELETE FROM blacklist WHERE discord_id = ?").run(discordId);
      } else if (id) {
        db.prepare("DELETE FROM blacklist WHERE id = ?").run(id);
      } else {
        res.writeHead(400);
        res.end(JSON.stringify({ error: "id or discord_id required" }));
        return;
      }
      res.writeHead(200);
      res.end(JSON.stringify({ success: true }));
    } catch (err: any) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message }));
    }
  } 
  else if (pathname === "/api/proxy" && req.method === "GET") {
    const targetUrl = urlObj.searchParams.get("url");
    if (!targetUrl) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: "url parameter is required" }));
      return;
    }
    
    try {
      const response = await fetch(targetUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
      });
      const body = await response.text();
      res.writeHead(response.status, { "Content-Type": response.headers.get("content-type") || "application/json" });
      res.end(body);
    } catch (err: any) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message }));
    }
  }
  else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: "Not Found" }));
  }
}).listen(Number(serverPort), "0.0.0.0", () => {
  console.log(`[HTTP] stats server listening on port ${serverPort}`);
});

client.on(Events.GuildMemberAdd, async (member) => {
  const welcomeChannelId = "1515741307534966784";

  // ── Auto-ban akun yang umurnya kurang dari 1 bulan ──
  try {
    const accountAgeMs = Date.now() - member.user.createdTimestamp;
    const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000; // 30 hari

    if (accountAgeMs < ONE_MONTH_MS) {
      const accountAgeDays = Math.floor(accountAgeMs / (24 * 60 * 60 * 1000));
      const createdUnix = Math.floor(member.user.createdTimestamp / 1000);

      console.log(`[Anti-Raid] Akun terlalu baru terdeteksi: ${member.user.tag} (${accountAgeDays} hari). Memproses auto-ban...`);

      // Coba DM user sebelum ban
      try {
        await member.send(
          `⛔ **Auto-Ban — ${member.guild.name}**\n\n` +
          `Akun Discord Anda terlalu baru (dibuat ${accountAgeDays} hari yang lalu). ` +
          `Demi keamanan server, akun yang berumur kurang dari **30 hari** akan otomatis di-ban.\n\n` +
          `Silakan coba bergabung kembali setelah akun Anda berumur minimal 1 bulan.`
        );
      } catch {
        // DM gagal (privasi tertutup), lanjutkan ban
      }

      // Ban member
      await member.ban({ reason: `[Auto-Ban] Akun terlalu baru (${accountAgeDays} hari). Minimal 30 hari.` });

      // Kirim log ke channel
      const logEmbed = new EmbedBuilder()
        .setColor(0x2f3136)
        .setTitle("⛔ Auto-Ban: Akun Terlalu Baru")
        .setDescription(
          `Pengguna <@${member.user.id}> (\`${member.user.id}\`) otomatis di-ban demi keamanan server.\n\n` +
          `• **Umur Akun:** ${accountAgeDays} hari\n` +
          `• **Tanggal Dibuat:** <t:${createdUnix}:F> (<t:${createdUnix}:R>)`
        )
        .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
        .setFooter({ text: "LeonX Hub • Anti-Raid Protection" })
        .setTimestamp();

      if (config.LOG_CHANNEL_ID) {
        const logChannel = await member.guild.channels.fetch(config.LOG_CHANNEL_ID).catch(() => null);
        if (logChannel?.isSendable()) {
          await logChannel.send({ embeds: [logEmbed] });
        }
      }

      const welcomeChannel = await member.guild.channels.fetch(welcomeChannelId).catch(() => null);
      if (welcomeChannel?.isSendable()) {
        await welcomeChannel.send({ embeds: [logEmbed] });
      }

      return; // Jangan kirim welcome message
    }
  } catch (banError) {
    console.error("[Anti-Raid] Gagal memproses auto-ban akun baru:", banError);
  }

  // ── Welcome message ──
  try {
    const channel = await member.guild.channels.fetch(welcomeChannelId).catch(() => null);
    if (channel?.isSendable()) {
      const embed = new EmbedBuilder()
        .setColor(0x2f3136)
        .setTitle("✨ Selamat Datang di LeonX Hub!")
        .setDescription(
          `Halo <@${member.id}>, selamat datang di **${member.guild.name}**!\n\n` +
          "---\n\n" +
          "### 📋 Langkah Awal Member Baru\n" +
          `• \`1.\` Selesaikan verifikasi di channel <#${config.VERIFY_CHANNEL_ID}>\n` +
          `• \`2.\` Baca peraturan server di channel rules\n` +
          `• \`3.\` Gunakan \`/script\` untuk mendapatkan loader script Anda.`
        )
        .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
        .setFooter({ text: `Member #${member.guild.memberCount}` })
        .setTimestamp();

      const verifyRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setLabel("Verifikasi Akun")
          .setEmoji("✅")
          .setStyle(ButtonStyle.Link)
          .setURL(`https://discord.com/channels/${config.GUILD_ID}/${config.VERIFY_CHANNEL_ID}`)
      );

      await channel.send({ content: `Selamat datang <@${member.id}>!`, embeds: [embed], components: [verifyRow] });
    }
  } catch (error) {
    console.error("Gagal mengirim pesan selamat datang:", error);
  }
});

client.on(Events.GuildMemberRemove, async (member) => {
  const welcomeChannelId = "1515741307534966784";
  try {
    const channel = await member.guild.channels.fetch(welcomeChannelId).catch(() => null);
    if (channel?.isSendable()) {
      const embed = new EmbedBuilder()
        .setColor(0x2f3136)
        .setTitle("👋 Member Meninggalkan Server")
        .setDescription(
          `**${member.user.tag}** telah meninggalkan server.\n\n` +
          "---\n\n" +
          `Terima kasih sudah pernah menjadi bagian dari **${member.guild.name}**!`
        )
        .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
        .setFooter({ text: `Member #${member.guild.memberCount}` })
        .setTimestamp();

      await channel.send({ embeds: [embed] });
    }
  } catch (error) {
    console.error("Gagal mengirim pesan selamat tinggal:", error);
  }
});

await client.login(config.DISCORD_TOKEN);

