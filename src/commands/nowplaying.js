import { SlashCommandBuilder } from 'discord.js';
import { nowPlayingEmbed } from '../lib/embeds.js';
import { requireQueue } from '../lib/guards.js';

export const data = new SlashCommandBuilder()
  .setName('nowplaying')
  .setDescription('Mostra a faixa que esta tocando');

export async function execute(interaction) {
  const queue = requireQueue(interaction);
  await interaction.reply({ embeds: [nowPlayingEmbed(queue)] });
}
