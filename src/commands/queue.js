import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { COLORS, loopLabel } from '../lib/embeds.js';
import { formatDuration, totalDuration, trackLink } from '../lib/format.js';
import { requireQueue } from '../lib/guards.js';

const PAGE_SIZE = 10;

export const data = new SlashCommandBuilder()
  .setName('queue')
  .setDescription('Mostra a fila de reproducao')
  .addIntegerOption((option) =>
    option.setName('pagina').setDescription('Pagina da fila').setMinValue(1).setRequired(false),
  );

export async function execute(interaction) {
  const queue = requireQueue(interaction, { needsCurrent: false });
  const pages = Math.max(1, Math.ceil(queue.tracks.length / PAGE_SIZE));
  const page = Math.min(interaction.options.getInteger('pagina') ?? 1, pages);
  const start = (page - 1) * PAGE_SIZE;

  const embed = new EmbedBuilder().setColor(COLORS.info).setTitle('📜 Fila de reproducao');

  if (queue.current) {
    embed.addFields({
      name: 'Tocando agora',
      value: `${trackLink(queue.current)} \`[${formatDuration(queue.current.duration)}]\``,
    });
  }

  const lines = queue.tracks
    .slice(start, start + PAGE_SIZE)
    .map(
      (track, index) =>
        `\`${start + index + 1}.\` ${trackLink(track)} \`[${formatDuration(track.duration)}]\``,
    );

  embed.addFields({
    name: `A seguir (${queue.tracks.length})`,
    value: lines.join('\n') || '*Fila vazia — use `/play` para adicionar.*',
  });

  embed.setFooter({
    text:
      `Pagina ${page}/${pages} • Duracao restante: ${formatDuration(totalDuration(queue.tracks))} • ` +
      `Volume ${queue.volume}% • Repeticao: ${loopLabel(queue.loopMode)}`,
  });

  await interaction.reply({ embeds: [embed] });
}
