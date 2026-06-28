const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('alive')
    .setDescription('Make the bot stay 24/7 in a voice channel or stop it')
    .addSubcommand(sub =>
      sub.setName('set')
        .setDescription('Bot will join and stay 24/7 in a voice channel')
        .addChannelOption(opt =>
          opt.setName('channel')
            .setDescription('Voice channel to stay in')
            .addChannelTypes(ChannelType.GuildVoice)
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName('stop')
        .setDescription('Stop the 24/7 voice connection')
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    await interaction.deferReply({ flags: 64 });

    const subcommand = interaction.options.getSubcommand();
    const { guildId, client } = interaction;

    if (subcommand === 'set') {
      const channel = interaction.options.getChannel('channel');

      if (!channel || channel.type !== ChannelType.GuildVoice) {
        return interaction.editReply({ content: 'Please select a valid voice channel.' });
      }

      const botMember = interaction.guild.members.me;
      const perms = channel.permissionsFor(botMember);
      const missing = [];
      if (!perms.has(PermissionFlagsBits.ViewChannel)) missing.push('View Channel');
      if (!perms.has(PermissionFlagsBits.Connect)) missing.push('Connect');
      if (!perms.has(PermissionFlagsBits.Speak)) missing.push('Speak');

      if (missing.length) {
        return interaction.editReply({
          content: `I'm missing the following permissions in ${channel}:\n> **${missing.join(', ')}**`,
        });
      }

      // Disconnect dulu kalau udah ada koneksi aktif (fix: biar ga mental/nabrak)
      if (client.voiceChannels[guildId]) {
        try { client.leaveVoiceChannel(guildId); } catch (_) { /* ignore */ }
      }

      client.voiceChannels[guildId] = channel.id;
      client.saveVoiceChannels(client.voiceChannels);

      try {
        await client.connectVoiceChannel(guildId);

        const embed = new EmbedBuilder()
          .setTitle('24/7 Mode Activated!')
          .setDescription(`Bot will now stay 24/7 in ${channel}`)
          .setColor(0x00c853)
          .addFields(
            { name: 'Channel', value: `${channel}`, inline: true },
            { name: 'Status', value: 'Auto-reconnect enabled', inline: true }
          )
          .setTimestamp();

        return interaction.editReply({ embeds: [embed] });

      } catch (error) {
        console.error('[alive set] connectVoiceChannel error:', error);

        delete client.voiceChannels[guildId];
        client.saveVoiceChannels(client.voiceChannels);

        const detail = error?.message ?? String(error);
        return interaction.editReply({
          content: [
            '**Failed to connect to the voice channel.**',
            '',
            `**Error:** \`${detail}\``,
            '',
            '**Common fixes:**',
            '• Make sure I have **View Channel**, **Connect**, and **Speak** permissions.',
            '• Run `npm install` again — a voice encryption library may be missing.',
            '• Check the bot console for the full `Voice dependency report`.',
          ].join('\n'),
        });
      }
    }

    if (subcommand === 'stop') {
      if (!client.voiceChannels[guildId]) {
        return interaction.editReply({ content: 'No 24/7 channel is currently set for this server.' });
      }

      client.leaveVoiceChannel(guildId);

      // Hapus data voice channel biar gak auto-reconnect lagi (fix: data lama nyangkut wok)
      delete client.voiceChannels[guildId];
      client.saveVoiceChannels(client.voiceChannels);

      const embed = new EmbedBuilder()
        .setTitle('24/7 Mode Stopped')
        .setDescription('Bot will no longer stay in the voice channel.')
        .setColor(0xff1744)
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    return interaction.editReply({ content: 'Unknown subcommand.' });
  },
};