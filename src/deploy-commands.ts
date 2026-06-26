import "dotenv/config";
import { DiscordAPIError, REST, Routes } from "discord.js";
import { z } from "zod";
import { commands } from "./commands.js";

const env = z.object({
  DISCORD_TOKEN: z.string().min(1),
  CLIENT_ID: z.string().regex(/^\d+$/),
  GUILD_ID: z.string().regex(/^\d+$/)
}).parse(process.env);

const rest = new REST({ version: "10" }).setToken(env.DISCORD_TOKEN);

const inviteUrl =
  `https://discord.com/oauth2/authorize?client_id=${env.CLIENT_ID}` +
  "&permissions=8&integration_type=0&scope=bot+applications.commands";

try {
  const application = await rest.get(Routes.currentApplication()) as { id: string };

  if (application.id !== env.CLIENT_ID) {
    console.error("Deploy dibatalkan: CLIENT_ID tidak cocok dengan token bot.");
    console.error(`CLIENT_ID di .env : ${env.CLIENT_ID}`);
    console.error(`Application token : ${application.id}`);
    process.exitCode = 1;
  } else {
    await rest.get(Routes.guild(env.GUILD_ID));
    await rest.put(Routes.applicationGuildCommands(env.CLIENT_ID, env.GUILD_ID), {
      body: commands
    });

    console.log(`${commands.length} command berhasil didaftarkan ke server ${env.GUILD_ID}.`);
  }
} catch (error) {
  if (error instanceof DiscordAPIError && error.code === 50001) {
    console.error("Deploy gagal: bot tidak memiliki akses ke server tersebut.");
    console.error("Pastikan GUILD_ID benar dan undang bot melalui link ini:");
    console.error(inviteUrl);
    console.error("Setelah bot masuk ke server, jalankan lagi: npm run deploy");
  } else if (error instanceof DiscordAPIError && error.status === 401) {
    console.error("Deploy gagal: DISCORD_TOKEN tidak valid. Reset token di Developer Portal lalu perbarui .env.");
  } else {
    console.error("Deploy command gagal:", error);
  }

  process.exitCode = 1;
}
