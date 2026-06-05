import { getBackendUrl } from "../features/sentinela/classificadorLLM";

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
  valorCausa?: number | null;
}

export interface AndamentoTJSP {
  data: string;   // formato DD/MM/AAAA, como vem do TJSP
  texto: string;
}

export interface ResultadoAndamentos {
  andamentos: AndamentoTJSP[];
  valorCausa: number | null;
  exequente?: string;
  executado?: string;
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
  const backendUrl = getBackendUrl();
  const proxyBaseUrl = `${backendUrl}/api/proxy-tjsp?url=`;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
      console.info(`[tjspService] Retry ${attempt}/${MAX_RETRIES - 1} em ${delay}ms...`);
      await sleep(delay);
    }

    let response: Response;
    try {
      const fullUrl = `${proxyBaseUrl}${encodeURIComponent(url)}`;
      response = await fetch(fullUrl);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      lastError = new Error(`Falha de rede ao consultar o TJSP (via proxy): ${msg}`);
      continue;
    }

    if (response.status >= 400 && response.status < 500) {
      throw new Error(
        `TJSP retornou status ${response.status} via proxy. URL alvo: ${url}`
      );
    }

    if (!response.ok) {
      lastError = new Error(`TJSP indisponível via proxy (status ${response.status}).`);
      continue;
    }

    const html = await response.text();
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
    const linkEl = div.querySelector<HTMLAnchorElement>(".linkProcesso");
    if (!linkEl) return;

    const numeroCnj = limparTexto(linkEl.textContent);
    const href = linkEl.getAttribute("href") ?? "";
    const codigoProcesso = extrairParam(href, "processo.codigo");
    const foro = extrairParam(href, "processo.foro");

    if (!numeroCnj || !codigoProcesso) return;

    const classeEl = div.querySelector(".classeProcesso");
    const classe = limparTexto(classeEl?.textContent);
    if (!isExecucaoFiscal(classe)) return;

    const assuntoEl = div.querySelector(".assuntoPrincipalProcesso");
    const assunto = limparTexto(assuntoEl?.textContent);

    let exequente = "";
    let executado = "";

    // Tenta encontrar as partes varrendo labels e spans
    const partyLabels = div.querySelectorAll<HTMLElement>("label, span, b, .tipoDeParticipacao, .tipoParticipacao");
    partyLabels.forEach((lbl) => {
      const text = lbl.textContent?.toLowerCase() || "";
      const isExeq = text.includes("exeq") || text.includes("autor") || text.includes("requerent");
      const isExec = text.includes("exect") || text.includes("executad") || text.includes("requerid") || text.includes("reu");

      if (isExeq || isExec) {
        let val = "";

        // 1. Tenta o próximo nó de texto ou irmão
        const nextNode = lbl.nextSibling;
        if (nextNode && nextNode.nodeType === Node.TEXT_NODE) {
          val = limparTexto(nextNode.textContent);
        }

        if (!val) {
          const next = lbl.nextElementSibling as HTMLElement;
          if (next) val = limparTexto(next.textContent?.split("\n")[0]);
        }

        // 2. Se não achou, tenta pegar do parent ignorando o texto da própria label
        if (!val) {
          const pTxt = lbl.parentElement?.textContent || "";
          const parts = pTxt.split(lbl.textContent || "");
          if (parts.length > 1) val = limparTexto(parts[1].split("\n")[0]);
        }

        if (val && val.length > 3) {
          if (isExeq && !exequente) exequente = val;
          else if (isExec && !executado) executado = val;
        }
      }
    });

    // Fallback via Regex no HTML se ainda estiver vazio
    if (!exequente || !executado) {
      const html = div.innerHTML;
      if (!exequente) {
        const m = html.match(/(?:Exeqte|Exequente|Autor|Requerente)\s*[:\-]?\s*<[^>]+>([^<]+)/i);
        if (m) exequente = limparTexto(m[1]);
      }
      if (!executado) {
        const m = html.match(/(?:Exectdo|Executado|Requerido|Réu)\s*[:\-]?\s*<[^>]+>([^<]+)/i);
        if (m) executado = limparTexto(m[1]);
      }
    }

    // Fallback absoluto por posição
    if (!exequente || !executado) {
      const genericNames = Array.from(div.querySelectorAll(".nomeParte")).map(e => limparTexto(e.textContent?.split("\n")[0]));
      if (!exequente && genericNames[0]) exequente = genericNames[0];
      if (!executado && genericNames[1]) executado = genericNames[1];
    }

    // Tenta extrair valor da causa da listagem (se presente)
    const valorEl = div.querySelector(".valorDaCausaProcesso, .valorCausa, [class*='valor']");
    const valorCausa = valorEl ? parseValorMonetario(valorEl.textContent) : null;

    const dataEl = div.querySelector(".dataLocalDistribuicaoProcesso");
    const dataTxt = limparTexto(dataEl?.textContent);
    const dataDistribuicao = dataTxt.slice(0, 10);
    const localInfo = dataTxt.slice(10).trim();

    let comarca = "";
    let vara = "";
    // Aceita vários tipos de separadores (hífen, travessão, etc)
    const parts = localInfo.split(/\s+[\u2013\-]\s+/);
    if (parts.length >= 2) {
      comarca = parts[0].trim();
      vara = parts[1].trim();
    } else {
      comarca = localInfo;
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
      valorCausa,
      exequente: exequente || "---",
      executado: executado || "---",
    });
  });

  return processos;
}

/**
 * Tenta extrair o valor da causa do documento HTML da página de detalhe do TJSP.
 * Procura por elementos que contenham "Valor da Causa" e extrai o valor monetário.
 * Inclui múltiplos fallbacks para lidar com variações da estrutura do TJSP.
 */
function extrairValorDaCausa(doc: Document): number | null {
  // 1) Tenta seletores diretos por ID / classe (várias variações)
  const direto = doc.querySelector<HTMLElement>(
    "#valorDaCausa, .valorDaCausaProcesso, " +
    "[id*='valorCausa'], [class*='valorCausa'], " +
    "[id*='valor-causa'], [class*='valor-causa'], " +
    ".labelValor, #labelValor"
  );
  if (direto) {
    const parsed = parseValorMonetario(direto.textContent);
    if (parsed !== null) return parsed;
  }

  // 2) Tenta encontrar qualquer elemento que contenha "Valor da Causa" ou "Valor da ação"
  const labels = doc.querySelectorAll<HTMLElement>("td, th, span, label, div, p, strong");
  for (const el of labels) {
    const text = el.textContent?.toLowerCase() || "";
    const isValor = text.includes("valor da causa") ||
                    text.includes("valor da acao") ||
                    text.includes("valor da ação") ||
                    text.includes("valor causa");
    if (!isValor) continue;

    // Tenta extrair do PRÓPRIO elemento (se o valor estiver na mesma célula)
    let parsed = parseValorMonetario(el.textContent);
    if (parsed !== null) return parsed;

    // Pega o próximo elemento irmão
    const next = el.nextElementSibling;
    if (next) {
      parsed = parseValorMonetario(next.textContent);
      if (parsed !== null) return parsed;
    }

    // Pega o elemento anterior (às vezes o label vem depois)
    const prev = el.previousElementSibling;
    if (prev) {
      parsed = parseValorMonetario(prev.textContent);
      if (parsed !== null) return parsed;
    }

    // Tenta a linha inteira (tr) e busca o último td
    const tr = el.closest("tr");
    if (tr) {
      const tds = tr.querySelectorAll("td, th");
      // tenta cada célula na linha
      for (const td of tds) {
        parsed = parseValorMonetario(td.textContent);
        if (parsed !== null) return parsed;
      }
    }
  }

  // 3) Fallback: busca qualquer valor em formato "R$ X.XXX,XX" na página
  const bodyText = doc.body?.textContent || "";
  const valores = bodyText.match(/(?:R?\$)\s*[\d.,]+(?:,\d{2})?/g);
  if (valores) {
    for (const v of valores) {
      const parsed = parseValorMonetario(v);
      if (parsed !== null && parsed > 0) return parsed;
    }
  }

  return null;
}

/**
 * Converte string de valor monetário brasileiro para número.
 * Ex: "R$ 1.234,56" → 1234.56, "R$ 50.000,00" → 50000
 */
function parseValorMonetario(texto: string | null | undefined): number | null {
  if (!texto) return null;
  const limpo = texto.trim();
  // R$ 1.234,56 ou 1.234,56
  const match = limpo.match(/(?:R?\$)?\s*([\d.]+,\d{2})/);
  if (!match) return null;
  const num = match[1].replace(/\./g, "").replace(",", ".");
  return parseFloat(num);
}

/**
 * Busca os andamentos e dados complementares de um processo específico
 * pelo código interno do TJSP.
 *
 * Retorna array vazio e valorCausa null se a tabela de movimentações
 * não for encontrada. Lança erro apenas em caso de falha de rede
 * ou resposta de erro do TJSP.
 */
export async function buscarAndamentos(
  codigoProcesso: string,
  foro: string
): Promise<ResultadoAndamentos> {
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
    return { andamentos: [], valorCausa: null };
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

  const valorCausa = extrairValorDaCausa(doc);
  const partes = extrairPartesDaPagina(doc);

  return { andamentos, valorCausa, ...partes };
}

/**
 * Extrai as partes (Exequente/Executado) da página de detalhes do processo.
 * Tenta múltiplas estratégias de extração para lidar com variações do HTML do TJSP.
 */
function extrairPartesDaPagina(doc: Document): { exequente: string; executado: string } {
  let exequente = "";
  let executado = "";

  // 1) Tenta pelas tabelas de partes
  const table =
    doc.getElementById("tablePartesPrincipais") ||
    doc.getElementById("tableTodasPartes") ||
    doc.querySelector<HTMLElement>("table[id*='Parte']");

  if (table) {
    const rows = table.querySelectorAll("tr, div.fundamento, li");
    rows.forEach(tr => {
      const labelEl = tr.querySelector(".tipoDeParticipacao, .label, .legenda, span[class*='parte']");
      if (!labelEl) return;

      const label = (labelEl.textContent || "").toLowerCase();
      const nomeEl = tr.querySelector(".nomeParteEAdvogado, .nomeParte, td:last-child, span[class*='nome']");
      if (!nomeEl) return;

      const nome = (nomeEl.textContent || "").trim().split("\n")[0].trim();
      if (!nome) return;

      if (!exequente && /exequente|exeqte|exeq\.?|requerente|autor|polo ativo/i.test(label)) {
        exequente = nome;
      } else if (!executado && /executad[oa]?|exectd[oa]?|exect\.?|requerido|r[eé]u|polo passivo/i.test(label)) {
        executado = nome;
      }
    });
  }

  // 2) Fallback: procura por spans/labels com "Exequente" / "Executado" em toda a página
  if (!exequente || !executado) {
    const allLabels = doc.querySelectorAll<HTMLElement>("span, label, td, div.label, div[class*='parte']");
    allLabels.forEach(el => {
      const text = (el.textContent || "").toLowerCase();

      if (!exequente && /^exequente|^exeqte|^exeq\.?\b/i.test(text)) {
        const val = extrairNomeParteAposLabel(el);
        if (val) exequente = val;
      }
      if (!executado && /^executad[oa]?|^exectd[oa]?|^exect\.?\b|^r[eé]u\b/i.test(text)) {
        const val = extrairNomeParteAposLabel(el);
        if (val) executado = val;
      }
    });
  }

  // 3) Fallback: regex no HTML bruto
  if (!exequente || !executado) {
    const html = doc.body?.innerHTML || "";
    if (!exequente) {
      const m = html.match(/(?:Exequente|Exeqte|Exeq\.)\s*[:\-]?\s*(?:<[^>]+>\s*)?([^<]{3,}?)(?:\s*<|$)/i);
      if (m) exequente = limparTexto(m[1]);
    }
    if (!executado) {
      const m = html.match(/(?:Executado|Executada|Exectdo|Exectda|Réu)\s*[:\-]?\s*(?:<[^>]+>\s*)?([^<]{3,}?)(?:\s*<|$)/i);
      if (m) executado = limparTexto(m[1]);
    }
  }

  return { exequente, executado };
}

/** Após um label (ex.: "Exequente:"), tenta extrair o nome da parte do próximo elemento. */
function extrairNomeParteAposLabel(el: HTMLElement): string {
  // Tenta próximo irmão de texto
  const nextNode = el.nextSibling;
  if (nextNode && nextNode.nodeType === Node.TEXT_NODE) {
    const val = limparTexto(nextNode.textContent);
    if (val && val.length > 3) return val;
  }

  // Tenta próximo elemento irmão
  const next = el.nextElementSibling as HTMLElement;
  if (next) {
    const val = limparTexto(next.textContent?.split("\n")[0]);
    if (val && val.length > 3) return val;
  }

  // Tenta o conteúdo do parent, removendo o texto do próprio label
  const parentTxt = el.parentElement?.textContent || "";
  const parts = parentTxt.split(el.textContent || "");
  if (parts.length > 1) {
    const val = limparTexto(parts[1].split("\n")[0]);
    if (val && val.length > 3) return val;
  }

  return "";
}
