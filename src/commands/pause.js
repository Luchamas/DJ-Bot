import { SlashCommandBuilder } from 'discord.js';
import { errorEmbed, successEmbed } from '../lib/embeds.js';
import { requireQueue } from '../lib/guards.js';

export const data = new SlashCommandBuilder()
  .setName('pause')
  .setDescription('Pausa a faixa atual');

export async function execute(interaction) {
  const queue = requireQueue(interaction);
  const embed = queue.pause()
    ? successEmbed('⏸️ Pausado. Use `/resume` para continuar.')
    : errorEmbed('Nao consegui pausar (a faixa ja esta pausada?).');

  await interaction.reply({ embeds: [embed] });
}
