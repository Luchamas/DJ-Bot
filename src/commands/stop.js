import { SlashCommandBuilder } from 'discord.js';
import { successEmbed } from '../lib/embeds.js';
import { requireQueue } from '../lib/guards.js';

export const data = new SlashCommandBuilder()
  .setName('stop')
  .setDescription('Para a reproducao e limpa a fila');

export async function execute(interaction) {
  const queue = requireQueue(interaction, { needsCurrent: false });
  queue.stop();
  await interaction.reply({ embeds: [successEmbed('⏹️ Parei tudo e limpei a fila.')] });
}
