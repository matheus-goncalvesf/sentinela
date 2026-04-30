import {
  SCORE_THRESHOLDS,
  GAP_INCERTEZA_DIAS,
  MIN_EVENTOS_INCERTEZA,
  PRAZO_SUSPENSAO_DIAS,
  PRAZO_PRESCRICAO_DIAS,
  PRAZO_TOTAL_DIAS,
} from "./constants";
import { classificarEvento } from "./classificadorRegras";
import { diffInDays, formatDateBR } from "./dateUtils";
import type {
  AnalisePrescricao,
  CategoriaEvento,
  EventoProcessual,
  FasePrescricao,
  Processo,
  ScorePrescricao,
  StatusFinal,
} from "./types";

// ═══════════════════════════════════════════════════════════════════════════
// Motor de Prescrição Intercorrente — Execução Fiscal (TJSP)
//
// Fundamentos aplicados:
//  • LEF (Lei 6.830/80), art. 40, §§ 1º a 5º
//  • Súmula 314/STJ   — suspensão 1 ano + prescrição quinquenal
//  • Tema 566/STJ (REsp 1.340.553-RS) — marco inicial automático
//  • LC 118/2005      — art. 174 pu CTN (despacho interrompe prescrição)
//  • Súmula 106/STJ   — demora da máquina judiciária não prejudica credor
//  • Art. 151, VI, CTN — parcelamento suspende exigibilidade
//  • Art. 135 CTN + Súmula 435/STJ — redirecionamento
// ═══════════════════════════════════════════════════════════════════════════

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// Categorias que podem iniciar a contagem do art. 40 (Tema 566/STJ).
// A preferência é ciencia_fazenda APÓS tentativa frustrada. Se não houver
// ciência explícita, consideramos a própria tentativa (ciência ficta).
const CATEGORIAS_MARCO: Set<CategoriaEvento> = new Set([
  "ciencia_fazenda",
  "tentativa_frustrada_localizacao",
  "tentativa_frustrada_bens",
  "arquivamento_art40",
]);

// Atos úteis (Tema 566) — constrição efetiva, citação pessoal, despacho de
// citação (art. 174 pu CTN). Zeram o cômputo da prescrição intercorrente.
const CATEGORIAS_ATO_UTIL: Set<CategoriaEvento> = new Set([
  "constricao_positiva",
  "penhora_rosto_autos",
  "citacao_valida",
  "despacho_citacao",
]);

// Status terminais
const CATEGORIAS_TERMINAL_PRESCRICAO: Set<CategoriaEvento> = new Set([
  "prescricao_reconhecida",
]);
const CATEGORIAS_TERMINAL_EXTINCAO: Set<CategoriaEvento> = new Set([
  "extincao",
]);

// Categorias que sinalizam incerteza (requerem análise mais cuidadosa)
const CATEGORIAS_SINALIZAM_ALERTA: Set<CategoriaEvento> = new Set([
  "redirecionamento",
  "embargos_executado",
  "excecao_pre_executividade",
  "indicacao_bens",
]);

/**
 * Classifica uma lista de eventos brutos e retorna EventoProcessual[].
 * Ordena por data ASC (eventos sem data por último).
 */
export function processarEventos(
  eventos: Array<{ data: Date | null; textoBruto: string }>
): EventoProcessual[] {
  const processados: EventoProcessual[] = eventos.map((ev) => {
    const classificacao = classificarEvento(ev.textoBruto);
    return {
      id: generateId(),
      data: ev.data,
      textoBruto: ev.textoBruto,
      categoria: classificacao.categoria,
      efeitoJuridico: classificacao.efeitoJuridico,
      confianca: classificacao.confianca,
      padraoMatched: classificacao.padraoMatched,
    };
  });

  return processados.sort(compararPorData);
}

function compararPorData(a: EventoProcessual, b: EventoProcessual): number {
  if (!a.data && !b.data) return 0;
  if (!a.data) return 1;
  if (!b.data) return -1;
  return a.data.getTime() - b.data.getTime();
}

/**
 * Analisa um processo e retorna o diagnóstico de prescrição intercorrente.
 * dataHoje é injetável para facilitar testes determinísticos.
 */
export function analisarPrescricao(
  processo: Processo,
  dataHoje: Date = new Date()
): AnalisePrescricao {
  const eventos = [...processo.eventos].sort(compararPorData);
  const pontosIncerteza: string[] = [];
  const fundamentos: string[] = [];

  // ── Passo 0: Detecta status terminal (sentença já prolatada) ──────────────
  const eventoPrescricaoReconhecida = eventos.find(
    (ev) => ev.data && CATEGORIAS_TERMINAL_PRESCRICAO.has(ev.categoria) && ev.confianca >= 0.7
  );
  if (eventoPrescricaoReconhecida) {
    return montarRespostaTerminal(processo, eventos, eventoPrescricaoReconhecida, "prescricao_ja_reconhecida", dataHoje);
  }

  const eventoExtincao = eventos.find(
    (ev) =>
      ev.data &&
      CATEGORIAS_TERMINAL_EXTINCAO.has(ev.categoria) &&
      ev.confianca >= 0.7 &&
      !/arquivamento\s+(?:provis|sem\s+baixa)/i.test(ev.textoBruto)
  );
  if (eventoExtincao) {
    return montarRespostaTerminal(processo, eventos, eventoExtincao, "extinta", dataHoje);
  }

  // ── Passo 1: Marco inicial da prescrição intercorrente ────────────────────
  // Preferência Tema 566: ciência da Fazenda após tentativa frustrada.
  // Se não houver ciência explícita, consideramos a própria tentativa (ciência ficta).
  const marcoInicial = detectarMarcoInicial(eventos);

  if (!marcoInicial || !marcoInicial.data) {
    return montarInconclusivo(processo.id, eventos, pontosIncerteza);
  }

  fundamentos.push(
    "Marco inicial: art. 40, caput, da LEF (Lei 6.830/80) c/c Tema 566/STJ (REsp 1.340.553-RS)."
  );

  // ── Passo 2: Atos úteis e inúteis posteriores ao marco ────────────────────
  const eventosAposMarco = eventos.filter(
    (ev) => ev.data && ev.data > marcoInicial.data! && ev.confianca >= 0.5
  );

  const atosUteis = eventosAposMarco.filter((ev) => CATEGORIAS_ATO_UTIL.has(ev.categoria));
  const atosInuteisIgnorados = eventosAposMarco.filter(
    (ev) => ev.categoria === "pedido_fazenda_sem_efeito"
  );

  if (atosInuteisIgnorados.length > 0) {
    fundamentos.push(
      "Tema 566/STJ: meras petições da Fazenda pedindo prosseguimento, sem indicar diligência concreta, não interrompem a prescrição."
    );
  }

  // O MARCO EFETIVO (zerador do cômputo) é o último ato útil, ou o próprio marco inicial
  let marcoEfetivo: EventoProcessual = marcoInicial;
  if (atosUteis.length > 0) {
    marcoEfetivo = atosUteis[atosUteis.length - 1];
    fundamentos.push(
      "Tema 566/STJ: ato útil (penhora/citação/constrição) zera o cômputo da prescrição intercorrente, reabrindo a contagem integral."
    );
  }

  const marcoEfetivData = marcoEfetivo.data!;
  const ultimoAtoUtil = atosUteis.length > 0 ? atosUteis[atosUteis.length - 1] : marcoInicial;

  // ── Passo 3: Parcelamentos (art. 151, VI, CTN) ────────────────────────────
  const suspensoesEspeciais = calcularSuspensoesParcelamento(eventos, dataHoje, pontosIncerteza);
  const temParcelamentoAtivo = suspensoesEspeciais.some(
    (s) => s.motivo.includes("ativo") && s.fim.getTime() >= dataHoje.getTime() - 86400000
  );
  if (suspensoesEspeciais.length > 0) {
    fundamentos.push(
      "Art. 151, VI, CTN: parcelamento suspende a exigibilidade do crédito — período descontado do cômputo."
    );
  }

  // ── Passo 4: Contagem de dias (com desconto dos parcelamentos) ────────────
  const diasBrutos = diffInDays(marcoEfetivData, dataHoje);
  let diasSuspensos = 0;
  for (const suspensao of suspensoesEspeciais) {
    const inicioEfetivo = suspensao.inicio > marcoEfetivData ? suspensao.inicio : marcoEfetivData;
    if (inicioEfetivo < dataHoje) {
      const fimEfetivo = suspensao.fim < dataHoje ? suspensao.fim : dataHoje;
      if (fimEfetivo > inicioEfetivo) {
        diasSuspensos += diffInDays(inicioEfetivo, fimEfetivo);
      }
    }
  }
  const diasTotaisContagem = Math.max(0, diasBrutos - diasSuspensos);

  // ── Passo 5: Determinação da fase ─────────────────────────────────────────
  const fase = determinarFase(diasTotaisContagem, temParcelamentoAtivo);

  // ── Passo 6: Score ────────────────────────────────────────────────────────
  const score = calcularScore(diasTotaisContagem, fase);

  // ── Passo 7: Data provável da prescrição e dias restantes ─────────────────
  const { dataProvavelPrescricao, diasAteProvavelPrescricao } = projetarPrescricao(
    marcoEfetivData,
    diasTotaisContagem,
    suspensoesEspeciais,
    dataHoje
  );

  // ── Passo 8: Pontos de incerteza ──────────────────────────────────────────
  for (const ev of eventos) {
    if (ev.confianca > 0 && ev.confianca < 0.60) {
      const texto =
        ev.textoBruto.length > 60 ? ev.textoBruto.slice(0, 60) + "…" : ev.textoBruto;
      pontosIncerteza.push(
        `Evento de baixa confiança (${(ev.confianca * 100).toFixed(0)}%): "${texto}"`
      );
    }
  }

  const eventosComData = eventos.filter((ev) => ev.data !== null);
  for (let i = 1; i < eventosComData.length; i++) {
    const gap = diffInDays(eventosComData[i - 1].data!, eventosComData[i].data!);
    if (gap > GAP_INCERTEZA_DIAS) {
      pontosIncerteza.push(
        `Lacuna de ${gap} dias sem movimentação entre ${formatDateBR(
          eventosComData[i - 1].data!
        )} e ${formatDateBR(eventosComData[i].data!)}.`
      );
    }
  }

  if (eventos.some((ev) => ev.categoria === "redirecionamento")) {
    pontosIncerteza.push(
      "Redirecionamento detectado — análise pode diferir por polo passivo. Para o sócio: Tema 444/STJ (prazo de 5 anos a partir da dissolução irregular)."
    );
    fundamentos.push(
      "Redirecionamento: art. 135 CTN + Súmula 435/STJ (dissolução irregular). Tema 444/STJ para contagem contra sócio."
    );
  }

  if (eventos.some((ev) => CATEGORIAS_SINALIZAM_ALERTA.has(ev.categoria))) {
    const alertas: string[] = [];
    if (eventos.some((ev) => ev.categoria === "embargos_executado"))
      alertas.push("embargos do executado (pode suspender execução conforme garantia)");
    if (eventos.some((ev) => ev.categoria === "excecao_pre_executividade"))
      alertas.push("exceção de pré-executividade em discussão (Súmula 393/STJ)");
    if (eventos.some((ev) => ev.categoria === "indicacao_bens"))
      alertas.push("indicação de bens pelo executado — verificar se afasta inércia");
    if (alertas.length > 0) {
      pontosIncerteza.push(`Sinalizações relevantes: ${alertas.join("; ")}.`);
    }
  }

  if (eventos.length < MIN_EVENTOS_INCERTEZA) {
    pontosIncerteza.push(
      `Histórico com apenas ${eventos.length} evento(s) — dados possivelmente incompletos.`
    );
  }

  // ── Passo 9: Confiança geral ──────────────────────────────────────────────
  const eventosChave = [marcoInicial, ...atosUteis].filter(Boolean) as EventoProcessual[];
  const confiancaMediaChave =
    eventosChave.length > 0
      ? eventosChave.reduce((s, ev) => s + ev.confianca, 0) / eventosChave.length
      : 0;
  const naoClassificados = eventos.filter((ev) => ev.categoria === "nao_classificado").length;
  const penalidade = eventos.length > 0 ? (naoClassificados / eventos.length) * 0.30 : 0;
  const confiancaGeral = Math.max(
    0,
    Math.round((confiancaMediaChave - penalidade) * 100) / 100
  );

  // ── Passo 10: Fundamentos, via, explicação ────────────────────────────────
  if (fase === "prescrita") {
    fundamentos.push("Art. 40, § 4º, LEF: decretação de ofício da prescrição intercorrente, após oitiva da Fazenda.");
  }
  if (fase === "suspensao_art40_p2") {
    fundamentos.push("Art. 40, § 2º, LEF: suspensão obrigatória de 1 ano antes do início do prazo prescricional.");
  }

  const viaSugerida = calcularViaSugerida(score, fase, pontosIncerteza.length, temParcelamentoAtivo);

  const explicacaoTextual = montarExplicacao({
    processo,
    score,
    fase,
    statusFinal: "ativa",
    confiancaGeral,
    marcoInicial,
    ultimoAtoUtil,
    marcoEfetivData,
    diasTotaisContagem,
    diasSuspensos,
    dataProvavelPrescricao,
    diasAteProvavelPrescricao,
    atosUteis,
    atosInuteisIgnorados,
    suspensoesEspeciais,
    pontosIncerteza,
    fundamentos,
    viaSugerida,
    dataHoje,
  });

  return {
    processoId: processo.id,
    score,
    fase,
    statusFinal: "ativa",
    confiancaGeral,
    marcoInicial,
    marcoInicialData: marcoInicial.data,
    ultimoAtoUtil,
    ultimoAtoUtilData: ultimoAtoUtil?.data ?? null,
    diasSemAtoUtil: diasTotaisContagem,
    diasTotaisContagem,
    prazoNecessario: PRAZO_TOTAL_DIAS,
    dataProvavelPrescricao,
    diasAteProvavelPrescricao,
    interrupcoes: atosUteis,
    atosInuteisIgnorados,
    suspensoesEspeciais,
    pontosIncerteza,
    fundamentosJuridicos: fundamentos,
    explicacaoTextual,
    viaSugerida,
  };
}

// ── Helpers privados ─────────────────────────────────────────────────────────

/**
 * Marco inicial conforme Tema 566/STJ.
 * Preferência: ciência da Fazenda APÓS primeira tentativa frustrada.
 * Fallback: a própria tentativa frustrada (ciência ficta).
 */
function detectarMarcoInicial(eventos: EventoProcessual[]): EventoProcessual | null {
  const comData = eventos.filter((ev) => ev.data && ev.confianca >= 0.5);

  // Procura primeira tentativa frustrada
  const primeiraTentativa = comData.find(
    (ev) =>
      ev.categoria === "tentativa_frustrada_localizacao" ||
      ev.categoria === "tentativa_frustrada_bens"
  );

  // Procura ciência da Fazenda APÓS a tentativa
  if (primeiraTentativa) {
    const cienciaApos = comData.find(
      (ev) => ev.categoria === "ciencia_fazenda" && ev.data! > primeiraTentativa.data!
    );
    if (cienciaApos) return cienciaApos;
  }

  // Prefere arquivamento art. 40 se existir (marco literal do §2º)
  const arquivamento = comData.find((ev) => ev.categoria === "arquivamento_art40");
  if (arquivamento) return arquivamento;

  // Fallback: primeira tentativa frustrada (ciência ficta)
  if (primeiraTentativa) return primeiraTentativa;

  // Último fallback: qualquer marco
  return comData.find((ev) => CATEGORIAS_MARCO.has(ev.categoria)) ?? null;
}

function calcularSuspensoesParcelamento(
  eventos: EventoProcessual[],
  dataHoje: Date,
  pontosIncerteza: string[]
): { inicio: Date; fim: Date; motivo: string }[] {
  const suspensoes: { inicio: Date; fim: Date; motivo: string }[] = [];
  const parcels = eventos.filter((ev) => ev.data && ev.categoria === "parcelamento");
  const rescisoes = eventos.filter(
    (ev) => ev.data && ev.categoria === "parcelamento_rescindido"
  );

  let j = 0;
  for (const parcel of parcels) {
    while (j < rescisoes.length && rescisoes[j].data! <= parcel.data!) j++;
    if (j < rescisoes.length) {
      const rescisao = rescisoes[j];
      j++;
      suspensoes.push({
        inicio: parcel.data!,
        fim: rescisao.data!,
        motivo: `Parcelamento encerrado em ${formatDateBR(rescisao.data!)}`,
      });
    } else {
      suspensoes.push({
        inicio: parcel.data!,
        fim: dataHoje,
        motivo: "Parcelamento ativo (sem rescisão detectada)",
      });
      pontosIncerteza.push(
        `Parcelamento iniciado em ${formatDateBR(parcel.data!)} sem rescisão detectada — verificar se ainda está vigente.`
      );
    }
  }
  return suspensoes;
}

function determinarFase(
  diasTotais: number,
  temParcelAtivo: boolean
): FasePrescricao {
  if (temParcelAtivo) return "parcelamento_ativo";
  if (diasTotais < 0) return "pre_marco";
  if (diasTotais < PRAZO_SUSPENSAO_DIAS) return "suspensao_art40_p2";
  if (diasTotais < PRAZO_TOTAL_DIAS) return "prescricao_em_curso";
  return "prescrita";
}

function calcularScore(diasTotais: number, fase: FasePrescricao): ScorePrescricao {
  if (fase === "parcelamento_ativo") return "sem_base";
  if (diasTotais >= SCORE_THRESHOLDS.forte) return "forte";
  if (diasTotais >= SCORE_THRESHOLDS.medio) return "medio";
  if (diasTotais >= SCORE_THRESHOLDS.fraco) return "fraco";
  return "sem_base";
}

function projetarPrescricao(
  _marcoEfetivo: Date,
  diasAtuais: number,
  _suspensoes: { inicio: Date; fim: Date; motivo: string }[],
  dataHoje: Date
): { dataProvavelPrescricao: Date | null; diasAteProvavelPrescricao: number | null } {
  const diasRestantes = PRAZO_TOTAL_DIAS - diasAtuais;
  if (diasRestantes <= 0) {
    // Já prescrito — calcula em que dia atingiu o prazo
    const diasExcedidos = Math.abs(diasRestantes);
    const dataPrescricao = new Date(dataHoje.getTime() - diasExcedidos * 86400000);
    return { dataProvavelPrescricao: dataPrescricao, diasAteProvavelPrescricao: 0 };
  }
  const dataPrescricao = new Date(dataHoje.getTime() + diasRestantes * 86400000);
  return {
    dataProvavelPrescricao: dataPrescricao,
    diasAteProvavelPrescricao: diasRestantes,
  };
}

function montarInconclusivo(
  processoId: string,
  eventos: EventoProcessual[],
  pontosIncerteza: string[]
): AnalisePrescricao {
  pontosIncerteza.push("Nenhum marco inicial identificado com confiança suficiente.");
  if (eventos.length < MIN_EVENTOS_INCERTEZA) {
    pontosIncerteza.push(
      `Histórico com apenas ${eventos.length} evento(s) — dados possivelmente incompletos.`
    );
  }
  return {
    processoId,
    score: "inconclusivo",
    fase: "indefinida",
    statusFinal: "ativa",
    confiancaGeral: 0,
    marcoInicial: null,
    marcoInicialData: null,
    ultimoAtoUtil: null,
    ultimoAtoUtilData: null,
    diasSemAtoUtil: null,
    diasTotaisContagem: 0,
    prazoNecessario: PRAZO_TOTAL_DIAS,
    dataProvavelPrescricao: null,
    diasAteProvavelPrescricao: null,
    interrupcoes: [],
    atosInuteisIgnorados: [],
    suspensoesEspeciais: [],
    pontosIncerteza,
    fundamentosJuridicos: [],
    explicacaoTextual:
      "SCORE: INCONCLUSIVO\n\nNenhum marco inicial identificado nos andamentos. Não é possível calcular o prazo prescricional.\n\nVIA SUGERIDA: Análise manual — revisar andamentos e verificar se há eventos não reconhecidos pelo sistema.\n\n⚠️ Análise automatizada. Não substitui parecer jurídico.",
    viaSugerida: "Análise manual necessária — nenhum marco inicial identificado.",
  };
}

function montarRespostaTerminal(
  processo: Processo,
  eventos: EventoProcessual[],
  eventoTerminal: EventoProcessual,
  status: StatusFinal,
  dataHoje: Date
): AnalisePrescricao {
  const marcoInicial = detectarMarcoInicial(eventos);
  const atosUteis = marcoInicial
    ? eventos.filter(
        (ev) =>
          ev.data &&
          ev.data > marcoInicial.data! &&
          CATEGORIAS_ATO_UTIL.has(ev.categoria) &&
          ev.confianca >= 0.5
      )
    : [];

  const resumo =
    status === "prescricao_ja_reconhecida"
      ? `Prescrição intercorrente já reconhecida em ${formatDateBR(eventoTerminal.data!)}. Processo encerrado com fundamento no art. 40, § 4º, da LEF.`
      : `Processo já extinto em ${formatDateBR(eventoTerminal.data!)} (não por prescrição intercorrente). Verificar fundamento da sentença.`;

  const via =
    status === "prescricao_ja_reconhecida"
      ? "Processo já teve prescrição reconhecida judicialmente — acompanhar eventual recurso da Fazenda."
      : "Processo extinto por outra causa — sem cabimento de peticionar prescrição intercorrente.";

  const fundamentos =
    status === "prescricao_ja_reconhecida"
      ? [
          "Art. 40, § 4º, LEF — prescrição intercorrente decretada.",
          "Tema 566/STJ — prazo quinquenal após o ano de suspensão.",
        ]
      : ["Extinção por causa diversa (pagamento/desistência/transação) — art. 924 CPC ou equivalente."];

  return {
    processoId: processo.id,
    score: status === "prescricao_ja_reconhecida" ? "forte" : "sem_base",
    fase: "indefinida",
    statusFinal: status,
    confiancaGeral: eventoTerminal.confianca,
    marcoInicial,
    marcoInicialData: marcoInicial?.data ?? null,
    ultimoAtoUtil: atosUteis[atosUteis.length - 1] ?? marcoInicial ?? null,
    ultimoAtoUtilData: atosUteis[atosUteis.length - 1]?.data ?? marcoInicial?.data ?? null,
    diasSemAtoUtil: null,
    diasTotaisContagem: 0,
    prazoNecessario: PRAZO_TOTAL_DIAS,
    dataProvavelPrescricao: null,
    diasAteProvavelPrescricao: null,
    interrupcoes: atosUteis,
    atosInuteisIgnorados: [],
    suspensoesEspeciais: [],
    pontosIncerteza: [],
    fundamentosJuridicos: fundamentos,
    explicacaoTextual: `STATUS FINAL: ${status === "prescricao_ja_reconhecida" ? "PRESCRIÇÃO JÁ RECONHECIDA" : "PROCESSO EXTINTO"}\n\n${resumo}\n\nVIA: ${via}\n\nData da análise: ${formatDateBR(dataHoje)}`,
    viaSugerida: via,
  };
}

function calcularViaSugerida(
  score: ScorePrescricao,
  fase: FasePrescricao,
  nIncertezas: number,
  temParcelAtivo: boolean
): string {
  if (temParcelAtivo) {
    return "Parcelamento ativo suspende a exigibilidade (art. 151, VI, CTN). Monitorar eventual rescisão para reabrir a contagem.";
  }
  if (fase === "prescrita") {
    if (nIncertezas === 0) {
      return "Petição de extinção por prescrição intercorrente (art. 40, §4º, LEF) — indícios sólidos. Requerer oitiva prévia da Fazenda.";
    }
    if (nIncertezas <= 2) {
      return "Exceção de pré-executividade (Súmula 393/STJ) — revisar pontos de incerteza antes de peticionar.";
    }
    return "Prescrição aparentemente consumada, mas com múltiplas incertezas — revisão manual antes de peticionar.";
  }
  if (fase === "prescricao_em_curso") {
    if (score === "medio") {
      return "Prescrição em curso — faltam menos de 2 anos. Preparar peça e monitorar ausência de novos atos úteis.";
    }
    return "Prescrição em curso — continuar monitorando mensalmente.";
  }
  if (fase === "suspensao_art40_p2") {
    return "Ainda no 1 ano de suspensão do art. 40, §2º, LEF — prescrição intercorrente ainda não iniciou.";
  }
  return "Sem base suficiente — verificar se execução é recente ou se faltam andamentos.";
}

interface DadosExplicacao {
  processo: Processo;
  score: ScorePrescricao;
  fase: FasePrescricao;
  statusFinal: StatusFinal;
  confiancaGeral: number;
  marcoInicial: EventoProcessual;
  ultimoAtoUtil: EventoProcessual | null;
  marcoEfetivData: Date;
  diasTotaisContagem: number;
  diasSuspensos: number;
  dataProvavelPrescricao: Date | null;
  diasAteProvavelPrescricao: number | null;
  atosUteis: EventoProcessual[];
  atosInuteisIgnorados: EventoProcessual[];
  suspensoesEspeciais: { inicio: Date; fim: Date; motivo: string }[];
  pontosIncerteza: string[];
  fundamentos: string[];
  viaSugerida: string;
  dataHoje: Date;
}

function montarExplicacao(d: DadosExplicacao): string {
  const SCORE_LABEL: Record<ScorePrescricao, string> = {
    forte: "FORTE",
    medio: "MODERADO",
    fraco: "FRACO",
    sem_base: "SEM BASE",
    inconclusivo: "INCONCLUSIVO",
  };
  const FASE_LABEL: Record<FasePrescricao, string> = {
    pre_marco: "Pré-marco",
    suspensao_art40_p2: "Suspensão do art. 40, §2º LEF (1 ano)",
    prescricao_em_curso: "Prescrição intercorrente em curso (5 anos)",
    prescrita: "Prescrição consumada",
    parcelamento_ativo: "Parcelamento ativo (exigibilidade suspensa)",
    indefinida: "Indefinida",
  };

  const valorFormatado =
    d.processo.valorCausa != null
      ? d.processo.valorCausa.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
      : "não informado";

  const dist = d.processo.dataDistribuicao
    ? formatDateBR(d.processo.dataDistribuicao)
    : "não informada";

  const diasFaltam = d.diasAteProvavelPrescricao ?? 0;
  const statusPrazo =
    diasFaltam <= 0
      ? `prazo ultrapassado${d.dataProvavelPrescricao ? ` — consumada em ${formatDateBR(d.dataProvavelPrescricao)}` : ""}`
      : `faltam ${diasFaltam.toLocaleString("pt-BR")} dias${d.dataProvavelPrescricao ? ` (prevista para ${formatDateBR(d.dataProvavelPrescricao)})` : ""}`;

  const marcoTexto =
    d.marcoInicial.textoBruto.length > 100
      ? d.marcoInicial.textoBruto.slice(0, 100) + "…"
      : d.marcoInicial.textoBruto;

  const linhasAtosUteis =
    d.atosUteis.length === 0
      ? "Nenhum ato útil detectado após o marco."
      : d.atosUteis
          .map((ev, idx) => {
            const t = ev.textoBruto.length > 80 ? ev.textoBruto.slice(0, 80) + "…" : ev.textoBruto;
            return `  ${idx + 1}. [${ev.data ? formatDateBR(ev.data) : "s/d"}] ${t}`;
          })
          .join("\n");

  const linhasInuteis =
    d.atosInuteisIgnorados.length === 0
      ? "Nenhum."
      : d.atosInuteisIgnorados
          .map((ev) => {
            const t = ev.textoBruto.length > 80 ? ev.textoBruto.slice(0, 80) + "…" : ev.textoBruto;
            return `  - [${ev.data ? formatDateBR(ev.data) : "s/d"}] ${t}`;
          })
          .join("\n");

  const linhasParcelamentos =
    d.suspensoesEspeciais.length === 0
      ? "Nenhum."
      : d.suspensoesEspeciais
          .map(
            (s, idx) =>
              `  ${idx + 1}. ${formatDateBR(s.inicio)} → ${formatDateBR(s.fim)} — ${s.motivo}`
          )
          .join("\n");

  const linhasIncerteza =
    d.pontosIncerteza.length === 0
      ? "Nenhuma incerteza identificada."
      : d.pontosIncerteza.map((p) => `  - ${p}`).join("\n");

  const linhasFundamentos =
    d.fundamentos.length === 0
      ? "—"
      : d.fundamentos.map((f) => `  • ${f}`).join("\n");

  return `SCORE: ${SCORE_LABEL[d.score]} (confiança ${(d.confiancaGeral * 100).toFixed(0)}%)
FASE: ${FASE_LABEL[d.fase]}

Execução fiscal ajuizada em ${dist} por ${d.processo.exequente || "exequente não informado"} contra ${d.processo.executado || "executado não informado"}.
Valor: ${valorFormatado}. Último ato útil: ${d.ultimoAtoUtil?.data ? formatDateBR(d.ultimoAtoUtil.data) : "não identificado"}.

MARCO INICIAL IDENTIFICADO:
  [${formatDateBR(d.marcoInicial.data!)}] ${marcoTexto}
  → Categoria: ${d.marcoInicial.categoria} | Efeito: ${d.marcoInicial.efeitoJuridico} | Confiança: ${(d.marcoInicial.confianca * 100).toFixed(0)}%

CONTAGEM:
  Marco efetivo: ${formatDateBR(d.marcoEfetivData)}
  Prazo total: ${PRAZO_TOTAL_DIAS.toLocaleString("pt-BR")} dias (${PRAZO_SUSPENSAO_DIAS} suspensão + ${PRAZO_PRESCRICAO_DIAS} prescrição)
  Dias computados: ${d.diasTotaisContagem.toLocaleString("pt-BR")}${d.diasSuspensos > 0 ? ` (descontados ${d.diasSuspensos.toLocaleString("pt-BR")} dias de parcelamento)` : ""}
  Status: ${statusPrazo}

ATOS ÚTEIS (zeram o cômputo — Tema 566/STJ):
${linhasAtosUteis}

ATOS INÚTEIS IGNORADOS (meros pedidos da Fazenda — Tema 566/STJ):
${linhasInuteis}

PARCELAMENTOS (períodos descontados — art. 151 VI CTN):
${linhasParcelamentos}

ATENÇÃO:
${linhasIncerteza}

FUNDAMENTOS APLICADOS:
${linhasFundamentos}

VIA SUGERIDA: ${d.viaSugerida}

Data da análise: ${formatDateBR(d.dataHoje)}
⚠️ Análise automatizada com base nos andamentos. Não substitui parecer jurídico. Verifique os marcos nos autos.`;
}
