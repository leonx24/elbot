import {
  ActionRowBuilder,
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ThumbnailBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from "discord.js";
import { buildV2Container } from "./components-v2.js";

// Configuration for self-service actions
export const SERVICES = [
  {
    emoji: "🔑",
    title: "Get My Key",
    desc: "Dapatkan atau lihat License Key & Script Loader pribadi Anda.",
    customId: "get_my_key",
    style: ButtonStyle.Success,
  },
  {
    emoji: "🔄",
    title: "Reset HWID",
    desc: "Reset tautan perangkat jika Anda mengganti device.",
    note: "Cooldown 10 menit",
    customId: "reset_hwid",
    style: ButtonStyle.Primary,
  },
  {
    emoji: "📊",
    title: "My Key Info",
    desc: "Periksa status lisensi, perangkat terikat, dan riwayat eksekusi.",
    customId: "my_key_info",
    style: ButtonStyle.Secondary,
  },
  {
    emoji: "📋",
    title: "Copy Loader",
    desc: "Ambil script loader & key siap salin langsung di HP (Mobile Copy).",
    customId: "copy_loader",
    style: ButtonStyle.Secondary,
  },
  {
    emoji: "🎮",
    title: "Game Support",
    desc: "Cek daftar game yang didukung saat ini.",
    customId: "game_support",
    style: ButtonStyle.Secondary,
  },
];

/**
 * Membangun Dashboard Panel Lisensi LeonX Hub (Discord Components V2)
 * Tanpa garis aksen di sisi kiri.
 */
export function buildLicensePanelV2(iconUrl?: string) {
  const container = new ContainerBuilder();
  // Catatan: Tidak menggunakan .setAccentColor(...) agar tidak ada garis warna di sisi kiri

  // Header: title/desc + logo thumbnail accessory
  const headerContent = new TextDisplayBuilder().setContent(
    "## 🔑 LeonX Hub — License & Script Dashboard\n" +
    "Kelola lisensi script LeonX, reset HWID perangkat, dan dapatkan script loader dalam satu klik."
  );

  if (iconUrl) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(headerContent)
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(iconUrl))
    );
  } else {
    container.addTextDisplayComponents(headerContent);
  }

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large)
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent("### 📌 Layanan Mandiri (Self-Service)")
  );

  // Each service as its own Section with actionable button accessory
  for (const s of SERVICES) {
    const lines = [`**${s.emoji} ${s.title}**`, s.desc];
    if (s.note) lines.push(`-# ${s.note}`);

    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join("\n")))
        .setButtonAccessory(
          new ButtonBuilder()
            .setCustomId(s.customId)
            .setLabel(s.title)
            .setStyle(s.style)
        )
    );
  }

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large)
  );

  // Security notice
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      "🔒 **Keamanan:** Jangan pernah membagikan Key pribadi Anda kepada siapapun."
    )
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
  );

  // Footer
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent("-# LeonX Hub • Automated License Management System")
  );

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2 as const,
  };
}

/**
 * Membangun payload Dual-Platform Script Loader (Components V2)
 * Menyediakan versi Mobile (1-tap copy) dan versi PC (multi-line codeblock),
 * beserta tombol interaktif untuk Versi Mobile, Versi PC, dan Reset HWID.
 */
export function buildDualPlatformScriptPayload(
  key: string,
  options?: {
    userId?: string;
    isEng?: boolean;
    ephemeral?: boolean;
    iconUrl?: string;
    customTitle?: string;
  }
) {
  const isEng = options?.isEng ?? false;
  const singleLineLoader = `_G.Key = "${key}"; loadstring(game:HttpGet("https://leonthings.my.id/loader.lua?t=" .. tostring(os.time())))()`;
  const pcScript = `_G.Key = "${key}"\nloadstring(game:HttpGet("https://leonthings.my.id/loader.lua?t=" .. tostring(os.time())))()`;

  const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("script_mode_mobile")
      .setLabel(isEng ? "Mobile Version" : "Versi Mobile")
      .setEmoji("📱")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("script_mode_pc")
      .setLabel(isEng ? "PC Version" : "Versi PC")
      .setEmoji("💻")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("reset_hwid")
      .setLabel("Reset HWID")
      .setEmoji("🔄")
      .setStyle(ButtonStyle.Secondary)
  );

  const title =
    options?.customTitle ||
    (isEng
      ? "🔑 LeonX Hub — Script Loader & License"
      : "🔑 LeonX Hub — Script Loader & License");

  const description = options?.userId
    ? (isEng
        ? `Hello <@${options.userId}>, here is your script loader and license key:`
        : `Halo <@${options.userId}>, berikut adalah script loader dan license key Anda:`)
    : (isEng
        ? "Here is your official LeonX Hub script loader and license key:"
        : "Berikut adalah script loader dan license key resmi LeonX Hub Anda:");

  const v2Payload = buildV2Container({
    title,
    description,
    thumbnailUrl: options?.iconUrl,
    sections: [
      {
        title: isEng ? "📱 Mobile Version (Tap to Copy)" : "📱 Versi Mobile (Klik Langsung Ter-copy)",
        content: isEng
          ? `**Tap the script below once to copy automatically (do not hold):**\n\n` +
            `\`${singleLineLoader}\`\n\n` +
            `**Tap license key below to copy key only:**\n\n` +
            `\`${key}\``
          : `**Klik script nya aja nanti bakalan langsung ter-copy otomatis, jangan di tahan:**\n\n` +
            `\`${singleLineLoader}\`\n\n` +
            `**Klik key di bawah untuk salin key lisensi saja:**\n\n` +
            `\`${key}\``,
      },
      {
        title: isEng ? "💻 PC Version (Multi-line Script)" : "💻 Versi PC (Script Multi-line)",
        content:
          (isEng
            ? "**Full script for PC executors (Wave, Solara, Synapse, etc.):**\n\n"
            : "**Script lengkap untuk executor PC (Wave, Solara, Synapse, dll):**\n\n") +
          `\`\`\`lua\n${pcScript}\n\`\`\``,
      },
      {
        title: isEng ? "💡 Device Binding & Tips" : "💡 Panduan & Pengikatan HWID",
        content: isEng
          ? "• Key binds automatically to your device (HWID) on first Roblox execution.\n• Tap the buttons below for fast single-tap copying or to reset HWID."
          : "• Key otomatis terikat ke perangkat (HWID) saat pertama kali dieksekusi di Roblox.\n• Gunakan tombol di bawah jika ingin salin cepat per format atau reset HWID perangkat.",
      },
    ],
    footer: "LeonX Hub • Dual-Platform Loader System",
    actionRows: [actionRow],
  });

  return {
    ...v2Payload,
    flags: (options?.ephemeral
      ? MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
      : MessageFlags.IsComponentsV2) as any,
  };
}

/**
 * Membangun respon ephemeral untuk menampilkan Key user
 */
export function buildUserKeyEphemeral(key: string, username: string) {
  return buildDualPlatformScriptPayload(key, {
    userId: username,
    ephemeral: true,
  });
}

/**
 * Membangun respon ephemeral untuk informasi detail Key user (Components V2)
 */
export function buildKeyInfoEphemeral(info: {
  key: string;
  roblox_id: string | null;
  hwid: string | null;
  last_reset_at: string | null;
  created_at: string;
  execution_count: number;
}, discordId: string) {
  const singleLineLoader = `_G.Key = "${info.key}"; loadstring(game:HttpGet("https://leonthings.my.id/loader.lua?t=" .. tostring(os.time())))()`;
  const pcScript = `_G.Key = "${info.key}"\nloadstring(game:HttpGet("https://leonthings.my.id/loader.lua?t=" .. tostring(os.time())))()`;

  const hwidStatus = info.hwid
    ? `\`Terikat\` (\`${info.hwid.slice(0, 16)}...\`)`
    : "`Belum Terikat (Siap Dipakai di Game)`";

  const robloxStatus = info.roblox_id
    ? `[${info.roblox_id}](https://www.roblox.com/users/${info.roblox_id}/profile)`
    : "`Belum Terdeteksi`";

  const lastReset = info.last_reset_at
    ? `<t:${Math.floor(new Date(info.last_reset_at).getTime() / 1000)}:R>`
    : "`Belum Pernah`";

  const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("script_mode_mobile")
      .setLabel("Versi Mobile")
      .setEmoji("📱")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("script_mode_pc")
      .setLabel("Versi PC")
      .setEmoji("💻")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("reset_hwid")
      .setLabel("Reset HWID")
      .setEmoji("🔄")
      .setStyle(ButtonStyle.Secondary)
  );

  const v2Payload = buildV2Container({
    title: "📊 Informasi Lisensi Script — LeonX Hub",
    description: `Informasi data akun dan perangkat lisensi untuk <@${discordId}>:`,
    sections: [
      {
        title: "🔑 Detail Lisensi & Perangkat",
        content:
          `• **License Key:** \`${info.key}\`\n` +
          `• **Status Perangkat (HWID):** ${hwidStatus}\n` +
          `• **Roblox ID Terakhir:** ${robloxStatus}\n` +
          `• **Total Eksekusi In-Game:** \`${info.execution_count} kali\`\n` +
          `• **Terakhir Reset HWID:** ${lastReset}\n` +
          `• **Tanggal Dibuat:** \`${info.created_at}\``,
      },
      {
        title: "📱 Versi Mobile (Klik Langsung Ter-copy)",
        content:
          `**Klik script nya aja nanti bakalan langsung ter-copy otomatis, jangan di tahan:**\n\n` +
          `\`${singleLineLoader}\`\n\n` +
          `**Klik key di bawah untuk salin key lisensi saja:**\n\n` +
          `\`${info.key}\``,
      },
      {
        title: "💻 Versi PC (Script Multi-line)",
        content:
          `**Script lengkap untuk executor PC (Wave, Solara, dll):**\n\n` +
          `\`\`\`lua\n${pcScript}\n\`\`\``,
      },
    ],
    footer: "LeonX Hub • License System",
    actionRows: [actionRow],
  });

  return {
    ...v2Payload,
    flags: (MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral) as any,
  };
}
