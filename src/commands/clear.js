import { SlashCommandBuilder } from 'discord.js';
import { successEmbed } from '../lib/embeds.js';
import { requireQueue } from '../lib/guards.js';

export const data = new SlashCommandBuilder()
  .setName('clear')
  .setDescription('Limpa a fila sem parar a faixa atual');

export async function execute(interaction) {
  const queue = requireQueue(interaction, { needsCurrent: false });
  const removed = queue.tracks.length;
  queue.tracks = [];

  await interaction.reply({
    embeds: [successEmbed(`🧹 Removi ${removed} faixa(s) da fila. A atual continua tocando.`)],
  });
}
