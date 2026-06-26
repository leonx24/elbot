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
  ModalBuilder,
  PermissionFlagsBits,
  TextChannel,
  TextInputBuilder,
  TextInputStyle
} from "discord.js";
import { config } from "./config.js";
import { db, trackCommand, addToBlacklist, removeFromBlacklist, isBlacklisted, getBlacklistList } from "./database.js";
import {
  createTicketPanel,
  createTicketChannel,
  closeTicket,
  createRatingButtons,
  getTicketStats,
  TICKET_CATEGORIES,
  type TicketCategory
} from "./ticket-system.js";

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

const cooldowns = new Map<string, number>();
const ticketDeleteTimers = new Map<string, NodeJS.Timeout>();
const ownerOnlyCommands = new Set(["warn", "timeout", "kick", "ban", "stats", "setstatus", "setvoicechannel", "blacklist"]);
const faq: Record<string, string> = {
  script: "Gunakan `/script nama:LeonX Hub Loader`. Bot akan mengirimkannya lewat DM.",
  error: "Cek `/status`, pastikan versinya terbaru, lalu kirim `/bug-report` bila masih error.",
  ticket: "Gunakan `/ticket`, kemudian tekan tombol **Buka Ticket**."
};

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

  return {
    embeds: [
      new EmbedBuilder()
        .setColor("Green")
        .setTitle("Verifikasi Member")
        .setDescription(
          "Klik tombol **Verify** di bawah untuk menyetujui peraturan dan mendapatkan akses ke server."
        )
    ],
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
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (ownerOnlyCommands.has(interaction.commandName) &&
          interaction.user.id !== config.OWNER_ID) {
        await interaction.reply({
          content: "Command ini khusus owner bot.",
          ephemeral: true
        });
        return;
      }

      if (onCooldown(interaction.user.id, interaction.commandName)) {
        await interaction.reply({ content: "Tunggu beberapa detik sebelum memakai command lagi.", ephemeral: true });
        return;
      }
      trackCommand(interaction.commandName);

      if (interaction.commandName === "verify") {
        await interaction.reply({
          content: `Silakan verifikasi di <#${config.VERIFY_CHANNEL_ID}>.`,
          ephemeral: true
        });
      }

      if (interaction.commandName === "script") {
        const blacklistCheck = isBlacklisted({ discordId: interaction.user.id });
        if (blacklistCheck.blacklisted) {
          await interaction.reply({
            content: `❌ Akses ditolak: Akun Discord Anda berada dalam daftar blacklist.\nAlasan: *${blacklistCheck.reason}*`,
            ephemeral: true
          });
          return;
        }

        if (!(interaction.member instanceof GuildMember) ||
            !config.VERIFIED_ROLE_ID ||
            !interaction.member.roles.cache.has(config.VERIFIED_ROLE_ID)) {
          await interaction.reply({
            content: `Kamu harus verifikasi dahulu di <#${config.VERIFY_CHANNEL_ID}>.`,
            ephemeral: true
          });
          return;
        }
        if (config.PREMIUM_ROLE_ID &&
            !interaction.member.roles.cache.has(config.PREMIUM_ROLE_ID)) {
          await interaction.reply({ content: "Kamu belum memiliki role yang diperlukan.", ephemeral: true });
          return;
        }
        await interaction.deferReply({ ephemeral: true });
        await interaction.user.send(
          '**LeonX Hub Loader**\n```lua\nloadstring(game:HttpGet("https://raw.githubusercontent.com/leonx24/Leon-x/main/loader.lua"))()\n```'
        );
        await interaction.editReply("Script berhasil dikirim melalui DM.");
      }

      if (interaction.commandName === "status") {
        const dbStatus = db.prepare("SELECT value FROM bot_settings WHERE key = 'script_status'").get() as { value: string } | undefined;
        const dbReason = db.prepare("SELECT value FROM bot_settings WHERE key = 'script_status_reason'").get() as { value: string } | undefined;

        const statusVal = dbStatus?.value || "operational";
        const reasonVal = dbReason?.value || "Semua sistem berjalan dengan normal.";

        let statusText = "🟢 Operational";
        let statusColor = 0x22c55e; // Green

        if (statusVal === "testing") {
          statusText = "🟡 Testing / Updating";
          statusColor = 0xeab308; // Yellow
        } else if (statusVal === "maintenance") {
          statusText = "🔴 Maintenance / Patched";
          statusColor = 0xef4444; // Red
        }

        await interaction.reply({
          embeds: [new EmbedBuilder().setColor(statusColor).setTitle("Status Script")
            .addFields(
              { name: "LeonX Hub", value: statusText, inline: true },
              { name: "Bot", value: "🟢 Online", inline: true },
              { name: "Catatan", value: reasonVal, inline: false }
            ).setTimestamp()]
        });
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
          ephemeral: true
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
            ephemeral: true
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
          ephemeral: true
        });

        // Jalankan pembaruan channel voice di background
        updateVoiceChannelStatus().catch((error) => {
          console.error("Gagal memperbarui voice channel status setelah mengganti channel:", error);
        });
      }

      if (interaction.commandName === "faq") {
        const topic = interaction.options.getString("topik", true);
        await interaction.reply({ content: faq[topic] ?? "Topik tidak ditemukan.", ephemeral: true });
      }

      if (interaction.commandName === "ticket") {
        const sub = interaction.options.getSubcommand(false);

        if (!sub) {
          // Fallback jika somehow dipanggil tanpa subcommand
          await interaction.reply({
            content: "Gunakan subcommand: `/ticket panel`, `/ticket close`, `/ticket add`, `/ticket remove`, atau `/ticket stats`",
            ephemeral: true
          });
          return;
        }

        if (sub === "panel") {
          if (interaction.user.id !== config.OWNER_ID) {
            await interaction.reply({
              content: "Hanya owner yang dapat membuat panel ticket.",
              ephemeral: true
            });
            return;
          }
          if (!interaction.channel?.isSendable()) {
            await interaction.reply({
              content: "Tidak bisa mengirim pesan di channel ini.",
              ephemeral: true
            });
            return;
          }
          await interaction.channel.send(createTicketPanel());
          await interaction.reply({
            content: "Panel ticket berhasil dibuat!",
            ephemeral: true
          });
        }

        if (sub === "close") {
          if (!interaction.channel || interaction.channel.type !== ChannelType.GuildText) {
            await interaction.reply({
              content: "Command ini hanya bisa digunakan di channel ticket.",
              ephemeral: true
            });
            return;
          }

          const ticketData = db.prepare("SELECT * FROM tickets WHERE channel_id = ?")
            .get(interaction.channel.id) as any;

          if (!ticketData) {
            await interaction.reply({
              content: "Ini bukan channel ticket.",
              ephemeral: true
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
            .setColor("Blue")
            .setTitle("📊 Beri Rating untuk Support Kami")
            .setDescription(
              "Bagaimana pengalamanmu dengan support kami?\n" +
              "Rating kamu sangat membantu kami untuk terus meningkatkan layanan."
            );

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
              ephemeral: true
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
              ephemeral: true
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

          const statsEmbed = new EmbedBuilder()
            .setColor("Blue")
            .setTitle("📊 Statistik Ticket System")
            .addFields(
              { name: "📝 Total Tickets", value: String(stats.total), inline: true },
              { name: "🟢 Open", value: String(stats.open), inline: true },
              { name: "🔒 Closed", value: String(stats.closed), inline: true },
              { name: "⭐ Average Rating", value: String(stats.avgRating), inline: true },
              {
                name: "📂 By Category",
                value: stats.byCategory.length > 0
                  ? stats.byCategory.map(c => `${TICKET_CATEGORIES[c.category as TicketCategory]?.emoji || "📌"} ${c.category}: ${c.count}`).join("\n")
                  : "Belum ada data",
                inline: false
              }
            )
            .setTimestamp();

          await interaction.reply({
            embeds: [statsEmbed],
            ephemeral: true
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
              ephemeral: true
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

          const consolidatedEmbed1 = new EmbedBuilder()
            .setColor(type.color)
            .setTitle(`LeonX Script Update Logs`)
            .setDescription(
              `• **Place:** ${gameName}\n` +
              `• **Version:** ${version}\n` +
              `• **Developer Notes:**\n` +
              `> ${summary}`
            )
            .setThumbnail(botAvatar ?? null);

          const consolidatedEmbed2 = new EmbedBuilder()
            .setColor(type.color)
            .setDescription(
              formattedContent + "\n\n" +
              `⚠️ *Dilarang membagikan script ke luar server. Pelanggaran dapat menyebabkan blacklist.*`
            )
            .setFooter({
              text: `LeonX Hub ${version} • ${statusFooterText}`,
              iconURL: botAvatar
            })
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
                embeds: [consolidatedEmbed1, consolidatedEmbed2],
                components: [links]
              },
              reason: `Changelog ${version}`
            });
          } else if (channel?.isSendable()) {
            await channel.send({
              content: `@everyone  ${type.emoji} **${type.label}**`,
              embeds: [consolidatedEmbed1, consolidatedEmbed2],
              components: [links]
            });
          } else {
            throw new Error("CHANGELOG_CHANNEL_ID bukan channel teks atau forum yang dapat digunakan.");
          }

          db.prepare("INSERT INTO changelogs (title, content, author_id) VALUES (?, ?, ?)")
            .run(changelogTitle, formattedContent, interaction.user.id);
          await interaction.reply({
            content: `Changelog berhasil diterbitkan di <#${config.CHANGELOG_CHANNEL_ID}>.`,
            ephemeral: true
          });
        } else {
          const row = db.prepare("SELECT title, content, created_at FROM changelogs ORDER BY id DESC LIMIT 1")
            .get() as { title: string; content: string; created_at: string } | undefined;
          await interaction.reply(row
            ? { embeds: [new EmbedBuilder().setTitle(row.title).setDescription(row.content).setFooter({ text: row.created_at })] }
            : { content: "Belum ada changelog.", ephemeral: true });
        }
      }

      if (["warn", "timeout", "kick", "ban"].includes(interaction.commandName)) {
        const user = interaction.options.getUser("user", true);
        const member = await interaction.guild?.members.fetch(user.id).catch(() => null);
        const reason = interaction.options.getString("alasan") ?? "Tidak ada alasan";
        if (!member) {
          await interaction.reply({ content: "Member tidak ditemukan.", ephemeral: true });
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
        await interaction.reply({ content: `Tindakan **${interaction.commandName}** berhasil untuk ${user.tag}.`, ephemeral: true });
      }

      if (interaction.commandName === "stats") {
        const openTickets = (db.prepare("SELECT COUNT(*) AS count FROM tickets WHERE status = 'open'").get() as { count: number }).count;
        const reports = (db.prepare("SELECT COUNT(*) AS count FROM bug_reports").get() as { count: number }).count;
        const uses = (db.prepare("SELECT COALESCE(SUM(uses), 0) AS count FROM command_usage").get() as { count: number }).count;
        await interaction.reply({
          embeds: [new EmbedBuilder().setTitle("Statistik Admin").addFields(
            { name: "Member", value: String(interaction.guild?.memberCount ?? 0), inline: true },
            { name: "Ticket aktif", value: String(openTickets), inline: true },
            { name: "Bug report", value: String(reports), inline: true },
            { name: "Command digunakan", value: String(uses), inline: true }
          )],
          ephemeral: true
        });
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
              ephemeral: true
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

          await interaction.reply({ content: message, ephemeral: true });
        }

        if (sub === "remove") {
          const user = interaction.options.getUser("user");
          const robloxId = interaction.options.getString("roblox_id");
          const hwid = interaction.options.getString("hwid");

          if (!user && !robloxId && !hwid) {
            await interaction.reply({
              content: "❌ Gagal: Anda harus menyertakan minimal salah satu dari parameter `user`, `roblox_id`, atau `hwid`.",
              ephemeral: true
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
              ephemeral: true
            });
          } else {
            await interaction.reply({
              content: "❌ Gagal: Target tidak ditemukan dalam daftar blacklist.",
              ephemeral: true
            });
          }
        }

        if (sub === "list") {
          const list = getBlacklistList();
          if (list.length === 0) {
            await interaction.reply({ content: "ℹ️ Daftar blacklist saat ini kosong.", ephemeral: true });
            return;
          }

          const embed = new EmbedBuilder()
            .setColor("Red")
            .setTitle("🚫 Daftar Blacklist LeonX")
            .setDescription(
              list.map((item) => {
                let details = "";
                if (item.discord_id) details += `Discord: <@${item.discord_id}> `;
                if (item.roblox_id) details += `Roblox ID: \`${item.roblox_id}\` `;
                if (item.hwid) details += `HWID: \`${item.hwid}\` `;
                return `**#${item.id}** — ${details}\n└ Alasan: *${item.reason}* (${item.created_at})`;
              }).join("\n\n")
            )
            .setTimestamp();

          await interaction.reply({ embeds: [embed], ephemeral: true });
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

          // Format Creation Date
          const creationDate = new Date(details.created);
          const unixTimestamp = Math.floor(creationDate.getTime() / 1000);

          const verifiedBadge = details.hasVerifiedBadge ? " ☑️" : "";

          const embed = new EmbedBuilder()
            .setColor("Blue")
            .setTitle(`👤 Profil Roblox: ${details.displayName}${verifiedBadge}`)
            .setURL(`https://www.roblox.com/users/${userId}/profile`)
            .setThumbnail(avatarUrl)
            .setDescription(
              details.description && details.description.trim() !== ""
                ? `\`\`\`text\n${details.description.slice(0, 500)}\n\`\`\``
                : "*Tidak ada deskripsi profil.*"
            )
            .addFields(
              { name: "Username", value: `\`${details.name}\``, inline: true },
              { name: "Display Name", value: `\`${details.displayName}\``, inline: true },
              { name: "Roblox ID", value: `\`${userId}\``, inline: true },
              { name: "Status Akun", value: details.isBanned ? "🔴 **Banned**" : "🟢 **Aktif**", inline: true },
              { name: "💰 Total RAP (Limiteds)", value: `\`${rapText}\``, inline: true },
              { name: "\u200B", value: "\u200B", inline: true }, // Spacer
              { name: "👥 Statistik Sosial", value: `• **Teman:** ${friendsCount}\n• **Pengikut:** ${followersCount}\n• **Mengikuti:** ${followingCount}`, inline: false },
              { name: "🏷️ Riwayat Nama Sebelumnya", value: historyText, inline: false },
              { name: "📅 Tanggal Pembuatan", value: `<t:${unixTimestamp}:D> (<t:${unixTimestamp}:R>)`, inline: false }
            )
            .setFooter({ text: "LeonX Hub • Roblox Lookup" })
            .setTimestamp();

          await interaction.editReply({ embeds: [embed] });
        } catch (error) {
          console.error("Gagal melakukan lookup Roblox:", error);
          await interaction.editReply("❌ Terjadi kesalahan saat menghubungi server Roblox. Silakan coba beberapa saat lagi.");
        }
      }

      if (interaction.commandName === "monitor-game") {
        const placeId = interaction.options.getString("place_id", true);
        await interaction.deferReply();

        try {
          // 1. Get Universe ID from Place ID
          const detailsResponse = await fetch(`https://games.roblox.com/v1/games/multiget-place-details?placeIds=${placeId}`);
          if (!detailsResponse.ok) {
            throw new Error(`Place details fetch error: ${detailsResponse.statusText}`);
          }

          const placeDetailsList = await detailsResponse.json() as Array<{
            universeId?: number;
            name?: string;
            description?: string;
            builder?: string;
            url?: string;
          }>;

          const placeData = placeDetailsList?.[0];
          if (!placeData || !placeData.universeId) {
            await interaction.editReply(`❌ Game dengan Place ID \`${placeId}\` tidak ditemukan.`);
            return;
          }

          const universeId = placeData.universeId;

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
          let creatorName = placeData.builder || "Unknown";
          let gameName = placeData.name || "Unknown Game";

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
            .setColor("Green")
            .setTitle(`🎮 Game Monitor: ${gameName}`)
            .setURL(`https://www.roblox.com/games/${placeId}`)
            .setThumbnail(iconUrl)
            .addFields(
              { name: "Creator", value: `\`${creatorName}\``, inline: true },
              { name: "Place ID", value: `\`${placeId}\``, inline: true },
              { name: "Universe ID", value: `\`${universeId}\``, inline: true },
              { name: "🟢 Playing", value: `\`${playing.toLocaleString("id-ID")}\``, inline: true },
              { name: "📈 Total Visits", value: `\`${visits.toLocaleString("id-ID")}\``, inline: true },
              { name: "⭐ Favorites", value: `\`${favoritedCount.toLocaleString("id-ID")}\``, inline: true },
              { name: "👍 Likes", value: `\`${likes.toLocaleString("id-ID")}\``, inline: true },
              { name: "👎 Dislikes", value: `\`${dislikes.toLocaleString("id-ID")}\``, inline: true },
              { name: "📊 Like Ratio", value: `\`${likeRatio}\` 👍`, inline: true }
            )
            .setFooter({ text: "LeonX Hub • Game Monitor" })
            .setTimestamp();

          await interaction.editReply({ embeds: [embed] });
        } catch (error) {
          console.error("Gagal memantau game Roblox:", error);
          await interaction.editReply("❌ Terjadi kesalahan saat mengambil data game. Silakan coba beberapa saat lagi.");
        }
      }
    }

    if (interaction.isButton() && interaction.customId === "verify:accept") {
      if (!config.VERIFIED_ROLE_ID || !(interaction.member instanceof GuildMember)) {
        await interaction.reply({ content: "Role verifikasi belum dikonfigurasi oleh admin.", ephemeral: true });
        return;
      }
      if (interaction.member.roles.cache.has(config.VERIFIED_ROLE_ID)) {
        await interaction.reply({ content: "Kamu sudah terverifikasi.", ephemeral: true });
        return;
      }
      await interaction.member.roles.add(config.VERIFIED_ROLE_ID);
      await interaction.reply({ content: "Verifikasi berhasil. Selamat datang!", ephemeral: true });
    }

    if (interaction.isStringSelectMenu() && interaction.customId === "ticket:category") {
      if (!interaction.guild) return;

      const category = interaction.values[0] as TicketCategory;

      // Render ulang select menu agar pilihan kembali ke placeholder.
      // Tanpa ini Discord menyimpan kategori terakhir, sehingga kategori yang
      // sama tidak dapat dipilih lagi setelah ticket ditutup.
      await interaction.message.edit(createTicketPanel()).catch((error) => {
        console.error("Gagal mereset pilihan kategori ticket:", error);
      });

      const existing = db.prepare("SELECT channel_id FROM tickets WHERE guild_id = ? AND user_id = ? AND status = 'open'")
        .get(interaction.guild.id, interaction.user.id) as { channel_id: string } | undefined;

      if (existing) {
        await interaction.reply({
          content: `Kamu sudah memiliki ticket aktif di <#${existing.channel_id}>`,
          ephemeral: true
        });
        return;
      }

      await interaction.deferReply({ ephemeral: true });

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
          ephemeral: true
        });
        return;
      }

      if (ticketData.claimed_by) {
        await interaction.reply({
          content: `Ticket ini sudah di-claim oleh <@${ticketData.claimed_by}>`,
          ephemeral: true
        });
        return;
      }

      db.prepare("UPDATE tickets SET claimed_by = ? WHERE channel_id = ?")
        .run(interaction.user.id, interaction.channel.id);

      const claimEmbed = new EmbedBuilder()
        .setColor("Green")
        .setDescription(`✋ <@${interaction.user.id}> telah claim ticket ini dan akan membantu menyelesaikan masalahmu.`);

      await interaction.reply({ embeds: [claimEmbed] });
    }

    if (interaction.isButton() && interaction.customId === "ticket:close") {
      if (!interaction.channel || interaction.channel.type !== ChannelType.GuildText) return;

      const ticketData = getOrRecoverTicket(interaction.channel);

      if (!ticketData) {
        await interaction.reply({
          content: "Data ticket tidak ditemukan. Pastikan tombol ini berada di channel ticket yang dibuat bot.",
          ephemeral: true
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
      const ratingEmbed = new EmbedBuilder()
        .setColor("Blue")
        .setTitle("📊 Beri Rating untuk Support Kami")
        .setDescription(
          `<@${ticket.user_id}>, bagaimana pengalamanmu dengan support kami?\n` +
          "Hanya pembuat ticket yang dapat memberi rating.\n\n" +
          "Channel akan dihapus setelah rating diberikan atau otomatis dalam **10 menit**."
        );

      await interaction.channel.send({
        embeds: [ratingEmbed],
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
          ephemeral: true
        });
        return;
      }

      if (interaction.user.id !== ticketData.user_id) {
        await interaction.reply({
          content: "Hanya pembuat ticket yang dapat memberikan rating.",
          ephemeral: true
        });
        return;
      }

      if (ticketData.rating !== null) {
        await interaction.reply({
          content: "Kamu sudah memberikan rating untuk ticket ini.",
          ephemeral: true
        });
        return;
      }

      db.prepare("UPDATE tickets SET rating = ? WHERE channel_id = ?")
        .run(rating, interaction.channel.id);

      const thanksEmbed = new EmbedBuilder()
        .setColor("Green")
        .setTitle("✅ Terima Kasih!")
        .setDescription(
          `Rating kamu: ${"⭐".repeat(rating)}\n\n` +
          "Terima kasih atas feedback-nya! Kami akan terus meningkatkan layanan support."
        );

      await interaction.reply({
        embeds: [thanksEmbed],
        ephemeral: true
      });

      // Log rating jika ada LOG_CHANNEL_ID
      if (config.LOG_CHANNEL_ID) {
        const logChannel = await client.channels.fetch(config.LOG_CHANNEL_ID).catch(() => null);
        if (logChannel?.isSendable()) {
          const logEmbed = new EmbedBuilder()
            .setColor(rating >= 4 ? "Green" : rating >= 3 ? "Yellow" : "Red")
            .setTitle("📊 New Ticket Rating")
            .addFields(
              { name: "Ticket ID", value: `#${ticketData.id}`, inline: true },
              { name: "Category", value: TICKET_CATEGORIES[ticketData.category as TicketCategory]?.label || ticketData.category, inline: true },
              { name: "Rating", value: `${"⭐".repeat(rating)} (${rating}/5)`, inline: true },
              { name: "User", value: `<@${ticketData.user_id}>`, inline: true },
              { name: "Claimed By", value: ticketData.claimed_by ? `<@${ticketData.claimed_by}>` : "Unclaimed", inline: true }
            )
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
        .setColor("Orange")
        .setTitle(`#${result.lastInsertRowid} ${title}`)
        .setDescription(description)
        .addFields({ name: "Cara mengulang", value: steps })
        .addFields({
          name: "📷 Bukti gambar/video",
          value: "Pelapor dapat mengirim screenshot atau video tambahan di dalam post ini."
        })
        .setFooter({ text: `Oleh ${interaction.user.tag} (${interaction.user.id})` })
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
        ephemeral: true
      });
    }
  } catch (error) {
    console.error(error);
    const message = { content: "Terjadi kesalahan saat menjalankan fitur ini.", ephemeral: true } as const;
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

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.guild) return;

  const member = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
  if (!member) return;

  // Lewati pengecekan jika pengirim adalah owner atau staf dengan permission ManageMessages
  if (
    member.permissions.has(PermissionFlagsBits.ManageMessages) ||
    member.id === config.OWNER_ID
  ) {
    return;
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
            .setColor("Red")
            .setTitle("🛡️ Auto Mod: Link Terblokir")
            .setDescription(`Pesan dari <@${message.author.id}> otomatis dihapus karena mengandung link invite server lain.`)
            .addFields(
              { name: "Pengguna", value: `${message.author.tag} (\`${message.author.id}\`)`, inline: true },
              { name: "Channel", value: `<#${message.channel.id}>`, inline: true },
              { name: "Isi Pesan", value: `\`\`\`text\n${message.content.slice(0, 1000)}\n\`\`\`` }
            )
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
              .setColor("Orange")
              .setTitle("🛡️ Auto Mod: Tindakan Mute (Timeout)")
              .setDescription(`Pengguna <@${message.author.id}> secara otomatis di-timeout selama 10 menit karena spamming.`)
              .addFields(
                { name: "Pengguna", value: `${message.author.tag} (\`${message.author.id}\`)`, inline: true },
                { name: "Deteksi", value: isSpammingFast ? "Mengirim pesan terlalu cepat" : "Mengirim pesan duplikat berulang", inline: true }
              )
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

await client.login(config.DISCORD_TOKEN);

