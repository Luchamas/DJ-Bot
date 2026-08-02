import { SlashCommandBuilder } from 'discord.js';
import { errorEmbed, successEmbed } from '../lib/embeds.js';
import { requireQueue } from '../lib/guards.js';

export const data = new SlashCommandBuilder()
  .setName('resume')
  .setDescription('Retoma a reproducao pausada');

export async function execute(interaction) {
  const queue = requireQueue(interaction);
  const embed = queue.resume()
    ? successEmbed('▶️ Voltando a tocar.')
    : errorEmbed('Nao ha nada pausado.');

  await interaction.reply({ embeds: [embed] });
}
