# 🎧 DJ Bot

Bot de música para Discord com comandos de barra (`/play`, `/skip`, `/queue`, ...), que entende
**links do YouTube e do Spotify** — além de busca por texto.

## Como funciona

| Fonte | O que é aceito | Como toca |
| --- | --- | --- |
| YouTube | vídeo, playlist, Shorts, YouTube Music | áudio extraído direto pelo `yt-dlp` |
| Spotify | faixa, álbum, playlist, artista | metadados pela API do Spotify → áudio equivalente no YouTube |
| Texto | `/play engenheiros do hawaii infinita highway` | busca no YouTube |
| Outros | SoundCloud, Bandcamp, Twitch VOD, ... | qualquer site suportado pelo `yt-dlp` |

> A API do Spotify **não** permite streaming de áudio por bots — ela só entrega metadados.
> Por isso o bot lê título/artista do link e reproduz a versão correspondente do YouTube.
> É o mesmo caminho usado por praticamente todos os bots de música.

## Pré-requisitos

- **Node.js 22.x** — funciona da 20.11 pra cima, mas a 22 é a recomendada. É a versão mais nova
  com binário pronto do `@discordjs/opus` (o encoder de áudio nativo); da 24 em diante o npm tenta
  compilá-lo do zero e aí exige o compilador C++ do Visual Studio.
  ```bash
  winget install OpenJS.NodeJS.LTS --version 22.23.2
  ```
  Se o winget não listar mais a 22.x, baixe o MSI em <https://nodejs.org/dist/v22.23.2/node-v22.23.2-x64.msi>.
  Feche e reabra o terminal depois de instalar.
- FFmpeg **não** precisa ser instalado: vem junto pelo pacote `ffmpeg-static`.
- yt-dlp **não** precisa ser instalado: o `npm install` baixa o executável para `./bin`.

## Instalação

```bash
npm install
```

```bash
copy .env.example .env
```

Preencha o `.env`:

### 1. Credenciais do Discord (obrigatório)

1. Acesse <https://discord.com/developers/applications> → **New Application**.
2. Aba **Bot** → **Reset Token** → copie para `DISCORD_TOKEN`.
3. Aba **General Information** → copie o **Application ID** para `DISCORD_CLIENT_ID`.
4. Coloque o ID do seu servidor em `DISCORD_GUILD_ID` (ative o Modo Desenvolvedor no Discord,
   clique com o botão direito no servidor → *Copiar ID*). Isso faz os comandos aparecerem na hora;
   sem isso o registro é global e leva até 1 hora.

Nenhuma *Privileged Gateway Intent* é necessária.

### 2. Credenciais do Spotify (opcional, recomendado)

1. Acesse <https://developer.spotify.com/dashboard> → **Create app** (qualquer nome; Redirect URI
   pode ser `http://localhost:3000`, não é usada).
2. Copie **Client ID** e **Client Secret** para `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET`.

Sem essas credenciais só funcionam links de **faixa única** do Spotify (via oEmbed);
álbuns, playlists e artistas exigem a API.

### 3. Convidar o bot

Aba **OAuth2 → URL Generator**: marque o escopo `bot` + `applications.commands`, e as permissões
**View Channel**, **Send Messages**, **Embed Links**, **Connect**, **Speak**. Abra a URL gerada e
escolha o servidor.

## Uso

```bash
npm run deploy
```

```bash
npm start
```

O `npm run deploy` registra os comandos de barra e só precisa rodar de novo quando você
adicionar/alterar comandos.

## Status do bot (presence)

Enquanto toca, o bot aparece como **"Ouvindo &lt;música&gt; • 3:20/6:13"** na lista de membros. Pausado
vira `⏸️`, transmissão ao vivo vira `🔴 ao vivo`, e com vários servidores tocando ao mesmo tempo
mostra `🎵 N servidores tocando` (a presence é uma só para o bot inteiro, então mostrar uma faixa
específica seria enganoso).

O tempo **não anda sozinho**: a API do Discord só aceita `name`, `type`, `state` e `url` na presence
de um bot — o campo `timestamps`, que faz o cronômetro correr no Rich Presence de usuário, é
ignorado para bots. Por isso o texto é reescrito de tempos em tempos. O padrão é a cada 15 s, o que
fica bem abaixo do limite do gateway (5 atualizações a cada 20 s). Ajuste em `PRESENCE_UPDATE_SECONDS`,
ou desligue tudo com `PRESENCE_ENABLED=false`.

## Verificar se está tudo funcionando

```bash
npm run smoke
```

Testa a cadeia inteira (yt-dlp → ffmpeg → PCM, resolvers de link, comandos, embeds) sem conectar no
Discord. Se as etapas de Spotify estiverem no `.env`, ele também testa álbum e playlist.

## Comandos

| Comando | Descrição |
| --- | --- |
| `/play <busca> [proxima]` | Toca ou enfileira um link/termo de busca |
| `/skip [quantidade]` | Pula a faixa atual (ou várias) |
| `/pause` · `/resume` | Pausa e retoma |
| `/stop` | Para tudo e limpa a fila |
| `/queue [pagina]` | Mostra a fila |
| `/nowplaying` | Faixa atual com barra de progresso |
| `/volume [nivel]` | Consulta ou ajusta o volume (0–200%) |
| `/loop <modo>` | Repetição: desligado / faixa / fila |
| `/shuffle` | Embaralha a fila |
| `/remove <posicao>` | Remove uma faixa da fila |
| `/clear` | Limpa a fila sem parar a faixa atual |
| `/leave` | Sai do canal de voz |
| `/help` | Lista os comandos |

## Estrutura

```
src/
├─ index.js              # cliente, eventos, tratamento de erros
├─ deploy-commands.js    # registro dos comandos de barra
├─ config.js             # leitura e validação do .env
├─ commands/             # um arquivo por comando (data + execute)
└─ lib/
   ├─ ytdlp.js           # wrapper do yt-dlp + pipeline yt-dlp → ffmpeg → PCM
   ├─ spotify.js         # API do Spotify (client credentials) + fallback oEmbed
   ├─ resolver.js        # link/busca → lista de faixas; Spotify → YouTube
   ├─ queue.js           # fila e player por servidor
   ├─ presence.js        # status do bot com a faixa e o tempo
   ├─ bus.js             # eventos internos (fila → presence)
   ├─ guards.js          # validações (canal de voz, permissões)
   ├─ embeds.js          # mensagens visuais
   └─ format.js          # duração, barra de progresso, links
```

Faixas do Spotify são resolvidas no YouTube **só na hora de tocar** — assim uma playlist de 200
músicas entra na fila em segundos em vez de minutos.

## Solução de problemas

**`yt-dlp nao encontrado`**

```bash
npm run ytdlp:update
```

**YouTube pedindo login / "Sign in to confirm you're not a bot"**

Acontece em IPs de datacenter/VPS. Configure cookies no `.env`:
`YTDLP_COOKIES_FROM_BROWSER=chrome` (com o navegador fechado) ou `YTDLP_COOKIES=C:\caminho\cookies.txt`.

**Vídeos param de tocar do nada**

O YouTube muda a extração com frequência. Atualize o yt-dlp:

```bash
npm run ytdlp:update
```

**Ver o relatório de dependências de voz**

```bash
node src/index.js --deps
```

**`npm install` falhando em `@discordjs/opus` com `gyp ERR! find VS`**

O `@discordjs/opus` é o encoder de áudio nativo (mais rápido). Ele só publica binários prontos até
o Node 22 (ABI 127); em versões mais novas o npm cai para compilar do zero, o que exige a workload
"Desenvolvimento para desktop com C++" do Visual Studio.

Ele está declarado em `optionalDependencies`, então **essa falha não derruba o `npm install`** — o
`prism-media` cai automaticamente no `opusscript`, que é JavaScript puro e funciona em qualquer
lugar. O bot toca normalmente assim; a diferença de desempenho só aparece com muitos servidores
tocando ao mesmo tempo.

Se quiser o encoder nativo, escolha um dos dois:

- usar o Node 22 (baixa o binário pronto, sem compilar nada);
- adicionar a workload C++ ao Visual Studio e rodar `npm install @discordjs/opus`.

Para ver qual encoder está ativo:

```bash
npm run smoke
```

A etapa `[3] encoder de opus` diz se está no nativo ou no fallback.

**Playlist do Spotify devolvendo "não encontrado ou privado"**

Playlists editoriais feitas pelo próprio Spotify (as de ID começando em `37i9dQ`) são bloqueadas
pela API desde novembro de 2024 e respondem 404 para aplicativos novos. Playlists criadas por
usuários funcionam normalmente.
