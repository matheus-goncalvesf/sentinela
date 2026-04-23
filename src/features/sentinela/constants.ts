import type { CategoriaEvento, EfeitoJuridico } from "./types";

// ── Prazos legais ─────────────────────────────────────────────────────────────
// Art. 40 §2: suspensão por 1 ano (365 dias)
// Art. 40 §4: prescrição intercorrente após 5 anos (1825 dias) do arquivamento
// Total máximo para cômputo: 6 anos = 2190 dias
export const PRAZO_SUSPENSAO_DIAS = 365;
export const PRAZO_PRESCRICAO_DIAS = 1825;
export const PRAZO_TOTAL_DIAS = 2190;

export const SCORE_THRESHOLDS = {
  forte: 2190,
  medio: 1752,
  fraco: 1095,
} as const;

export const GAP_INCERTEZA_DIAS = 730;
export const MIN_EVENTOS_INCERTEZA = 5;

// ── Mapeamento categoria → efeito jurídico ────────────────────────────────────
// Fundamentos: LEF art. 40, LC 118/2005 + art. 174 pu CTN, Súmula 314 STJ,
// Tema 566/STJ (REsp 1.340.553-RS).
export const CATEGORIA_EFEITO_MAP: Record<CategoriaEvento, EfeitoJuridico> = {
  suspensao_art40: "suspende",
  arquivamento_art40: "inicia_contagem",
  tentativa_frustrada_localizacao: "inicia_contagem",
  tentativa_frustrada_bens: "inicia_contagem",
  constricao_positiva: "interrompe",
  penhora_rosto_autos: "interrompe",
  ciencia_fazenda: "inicia_contagem",
  parcelamento: "suspende",
  parcelamento_rescindido: "neutro",
  redirecionamento: "neutro",
  despacho_citacao: "interrompe",
  citacao_valida: "interrompe",
  indicacao_bens: "neutro",
  embargos_executado: "neutro",
  excecao_pre_executividade: "neutro",
  prescricao_reconhecida: "encerra",
  pedido_fazenda_sem_efeito: "neutro",
  ato_neutro: "neutro",
  extincao: "encerra",
  nao_classificado: "incerto",
};

// ── Definição das regras do classificador ─────────────────────────────────────
export interface DefinicaoCategoria {
  patterns: RegExp[];
  negativePatterns: RegExp[];
  baseConfidence: number;
  // Maior specificity = preferida em caso de empate
  specificity: number;
}

// ── Building blocks reutilizáveis (fragmentos regex) ──────────────────────────
// Usados via string template. Ex.: new RegExp(`${ART_40}.*${SUSPENS}`, "i")
//
// Cobrem variações reais de redação em andamentos do TJSP/eSaj:
// "art. 40", "art 40", "art.40", "artigo 40", "art.40 da LEF", "§ 2º do art. 40"
const ART_40 = String.raw`(?:art(?:\.|igo)?\s*40|artigo\s+quarenta)`;
const ART_40_P = String.raw`(?:(?:§|par[aá]grafo|par\.?)\s*(?:1|2|3|4|5)[º°o]?\s*(?:do\s+)?${ART_40}|${ART_40}\s*,?\s*(?:§|par[aá]grafo|par\.?)\s*(?:1|2|3|4|5))`;
const LEF = String.raw`(?:LEF|Lei\s*n?[º°.]?\s*6[\.\s]*830(?:\s*[\/\-]\s*(?:19)?80)?|Lei\s+de\s+Execu[cç][aã]o(?:\s+Fiscal)?)`;
const CTN_174 = String.raw`(?:art(?:\.|igo)?\s*174(?:\s*,?\s*(?:§|par[aá]grafo)?\s*(?:[uú]nico|1))?\s*(?:do\s+)?CTN|CTN\s*,?\s*art(?:\.|igo)?\s*174)`;
const FAZENDA = String.raw`(?:Fazenda(?:\s+P[uú]blica(?:\s+(?:Nacional|Estadual|Municipal|do\s+Estado|Federal))?)?|Uni[aã]o(?:\s+Federal)?|PGFN|PGE(?:[-\s]*SP)?|PGM|Procuradoria(?:\s+(?:Geral|da\s+Fazenda|Municipal|Estadual|do\s+Munic[ií]pio|do\s+Estado))?|Munic[ií]pio(?:\s+de\s+[A-Z][a-zá-ú\s]+)?|Estado(?:\s+de\s+[A-Z][a-zá-ú\s]+)?|Exequente)`;
const SUSPENS = String.raw`(?:suspens(?:o|a|[aã]o|[aã]o\s+do\s+processo|[aã]o\s+da\s+execu[cç][aã]o))`;
const ARQUIV = String.raw`(?:arquiv(?:am[\s-]*se|ado?|amento|em[\s-]*se|e[\s-]*se|a[\s-]*se)|remess[ae]\s+ao\s+arquivo|remetam[\s-]*se.*arquivo)`;
const NAO = String.raw`(?:n[aã]o|sem\s+[eê]xito|in[eê]xito|inexit(?:o|oso)|frustrad[ao]|infrut[ií]fer[ao])`;
const POSITIV = String.raw`(?:positiv[ao]|efetivad[ao]|realizad[ao]|exitosa|com\s+[eê]xito|bem[\s-]sucedid[ao]|deferid[ao]|cumprid[ao]\s+com\s+[eê]xito)`;
const NEGATIV = String.raw`(?:negativ[ao]|frustrad[ao]|infrut[ií]fer[ao]|sem\s+[eê]xito|sem\s+resultado|mal[\s-]sucedid[ao])`;
const PROGRAMAS_PARCEL = String.raw`(?:REFIS|PERT|PEP|PPD|PPI|Simples\s+Nacional|MEI|MOD[- ]?RFB|parcelamento\s+ordin[aá]rio|parcelamento\s+especial|Lei\s+n?[º°.]?\s*\d[\d\.\/]*\s*(?:parcel))`;
const SISTEMAS_BENS = String.raw`(?:SISBAJUD|BACEN[- ]?JUD|BACENJUD|RENAJUD|INFOJUD|CNIB|CCS|SIMBA|SERASAJUD|CENSEC|ARISP|CRI)`;

// rx() = helper pra montar RegExp a partir de fragmentos string
const rx = (src: string, flags = "i") => new RegExp(src, flags);

export const DEFINICOES_CATEGORIAS: Record<CategoriaEvento, DefinicaoCategoria> = {
  // ═══════════════════════════════════════════════════════════════════════════
  // SUSPENSÃO — Art. 40, caput, LEF
  // "Não localizado o devedor ou encontrados bens penhoráveis, o juiz
  //  SUSPENDERÁ o curso da execução, ouvindo a Fazenda Pública."
  // Exige referência EXPLÍCITA ao art. 40 ou parágrafos — "suspenso" sozinho é neutro.
  // ═══════════════════════════════════════════════════════════════════════════
  suspensao_art40: {
    patterns: [
      rx(`${SUSPENS}.{0,80}${ART_40}`),
      rx(`${ART_40}.{0,80}${SUSPENS}`),
      // Exige "caput" OU ausência de §2º/§4º para evitar confusão com arquivamento
      rx(`${ART_40}(?:\\s+caput)?(?:\\s*,?\\s*da\\s+|\\s*,?\\s+)${LEF}(?![^\\n]*§\\s*(?:2|4))`),
      rx(`${SUSPENS}.{0,60}${LEF}`),
      rx(`${SUSPENS}.{0,40}(?:por|pelo\\s+prazo\\s+de)\\s+1\\s*\\(?(?:um)?\\)?\\s*ano.{0,40}${LEF}`),
      rx(`suspens[aã]o\\s+por\\s+1\\s*\\(?(?:um)?\\)?\\s*ano.{0,60}${ART_40}`),
      rx(String.raw`S[uú]mula\s*(?:n?[º°]?\s*)?314\s+(?:do\s+)?STJ`),
      rx(String.raw`aguarde[\-\s]*se.{0,40}decurso.{0,40}(?:prazo\s+)?${ART_40}`),
    ],
    negativePatterns: [
      /liminar/i,
      /tutela\s+(provis[oó]ria|antecipada|de\s+urg[eê]ncia)/i,
      /recurso\s+(especial|extraordin[aá]rio|de\s+apela)/i,
      /processo\s+em\s+outro\s+ju[ií]zo/i,
      /conex[aã]o/i,
      // Evita confusão com arquivamento_art40 (remessa ao arquivo)
      /remetam[\s-]*se.{0,30}arquivo/i,
      /arquiv(?:em|e)[\s-]*se/i,
    ],
    baseConfidence: 0.92,
    specificity: 10,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ARQUIVAMENTO PROVISÓRIO — Art. 40, § 2º, LEF
  // "Decorrido o prazo máximo de 1 (um) ano, sem que seja localizado o devedor
  //  ou encontrados bens penhoráveis, o juiz ORDENARÁ O ARQUIVAMENTO dos autos."
  // Súmula 314 STJ: findo 1 ano, inicia prazo quinquenal da prescrição intercorrente.
  // Distinguir de arquivamento DEFINITIVO (baixa) → extinção.
  // ═══════════════════════════════════════════════════════════════════════════
  arquivamento_art40: {
    patterns: [
      rx(`${ARQUIV}.{0,80}${ART_40_P}`),
      rx(`${ART_40_P}.{0,80}${ARQUIV}`),
      rx(`${ARQUIV}.{0,60}${ART_40}`),
      rx(`arquivamento\\s+provis[oó]rio`),
      rx(`arquivamento\\s+sem\\s+baixa(?:\\s+na\\s+distribui[cç][aã]o)?`),
      rx(`arquiv(?:em|e)[\\s-]*se\\s+(?:os\\s+autos\\s+)?sem\\s+baixa`),
      rx(String.raw`remetam[\s-]*se.{0,30}arquivo.{0,60}(?:${ART_40}|sem\s+baixa)`),
      rx(`${ARQUIV}.{0,40}${LEF}`),
      rx(`arquiv(?:am|e|em)[\\s-]*se.{0,100}1\\s*\\(?(?:um)?\\)?\\s*ano`),
    ],
    negativePatterns: [
      /baixa\s+definitiva/i,
      /arquivamento\s+definitivo/i,
      /extin[cç][aã]o/i,
      /pagamento\s+integral/i,
      /quitad[ao]/i,
      /satisfeit[ao]/i,
      /remi[cç][aã]o/i,
      /desist[eê]ncia/i,
    ],
    baseConfidence: 0.90,
    specificity: 10,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TENTATIVA FRUSTRADA DE LOCALIZAÇÃO DO DEVEDOR
  // Dispara a suspensão do art. 40 caput. Marco comum do Tema 566/STJ.
  // ═══════════════════════════════════════════════════════════════════════════
  tentativa_frustrada_localizacao: {
    patterns: [
      // Oficial de justiça não encontrou
      rx(`oficial(?:\\s+de\\s+justi[cç]a)?.{0,80}(?:certific|inform).{0,60}${NAO}.{0,40}(?:encontr|localiz)`),
      rx(`oficial.{0,60}(?:n[aã]o|sem).{0,30}(?:cumprimento|localiza[cç][aã]o)`),
      rx(`diligen[cç]i(?:a|as).{0,40}${NEGATIV}`),
      rx(`${NEGATIV}.{0,40}diligen[cç]i`),
      // Certidão negativa
      rx(`certid[aã]o\\s+${NEGATIV}`),
      // AR / Aviso de Recebimento
      rx(`(?:AR|aviso\\s+de\\s+recebimento).{0,60}(?:devolvid|${NEGATIV}|${NAO}.{0,20}recebid)`),
      rx(`(?:AR|aviso\\s+de\\s+recebimento).{0,40}(?:mudou[\\s-]*se|ausente|desconhecid|endere[cç]o\\s+insuficiente|n[aã]o\\s+procurad)`),
      rx(`(?:mudou[\\s-]*se|desconhecido?|ausente|endere[cç]o\\s+insuficiente|n[aã]o\\s+procurad[ao])(?!\\w)`),
      // Citação
      rx(`cita[cç][aã]o.{0,40}${NEGATIV}`),
      rx(`cita[cç][aã]o.{0,40}(?:${NAO}.{0,20}(?:realiz|cumprid|efetiv))`),
      rx(`cita[cç][aã]o\\s+por\\s+edital`),
      rx(`edital.{0,40}cita[cç][aã]o`),
      rx(`mandado(?:\\s+de\\s+cita[cç][aã]o)?.{0,40}(?:${NEGATIV}|devolvid|${NAO}.{0,20}cumprid)`),
      // Forma genérica
      rx(`(?:devedor|executad[oa]|r[eé]u|requerid[oa]).{0,60}${NAO}.{0,30}(?:localizad|encontrad)`),
      rx(`${NAO}.{0,30}(?:localizad|encontrad).{0,60}(?:devedor|executad[oa]|r[eé]u|requerid[oa])`),
      rx(`${NAO}\\s+foi\\s+(?:poss[ií]vel\\s+)?(?:localizar|encontrar|citar)`),
      rx(`impossibilidade\\s+de\\s+cita[cç][aã]o`),
    ],
    negativePatterns: [
      rx(`\\b${POSITIV}\\b`),
      /negativa[cç][aã]o/i, // "negativação" (Serasa) ≠ certidão negativa
      /realizad[ao]\s+com\s+(sucesso|[eê]xito)/i,
      /cumprid[ao]\s+com\s+(sucesso|[eê]xito)/i,
      /citad[ao]\s+pessoalmente/i,
    ],
    baseConfidence: 0.86,
    specificity: 7,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TENTATIVA FRUSTRADA DE LOCALIZAÇÃO DE BENS
  // Outro marco típico do art. 40 caput (não há bens penhoráveis).
  // Sistemas: SISBAJUD, BACENJUD, RENAJUD, INFOJUD, CNIB.
  // ═══════════════════════════════════════════════════════════════════════════
  tentativa_frustrada_bens: {
    patterns: [
      rx(`${SISTEMAS_BENS}.{0,40}${NEGATIV}`),
      rx(`${NEGATIV}.{0,40}${SISTEMAS_BENS}`),
      rx(`${SISTEMAS_BENS}.{0,40}sem\\s+(?:resultado|valores?|bloqueio|movimenta[cç][aã]o)`),
      rx(`${SISTEMAS_BENS}.{0,40}${NAO}.{0,30}(?:localiz|encontr|bloque)`),
      rx(`(?:n[aã]o\\s+foram|sem).{0,20}encontrad[oa]s?\\s+bens`),
      rx(`bens?\\s+${NAO}\\s+(?:foram\\s+)?(?:localizad|encontrad)`),
      rx(`(?:n[aã]o|sem)\\s+(?:foram\\s+)?(?:indicad|apresentad|oferecid)[oa]s?\\s+bens`),
      rx(`penhora\\s+${NEGATIV}`),
      rx(`bloqueio\\s+${NEGATIV}`),
      rx(`bloqueio\\s+(?:sem|${NAO})\\s+(?:resultado|valores?|[eê]xito)`),
      rx(`sem\\s+valores?\\s+(?:a\\s+)?(?:bloquear|penhorar)`),
      rx(`arresto\\s+${NEGATIV}`),
      rx(`pesquisa\\s+(?:de\\s+)?bens?\\s+${NEGATIV}`),
      rx(`consulta\\s+${SISTEMAS_BENS}.{0,40}${NEGATIV}`),
      rx(`infrut[ií]fer[oa]`),
      rx(`${NAO}\\s+(?:foram|existem)\\s+(?:localizad|encontrad|indicad|oferecid)`),
      rx(`n[aã]o\\s+possui\\s+bens`),
      rx(`inexist[eê]ncia\\s+de\\s+bens(?:\\s+penhor[aá]veis)?`),
    ],
    negativePatterns: [
      rx(`\\b${POSITIV}\\b`),
      /bloqueio\s+(realizado|efetivad)/i,
      /valores?\s+bloqueados?\s+(?:no\s+valor|com\s+sucesso)/i,
      /penhora\s+(realizada|efetivad)/i,
    ],
    baseConfidence: 0.88,
    specificity: 8,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CONSTRIÇÃO POSITIVA — ATO ÚTIL — interrompe prescrição intercorrente
  // (Tema 566/STJ: "ato útil que viabilize a satisfação do crédito").
  // Penhora/bloqueio efetivado, arresto positivo, sequestro.
  // ═══════════════════════════════════════════════════════════════════════════
  constricao_positiva: {
    patterns: [
      rx(`penhora\\s+(?:foi\\s+)?(?:realizada|efetivad[ao]|cumprid[ao]|positiv)`),
      rx(`(?:realizad|efetivad)[ao]\\s+a\\s+penhora`),
      rx(`bens?\\s+penhorad[oa]s?`),
      rx(`auto\\s+de\\s+penhora(?:\\s+lavrad|\\s+positiv)?`),
      rx(`lavratura\\s+(?:do\\s+)?auto\\s+de\\s+penhora`),
      rx(`${SISTEMAS_BENS}\\s+${POSITIV}`),
      rx(`${POSITIV}\\s+(?:em|no)\\s+${SISTEMAS_BENS}`),
      rx(`bloqueio\\s+${POSITIV}`),
      rx(`${POSITIV}\\s+bloqueio`),
      rx(`bloqueio.{0,40}no\\s+valor\\s+de\\s+R\\$`),
      rx(`valor(?:es)?\\s+bloquead[oa]s?(?:\\s+em\\s+R\\$|\\s+no\\s+valor)?`),
      rx(`arresto\\s+${POSITIV}`),
      rx(`arresto.{0,40}(?:realizad|efetivad|convertid)`),
      rx(`convers[aã]o\\s+(?:do\\s+)?arresto\\s+em\\s+penhora`),
      rx(`sequestro\\s+(?:realizad|efetivad|cumprid)`),
      rx(`constri[cç][aã]o\\s+${POSITIV}`),
      rx(`avalia[cç][aã]o\\s+(?:do\\s+)?bem\\s+penhorad`),
      rx(`intima[cç][aã]o\\s+da\\s+penhora`),
      rx(`leil[aã]o\\s+designad`),
      rx(`adjudica[cç][aã]o\\s+(?:do\\s+)?bem`),
      rx(`arremata[cç][aã]o`),
    ],
    negativePatterns: [
      rx(`\\b${NEGATIV}\\b`),
      rx(`${NAO}\\s+(?:foram\\s+)?(?:localiz|encontr|bloque|penhor)`),
      /sem\s+valores?/i,
      /sem\s+resultado/i,
      /liminar/i,
    ],
    baseConfidence: 0.93,
    specificity: 10,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PENHORA NO ROSTO DOS AUTOS — ATO ÚTIL
  // Forma específica de constrição (CPC art. 860).
  // ═══════════════════════════════════════════════════════════════════════════
  penhora_rosto_autos: {
    patterns: [
      rx(`penhora\\s+no\\s+rosto\\s+dos\\s+autos`),
      rx(`penhora\\s+de\\s+cr[eé]dito(?:s)?\\s+em\\s+outro\\s+processo`),
      rx(`of[ií]cio.{0,40}penhora.{0,40}rosto`),
    ],
    negativePatterns: [
      rx(`\\b${NEGATIV}\\b`),
      /indeferid/i,
    ],
    baseConfidence: 0.90,
    specificity: 9,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CIÊNCIA DA FAZENDA — Art. 40 §1º LEF (deve ser ouvida antes de suspender)
  // Intimação pessoal da Fazenda como sujeito da ciência.
  // ═══════════════════════════════════════════════════════════════════════════
  ciencia_fazenda: {
    patterns: [
      rx(`${FAZENDA}\\s+(?:foi\\s+)?(?:ciente|intimad[ao]|notificad[ao])`),
      rx(`(?:ciente|intimad[ao]|notificad[ao])\\s+(?:a\\s+|o\\s+)?${FAZENDA}`),
      rx(`intim(?:[ae][\\s-]*se|a[cç][aã]o|ar[\\s-]*se)\\s+(?:a\\s+|o\\s+)?${FAZENDA}`),
      rx(`notifi(?:que|ca[cç][aã]o|car)[\\s-]*(?:se\\s+)?(?:a\\s+|o\\s+)?${FAZENDA}`),
      rx(`ci[eê]ncia\\s+(?:à|ao|d[ao])\\s+${FAZENDA}`),
      rx(`vista[s]?\\s+(?:à|ao|d[ao])\\s+${FAZENDA}`),
      rx(`${FAZENDA}.{0,40}(?:ciente|tomou\\s+ci[eê]ncia)`),
      rx(`abr[ae][\\s-]*se\\s+vista\\s+(?:à|ao)\\s+${FAZENDA}`),
      rx(`remetam[\\s-]*se\\s+os\\s+autos\\s+(?:à|ao)\\s+${FAZENDA}`),
    ],
    negativePatterns: [
      /minist[eé]rio\s+p[uú]blico/i, // MP ≠ Fazenda para efeitos do art. 40
      /defensoria/i,
    ],
    baseConfidence: 0.83,
    specificity: 6,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PARCELAMENTO — Suspensão da exigibilidade (Art. 151, VI, CTN)
  // Programas: PERT, PEP, REFIS, PPI, PPD, Simples Nacional, MEI, Lei X.
  // ═══════════════════════════════════════════════════════════════════════════
  parcelamento: {
    patterns: [
      rx(`parcelamento\\s+(?:foi\\s+)?(?:deferido|aprovado|celebrado|concedido|homologado|formalizad|ativ[oa])`),
      rx(`homolog(?:ad[ao]|ou|o).{0,40}(?:ades[aã]o|parcelament)`),
      rx(`ades[aã]o.{0,60}(?:ao|aos?)\\s+(?:programa\\s+de\\s+)?parcelament`),
      rx(`ades[aã]o.{0,40}(?:ao|aos?)\\s+${PROGRAMAS_PARCEL}`),
      rx(`ader(?:iu|imos|ido|ida|indo|ir)\\s+(?:o\\s+(?:executad|devedor)[ao]?\\s+)?(?:ao|aos?)\\s+(?:programa\\s+de\\s+)?(?:parcelament|${PROGRAMAS_PARCEL})`),
      rx(`(?:executad|devedor)[oa]?\\s+ader(?:iu|imos|ido|ida)`),
      rx(`ingresso\\s+(?:no|em)\\s+(?:programa\\s+de\\s+)?parcelament`),
      rx(`parcelamento.{0,40}(?:em\\s+vigor|vigente|ativ[oa]|regular|em\\s+dia)`),
      rx(`d[eé]bito\\s+(?:foi\\s+)?(?:parcelad|inclu[ií]d).{0,40}(?:parcelament|${PROGRAMAS_PARCEL})`),
      rx(`inclu[ií]d[oa]\\s+no\\s+(?:programa\\s+de\\s+)?parcelament`),
      rx(`cr[eé]dito\\s+parcelad[oa]`),
      rx(`${PROGRAMAS_PARCEL}.{0,60}(?:deferid|homolog|aprovad|ades[aã]o)`),
      rx(`suspens[aã]o\\s+da\\s+exigibilidade.{0,60}parcelament`),
      rx(`art(?:\\.|igo)?\\s*151.{0,40}CTN`),
    ],
    negativePatterns: [
      /rescind/i,
      /rescis/i,
      /cancel/i,
      /exclus[aã]o/i,
      /inadimpl/i,
      /indeferid/i,
      /n[aã]o\s+(?:houve|foi)\s+parcel/i,
    ],
    baseConfidence: 0.89,
    specificity: 8,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PARCELAMENTO RESCINDIDO — retorno à exigibilidade
  // Não é marco interruptivo — apenas reabre o curso normal.
  // ═══════════════════════════════════════════════════════════════════════════
  parcelamento_rescindido: {
    patterns: [
      rx(`parcelamento.{0,40}(?:rescind|rescis)`),
      rx(`(?:rescis[aã]o|rescindid[oa]).{0,40}parcelament`),
      rx(`parcelamento.{0,40}cancel`),
      rx(`(?:cancelamento|cancelad[oa]).{0,40}parcelament`),
      rx(`exclus[aã]o.{0,40}parcelament`),
      rx(`parcelamento.{0,40}(?:inadimpl|em\\s+atraso)`),
      rx(`exclu[ií]d[oa].{0,40}(?:do\\s+)?${PROGRAMAS_PARCEL}`),
    ],
    negativePatterns: [],
    baseConfidence: 0.86,
    specificity: 8,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // REDIRECIONAMENTO — Inclusão do sócio/responsável (art. 135 CTN, IDPJ)
  // Súmula 435 STJ: redirecionamento por dissolução irregular.
  // Tema 444/STJ: prescrição para redirecionamento conta do ato de dissolução.
  // ═══════════════════════════════════════════════════════════════════════════
  redirecionamento: {
    patterns: [
      rx(`redirecion(?:amento|ad[ao]|ar)`),
      rx(`inclus[aã]o.{0,30}(?:no\\s+)?polo\\s+passivo`),
      rx(`(?:s[oó]cio|administrador|corresponsa[aá]vel).{0,30}(?:inclu[ií]d|citad|executad)`),
      rx(`incidente\\s+de\\s+desconsidera[cç][aã]o(?:\\s+da\\s+personalidade)?`),
      rx(`\\bIDPJ\\b`),
      rx(`desconsidera[cç][aã]o\\s+(?:da\\s+)?personalidade\\s+jur[ií]dica`),
      rx(`art(?:\\.|igo)?\\s*135.{0,20}CTN`),
      rx(`S[uú]mula\\s*(?:n?[º°]?\\s*)?435\\s+(?:do\\s+)?STJ`),
      rx(`dissolu[cç][aã]o\\s+irregular`),
      rx(`novo\\s+(?:executad|devedor)[ao]`),
      rx(`responsabiliza[cç][aã]o\\s+(?:do\\s+)?s[oó]cio`),
    ],
    negativePatterns: [
      /indeferid/i,
      /rejeitad/i,
      /n[aã]o\s+(?:houve|cabe)\s+redirecion/i,
    ],
    baseConfidence: 0.84,
    specificity: 7,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // DESPACHO QUE ORDENA A CITAÇÃO — Art. 174, pu, I, CTN (LC 118/2005)
  // "A prescrição se interrompe pelo DESPACHO do juiz que ordenar a citação"
  // (retroage à data de propositura — Súmula 106 STJ e art. 240 §1º CPC).
  // IMPORTANTE: só para execuções fiscais com distribuição após LC 118 (09/06/2005).
  // Antes disso: interrupção só com citação pessoal do devedor.
  // ═══════════════════════════════════════════════════════════════════════════
  despacho_citacao: {
    patterns: [
      rx(`despacho\\s+(?:que\\s+)?(?:ordena|determina)\\s+a\\s+cita[cç][aã]o`),
      rx(`ordenad[ao]\\s+a\\s+cita[cç][aã]o`),
      rx(`cite[\\s-]*se(?:\\s+o\\s+(?:executad|devedor|r[eé]u))?(?!\\s+(?:por\\s+edital|${NEGATIV}))`),
      rx(`determin[ao](?:u|m)?\\s+a\\s+cita[cç][aã]o`),
      rx(`${CTN_174}`),
    ],
    negativePatterns: [
      rx(`cita[cç][aã]o\\s+por\\s+edital`),
      /indeferid/i,
      /impossibilidade/i,
    ],
    baseConfidence: 0.80,
    specificity: 7,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CITAÇÃO EFETIVADA — devedor citado pessoalmente
  // Interrompe prescrição (mesmo antes da LC 118/2005).
  // ═══════════════════════════════════════════════════════════════════════════
  citacao_valida: {
    patterns: [
      rx(`cita[cç][aã]o\\s+(?:foi\\s+)?(?:realizada|efetivad[ao]|cumprid[ao]|${POSITIV})`),
      rx(`(?:executad|devedor|r[eé]u|requerid)[oa]?\\s+citad[oa]?\\s+pessoalmente`),
      rx(`cita[cç][aã]o\\s+pessoal(?:mente)?`),
      rx(`citad[oa]\\s+na\\s+(?:pessoa\\s+)?d[oa]`),
      rx(`(?:AR|aviso\\s+de\\s+recebimento)\\s+${POSITIV}`),
      rx(`(?:AR|aviso\\s+de\\s+recebimento).{0,40}(?:recebid|juntad|assinad)`),
      rx(`mandado(?:\\s+de\\s+cita[cç][aã]o)?\\s+${POSITIV}`),
      rx(`mandado(?:\\s+de\\s+cita[cç][aã]o)?\\s+cumprid[ao]`),
      rx(`cita[cç][aã]o\\s+por\\s+hora\\s+certa`),
      rx(`comparecimento\\s+espont[aâ]neo\\s+d[oa]\\s+(?:executad|devedor)`),
    ],
    negativePatterns: [
      rx(`\\b${NEGATIV}\\b`),
      rx(`${NAO}\\s+(?:foi\\s+)?(?:encontrad|localiz|realizad|cumprid|efetivad)`),
      rx(`devolvid[ao]`),
      rx(`cita[cç][aã]o\\s+por\\s+edital`),
      /frustrad/i,
      /mudou[\s-]*se/i,
      /endere[cç]o\s+insuficiente/i,
    ],
    baseConfidence: 0.90,
    specificity: 9,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // INDICAÇÃO DE BENS PELO EXECUTADO — ato processual que pode romper inércia
  // Não é marco interruptivo em si, mas afasta alegação de inércia da Fazenda.
  // ═══════════════════════════════════════════════════════════════════════════
  indicacao_bens: {
    patterns: [
      rx(`(?:executad|devedor)[oa]?\\s+indic[aou]u?\\s+bens?`),
      rx(`indica[cç][aã]o\\s+de\\s+bens?\\s+(?:[aà]\\s+penhora|pelo\\s+executad)`),
      rx(`(?:executad|devedor)[oa]?\\s+nome[io]u?\\s+bens?\\s+[aà]\\s+penhora`),
      rx(`oferecimento\\s+de\\s+bens?\\s+[aà]\\s+penhora`),
      rx(`ofere(?:ceu|cidos?)\\s+bens?\\s+[aà]\\s+penhora`),
      rx(`nomea[cç][aã]o\\s+(?:de\\s+)?bens?\\s+(?:[aà]\\s+penhora|pelo\\s+executad)`),
      rx(`garantia\\s+do\\s+ju[ií]zo(?:\\s+pelo\\s+executad)?`),
    ],
    negativePatterns: [
      /indeferid/i,
      /rejeitad/i,
      /recus/i,
    ],
    baseConfidence: 0.78,
    specificity: 6,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // EMBARGOS DO EXECUTADO — art. 16 LEF (prazo 30 dias após garantia)
  // Não interrompe prescrição, mas indica atividade processual.
  // ═══════════════════════════════════════════════════════════════════════════
  embargos_executado: {
    patterns: [
      rx(`embargos\\s+(?:à|a|do)\\s+execu[cç][aã]o`),
      rx(`embargos\\s+do\\s+(?:executad|devedor)`),
      rx(`oposi[cç][aã]o\\s+(?:de\\s+)?embargos`),
      rx(`opos\\s+embargos`),
      rx(`distribui[cç][aã]o\\s+d[oe]s?\\s+embargos`),
      rx(`autos?\\s+(?:d[oe]s?\\s+)?embargos`),
      rx(`art(?:\\.|igo)?\\s*16.{0,20}${LEF}`),
    ],
    negativePatterns: [
      /embargos\s+(rejeitad|julgad|improced|intempestiv)/i,
    ],
    baseConfidence: 0.82,
    specificity: 7,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // EXCEÇÃO DE PRÉ-EXECUTIVIDADE — Súmula 393 STJ
  // "A exceção de pré-executividade é admissível quando a matéria invocada
  //  seja suscetível de conhecimento de ofício e não demande dilação probatória"
  // ═══════════════════════════════════════════════════════════════════════════
  excecao_pre_executividade: {
    patterns: [
      rx(`exce[cç][aã]o\\s+de\\s+pr[eé][\\s-]?executividade`),
      rx(`obje[cç][aã]o\\s+de\\s+pr[eé][\\s-]?executividade`),
      rx(`S[uú]mula\\s*(?:n?[º°]?\\s*)?393\\s+(?:do\\s+)?STJ`),
    ],
    negativePatterns: [
      /rejeitad/i,
      /indeferid/i,
      /improced/i,
    ],
    baseConfidence: 0.85,
    specificity: 8,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PRESCRIÇÃO INTERCORRENTE RECONHECIDA — extinção (Art. 40 §4º LEF)
  // "Ouvida a Fazenda Pública, poderá o juiz, de ofício, reconhecer a prescrição
  //  intercorrente e decretá-la de imediato."
  // ═══════════════════════════════════════════════════════════════════════════
  prescricao_reconhecida: {
    patterns: [
      rx(`prescri[cç][aã]o\\s+intercorrente\\s+(?:reconhecid|declarad|decretad|configurad|consumad|operad)`),
      rx(`(?:reconhe[cç](?:o|a|id[oa])|declar(?:o|a|ad[oa])|decret(?:o|a|ad[oa]))\\s+(?:de\\s+of[ií]cio\\s+)?a\\s+prescri[cç][aã]o\\s+intercorrente`),
      rx(`(?:reconhecid|declarad|decretad)[ao]\\s+(?:de\\s+of[ií]cio\\s+)?a\\s+prescri[cç][aã]o\\s+intercorrente`),
      rx(`extin[cç][aã]o\\s+(?:da\\s+execu[cç][aã]o\\s+)?(?:em\\s+raz[aã]o\\s+d[ae]\\s+|por\\s+)?prescri[cç][aã]o`),
      rx(`${ART_40}\\s*,?\\s*§\\s*4`),
      rx(`prescri[cç][aã]o\\s+(?:consumad|operad|verificad)\\s+(?:nos\\s+termos\\s+d[oe]\\s+)?${ART_40}`),
      rx(`resolu[cç][aã]o.{0,40}m[eé]rito.{0,40}prescri[cç][aã]o`),
    ],
    negativePatterns: [
      /n[aã]o\s+(?:h[aá]|houve|restou\s+configurad).{0,20}prescri[cç][aã]o/i,
      /afastad[ao]\s+a\s+prescri[cç][aã]o/i,
      /rejeit[ao].{0,30}prescri[cç][aã]o/i,
    ],
    baseConfidence: 0.93,
    specificity: 10,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PEDIDO DA FAZENDA SEM EFEITO INTERRUPTIVO
  // Tema 566/STJ: "mera petição da Fazenda requerendo prosseguimento, sem
  //  indicar bens ou diligência concreta, NÃO interrompe a prescrição"
  // ═══════════════════════════════════════════════════════════════════════════
  pedido_fazenda_sem_efeito: {
    patterns: [
      rx(`${FAZENDA}.{0,30}(?:requer|pede|solicit|postul).{0,30}prosseguimento`),
      rx(`${FAZENDA}.{0,30}(?:requer|pede|solicit).{0,30}(?:dilig[eê]ncia|prazo|vista)`),
      rx(`${FAZENDA}.{0,30}(?:manifest[ao]u?[\\s-]*se|apresent[ao]u?).{0,60}(?:gen[eé]ric|prazo|suspens)`),
      rx(`${FAZENDA}.{0,30}reitera.{0,30}(?:pedido|dilig[eê]ncia)`),
      rx(`${FAZENDA}.{0,30}pede\\s+prazo`),
      rx(`peti[cç][aã]o\\s+(?:de\\s+)?${FAZENDA}.{0,30}(?:suspens|prazo)`),
      rx(`${FAZENDA}.{0,40}nada\\s+(?:a|para)\\s+requerer`),
    ],
    negativePatterns: [
      // Indicação concreta de bens é ATO ÚTIL — não deve cair aqui
      rx(`indic[aou]u?\\s+(?:bens?|endere[cç]o)`),
      rx(`${SISTEMAS_BENS}`),
      rx(`penhor[ae]?\\s+(?:sobre|em)`),
    ],
    baseConfidence: 0.77,
    specificity: 5,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ATO NEUTRO — atos ordinatórios sem efeito sobre prescrição
  // Specificity baixa para ceder a outras categorias quando coincidir.
  // ═══════════════════════════════════════════════════════════════════════════
  ato_neutro: {
    patterns: [
      rx(`ato\\s+ordin[aá]t[oó]rio`),
      rx(`conclus[oa]s?\\s*(?:ao|à|para)\\s*(?:despacho|decis[aã]o|senten[cç]a|ju[ií]z)`),
      rx(`mero\\s+(?:impulso|expediente)\\s+processual`),
      rx(`juntad[ao]\\s+de\\s+peti[cç][aã]o`),
      rx(`juntada\\s+de\\s+(?:AR|mandado|of[ií]cio|certid[aã]o|guia)`),
      rx(`decurso\\s+d[eo]\\s+prazo`),
      rx(`certifico\\s+(?:o\\s+)?decurso\\s+d[eo]\\s+prazo`),
      rx(`(?:expedid[oa]|expedi[cç][aã]o\\s+de)\\s+(?:carta|mandado|of[ií]cio|edital|precat[oó]ria)`),
      rx(`recebid[ao]s?\\s+(?:os\\s+autos|a\\s+peti[cç][aã]o\\s+inicial)`),
      rx(`processe[\\s-]*se`),
      rx(`^vistos`),
      rx(`\\bredistribui[cç][aã]o\\b`),
      rx(`remessa\\s+(?:à|ao|d[ao])\\s+(?:cart[oó]rio|contadoria|dist)`),
      rx(`c[aá]lculos?\\s+(?:atualiza|de\\s+liquida|apresentad)`),
      rx(`autos?\\s+com\\s+(?:conclus|carga)`),
      rx(`publica[cç][aã]o\\s+(?:no\\s+)?(?:DJ|di[aá]rio)`),
    ],
    negativePatterns: [
      // Se for intimação da Fazenda, deixa ciencia_fazenda pegar
      rx(`intima[cç][aã]o\\s+(?:à|ao|d[ao])\\s+${FAZENDA}`),
      // Se for despacho de citação, deixa despacho_citacao pegar
      rx(`cite[\\s-]*se`),
    ],
    baseConfidence: 0.78,
    specificity: 3,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // EXTINÇÃO — término do processo por outras razões (pagamento, desistência)
  // Quando a causa da extinção for prescrição, prescricao_reconhecida ganha.
  // ═══════════════════════════════════════════════════════════════════════════
  extincao: {
    patterns: [
      rx(`extin[cç][aã]o\\s+(?:do\\s+)?(?:processo|execu[cç][aã]o|feito)(?:.{0,40}(?:pagamento|quita|satisf|remi[cç][aã]o|renu|desist|transa[cç]))?`),
      rx(`(?:processo|execu[cç][aã]o|feito)\\s+extint[oa]`),
      rx(`extingo\\s+(?:o\\s+(?:processo|feito|execu[cç][aã]o))?`),
      rx(`julgo\\s+extint`),
      rx(`baixa\\s+definitiva`),
      rx(`arquivamento\\s+definitivo(?!\\s+provis)`),
      rx(`tr[aâ]nsito\\s+em\\s+julgado`),
      rx(`senten[cç]a\\s+(?:de\\s+)?extin[cç][aã]o`),
      rx(`pagamento\\s+integral.{0,40}(?:d[ao]\\s+)?d[eé]bito`),
      rx(`d[eé]bito\\s+(?:quitad|satisfeit|pag[ao])`),
      rx(`desist[eê]ncia\\s+(?:da\\s+)?execu[cç][aã]o`),
      rx(`renunci(?:a|ou)\\s+(?:à|ao)\\s+(?:cr[eé]dito|direito)`),
      rx(`remi[cç][aã]o\\s+(?:do\\s+)?d[eé]bito`),
      rx(`transa[cç][aã]o\\s+(?:tribut[aá]ria|homolog)`),
    ],
    negativePatterns: [
      rx(`arquivamento\\s+(?:provis[oó]rio|sem\\s+baixa)`),
      rx(`prescri[cç][aã]o\\s+intercorrente`),
    ],
    baseConfidence: 0.91,
    specificity: 10,
  },

  // Fallback — nunca tem patterns positivos por definição
  nao_classificado: {
    patterns: [],
    negativePatterns: [],
    baseConfidence: 0,
    specificity: 0,
  },
};

// ── Cores por score (Tailwind) ────────────────────────────────────────────────
export const SCORE_COLORS: Record<
  string,
  { bg: string; text: string; border: string; label: string }
> = {
  forte: {
    bg: "bg-emerald-500/10",
    text: "text-emerald-400",
    border: "border-emerald-500/30",
    label: "Forte indício",
  },
  medio: {
    bg: "bg-amber-500/10",
    text: "text-amber-400",
    border: "border-amber-500/30",
    label: "Indício moderado",
  },
  fraco: {
    bg: "bg-blue-500/10",
    text: "text-blue-400",
    border: "border-blue-500/30",
    label: "Indício fraco",
  },
  sem_base: {
    bg: "bg-slate-700/30",
    text: "text-slate-400",
    border: "border-slate-600/40",
    label: "Sem base",
  },
  inconclusivo: {
    bg: "bg-slate-700/30",
    text: "text-slate-400",
    border: "border-slate-600/40",
    label: "Inconclusivo",
  },
};

// ── Cores por efeito jurídico (Tailwind) ──────────────────────────────────────
export const EFEITO_COLORS: Record<EfeitoJuridico, string> = {
  inicia_contagem: "border-amber-500/40 bg-amber-500/5",
  interrompe: "border-emerald-500/40 bg-emerald-500/5",
  suspende: "border-blue-500/40 bg-blue-500/5",
  encerra: "border-red-500/40 bg-red-500/5",
  neutro: "border-border bg-secondary",
  incerto: "border-dashed border-slate-600 bg-secondary",
};

export const EFEITO_DOT_COLORS: Record<EfeitoJuridico, string> = {
  inicia_contagem: "bg-amber-400",
  interrompe: "bg-emerald-400",
  suspende: "bg-blue-400",
  encerra: "bg-red-400",
  neutro: "bg-slate-500",
  incerto: "bg-yellow-400",
};
