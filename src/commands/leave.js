import { SlashCommandBuilder } from 'discord.js';
import { successEmbed } from '../lib/embeds.js';
import { requireQueue } from '../lib/guards.js';

export const data = new SlashCommandBuilder()
  .setName('leave')
  .setDescription('Faz o bot sair do canal de voz');

export async function execute(interaction) {
  const queue = requireQueue(interaction, { needsCurrent: false });
  queue.destroy();
  await interaction.reply({ embeds: [successEmbed('👋 Sai do canal de voz. Ate mais!')] });
}
