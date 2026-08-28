/**
 * Login no Discord com novas tentativas.
 *
 * Num servidor domestico e comum o container subir antes de o roteador terminar
 * de ligar: o DNS ainda nao responde e o login falha com EAI_AGAIN. Em vez de
 * morrer na hora e cair em ciclo de reinicio, o bot espera e insiste.
 *
 * Erro que nao seja de rede (token invalido, por exemplo) falha de primeira -
 * insistir nesse caso so atrasaria o diagnostico.
 */

const ERROS_DE_REDE = new Set([
  'EAI_AGAIN', // DNS ainda nao resolve (tipico logo apos um boot)
  'ENOTFOUND',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENETUNREACH',
  'EHOSTUNREACH',
]);

/** O undici embrulha falhas de rede em "fetch failed", com o erro real em `cause`. */
export function codigoDeRede(error) {
  return error?.code ?? error?.cause?.code ?? null;
}

export function ehErroDeRede(error) {
  return ERROS_DE_REDE.has(codigoDeRede(error));
}

const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @param {{ login: (token: string) => Promise<unknown> }} client
 * @param {string} token
 * @param {{ tentativas?: number, aoRepetir?: Function, esperar?: Function }} [opcoes]
 */
export async function loginComRetentativa(client, token, opcoes = {}) {
  const { tentativas = 10, aoRepetir = () => {}, esperar = dormir } = opcoes;

  for (let tentativa = 1; ; tentativa++) {
    try {
      return await client.login(token);
    } catch (error) {
      if (!ehErroDeRede(error) || tentativa >= tentativas) throw error;

      // 2s, 4s, 8s, 16s, 32s, depois 60s fixos: ~5 min de tolerancia no total,
      // suficiente para o roteador terminar de ligar.
      const segundos = Math.min(60, 2 ** tentativa);
      aoRepetir({ tentativa, tentativas, codigo: codigoDeRede(error), segundos });
      await esperar(segundos * 1000);
    }
  }
}
