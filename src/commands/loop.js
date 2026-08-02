import { SlashCommandBuilder } from 'discord.js';
import { loopLabel, successEmbed } from '../lib/embeds.js';
import { requireQueue } from '../lib/guards.js';

export const data = new SlashCommandBuilder()
  .setName('loop')
  .setDescription('Define o modo de repeticao')
  .addStringOption((option) =>
    option
      .setName('modo')
      .setDescription('O que repetir')
      .setRequired(true)
      .addChoices(
        { name: 'desligado', value: 'off' },
        { name: 'faixa atual', value: 'track' },
        { name: 'fila inteira', value: 'queue' },
      ),
  );

export async function execute(interaction) {
  const queue = requireQueue(interaction, { needsCurrent: false });
  queue.loopMode = interaction.options.getString('modo', true);

  await interaction.reply({
    embeds: [successEmbed(`Repeticao: **${loopLabel(queue.loopMode)}**`)],
  });
}
