import {
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

// Configuration for self-service actions
export const SERVICES = [
  {
    emoji: "🔑",
    title: "Get My Key",
    desc: "Dapatkan atau lihat License Key pribadi Anda.",
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
    desc: "Ambil script loader siap eksekusi di Roblox.",
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
