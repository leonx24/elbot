import {
  ApplicationCommandOptionType,
  PermissionFlagsBits,
  SlashCommandBuilder
} from "discord.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("verify")
    .setDescription("Verifikasi akun dan dapatkan role member"),
  new SlashCommandBuilder()
    .setName("script")
    .setDescription("Kirim script melalui DM")
    .addStringOption((option) =>
      option.setName("nama").setDescription("Nama script").setRequired(true)
        .addChoices({ name: "LeonX Hub Loader", value: "loader" })
    ),
  new SlashCommandBuilder()
    .setName("status")
    .setDescription("Lihat status layanan script"),
  new SlashCommandBuilder()
    .setName("changelog")
    .setDescription("Lihat atau terbitkan changelog")
    .addSubcommand((sub) => sub.setName("latest").setDescription("Lihat update terbaru"))
    .addSubcommand((sub) =>
      sub.setName("publish").setDescription("Terbitkan changelog")
        .addStringOption((o) =>
          o.setName("versi").setDescription("Versi update, contoh: v1.2.0").setRequired(true)
        )
        .addStringOption((o) => o.setName("judul").setDescription("Judul update").setRequired(true))
        .addStringOption((o) =>
          o.setName("jenis").setDescription("Jenis update").setRequired(true)
            .addChoices(
              { name: "Update Besar", value: "major" },
              { name: "Fitur Baru", value: "feature" },
              { name: "Perbaikan Bug", value: "fix" },
              { name: "Maintenance", value: "maintenance" }
            )
        )
        .addStringOption((o) =>
          o.setName("isi")
            .setDescription("Contoh: NEW: fitur A | IMPR: lebih cepat | FIX: crash")
            .setRequired(true)
        )
        .addStringOption((o) =>
          o.setName("ringkasan")
            .setDescription("Kalimat pembuka update (opsional)")
        )
    ),
  new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Kelola sistem ticket support")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub.setName("panel").setDescription("Kirim panel ticket ke channel ini")
    )
    .addSubcommand((sub) =>
      sub.setName("close").setDescription("Tutup ticket ini")
        .addStringOption((o) => o.setName("alasan").setDescription("Alasan penutupan"))
    )
    .addSubcommand((sub) =>
      sub.setName("add").setDescription("Tambahkan user ke ticket ini")
        .addUserOption((o) => o.setName("user").setDescription("User yang ditambahkan").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub.setName("remove").setDescription("Hapus user dari ticket ini")
        .addUserOption((o) => o.setName("user").setDescription("User yang dihapus").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub.setName("stats").setDescription("Lihat statistik ticket system")
    ),
  new SlashCommandBuilder()
    .setName("bug-report")
    .setDescription("Kirim laporan bug"),
  new SlashCommandBuilder()
    .setName("faq")
    .setDescription("Pertanyaan yang sering ditanyakan")
    .addStringOption((option) =>
      option.setName("topik").setDescription("Pilih topik").setRequired(true)
        .addChoices(
          { name: "Cara mendapatkan script", value: "script" },
          { name: "Script tidak berjalan", value: "error" },
          { name: "Cara membuat ticket", value: "ticket" }
        )
    ),
  new SlashCommandBuilder()
    .setName("warn").setDescription("Beri peringatan kepada member")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName("user").setDescription("Member").setRequired(true))
    .addStringOption((o) => o.setName("alasan").setDescription("Alasan").setRequired(true)),
  new SlashCommandBuilder()
    .setName("timeout").setDescription("Timeout member")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName("user").setDescription("Member").setRequired(true))
    .addIntegerOption((o) => o.setName("menit").setDescription("Durasi").setRequired(true).setMinValue(1).setMaxValue(40320))
    .addStringOption((o) => o.setName("alasan").setDescription("Alasan")),
  new SlashCommandBuilder()
    .setName("kick").setDescription("Keluarkan member")
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption((o) => o.setName("user").setDescription("Member").setRequired(true))
    .addStringOption((o) => o.setName("alasan").setDescription("Alasan")),
  new SlashCommandBuilder()
    .setName("ban").setDescription("Ban member")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((o) => o.setName("user").setDescription("Member").setRequired(true))
    .addStringOption((o) => o.setName("alasan").setDescription("Alasan")),
  new SlashCommandBuilder()
    .setName("setstatus")
    .setDescription("Set status layanan script (Owner Only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((o) =>
      o.setName("status")
        .setDescription("Pilih status script")
        .setRequired(true)
        .addChoices(
          { name: "🟢 Operational", value: "operational" },
          { name: "🟡 Testing / Updating", value: "testing" },
          { name: "🔴 Maintenance / Patched", value: "maintenance" }
        )
    )
    .addStringOption((o) =>
      o.setName("catatan")
        .setDescription("Catatan status (opsional)")
    ),
  new SlashCommandBuilder()
    .setName("setvoicechannel")
    .setDescription("Atur voice channel untuk status bot (Owner Only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((o) =>
      o.setName("channel")
        .setDescription("Pilih voice channel")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("stats").setDescription("Statistik bot dan server")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
].map((command) => command.toJSON());

export type CommandData = {
  name: string;
  description: string;
  options?: Array<{ type: ApplicationCommandOptionType }>;
};
