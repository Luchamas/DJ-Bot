import { SlashCommandBuilder } from 'discord.js';
import { infoEmbed, successEmbed } from '../lib/embeds.js';
import { requireQueue } from '../lib/guards.js';

export const data = new SlashCommandBuilder()
  .setName('volume')
  .setDescription('Mostra ou ajusta o volume (0-200)')
  .addIntegerOption((option) =>
    option
      .setName('nivel')
      .setDescription('Novo volume em porcentagem')
      .setMinValue(0)
      .setMaxValue(200)
      .setRequired(false),
  );

export async function execute(interaction) {
  const queue = requireQueue(interaction, { needsCurrent: false });
  const level = interaction.options.getInteger('nivel');

  if (level === null) {
    await interaction.reply({ embeds: [infoEmbed(`🔊 Volume atual: **${queue.volume}%**`)] });
    return;
  }

  queue.setVolume(level);
  await interaction.reply({ embeds: [successEmbed(`🔊 Volume ajustado para **${queue.volume}%**`)] });
}
