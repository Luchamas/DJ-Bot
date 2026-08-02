import {
  AudioPlayerStatus,
  NoSubscriberBehavior,
  StreamType,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel,
} from '@discordjs/voice';
import { config } from '../config.js';
import { notifyQueueUpdate } from './bus.js';
import { errorEmbed, infoEmbed, nowPlayingEmbed } from './embeds.js';
import { resolveStreamUrl } from './resolver.js';
import { createAudioStream } from './ytdlp.js';

/** @type {Map<string, GuildQueue>} */
const queues = new Map();

export class GuildQueue {
  constructor(guild, voiceChannel, textChannel) {
    this.guild = guild;
    this.voiceChannel = voiceChannel;
    this.textChannel = textChannel;

    /** @type {object[]} */
    this.tracks = [];
    /** @type {object|null} */
    this.current = null;

    this.volume = config.defaultVolume;
    this.loopMode = 'off';
    this.destroyed = false;

    this.connection = null;
    this.resource = null;
    this.activeStream = null;
    this.idleTimer = null;
    this.failures = 0;

    this.player = createAudioPlayer({
      behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
    });

    this.player.on(AudioPlayerStatus.Idle, (oldState) => {
      // Ignora a transicao inicial (Idle -> Idle) ao criar o player.
      if (oldState.status === AudioPlayerStatus.Idle) return;
      this.cleanupStream();
      void this.playNext();
    });

    this.player.on('error', (error) => {
      console.error(`[player] ${this.guild.id}:`, error.message);
      this.send(errorEmbed(`Erro ao tocar **${this.current?.title ?? 'a faixa'}**. Pulando.`));
      // O evento de erro ja leva o player para Idle, que dispara playNext().
    });
  }

  /* ------------------------------------------------------------------ conexao */

  async connect(voiceChannel = this.voiceChannel) {
    this.voiceChannel = voiceChannel;

    if (this.connection && this.connection.joinConfig.channelId === voiceChannel.id) {
      return this.connection;
    }

    this.connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: voiceChannel.guild.id,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      selfDeaf: true,
    });

    this.connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        // Pode ser so uma mudanca de regiao/canal: espera a reconexao automatica.
        await Promise.race([
          entersState(this.connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(this.connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch {
        this.destroy();
      }
    });

    this.connection.subscribe(this.player);

    try {
      await entersState(this.connection, VoiceConnectionStatus.Ready, 20_000);
    } catch {
      this.destroy();
      throw new Error('Nao consegui entrar no canal de voz (timeout).');
    }

    return this.connection;
  }

  /* --------------------------------------------------------------------- fila */

  add(tracks) {
    const space = Math.max(0, config.maxQueueSize - this.size());
    const accepted = tracks.slice(0, space);
    this.tracks.push(...accepted);
    return accepted.length;
  }

  addNext(tracks) {
    const space = Math.max(0, config.maxQueueSize - this.size());
    const accepted = tracks.slice(0, space);
    this.tracks.unshift(...accepted);
    return accepted.length;
  }

  size() {
    return this.tracks.length + (this.current ? 1 : 0);
  }

  isPlaying() {
    return (
      this.player.state.status === AudioPlayerStatus.Playing ||
      this.player.state.status === AudioPlayerStatus.Buffering ||
      this.player.state.status === AudioPlayerStatus.Paused
    );
  }

  isPaused() {
    return (
      this.player.state.status === AudioPlayerStatus.Paused ||
      this.player.state.status === AudioPlayerStatus.AutoPaused
    );
  }

  /* ------------------------------------------------------------------ playback */

  /** Toca a proxima faixa respeitando o modo de repeticao. */
  async playNext() {
    if (this.destroyed) return;

    let next;
    if (this.loopMode === 'track' && this.current) {
      next = this.current;
    } else {
      if (this.loopMode === 'queue' && this.current) this.tracks.push(this.current);
      next = this.tracks.shift();
    }

    if (!next) {
      this.current = null;
      this.scheduleIdleLeave(config.leaveOnEndMs, 'A fila acabou.');
      notifyQueueUpdate();
      return;
    }

    this.clearIdleTimer();
    this.current = next;

    try {
      const url = await resolveStreamUrl(next);
      const stream = createAudioStream(url);
      this.activeStream = stream;

      const resource = createAudioResource(stream.stream, {
        inputType: StreamType.Raw,
        inlineVolume: true,
      });
      resource.volume?.setVolume(this.volume / 100);

      this.resource = resource;
      this.player.play(resource);
      this.failures = 0;

      this.send(nowPlayingEmbed(this));
      notifyQueueUpdate();
    } catch (error) {
      this.cleanupStream();
      this.failures += 1;
      this.send(errorEmbed(`Falha em **${next.title}**: ${error.message}`));

      if (this.failures >= 5) {
        this.failures = 0;
        this.send(errorEmbed('Muitas falhas seguidas. Parando a reproducao.'));
        this.tracks = [];
        this.current = null;
        return;
      }
      await this.playNext();
    }
  }

  skip() {
    if (!this.current) return false;
    // Nao repetir a mesma faixa quando o usuario pede skip explicitamente.
    if (this.loopMode === 'track') this.loopMode = 'off';
    this.player.stop(true);
    return true;
  }

  stop() {
    this.tracks = [];
    this.loopMode = 'off';
    this.player.stop(true);
  }

  pause() {
    const paused = this.player.pause(true);
    if (paused) notifyQueueUpdate();
    return paused;
  }

  resume() {
    const resumed = this.player.unpause();
    if (resumed) notifyQueueUpdate();
    return resumed;
  }

  setVolume(value) {
    this.volume = Math.min(200, Math.max(0, Math.round(value)));
    this.resource?.volume?.setVolume(this.volume / 100);
    return this.volume;
  }

  shuffle() {
    for (let i = this.tracks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.tracks[i], this.tracks[j]] = [this.tracks[j], this.tracks[i]];
    }
    return this.tracks.length;
  }

  remove(position) {
    const index = position - 1;
    if (index < 0 || index >= this.tracks.length) return null;
    return this.tracks.splice(index, 1)[0];
  }

  playbackDurationMs() {
    return this.resource?.playbackDuration ?? 0;
  }

  /* --------------------------------------------------------------- ciclo de vida */

  cleanupStream() {
    this.activeStream?.destroy();
    this.activeStream = null;
    this.resource = null;
  }

  scheduleIdleLeave(delay, reason) {
    this.clearIdleTimer();
    if (!delay || delay <= 0) return;

    this.idleTimer = setTimeout(() => {
      if (this.destroyed || this.isPlaying()) return;
      this.send(infoEmbed(`👋 ${reason} Saindo do canal de voz.`));
      this.destroy();
    }, delay);
  }

  clearIdleTimer() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;

    this.clearIdleTimer();
    this.tracks = [];
    this.current = null;
    this.cleanupStream();

    this.player.stop(true);
    try {
      if (this.connection?.state.status !== VoiceConnectionStatus.Destroyed) {
        this.connection?.destroy();
      }
    } catch {
      /* ja destruida */
    }

    queues.delete(this.guild.id);
    notifyQueueUpdate();
  }

  send(embed) {
    this.textChannel
      ?.send({ embeds: [embed] })
      .catch(() => {
        /* sem permissao de enviar no canal */
      });
  }
}

export function getQueue(guildId) {
  return queues.get(guildId);
}

/** Todas as filas vivas — usado pela presence do bot. */
export function listQueues() {
  return [...queues.values()];
}

export function createQueue(guild, voiceChannel, textChannel) {
  const existing = queues.get(guild.id);
  if (existing) {
    existing.textChannel = textChannel;
    return existing;
  }

  const queue = new GuildQueue(guild, voiceChannel, textChannel);
  queues.set(guild.id, queue);
  return queue;
}

export function destroyAllQueues() {
  for (const queue of [...queues.values()]) queue.destroy();
}
