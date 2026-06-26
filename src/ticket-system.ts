import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  Guild,
  GuildMember,
  Message,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  TextChannel,
  User
} from "discord.js";
import { db } from "./database.js";
import { config } from "./config.js";

export const TICKET_CATEGORIES = {
  bug: { label: "🐛 Bug Report", emoji: "🐛", description: "Laporkan bug atau error pada script" },
  script: { label: "📜 Script Issue", emoji: "📜", description: "Masalah terkait script atau loader" },
  general: { label: "💬 General Support", emoji: "💬", description: "Pertanyaan umum atau bantuan lainnya" },
  premium: { label: "👑 Premium Support", emoji: "👑", description: "Bantuan untuk member premium" },
  report: { label: "⚠️ Report User", emoji: "⚠️", description: "Laporkan user yang melanggar" }
} as const;

export type TicketCategory = keyof typeof TICKET_CATEGORIES;

export function createTicketPanel() {
  const embed = new EmbedBuilder()
    .setColor("Blue")
    .setTitle("🎫 Support Ticket System")
    .setDescription(
      "Butuh bantuan? Buka ticket support dengan memilih kategori yang sesuai di bawah.\n\n" +
      "**Kategori yang tersedia:**\n" +
      Object.entries(TICKET_CATEGORIES)
        .map(([_, cat]) => `${cat.emoji} **${cat.label.split(" ").slice(1).join(" ")}** - ${cat.description}`)
        .join("\n") +
      "\n\n**Catatan:**\n" +
      "• Satu user hanya bisa memiliki 1 ticket aktif\n" +
      "• Tim support akan merespons dalam 1-24 jam\n" +
      "• Mohon jelaskan masalah dengan detail"
    )
    .setFooter({ text: "LeonX Hub • Support System" })
    .setTimestamp();

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId("ticket:category")
    .setPlaceholder("Pilih kategori ticket...")
    .addOptions(
      Object.entries(TICKET_CATEGORIES).map(([key, cat]) => ({
        label: cat.label.split(" ").slice(1).join(" "),
        value: key,
        description: cat.description,
        emoji: cat.emoji
      }))
    );

  return {
    embeds: [embed],
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu)]
  };
}

export async function createTicketChannel(
  guild: Guild,
  user: User,
  category: TicketCategory
): Promise<TextChannel> {
  const categoryInfo = TICKET_CATEGORIES[category];
  const channelName = `${categoryInfo.emoji.replace(/[^\w]/g, "")}-${user.username}-${Date.now().toString().slice(-6)}`.slice(0, 100);

  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: config.TICKET_CATEGORY_ID || undefined,
    topic: `Ticket by ${user.tag} (${user.id}) | Category: ${category} | Created: ${new Date().toISOString()}`,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks] },
      ...(config.SUPPORT_ROLE_ID
        ? [{
            id: config.SUPPORT_ROLE_ID,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages]
          }]
        : [])
    ]
  });

  const welcomeEmbed = new EmbedBuilder()
    .setColor("Blue")
    .setTitle(`${categoryInfo.emoji} ${categoryInfo.label}`)
    .setDescription(
      `Halo <@${user.id}>, terima kasih sudah membuka ticket!\n\n` +
      `**Kategori:** ${categoryInfo.label}\n` +
      `**Status:** 🟢 Open\n\n` +
      "Jelaskan masalahmu dengan detail di bawah. Tim support akan segera membantu.\n\n" +
      "**Tips:**\n" +
      "• Sertakan screenshot/video jika memungkinkan\n" +
      "• Jelaskan langkah-langkah yang sudah dicoba\n" +
      "• Sebutkan versi script yang digunakan"
    )
    .setFooter({ text: `Ticket ID: #${channel.id.slice(-6)}` })
    .setTimestamp();

  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket:claim")
      .setLabel("Claim Ticket")
      .setEmoji("✋")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("ticket:close")
      .setLabel("Close Ticket")
      .setEmoji("🔒")
      .setStyle(ButtonStyle.Danger)
  );

  await channel.send({
    content: config.SUPPORT_ROLE_ID ? `<@${user.id}> | <@&${config.SUPPORT_ROLE_ID}>` : `<@${user.id}>`,
    embeds: [welcomeEmbed],
    components: [buttons]
  });

  return channel;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatMessageContent(text: string): string {
  let escaped = escapeHtml(text);
  // Bold
  escaped = escaped.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  // Italic
  escaped = escaped.replace(/\*(.*?)\*/g, "<em>$1</em>");
  // Strike
  escaped = escaped.replace(/~~(.*?)~~/g, "<del>$1</del>");
  // Underline
  escaped = escaped.replace(/__(.*?)__/g, "<u>$1</u>");
  // Code block
  escaped = escaped.replace(/```([\s\S]*?)```/g, "<pre><code>$1</code></pre>");
  // Inline code
  escaped = escaped.replace(/`(.*?)`/g, "<code>$1</code>");
  // Convert newlines to br
  escaped = escaped.replace(/\n/g, "<br>");
  return escaped;
}

export async function generateTranscript(channel: TextChannel): Promise<string> {
  const messages = await channel.messages.fetch({ limit: 100 });
  const sorted = [...messages.values()].reverse();

  let messagesHtml = "";

  for (const message of sorted) {
    const timestamp = message.createdAt.toLocaleString("id-ID", {
      dateStyle: "short",
      timeStyle: "short"
    });

    const authorName = escapeHtml(message.author.username);
    const botBadge = message.author.bot ? `<span class="bot-tag">BOT</span>` : "";
    const avatarUrl = message.author.displayAvatarURL({ size: 64 });

    let contentHtml = "";
    if (message.content) {
      contentHtml = `<div class="message-text">${formatMessageContent(message.content)}</div>`;
    }

    let embedsHtml = "";
    if (message.embeds.length > 0) {
      for (const embed of message.embeds) {
        const embedColor = embed.color ? `#${embed.color.toString(16).padStart(6, "0")}` : "#1e1f22";
        const title = embed.title ? `<div class="embed-title">${escapeHtml(embed.title)}</div>` : "";
        const desc = embed.description ? `<div class="embed-description">${formatMessageContent(embed.description)}</div>` : "";
        embedsHtml += `
          <div class="embed" style="border-left-color: ${embedColor};">
            ${title}
            ${desc}
          </div>
        `;
      }
    }

    let attachmentsHtml = "";
    if (message.attachments.size > 0) {
      message.attachments.forEach((att) => {
        const isImage = att.contentType?.startsWith("image/") || 
                        /\.(jpg|jpeg|png|gif|webp)$/i.test(att.name);
        if (isImage) {
          attachmentsHtml += `
            <div class="attachment">
              <a href="${escapeHtml(att.url)}" target="_blank">
                <img src="${escapeHtml(att.url)}" alt="${escapeHtml(att.name)}" style="max-width: 350px; max-height: 350px; border-radius: 4px; display: block; margin-top: 4px;" />
              </a>
            </div>
          `;
        } else {
          attachmentsHtml += `
            <div class="attachment">
              📎 <a href="${escapeHtml(att.url)}" target="_blank">${escapeHtml(att.name)}</a>
            </div>
          `;
        }
      });
    }

    messagesHtml += `
      <div class="message-group">
        <img class="avatar" src="${avatarUrl}" alt="${authorName}'s avatar" />
        <div class="message-content-wrapper">
          <div class="author-info">
            <span class="author-name">${authorName}</span>${botBadge}
            <span class="timestamp">${timestamp}</span>
          </div>
          ${contentHtml}
          ${embedsHtml}
          ${attachmentsHtml}
        </div>
      </div>
    `;
  }

  const htmlTemplate = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>Transkrip Tiket - #${escapeHtml(channel.name)}</title>
  <style>
    body {
      background-color: #313338;
      color: #dbdee1;
      font-family: 'gg sans', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      margin: 0;
      padding: 20px;
    }
    .header {
      border-bottom: 1px solid #3f4147;
      padding-bottom: 20px;
      margin-bottom: 20px;
    }
    .header h1 {
      color: #f2f3f5;
      margin: 0 0 5px 0;
      font-size: 24px;
    }
    .header p {
      margin: 3px 0;
      color: #949ba4;
      font-size: 14px;
    }
    .message-group {
      display: flex;
      margin-bottom: 16px;
    }
    .avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      margin-right: 16px;
      background-color: #3f4147;
    }
    .message-content-wrapper {
      display: flex;
      flex-direction: column;
    }
    .author-info {
      display: flex;
      align-items: baseline;
      margin-bottom: 4px;
    }
    .author-name {
      color: #f2f3f5;
      font-weight: 600;
      font-size: 16px;
      margin-right: 8px;
    }
    .timestamp {
      color: #949ba4;
      font-size: 12px;
    }
    .message-text {
      color: #dbdee1;
      font-size: 15px;
      line-height: 1.375;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .embed {
      background-color: #2b2d31;
      border-left: 4px solid #1e1f22;
      border-radius: 4px;
      padding: 8px 16px;
      margin-top: 8px;
      max-width: 520px;
    }
    .embed-title {
      color: #f2f3f5;
      font-weight: 600;
      font-size: 16px;
      margin-bottom: 4px;
    }
    .embed-description {
      color: #dbdee1;
      font-size: 14px;
      white-space: pre-wrap;
    }
    .attachment {
      margin-top: 8px;
    }
    .attachment a {
      color: #00a8fc;
      text-decoration: none;
      font-size: 14px;
    }
    .attachment a:hover {
      text-decoration: underline;
    }
    .bot-tag {
      background-color: #5865f2;
      color: #ffffff;
      font-size: 10px;
      font-weight: 600;
      padding: 1px 4px;
      border-radius: 3px;
      margin-left: 6px;
      text-transform: uppercase;
    }
    code {
      background: #2b2d31;
      padding: 2px 4px;
      border-radius: 4px;
      font-family: monospace;
      font-size: 85%;
    }
    pre code {
      display: block;
      padding: 8px;
      overflow-x: auto;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>🎫 #${escapeHtml(channel.name)}</h1>
    <p>Ticket ID: ${channel.id}</p>
    <p>Dibuat: ${channel.createdAt?.toLocaleString("id-ID") || "N/A"}</p>
    <p>Ditutup: ${new Date().toLocaleString("id-ID")}</p>
  </div>
  <div class="messages">
    ${messagesHtml}
  </div>
</body>
</html>`;

  return htmlTemplate;
}

export function createRatingButtons() {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("rating:1")
      .setLabel("⭐")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("rating:2")
      .setLabel("⭐⭐")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("rating:3")
      .setLabel("⭐⭐⭐")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("rating:4")
      .setLabel("⭐⭐⭐⭐")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("rating:5")
      .setLabel("⭐⭐⭐⭐⭐")
      .setStyle(ButtonStyle.Primary)
  );
}

export async function closeTicket(
  channel: TextChannel,
  closedBy: User,
  reason?: string
): Promise<{ transcript: string; ticketData: any }> {
  const transcript = await generateTranscript(channel);

  const ticketData = db.prepare(
    "SELECT * FROM tickets WHERE channel_id = ?"
  ).get(channel.id) as any;

  db.prepare(
    "UPDATE tickets SET status = 'closed', closed_at = CURRENT_TIMESTAMP, close_reason = ? WHERE channel_id = ?"
  ).run(reason || "Closed by staff", channel.id);

  const closeEmbed = new EmbedBuilder()
    .setColor("Red")
    .setTitle("🔒 Ticket Ditutup")
    .setDescription(
      `Ticket ini telah ditutup oleh <@${closedBy.id}>\n\n` +
      `**Alasan:** ${reason || "Tidak ada alasan"}\n\n` +
      "Transcript telah disimpan dan dikirim via DM.\n" +
      "Pembuat ticket dapat memberikan rating sebelum channel dihapus."
    )
    .setFooter({ text: "Terima kasih sudah menggunakan support system kami!" })
    .setTimestamp();

  await channel.send({ embeds: [closeEmbed] });

  return { transcript, ticketData };
}

export function getTicketStats() {
  const total = (db.prepare("SELECT COUNT(*) as count FROM tickets").get() as { count: number }).count;
  const open = (db.prepare("SELECT COUNT(*) as count FROM tickets WHERE status = 'open'").get() as { count: number }).count;
  const closed = (db.prepare("SELECT COUNT(*) as count FROM tickets WHERE status = 'closed'").get() as { count: number }).count;
  const avgRating = (db.prepare("SELECT AVG(rating) as avg FROM tickets WHERE rating IS NOT NULL").get() as { avg: number | null }).avg;

  const byCategory = db.prepare(`
    SELECT category, COUNT(*) as count
    FROM tickets
    GROUP BY category
  `).all() as Array<{ category: string; count: number }>;

  return {
    total,
    open,
    closed,
    avgRating: avgRating ? avgRating.toFixed(1) : "N/A",
    byCategory
  };
}
