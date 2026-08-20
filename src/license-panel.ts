import {
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ThumbnailBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  MessageFlags,
} from "discord.js";

/**
 * Membangun Dashboard Panel Lisensi LeonX Hub (Components V2)
 * Tanpa border warna di sisi kiri.
 */
export function buildLicensePanelV2(iconUrl?: string) {
  const container = new ContainerBuilder();

  // Header section with thumbnail
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

  // Guide Section
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      "### 📌 Layanan Mandiri (Self-Service)\n" +
      "• 🔑 **Get My Key** — Dapatkan atau lihat License Key pribadi Anda.\n" +
      "• 🔄 **Reset HWID** — Reset tautan perangkat jika Anda mengganti device (Cooldown 10 menit).\n" +
      "• 📊 **My Key Info** — Periksa status lisensi, perangkat terikat, dan riwayat eksekusi.\n" +
      "• 📋 **Copy Loader** — Ambil script loader siap eksekusi di Roblox.\n" +
      "• 🎮 **Game Support** — Cek daftar game yang didukung saat ini."
    )
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large)
  );

  // Footer Section
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      "-# 🔒 Keamanan: Jangan pernah membagikan Key pribadi Anda kepada siapapun.\n" +
      "-# LeonX Hub • Automated License Management System"
    )
  );

  // Action Buttons
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("license:get_key")
      .setLabel("Get My Key")
      .setEmoji("🔑")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("license:reset_hwid")
      .setLabel("Reset HWID")
      .setEmoji("🔄")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("license:info")
      .setLabel("My Key Info")
      .setEmoji("📊")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("license:copy_loader")
      .setLabel("Copy Loader")
      .setEmoji("📋")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("license:games")
      .setLabel("Game Support")
      .setEmoji("🎮")
      .setStyle(ButtonStyle.Secondary)
  );

  return {
    components: [container, row1],
    flags: MessageFlags.IsComponentsV2 as const,
  };
}

/**
 * Membangun respon ephemeral untuk menampilkan Key user
 */
export function buildUserKeyEphemeral(key: string, username: string) {
  const loaderCode = `_G.Key = "${key}"\nloadstring(game:HttpGet("https://leonthings.my.id/loader.lua?t=" .. tostring(os.time())))()`;

  const container = new ContainerBuilder();

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## 🔑 License Key Anda — LeonX Hub\n` +
      `Halo <@!${username}>, berikut adalah license key resmi milik Anda:\n\n` +
      `**License Key:**\n\`\`\`text\n${key}\n\`\`\`\n` +
      `**Script Loader (Siap Eksekusi):**\n\`\`\`lua\n${loaderCode}\n\`\`\`\n` +
      `*💡 Catatan: Key akan otomatis terikat ke perangkat (HWID) pertama kali saat dieksekusi di Roblox.*`
    )
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent("-# Rahasiakan key Anda. Satu key hanya dapat digunakan pada satu perangkat terdaftar.")
  );

  return {
    components: [container],
    flags: (MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral) as any,
  };
}

/**
 * Membangun respon ephemeral untuk informasi detail Key user
 */
export function buildKeyInfoEphemeral(info: {
  key: string;
  roblox_id: string | null;
  hwid: string | null;
  last_reset_at: string | null;
  created_at: string;
  execution_count: number;
}, discordId: string) {
  const container = new ContainerBuilder();

  const hwidStatus = info.hwid
    ? `\`Terikat\` (\`${info.hwid.slice(0, 16)}...\`)`
    : "`Belum Terikat (Siap Dipakai di Game)`";

  const robloxStatus = info.roblox_id
    ? `[${info.roblox_id}](https://www.roblox.com/users/${info.roblox_id}/profile)`
    : "`Belum Terdeteksi`";

  const lastReset = info.last_reset_at
    ? `<t:${Math.floor(new Date(info.last_reset_at).getTime() / 1000)}:R>`
    : "`Belum Pernah`";

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## 📊 Informasi Lisensi Script\n` +
      `Informasi data akun dan perangkat lisensi untuk <@${discordId}>:\n\n` +
      `• **License Key:** \`${info.key}\`\n` +
      `• **Status Perangkat (HWID):** ${hwidStatus}\n` +
      `• **Roblox ID Terakhir:** ${robloxStatus}\n` +
      `• **Total Eksekusi In-Game:** \`${info.execution_count} kali\`\n` +
      `• **Terakhir Reset HWID:** ${lastReset}\n` +
      `• **Tanggal Dibuat:** \`${info.created_at}\``
    )
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent("-# Jika ingin berpindah device/HP, gunakan tombol 'Reset HWID' di panel dashboard.")
  );

  return {
    components: [container],
    flags: (MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral) as any,
  };
}
