import { SlashCommandBuilder } from 'discord.js';
import { successEmbed } from '../lib/embeds.js';
import { trackLink } from '../lib/format.js';
import { requireQueue } from '../lib/guards.js';

export const data = new SlashCommandBuilder()
  .setName('skip')
  .setDescription('Pula a faixa atual')
  .addIntegerOption((option) =>
    option
      .setName('quantidade')
      .setDescription('Quantas faixas pular (padrao: 1)')
      .setMinValue(1)
      .setRequired(false),
  );

export async function execute(interaction) {
  const queue = requireQueue(interaction);
  const amount = interaction.options.getInteger('quantidade') ?? 1;
  const skipped = queue.current;

  // Descarta as faixas extras antes de parar a atual.
  if (amount > 1) queue.tracks.splice(0, amount - 1);
  queue.skip();

  await interaction.reply({ embeds: [successEmbed(`⏭️ Pulei ${trackLink(skipped)}.`)] });
}
