import { SlashCommandBuilder } from 'discord.js';
import { addedPlaylistEmbed, addedTrackEmbed } from '../lib/embeds.js';
import { UserError, requireVoiceChannel } from '../lib/guards.js';
import { createQueue, getQueue } from '../lib/queue.js';
import { resolveQuery } from '../lib/resolver.js';

export const data = new SlashCommandBuilder()
  .setName('play')
  .setDescription('Toca uma musica por link do YouTube/Spotify ou por busca')
  .addStringOption((option) =>
    option
      .setName('busca')
      .setDescription('Link do YouTube, link do Spotify ou termo de busca')
      .setRequired(true),
  )
  .addBooleanOption((option) =>
    option
      .setName('proxima')
      .setDescription('Coloca no topo da fila em vez do fim')
      .setRequired(false),
  );

export async function execute(interaction) {
  const voiceChannel = requireVoiceChannel(interaction);
  const input = interaction.options.getString('busca', true);
  const playNext = interaction.options.getBoolean('proxima') ?? false;

  // Ja tocando em outro canal: nao arrasta o bot para longe de quem esta ouvindo.
  const existing = getQueue(interaction.guildId);
  if (existing?.current && existing.voiceChannel?.id !== voiceChannel.id) {
    throw new UserError(`Ja estou tocando em **${existing.voiceChannel.name}**.`);
  }

  await interaction.deferReply();

  const { tracks, playlistTitle, truncated } = await resolveQuery(input);
  for (const track of tracks) track.requestedBy = interaction.user.toString();

  const queue = createQueue(interaction.guild, voiceChannel, interaction.channel);
  await queue.connect(voiceChannel);

  const wasIdle = !queue.current;
  const added = playNext ? queue.addNext(tracks) : queue.add(tracks);

  if (added === 0) {
    await interaction.editReply({ content: '⚠️ A fila esta cheia.' });
    return;
  }

  if (playlistTitle) {
    await interaction.editReply({
      embeds: [addedPlaylistEmbed(playlistTitle, tracks.slice(0, added), truncated || added < tracks.length)],
    });
  } else {
    // Se nada estava tocando, esta faixa vira a atual: posicao 0 = "tocando agora".
    const position = wasIdle ? 0 : queue.tracks.indexOf(tracks[0]) + 1;
    await interaction.editReply({ embeds: [addedTrackEmbed(tracks[0], position)] });
  }

  if (wasIdle) await queue.playNext();
}
