/** Segundos -> "3:41" ou "1:02:15". Duracao desconhecida vira "--:--". */
export function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '--:--';

  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  const pad = (value) => String(value).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`;
}

/** Barra de progresso textual. */
export function progressBar(current, total, size = 20) {
  if (!total || total <= 0) return '─'.repeat(size);
  const ratio = Math.min(1, Math.max(0, current / total));
  const position = Math.min(size - 1, Math.floor(ratio * size));
  return `${'─'.repeat(position)}🔘${'─'.repeat(size - position - 1)}`;
}

/** Corta textos longos preservando o limite do Discord. */
export function truncate(text, max = 60) {
  const value = String(text ?? '');
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/** Escapa markdown para titulos vindos de fontes externas. */
export function escapeMarkdown(text) {
  return String(text ?? '').replace(/([*_`~|\\[\]])/g, '\\$1');
}

/** Link clicavel seguro para embeds. */
export function trackLink(track) {
  const title = escapeMarkdown(truncate(track.title, 70));
  return track.url ? `[${title}](${track.url})` : title;
}

export function totalDuration(tracks) {
  return tracks.reduce((sum, track) => sum + (track.duration ?? 0), 0);
}
