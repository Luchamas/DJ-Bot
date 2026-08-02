import { SlashCommandBuilder } from 'discord.js';
import { successEmbed } from '../lib/embeds.js';
import { trackLink } from '../lib/format.js';
import { UserError, requireQueue } from '../lib/guards.js';

export const data = new SlashCommandBuilder()
  .setName('remove')
  .setDescription('Remove uma faixa da fila pela posicao')
  .addIntegerOption((option) =>
    option
      .setName('posicao')
      .setDescription('Posicao mostrada em /queue')
      .setMinValue(1)
      .setRequired(true),
  );

export async function execute(interaction) {
  const queue = requireQueue(interaction, { needsCurrent: false });
  const position = interaction.options.getInteger('posicao', true);
  const removed = queue.remove(position);

  if (!removed) throw new UserError(`Nao existe faixa na posicao **${position}**.`);

  await interaction.reply({ embeds: [successEmbed(`🗑️ Removi ${trackLink(removed)} da fila.`)] });
}
