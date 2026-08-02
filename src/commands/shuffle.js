import { SlashCommandBuilder } from 'discord.js';
import { errorEmbed, successEmbed } from '../lib/embeds.js';
import { requireQueue } from '../lib/guards.js';

export const data = new SlashCommandBuilder()
  .setName('shuffle')
  .setDescription('Embaralha as faixas da fila');

export async function execute(interaction) {
  const queue = requireQueue(interaction, { needsCurrent: false });
  const count = queue.shuffle();

  const embed =
    count < 2
      ? errorEmbed('Preciso de pelo menos 2 faixas na fila para embaralhar.')
      : successEmbed(`🔀 Embaralhei ${count} faixas.`);

  await interaction.reply({ embeds: [embed] });
}
