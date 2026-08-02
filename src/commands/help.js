import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { COLORS } from '../lib/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('help')
  .setDescription('Lista os comandos do bot');

export async function execute(interaction) {
  const commands = [...interaction.client.commands.values()]
    .map((command) => `\`/${command.data.name}\` — ${command.data.description}`)
    .sort()
    .join('\n');

  const embed = new EmbedBuilder()
    .setColor(COLORS.info)
    .setTitle('🎧 DJ Bot')
    .setDescription(commands)
    .addFields({
      name: 'Fontes suportadas',
      value: [
        '• YouTube: video, playlist, Shorts, YouTube Music',
        '• Spotify: faixa, album, playlist, artista *(o audio vem do YouTube)*',
        '• Texto livre: `/play sertanejo anos 90`',
        '• Outros sites suportados pelo yt-dlp (SoundCloud, Bandcamp, ...)',
      ].join('\n'),
    });

  await interaction.reply({ embeds: [embed] });
}
