/**
 * Serviço de integração com o TJSP via fetch direto do browser.
 * O TJSP (esaj.tjsp.jus.br) responde com status 200 sem bloqueio de CORS,
 * portanto toda a comunicação ocorre no frontend, sem proxy ou Edge Function.
 *
 * Seletores confirmados a partir da estrutura real do HTML do TJSP CPOPG:
 *   Lista de processos : #listagemDeProcessos > div[id^="divProcesso"]
 *   Número / href      : .linkProcesso
 *   Classe processual  : .classeProcesso
 *   Assunto            : .assuntoPrincipalProcesso
 *   Partes             : .nomeParte
 *   Data distribuição  : .dataLocalDistribuicaoProcesso (primeiros 10 chars)
 *   Tabela andamentos  : #tabelaTodasMovimentacoes
 *   Linha andamento    : tr.containerMovimentacao
 *   Data andamento     : td.dataMovimentacao
 *   Descrição          : td.descricaoMovimentacao
 */

const BASE_URL = "https://esaj.tjsp.jus.br";

export interface ProcessoTJSP {
  numeroCnj: string;
  codigoProcesso: string; // parâmetro processo.codigo (código interno do TJSP)
  foro: string;           // parâmetro processo.foro
  vara: string;
  comarca: string;
  classe: string;
  assunto: string;
  dataDistribuicao: string;
  exequente: string;
  executado: string;
}

export interface AndamentoTJSP {
  data: string;   // formato DD/MM/AAAA, como vem do TJSP
  texto: string;
}

/** Remove tudo que não é dígito do CNPJ. */
function limparCnpj(cnpj: string): string {
  return cnpj.replace(/\D/g, "");
}

/** Normaliza texto extraído do DOM: remove espaços em excesso. */
function limparTexto(s: string | null | undefined): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Extrai o valor de um parâmetro de query string por nome.
 * Ex: "?processo.codigo=ABC&processo.foro=1" → "ABC" para "processo.codigo"
 */
function extrairParam(href: string, param: string): string {
  const escaped = param.replace(/\./g, "\\.");
  const match = href.match(new RegExp(`[?&]${escaped}=([^&]+)`));
  return match ? decodeURIComponent(match[1]) : "";
}

/**
 * Aguarda `ms` milissegundos.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

/**
 * Faz fetch de uma URL do TJSP e retorna o documento HTML parseado.
 * Implementa retry com exponential backoff (3 tentativas, 1s/2s/4s).
 * Lança erro descritivo em caso de falha persistente.
 */
async function fetchHtmlTjsp(url: string): Promise<Document> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
      console.info(`[tjspService] Retry ${attempt}/${MAX_RETRIES - 1} em ${delay}ms...`);
      await sleep(delay);
    }

    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Accept: "text/html,application/xhtml+xml" },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      lastError = new Error(`Falha de rede ao consultar o TJSP: ${msg}`);
      continue; // Retry on network error
    }

    // Don't retry on client errors (4xx) — they won't resolve with retries
    if (response.status >= 400 && response.status < 500) {
      throw new Error(
        `TJSP retornou status ${response.status}. Verifique os parâmetros da consulta.`
      );
    }

    // Retry on server errors (5xx)
    if (!response.ok) {
      lastError = new Error(
        `TJSP retornou status ${response.status}. Tente novamente em instantes.`
      );
      continue;
    }

    const html = await response.text();
    if (!html || html.trim().length === 0) {
      lastError = new Error("TJSP retornou uma resposta vazia. Tente novamente.");
      continue; // Retry on empty response
    }

    const parser = new DOMParser();
    return parser.parseFromString(html, "text/html");
  }

  // All retries exhausted
  throw lastError ?? new Error("Falha ao consultar o TJSP após múltiplas tentativas.");
}

/** Verifica se o documento é uma página de erro ou de acesso negado do TJSP. */
function isErroTjsp(doc: Document): boolean {
  const body = doc.body?.textContent ?? "";
  return (
    body.includes("Acesso Negado") ||
    body.includes("Serviço Indisponível") ||
    doc.title?.includes("Erro") ||
    body.includes("Certificate is expired")
  );
}

/** Verifica se a classe processual corresponde a uma execução fiscal. */
function isExecucaoFiscal(classe: string): boolean {
  const c = classe.toLowerCase();
  return (
    c.includes("execução fiscal") ||
    c.includes("execucao fiscal")
  );
}

/**
 * Busca processos de execução fiscal pelo CNPJ do executado no TJSP (CPOPG).
 *
 * Retorna array vazio se não houver processos ou se a lista de processos
 * não for encontrada na resposta. Lança erro apenas em caso de falha de rede
 * ou resposta de erro do TJSP.
 */
export async function buscarProcessosPorCnpj(
  cnpj: string
): Promise<ProcessoTJSP[]> {
  const cnpjLimpo = limparCnpj(cnpj);
  if (cnpjLimpo.length !== 14) {
    throw new Error("CNPJ inválido. Informe os 14 dígitos.");
  }

  const url =
    `${BASE_URL}/cpopg/search.do` +
    `?conversationId=` +
    `&cbPesquisa=DOCPARTE` +
    `&dadosConsulta.valorConsulta=${cnpjLimpo}` +
    `&dadosConsulta.tipoNuProcesso=UNIFICADO`;

  const doc = await fetchHtmlTjsp(url);

  if (isErroTjsp(doc)) {
    throw new Error(
      "O TJSP retornou uma página de erro. Tente novamente ou verifique a disponibilidade do sistema."
    );
  }

  // Container principal da lista de processos
  const listagemEl = doc.getElementById("listagemDeProcessos");
  if (!listagemEl) {
    // Pode ser "nenhum resultado" ou estrutura alternativa — retorna vazio sem lançar
    return [];
  }

  // Cada processo fica em um div com id iniciando por "divProcesso"
  const divs = listagemEl.querySelectorAll<HTMLElement>("div[id^='divProcesso']");
  if (divs.length === 0) {
    return [];
  }

  const processos: ProcessoTJSP[] = [];

  divs.forEach((div) => {
    // Link do processo: contém o número CNJ e href com processo.codigo e processo.foro
    const linkEl = div.querySelector<HTMLAnchorElement>(".linkProcesso");
    if (!linkEl) return;

    const numeroCnj = limparTexto(linkEl.textContent);
    const href = linkEl.getAttribute("href") ?? "";
    const codigoProcesso = extrairParam(href, "processo.codigo");
    const foro = extrairParam(href, "processo.foro");

    if (!numeroCnj || !codigoProcesso) return;

    // Classe processual
    const classeEl = div.querySelector(".classeProcesso");
    const classe = limparTexto(classeEl?.textContent);

    // Filtro: apenas execuções fiscais
    if (!isExecucaoFiscal(classe)) return;

    // Assunto principal
    const assuntoEl = div.querySelector(".assuntoPrincipalProcesso");
    const assunto = limparTexto(assuntoEl?.textContent);

    // Partes: busca por label de polo para correta extração em casos de litisconsórcio
    let exequente = "";
    let executado = "";
    {
      const blocos = div.querySelectorAll<HTMLElement>(".unidadeParticipacao");
      let exequenteBlocoEncontrado = false;
      let executadoBlocoEncontrado = false;
      blocos.forEach((bloco) => {
        const labelEl = bloco.querySelector(".labelParticipacao, .tipoParticipacao");
        const label = limparTexto(labelEl?.textContent).toLowerCase();
        const nomeEl = bloco.querySelector<HTMLElement>(".nomeParte");
        if (!nomeEl) return;
        const nome = limparTexto(nomeEl.textContent.split("\n")[0]);
        const isPoloAtivo =
          label.includes("exequente") ||
          label.includes("exeqte") ||
          label.includes("requerente") ||
          label.includes("polo ativo");
        const isPoloPassivo =
          label.includes("executado") ||
          label.includes("exectdo") ||
          label.includes("executda") ||
          label.includes("requerido") ||
          label.includes("polo passivo");
        if (!exequenteBlocoEncontrado && isPoloAtivo) {
          exequente = nome;
          exequenteBlocoEncontrado = true;
        } else if (!executadoBlocoEncontrado && isPoloPassivo) {
          executado = nome;
          executadoBlocoEncontrado = true;
        }
      });
      // Fallback por posição se não encontrou via label (estrutura desconhecida)
      if (!exequenteBlocoEncontrado || !executadoBlocoEncontrado) {
        const parteEls = div.querySelectorAll(".nomeParte");
        if (!exequenteBlocoEncontrado) {
          exequente = limparTexto(parteEls[0]?.textContent.split("\n")[0]);
        }
        if (!executadoBlocoEncontrado) {
          executado = limparTexto(parteEls[1]?.textContent.split("\n")[0]);
        }
        if (!exequenteBlocoEncontrado || !executadoBlocoEncontrado) {
          const numeroCnjDebug = limparTexto(linkEl.textContent);
          console.warn(
            `[tjspService] Extração de partes por label falhou — usando fallback por posição. numeroCnj: ${numeroCnjDebug}`
          );
        }
      }
    }

    // Data de distribuição: primeiros 10 caracteres (DD/MM/AAAA)
    const dataEl = div.querySelector(".dataLocalDistribuicaoProcesso");
    const dataDistribuicao = limparTexto(dataEl?.textContent).slice(0, 10);

    // Foro/comarca e vara: extraídos do mesmo campo que data (TJSP os exibe juntos)
    // "DD/MM/AAAA  Foro de Comarca - Vara"  ou  "DD/MM/AAAA  Foro – Vara" (travessão)
    const dataLocalTexto = limparTexto(dataEl?.textContent);
    const parteComarca = dataLocalTexto.slice(10).trim();
    // Tenta travessão (U+2013) primeiro, depois hífen simples
    let separadorIdx = parteComarca.indexOf(" \u2013 ");
    let separadorLen = 3;
    if (separadorIdx < 0) {
      separadorIdx = parteComarca.indexOf(" - ");
      separadorLen = 3;
    }
    let comarca: string;
    let vara: string;
    if (separadorIdx >= 0) {
      comarca = parteComarca.slice(0, separadorIdx).trim();
      vara = parteComarca.slice(separadorIdx + separadorLen).trim();
    } else {
      comarca = parteComarca;
      vara = "";
      if (parteComarca) {
        console.warn(
          `[tjspService] Separador não encontrado em comarca/vara — numeroCnj: ${limparTexto(linkEl.textContent)}`
        );
      }
    }

    processos.push({
      numeroCnj,
      codigoProcesso,
      foro,
      vara,
      comarca,
      classe,
      assunto,
      dataDistribuicao,
      exequente,
      executado,
    });
  });

  return processos;
}

/**
 * Busca os andamentos de um processo específico pelo código interno do TJSP.
 *
 * Retorna array vazio se a tabela de movimentações não for encontrada
 * (aviso no console) ou se não houver linhas. Lança erro apenas em
 * caso de falha de rede ou resposta de erro do TJSP.
 */
export async function buscarAndamentos(
  codigoProcesso: string,
  foro: string
): Promise<AndamentoTJSP[]> {
  if (!codigoProcesso) {
    throw new Error("Código do processo não informado.");
  }

  const url =
    `${BASE_URL}/cpopg/show.do` +
    `?processo.codigo=${encodeURIComponent(codigoProcesso)}` +
    `&processo.foro=${encodeURIComponent(foro)}`;

  const doc = await fetchHtmlTjsp(url);

  if (isErroTjsp(doc)) {
    throw new Error("O TJSP retornou uma página de erro ao buscar os andamentos.");
  }

  const tabela = doc.getElementById("tabelaTodasMovimentacoes");
  if (!tabela) {
    console.warn(
      `[tjspService] Tabela de andamentos não encontrada para processo ${codigoProcesso}.`
    );
    return [];
  }

  const andamentos: AndamentoTJSP[] = [];

  // Cada linha de andamento tem a classe containerMovimentacao
  const linhas = tabela.querySelectorAll<HTMLTableRowElement>("tr.containerMovimentacao");

  linhas.forEach((tr) => {
    const dataEl = tr.querySelector("td.dataMovimentacao");
    const descEl = tr.querySelector("td.descricaoMovimentacao");

    const data = limparTexto(dataEl?.textContent);
    const texto = limparTexto(descEl?.textContent);

    // Valida formato de data DD/MM/AAAA
    if (!data || !/^\d{1,2}\/\d{2}\/\d{4}$/.test(data)) return;
    if (!texto) return;

    andamentos.push({ data, texto });
  });

  return andamentos;
}
