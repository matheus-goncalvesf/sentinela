import { SCORE_THRESHOLDS, GAP_INCERTEZA_DIAS, MIN_EVENTOS_INCERTEZA } from "./constants";
import { classificarEvento } from "./classificadorRegras";
import { diffInDays, formatDateBR } from "./dateUtils";
import type { AnalisePrescricao, EventoProcessual, Processo, ScorePrescricao } from "./types";

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const CATEGORIAS_MARCO = new Set([
  "ciencia_fazenda",
  "tentativa_frustrada_localizacao",
  "tentativa_frustrada_bens",
  "arquivamento_art40",
]);

const CATEGORIAS_INTERRUPCAO = new Set([
  "constricao_positiva",
  "citacao_valida",
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

  return processados.sort((a, b) => {
    if (!a.data && !b.data) return 0;
    if (!a.data) return 1;
    if (!b.data) return -1;
    return a.data.getTime() - b.data.getTime();
  });
}

/**
 * Analisa um processo e retorna o diagnóstico de prescrição intercorrente.
 * dataHoje é injetável para facilitar testes determinísticos.
 */
export function analisarPrescricao(
  processo: Processo,
  dataHoje: Date = new Date()
): AnalisePrescricao {
  const eventosOrdenados = [...processo.eventos].sort((a, b) => {
    if (!a.data && !b.data) return 0;
    if (!a.data) return 1;
    if (!b.data) return -1;
    return a.data.getTime() - b.data.getTime();
  });

  const pontosIncerteza: string[] = [];

  // ── Passo 1: Marco inicial ────────────────────────────────────────────────
  const marcoInicial: EventoProcessual | null =
    eventosOrdenados.find(
      (ev) => ev.data !== null && ev.confianca >= 0.5 && CATEGORIAS_MARCO.has(ev.categoria)
    ) ?? null;

  if (!marcoInicial || !marcoInicial.data) {
    return montarInconclusivo(processo.id, eventosOrdenados, pontosIncerteza, dataHoje);
  }

  // ── Passo 2: Interrupções após o marco ────────────────────────────────────
  const interrupcoes: EventoProcessual[] = eventosOrdenados.filter(
    (ev) =>
      ev.data !== null &&
      ev.confianca >= 0.5 &&
      CATEGORIAS_INTERRUPCAO.has(ev.categoria) &&
      ev.data > marcoInicial.data!
  );

  let marcoEfetivData: Date = marcoInicial.data;
  let ultimoAtoUtil: EventoProcessual | null = marcoInicial;

  if (interrupcoes.length > 0) {
    const ultima = interrupcoes[interrupcoes.length - 1];
    marcoEfetivData = ultima.data!;
    ultimoAtoUtil = ultima;
  }

  // ── Passo 3: Parcelamentos ────────────────────────────────────────────────
  const suspensoesEspeciais: { inicio: Date; fim: Date }[] = [];
  const soParcels = eventosOrdenados.filter(
    (ev) => ev.data !== null && ev.categoria === "parcelamento"
  );
  const soRescisoes = eventosOrdenados.filter(
    (ev) => ev.data !== null && ev.categoria === "parcelamento_rescindido"
  );

  // Ponteiro de rescisões: cada rescisão só é consumida por um parcelamento (o primeiro após ela)
  let j = 0;
  for (const parcel of soParcels) {
    // Avança ponteiro para a primeira rescisão cronologicamente após este parcelamento
    while (j < soRescisoes.length && soRescisoes[j].data! <= parcel.data!) {
      j++;
    }
    if (j < soRescisoes.length) {
      const rescisao = soRescisoes[j];
      j++; // Consome esta rescisão — não estará disponível para o próximo parcelamento
      suspensoesEspeciais.push({ inicio: parcel.data!, fim: rescisao.data! });
      pontosIncerteza.push(
        `Parcelamento de ${formatDateBR(parcel.data!)} a ${formatDateBR(rescisao.data!)} considerado como suspensão especial.`
      );
    } else {
      // Parcelamento ativo: suspensão até hoje
      suspensoesEspeciais.push({ inicio: parcel.data!, fim: dataHoje });
      pontosIncerteza.push(
        `Parcelamento iniciado em ${formatDateBR(parcel.data!)} sem rescisão detectada — suspensão ativa considerada até hoje. Verifique se ainda está vigente.`
      );
    }
  }

  // ── Passo 4: Cálculo de dias ──────────────────────────────────────────────
  const diasBrutos = diffInDays(marcoEfetivData, dataHoje);

  let diasSuspensos = 0;
  for (const suspensao of suspensoesEspeciais) {
    // Desconta apenas o período após o marco efetivo
    const inicioEfetivo = suspensao.inicio > marcoEfetivData ? suspensao.inicio : marcoEfetivData;
    if (inicioEfetivo < dataHoje) {
      diasSuspensos += diffInDays(inicioEfetivo, suspensao.fim < dataHoje ? suspensao.fim : dataHoje);
    }
  }

  const diasTotaisContagem = Math.max(0, diasBrutos - diasSuspensos);

  // ── Passo 5: Score ────────────────────────────────────────────────────────
  let score: ScorePrescricao;
  if (diasTotaisContagem >= SCORE_THRESHOLDS.forte) {
    score = "forte";
  } else if (diasTotaisContagem >= SCORE_THRESHOLDS.medio) {
    score = "medio";
  } else if (diasTotaisContagem >= SCORE_THRESHOLDS.fraco) {
    score = "fraco";
  } else {
    score = "sem_base";
  }

  // ── Passo 6: Pontos de incerteza adicionais ───────────────────────────────
  for (const ev of eventosOrdenados) {
    if (ev.confianca > 0 && ev.confianca < 0.60) {
      const texto = ev.textoBruto.length > 60
        ? ev.textoBruto.slice(0, 60) + "…"
        : ev.textoBruto;
      pontosIncerteza.push(`Evento de baixa confiança (${(ev.confianca * 100).toFixed(0)}%): "${texto}"`);
    }
  }

  const eventosComData = eventosOrdenados.filter((ev) => ev.data !== null);
  for (let j = 1; j < eventosComData.length; j++) {
    const gap = diffInDays(eventosComData[j - 1].data!, eventosComData[j].data!);
    if (gap > GAP_INCERTEZA_DIAS) {
      pontosIncerteza.push(
        `Lacuna de ${gap} dias sem movimentação entre ${formatDateBR(eventosComData[j - 1].data!)} e ${formatDateBR(eventosComData[j].data!)}.`
      );
    }
  }

  if (eventosOrdenados.some((ev) => ev.categoria === "redirecionamento")) {
    pontosIncerteza.push(
      "Redirecionamento detectado — a análise pode diferir por polo passivo. Verifique a situação de cada executado."
    );
  }

  if (eventosOrdenados.length < MIN_EVENTOS_INCERTEZA) {
    pontosIncerteza.push(
      `Histórico com apenas ${eventosOrdenados.length} evento(s) — dados possivelmente incompletos.`
    );
  }

  // ── Passo 7: Confiança geral ──────────────────────────────────────────────
  const eventosChave = [marcoInicial, ...interrupcoes].filter(Boolean) as EventoProcessual[];
  const confiancaMediaChave =
    eventosChave.length > 0
      ? eventosChave.reduce((s, ev) => s + ev.confianca, 0) / eventosChave.length
      : 0;

  const totalEventos = eventosOrdenados.length;
  const naoClassificados = eventosOrdenados.filter((ev) => ev.categoria === "nao_classificado").length;
  const penalidade = totalEventos > 0 ? (naoClassificados / totalEventos) * 0.30 : 0;
  const confiancaGeral = Math.max(0, Math.round((confiancaMediaChave - penalidade) * 100) / 100);

  // ── Passo 8: Via sugerida ─────────────────────────────────────────────────
  const nIncertezas = pontosIncerteza.length;
  const viaSugerida = calcularViaSugerida(score, nIncertezas);

  // ── Passo 9: Explicação textual ───────────────────────────────────────────
  const explicacaoTextual = montarExplicacao({
    processo,
    score,
    confiancaGeral,
    marcoInicial,
    ultimoAtoUtil,
    marcoEfetivData,
    diasTotaisContagem,
    interrupcoes,
    suspensoesEspeciais,
    pontosIncerteza,
    viaSugerida,
    dataHoje,
  });

  return {
    processoId: processo.id,
    score,
    confiancaGeral,
    marcoInicial,
    marcoInicialData: marcoInicial.data,
    ultimoAtoUtil,
    ultimoAtoUtilData: ultimoAtoUtil?.data ?? null,
    diasSemAtoUtil: diasTotaisContagem,
    diasTotaisContagem,
    prazoNecessario: SCORE_THRESHOLDS.forte,
    interrupcoes,
    suspensoesEspeciais,
    pontosIncerteza,
    explicacaoTextual,
    viaSugerida,
  };
}

// ── Helpers privados ─────────────────────────────────────────────────────────

function montarInconclusivo(
  processoId: string,
  eventos: EventoProcessual[],
  pontosIncerteza: string[],
  _dataHoje: Date
): AnalisePrescricao {
  pontosIncerteza.push("Nenhum marco inicial identificado com confiança suficiente.");
  if (eventos.length < MIN_EVENTOS_INCERTEZA) {
    pontosIncerteza.push(`Histórico com apenas ${eventos.length} evento(s) — dados possivelmente incompletos.`);
  }
  return {
    processoId,
    score: "inconclusivo",
    confiancaGeral: 0,
    marcoInicial: null,
    marcoInicialData: null,
    ultimoAtoUtil: null,
    ultimoAtoUtilData: null,
    diasSemAtoUtil: null,
    diasTotaisContagem: 0,
    prazoNecessario: SCORE_THRESHOLDS.forte,
    interrupcoes: [],
    suspensoesEspeciais: [],
    pontosIncerteza,
    explicacaoTextual: "SCORE: INCONCLUSIVO\n\nNenhum marco inicial identificado nos andamentos. Não é possível calcular o prazo prescricional.\n\nVIA SUGERIDA: Análise manual necessária — revisar andamentos e verificar se há eventos não reconhecidos pelo sistema.\n\n⚠️ Análise automatizada. Não substitui parecer jurídico.",
    viaSugerida: "Análise manual necessária — nenhum marco inicial identificado.",
  };
}

function calcularViaSugerida(score: ScorePrescricao, nIncertezas: number): string {
  switch (score) {
    case "forte":
      if (nIncertezas === 0) {
        return "Petição de extinção por prescrição intercorrente (art. 40 §4 LEF) — indícios sólidos.";
      } else if (nIncertezas <= 2) {
        return "Exceção de pré-executividade (EPE) — revisar pontos de incerteza antes de peticionar.";
      } else {
        return "Sinais de prescrição forte, mas múltiplas incertezas — revisão manual detalhada recomendada antes de peticionar.";
      }
    case "medio":
      return "Prescrição em desenvolvimento — acompanhar nos próximos meses e reavaliar ao atingir o prazo.";
    case "fraco":
      return "Indícios iniciais de prescrição — continuar monitorando o processo.";
    case "sem_base":
      return "Sem base suficiente para análise — dados insuficientes ou execução muito recente.";
    case "inconclusivo":
      return "Análise manual necessária — nenhum marco inicial identificado.";
  }
}

interface DadosExplicacao {
  processo: Processo;
  score: ScorePrescricao;
  confiancaGeral: number;
  marcoInicial: EventoProcessual;
  ultimoAtoUtil: EventoProcessual | null;
  marcoEfetivData: Date;
  diasTotaisContagem: number;
  interrupcoes: EventoProcessual[];
  suspensoesEspeciais: { inicio: Date; fim: Date }[];
  pontosIncerteza: string[];
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

  const valorFormatado = d.processo.valorCausa != null
    ? d.processo.valorCausa.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : "não informado";

  const dist = d.processo.dataDistribuicao
    ? formatDateBR(d.processo.dataDistribuicao)
    : "não informada";

  const prazoTotal = SCORE_THRESHOLDS.forte;
  const diasFaltam = prazoTotal - d.diasTotaisContagem;
  const statusPrazo = diasFaltam <= 0
    ? `prazo ultrapassado em ${Math.abs(diasFaltam).toLocaleString("pt-BR")} dias`
    : `faltam ${diasFaltam.toLocaleString("pt-BR")} dias`;

  const marcoTexto = d.marcoInicial.textoBruto.length > 100
    ? d.marcoInicial.textoBruto.slice(0, 100) + "…"
    : d.marcoInicial.textoBruto;

  const linhasInterrupcoes = d.interrupcoes.length === 0
    ? "Nenhuma interrupção detectada."
    : d.interrupcoes.map((ev, idx) => {
        const t = ev.textoBruto.length > 80 ? ev.textoBruto.slice(0, 80) + "…" : ev.textoBruto;
        return `  ${idx + 1}. [${ev.data ? formatDateBR(ev.data) : "s/d"}] ${t}`;
      }).join("\n");

  const linhasParcelamentos = d.suspensoesEspeciais.length === 0
    ? "Nenhum."
    : d.suspensoesEspeciais.map((s, idx) =>
        `  ${idx + 1}. ${formatDateBR(s.inicio)} → ${formatDateBR(s.fim)}`
      ).join("\n");

  const linhasIncerteza = d.pontosIncerteza.length === 0
    ? "Nenhuma incerteza identificada."
    : d.pontosIncerteza.map((p) => `  - ${p}`).join("\n");

  return `SCORE: ${SCORE_LABEL[d.score]} (confiança ${(d.confiancaGeral * 100).toFixed(0)}%)

Execução fiscal ajuizada em ${dist} por ${d.processo.exequente || "exequente não informado"} contra ${d.processo.executado || "executado não informado"}.
Valor: ${valorFormatado}. Último ato útil: ${d.ultimoAtoUtil?.data ? formatDateBR(d.ultimoAtoUtil.data) : "não identificado"}.

MARCO INICIAL IDENTIFICADO:
  [${formatDateBR(d.marcoInicial.data!)}] ${marcoTexto}
  → Categoria: ${d.marcoInicial.categoria} | Efeito: ${d.marcoInicial.efeitoJuridico} | Confiança: ${(d.marcoInicial.confianca * 100).toFixed(0)}%

CONTAGEM:
  Marco efetivo: ${formatDateBR(d.marcoEfetivData)}
  Prazo total necessário: ${prazoTotal.toLocaleString("pt-BR")} dias (1 ano suspensão + 5 anos prescrição)
  Dias decorridos: ${d.diasTotaisContagem.toLocaleString("pt-BR")}
  Status: ${statusPrazo}

INTERRUPÇÕES:
${linhasInterrupcoes}

PARCELAMENTOS (períodos descontados):
${linhasParcelamentos}

ATENÇÃO:
${linhasIncerteza}

VIA SUGERIDA: ${d.viaSugerida}

Data da análise: ${formatDateBR(d.dataHoje)}
⚠️ Análise automatizada. Não substitui parecer jurídico. Verifique os marcos nos autos.`;
}
