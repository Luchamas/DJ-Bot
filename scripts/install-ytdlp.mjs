/**
 * Baixa o binario standalone do yt-dlp para ./bin.
 * O executavel do Windows/macOS/Linux e auto-contido: nao precisa de Python instalado.
 *
 *   node scripts/install-ytdlp.mjs           # baixa se ainda nao existir
 *   node scripts/install-ytdlp.mjs --force   # sempre rebaixa (atualiza)
 */
import { chmod, mkdir, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const binDir = join(root, 'bin');

const ASSETS = {
  win32: 'yt-dlp.exe',
  darwin: 'yt-dlp_macos',
  linux: process.arch === 'arm64' ? 'yt-dlp_linux_aarch64' : 'yt-dlp_linux',
};

const force = process.argv.includes('--force');

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const asset = ASSETS[process.platform];
  if (!asset) {
    console.warn(`[yt-dlp] Plataforma ${process.platform} nao suportada pelo instalador.`);
    console.warn('[yt-dlp] Instale o yt-dlp manualmente e aponte YTDLP_PATH para ele.');
    return;
  }

  const target = join(binDir, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');

  if (!force && (await exists(target))) {
    console.log(`[yt-dlp] Ja instalado em ${target} (use "npm run ytdlp:update" para atualizar).`);
    return;
  }

  const url = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${asset}`;
  console.log(`[yt-dlp] Baixando ${url} ...`);

  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

  const buffer = Buffer.from(await res.arrayBuffer());
  await mkdir(binDir, { recursive: true });

  // Escreve num arquivo temporario primeiro para nao corromper um binario em uso.
  const tmp = `${target}.download`;
  await writeFile(tmp, buffer);
  await rename(tmp, target);
  if (process.platform !== 'win32') await chmod(target, 0o755);

  console.log(`[yt-dlp] Pronto: ${target} (${(buffer.length / 1024 / 1024).toFixed(1)} MB)`);
}

main().catch((error) => {
  // Nao derruba o "npm install" por causa de rede: o bot avisa no start se faltar.
  console.warn(`[yt-dlp] Falha ao baixar: ${error.message}`);
  console.warn('[yt-dlp] Rode "npm run ytdlp:update" depois, ou instale manualmente e use YTDLP_PATH.');
});
