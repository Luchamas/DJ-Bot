import { generateDependencyReport } from '@discordjs/voice';
import {
  ChannelType,
  Client,
  Collection,
  Events,
  GatewayIntentBits,
  MessageFlags,
} from 'discord.js';
import { assertConfig, config, hasSpotifyCredentials } from './config.js';
import { errorEmbed } from './lib/embeds.js';
import { UserError } from './lib/guards.js';
import { loadCommands } from './lib/load-commands.js';
import { loginComRetentativa, codigoDeRede } from './lib/login.js';
import { startPresence, stopPresence } from './lib/presence.js';
import { destroyAllQueues, getQueue } from './lib/queue.js';
import { checkYtdlp } from './lib/ytdlp.js';

assertConfig();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

client.commands = new Collection();
for (const command of await loadCommands()) {
  client.commands.set(command.data.name, command);
}

/* -------------------------------------------------------------------- eventos */

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`🎧 Conectado como ${readyClient.user.tag}`);
  console.log(`   Comandos carregados: ${[...client.commands.keys()].join(', ')}`);
  console.log(`   Spotify: ${hasSpotifyCredentials ? 'API configurada' : 'sem credenciais (so faixas avulsas)'}`);

  try {
    console.log(`   yt-dlp: ${await checkYtdlp()}`);
  } catch (error) {
    console.warn(`⚠️  ${error.message}`);
  }

  startPresence(readyClient);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  if (!interaction.inGuild()) {
    await interaction.reply({
      embeds: [errorEmbed('Os comandos de musica so funcionam dentro de um servidor.')],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    const expected = error instanceof UserError;
    if (!expected) console.error(`[${interaction.commandName}]`, error);

    const embeds = [errorEmbed(expected ? error.message : `Algo deu errado: ${error.message}`)];

    try {
      // editReply nao aceita flags: o ephemeral so vale para respostas novas.
      if (interaction.deferred || interaction.replied) await interaction.editReply({ embeds });
      else await interaction.reply({ embeds, flags: MessageFlags.Ephemeral });
    } catch {
      /* interacao expirada */
    }
  }
});

/** Sai do canal quando fica sozinho; cancela o timer se alguem voltar. */
client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  const queue = getQueue(newState.guild.id);
  if (!queue?.voiceChannel) return;

  // O bot foi movido de canal por um admin: acompanha a mudanca.
  if (newState.member?.id === client.user.id && newState.channelId) {
    const moved = newState.guild.channels.cache.get(newState.channelId);
    if (moved?.type === ChannelType.GuildVoice || moved?.type === ChannelType.GuildStageVoice) {
      queue.voiceChannel = moved;
    }
  }

  const channel = queue.guild.channels.cache.get(queue.voiceChannel.id);
  const humans = channel?.members.filter((member) => !member.user.bot).size ?? 0;

  if (humans === 0) queue.scheduleIdleLeave(config.leaveOnEmptyMs, 'Fiquei sozinho no canal.');
  else if (queue.isPlaying() || queue.current) queue.clearIdleTimer();
});

/* --------------------------------------------------------------- encerramento */

function shutdown(signal) {
  console.log(`\n${signal} recebido, encerrando...`);
  stopPresence();
  destroyAllQueues();
  client.destroy();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => console.error('[unhandledRejection]', reason));

if (process.argv.includes('--deps')) console.log(generateDependencyReport());

try {
  await loginComRetentativa(client, config.token, {
    aoRepetir: ({ tentativa, tentativas, codigo, segundos }) =>
      console.warn(
        `[login] rede indisponivel (${codigo}). ` +
          `Tentativa ${tentativa}/${tentativas}, nova em ${segundos}s...`,
      ),
  });
} catch (error) {
  const codigo = codigoDeRede(error);
  if (codigo === 'EAI_AGAIN' || codigo === 'ENOTFOUND') {
    console.error(
      `\n[login] nao consegui resolver o DNS de discord.com (${codigo}).\n` +
        '  O container esta sem DNS funcional: confira se o roteador voltou.\n' +
        '  Veja a secao "EAI_AGAIN" no README para forcar um DNS no compose.',
    );
  } else {
    console.error(`\n[login] falhou: ${error.message}`);
  }
  process.exit(1);
}
