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
export const CATEGORIA_EFEITO_MAP: Record<CategoriaEvento, EfeitoJuridico> = {
  suspensao_art40: "suspende",
  arquivamento_art40: "inicia_contagem",
  tentativa_frustrada_localizacao: "inicia_contagem",
  tentativa_frustrada_bens: "inicia_contagem",
  constricao_positiva: "interrompe",
  ciencia_fazenda: "inicia_contagem",
  parcelamento: "suspende",
  parcelamento_rescindido: "neutro",
  redirecionamento: "neutro",
  citacao_valida: "interrompe",
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

export const DEFINICOES_CATEGORIAS: Record<CategoriaEvento, DefinicaoCategoria> = {
  // Exige referência explícita ao art. 40 — nunca classificar "suspenso" sozinho
  suspensao_art40: {
    patterns: [
      /suspen[sd]o.*art\.?\s*40/i,
      /art\.?\s*40.*lei\s*6\.?830/i,
      /suspens[aã]o.*execu[cç][aã]o.*art\.?\s*40/i,
      /art\.?\s*40.*suspens/i,
    ],
    negativePatterns: [
      /liminar/i,
      /tutela/i,
      /recurso/i,
    ],
    baseConfidence: 0.90,
    specificity: 10,
  },

  // "Arquivem-se" / "remetam-se...arquivo" / "arquivamento provisório"
  // Negative: arquivamento definitivo não é art. 40
  arquivamento_art40: {
    patterns: [
      /arquiv[ae].*art\.?\s*40/i,
      /arquivem[\s-]*se/i,
      /remetam[\s-]*se.*arquivo/i,
      /arquivamento.*provis[oó]rio/i,
      /remessa.*arquivo/i,
    ],
    negativePatterns: [
      /definitiv/i,
      /baixa\s+definitiva/i,
      /extin[cç][aã]o/i,
    ],
    baseConfidence: 0.88,
    specificity: 9,
  },

  // Tentativa frustrada de localização do devedor
  // Negative: positiv — para não capturar citações positivas
  tentativa_frustrada_localizacao: {
    patterns: [
      /n[aã]o\s+localiz[ao]/i,
      /devedor.*n[aã]o.*encontrad/i,
      /n[aã]o.*encontrad.*devedor/i,
      /cita[cç][aã]o.*negativ[ao](?![cç])/i,
      /cita[cç][aã]o.*infrut[ií]fer/i,
      /AR.*devolvido?\s+sem\s+recebimento/i,
      /AR.*negativ[oa](?![cç])/i,
      /aviso\s+de\s+recebimento.*devolvid/i,
      /mudou[\s-]*se/i,
      /endere[cç]o.*insuficiente/i,
      /cita[cç][aã]o.*por\s+edital/i,
      /mandado.*citac[aã]o.*negativ/i,
      /oficial.*certific.*n[aã]o.*encontr/i,
      /n[aã]o\s+foi\s+encontrad/i,
    ],
    negativePatterns: [
      /\bpositiv/i,
      /negativa[cç][aã]o/i,
      /realizada\s+com\s+sucesso/i,
      /cumprido\s+com\s+sucesso/i,
    ],
    baseConfidence: 0.85,
    specificity: 7,
  },

  // Tentativa frustrada de localização de bens
  // Negative: positiv — para não capturar bloqueios positivos
  tentativa_frustrada_bens: {
    patterns: [
      /n[aã]o\s+(foram\s+)?encontrados?\s+bens/i,
      /bens?\s+n[aã]o\s+(foram\s+)?localiza/i,
      /resultado\s+(de\s+pesquisa\s+)?negativ.*sisbajud/i,
      /sisbajud.*sem\s+(resultado|valores?)/i,
      /sisbajud.*resultado.*negativ/i,
      /bacenjud.*negativ/i,
      /bacenjud.*sem\s+(resultado|valores?)/i,
      /renajud.*negativ/i,
      /penhora.*negativ/i,
      /sem\s+valores?\s+(a\s+)?bloquear/i,
      /bloqueio.*sem\s+(resultado|valores?)/i,
      /infrutífer/i,
    ],
    negativePatterns: [
      /\bpositiv/i,
      /bloqueio\s+realizado/i,
      /valores?\s+bloqueados?/i,
    ],
    baseConfidence: 0.87,
    specificity: 8,
  },

  // Constrição positiva (penhora, bloqueio efetivado)
  // Negative: negativ / frustrad / sem valores
  constricao_positiva: {
    patterns: [
      /penhora\s+realizada/i,
      /penhora\s+efetivada/i,
      /bens?\s+penhorados?/i,
      /bloqueio.*positiv/i,
      /\bpositiv.*bloqueio/i,
      /valores?\s+bloqueados?/i,
      /sisbajud.*positiv/i,
      /\bpositiv.*sisbajud/i,
      /arresto.*efetivad/i,
      /constri[cç][aã]o.*realizada/i,
    ],
    negativePatterns: [
      /\bnegativ/i,
      /frustrad/i,
      /sem\s+valores?/i,
      /n[aã]o\s+(foram\s+)?encontrados?/i,
    ],
    baseConfidence: 0.92,
    specificity: 10,
  },

  // Ciência da Fazenda — apenas quando fazenda é sujeito/objeto da intimação
  ciencia_fazenda: {
    patterns: [
      /fazenda.*ciente/i,
      /intimad[ao].*fazenda/i,
      /intima[cç][aã]o.*fazenda/i,
      /intimad[ao].*procuradoria/i,
      /intima[cç][aã]o.*procuradoria/i,
      /intimad[ao].*pgfn/i,
      /intima[cç][aã]o.*pgfn/i,
      /ci[eê]ncia.*fazenda/i,
      /ci[eê]ncia.*procuradoria/i,
      /vistas?\s*(à|a)\s*(fazenda|pgfn|procuradoria)/i,
    ],
    negativePatterns: [],
    baseConfidence: 0.83,
    specificity: 6,
  },

  // Parcelamento ativo (REFIS, parcelamentos tributários)
  // Negative: termos de rescisão/cancelamento (já cobertos por parcelamento_rescindido)
  parcelamento: {
    patterns: [
      /parcelamento\s+(deferido|aprovado|celebrado|concedido|homologado)/i,
      /ades[aã]o.*refis/i,
      /ades[aã]o.*programa.*parcel/i,
      /parcelamento.*em\s+vigor/i,
      /parcelamento.*vigente/i,
      /ingresso.*parcelamento/i,
    ],
    negativePatterns: [
      /rescind/i,
      /cancel/i,
      /exclus[aã]o/i,
      /inadimpl/i,
    ],
    baseConfidence: 0.88,
    specificity: 7,
  },

  // Rescisão/cancelamento de parcelamento
  parcelamento_rescindido: {
    patterns: [
      /parcelamento.*rescind/i,
      /parcelamento.*cancel/i,
      /exclus[aã]o.*parcelamento/i,
      /rescis[aã]o.*parcelamento/i,
      /parcelamento.*inadimpl/i,
      /cancelamento.*parcelamento/i,
    ],
    negativePatterns: [],
    baseConfidence: 0.85,
    specificity: 8,
  },

  // Redirecionamento da execução / inclusão de sócios
  redirecionamento: {
    patterns: [
      /redirecion/i,
      /inclus[aã]o.*polo\s+passivo/i,
      /incidente.*desconsider/i,
      /s[oó]cio.*inclu[ií]/i,
      /desconsiderar[aã]o.*personalidade/i,
      /novo\s+executado/i,
    ],
    negativePatterns: [],
    baseConfidence: 0.82,
    specificity: 6,
  },

  // Citação válida (pessoalmente, AR positivo, mandado cumprido)
  // Negative: qualquer indicativo de frustração
  citacao_valida: {
    patterns: [
      /cita[cç][aã]o.*realizada/i,
      /citado.*pessoalmente/i,
      /cita[cç][aã]o.*pessoal/i,
      /AR.*positiv/i,
      /aviso\s+de\s+recebimento.*positiv/i,
      /mandado.*cumprido/i,
      /mandado\s+de\s+cita[cç][aã]o.*cumprido/i,
    ],
    negativePatterns: [
      /\bnegativ/i,
      /frustrad/i,
      /devolvid/i,
      /\bedital\b/i,
      /n[aã]o\s+(foi\s+)?(encontrad|localiz)/i,
    ],
    baseConfidence: 0.88,
    specificity: 9,
  },

  // Petições da fazenda sem efeito interruptivo (mero impulso processual)
  pedido_fazenda_sem_efeito: {
    patterns: [
      /fazenda.*requer.*prosseguimento/i,
      /fazenda.*pede.*dilig[eê]ncia/i,
      /pgfn.*requer/i,
      /fazenda.*pede\s+prazo/i,
      /procuradoria.*requer\s+prosseguimento/i,
    ],
    negativePatterns: [],
    baseConfidence: 0.75,
    specificity: 5,
  },

  // Atos meramente ordinatórios (sem efeito sobre prescrição)
  // Specificity baixa para não sobrepor outras categorias
  ato_neutro: {
    patterns: [
      /ato\s+ordin[aá]t[oó]rio/i,
      /conclus[oa]s?\s*(ao|à|para)/i,
      /juntada\s+de\s+peti[çc][aã]o/i,
      /decurso\s+de\s+prazo/i,
      /expedid[oa].*carta/i,
      /expedi[cç][aã]o\s+de\s+carta/i,
      /expedi[cç][aã]o\s+de\s+mandado/i,
      /recebida\s+a\s+peti[çc][aã]o\s+inicial/i,
      /cite-se/i,
      /vistos/i,
      /processe-se/i,
      /expedido\b/i,
      /certid[aã]o\b/i,
      /recebidos?\s+os\s+autos/i,
      /vista[sd]?\s+ao\s+(minist[eé]rio|dro|dr\.)/i,
    ],
    negativePatterns: [],
    baseConfidence: 0.80,
    specificity: 3,
  },

  // Extinção do processo
  extincao: {
    patterns: [
      /extin[cç][aã]o.*processo/i,
      /processo.*extinto/i,
      /baixa.*definitiva/i,
      /tr[aâ]nsito\s+em\s+julgado/i,
      /encerramento.*processo/i,
    ],
    negativePatterns: [],
    baseConfidence: 0.90,
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
