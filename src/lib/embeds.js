import { EmbedBuilder } from 'discord.js';
import { formatDuration, progressBar, trackLink } from './format.js';

export const COLORS = {
  primary: 0x1db954,
  info: 0x5865f2,
  warn: 0xfee75c,
  error: 0xed4245,
};

const SOURCE_LABEL = {
  spotify: 'Spotify',
  youtube: 'YouTube',
};

export function errorEmbed(message) {
  return new EmbedBuilder().setColor(COLORS.error).setDescription(`❌ ${message}`);
}

export function infoEmbed(message) {
  return new EmbedBuilder().setColor(COLORS.info).setDescription(message);
}

export function successEmbed(message) {
  return new EmbedBuilder().setColor(COLORS.primary).setDescription(message);
}

export function nowPlayingEmbed(queue) {
  const track = queue.current;
  if (!track) return infoEmbed('Nada tocando agora.');

  const elapsed = Math.floor(queue.playbackDurationMs() / 1000);
  const embed = new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle('🎵 Tocando agora')
    .setDescription(trackLink(track));

  if (track.live) {
    embed.addFields({ name: '​', value: '🔴 Transmissao ao vivo' });
  } else if (track.duration) {
    embed.addFields({
      name: '​',
      value: `\`${progressBar(elapsed, track.duration)}\` \`${formatDuration(elapsed)} / ${formatDuration(track.duration)}\``,
    });
  } else {
    embed.addFields({ name: '​', value: `\`${formatDuration(elapsed)}\` decorridos` });
  }

  embed.addFields(
    { name: 'Pedido por', value: `${track.requestedBy ?? '—'}`, inline: true },
    { name: 'Volume', value: `${queue.volume}%`, inline: true },
    { name: 'Repeticao', value: loopLabel(queue.loopMode), inline: true },
  );

  if (track.source && SOURCE_LABEL[track.source]) {
    embed.setFooter({ text: `Fonte: ${SOURCE_LABEL[track.source]}` });
  }
  if (track.thumbnail) embed.setThumbnail(track.thumbnail);

  return embed;
}

export function addedTrackEmbed(track, position) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle('➕ Adicionado a fila')
    .setDescription(trackLink(track))
    .addFields(
      { name: 'Duracao', value: track.live ? '🔴 ao vivo' : formatDuration(track.duration), inline: true },
      { name: 'Posicao', value: position > 0 ? `#${position}` : 'tocando agora', inline: true },
    );

  if (track.thumbnail) embed.setThumbnail(track.thumbnail);
  if (track.source && SOURCE_LABEL[track.source]) {
    embed.setFooter({ text: `Fonte: ${SOURCE_LABEL[track.source]}` });
  }
  return embed;
}

export function addedPlaylistEmbed(title, tracks, truncated) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle('📚 Playlist adicionada')
    .setDescription(`**${title}**\n${tracks.length} faixa(s) na fila.`);

  const preview = tracks
    .slice(0, 5)
    .map((track, index) => `\`${index + 1}.\` ${trackLink(track)}`)
    .join('\n');

  if (preview) embed.addFields({ name: 'Primeiras faixas', value: preview });
  if (tracks[0]?.thumbnail) embed.setThumbnail(tracks[0].thumbnail);
  if (truncated) embed.setFooter({ text: 'A lista foi cortada pelo limite configurado.' });

  return embed;
}

export function loopLabel(mode) {
  return { off: 'desligada', track: '🔂 faixa', queue: '🔁 fila' }[mode] ?? mode;
}
