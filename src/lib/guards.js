import { PermissionsBitField } from 'discord.js';
import { getQueue } from './queue.js';

/**
 * Erro "esperado" (falta de permissao, usuario fora do canal, ...).
 * O handler global mostra a mensagem para o usuario sem stack trace.
 */
export class UserError extends Error {}

/** Garante que o usuario esta num canal de voz que o bot consegue usar. */
export function requireVoiceChannel(interaction) {
  const channel = interaction.member?.voice?.channel;
  if (!channel) throw new UserError('Entre em um canal de voz primeiro.');

  const permissions = channel.permissionsFor(interaction.guild.members.me);
  if (!permissions?.has(PermissionsBitField.Flags.Connect)) {
    throw new UserError(`Nao tenho permissao para entrar em **${channel.name}**.`);
  }
  if (!permissions.has(PermissionsBitField.Flags.Speak)) {
    throw new UserError(`Nao tenho permissao para falar em **${channel.name}**.`);
  }

  return channel;
}

/** Garante que existe uma fila ativa e que o usuario esta no mesmo canal do bot. */
export function requireQueue(interaction, { needsCurrent = true } = {}) {
  const queue = getQueue(interaction.guildId);
  if (!queue) throw new UserError('Nao estou tocando nada neste servidor.');

  const userChannel = interaction.member?.voice?.channel;
  if (!userChannel || userChannel.id !== queue.voiceChannel?.id) {
    throw new UserError('Voce precisa estar no mesmo canal de voz que eu.');
  }

  if (needsCurrent && !queue.current) throw new UserError('Nao ha nenhuma faixa tocando.');
  return queue;
}
