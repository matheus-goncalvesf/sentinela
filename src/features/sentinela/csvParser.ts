import { parseDate } from "./dateUtils";
import type { EventoProcessual, Processo } from "./types";

interface EventoBruto {
  data: Date | null;
  textoBruto: string;
}

interface ProcessoBruto {
  numeroCnj: string;
  tribunal: string;
  vara: string;
  comarca: string;
  classe: string;
  valorCausa: number | null;
  dataDistribuicao: Date | null;
  exequente: string;
  executado: string;
  cnpjExecutado: string;
  eventos: EventoBruto[];
}

/** Remove acentos e converte para lowercase para comparação de cabeçalhos. */
function normalizeHeader(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/[^a-z0-9]/g, "")     // remove tudo que não é letra ou número
    .trim();
}

/** Detecta o separador mais frequente nas primeiras linhas, buscando consistência. */
function detectSeparator(lines: string[]): string {
  const separators = [";", ",", "\t"];
  const sample = lines.slice(0, 10); // olha até 10 linhas

  const scores = separators.map(sep => {
    // Conta quantas vezes o separador aparece em cada linha
    const counts = sample.map(line => (line.split(sep).length - 1));
    // O score é a média de ocorrências, mas penalizamos se variar muito (baixa consistência)
    const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
    if (avg < 1) return { sep, score: 0 };

    // Calcula desvio padrão simples para verificar consistência
    const variance = counts.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / counts.length;
    const consistency = 1 / (1 + variance);

    return { sep, score: avg * consistency };
  });

  return scores.sort((a, b) => b.score - a.score)[0].sep || ";";
}

/** Divide uma linha CSV respeitando aspas. */
function splitCsvLine(line: string, sep: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (!inQuotes && line.slice(i, i + sep.length) === sep) {
      result.push(current.trim());
      current = "";
      i += sep.length - 1;
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

/** Mapeia aliases de nomes de coluna para chaves internas. */
const COLUMN_ALIASES: Record<string, string> = {
  // Número do processo
  numerocnj: "numeroCnj",
  numeroprocesso: "numeroCnj",
  processo: "numeroCnj",
  cnj: "numeroCnj",
  numproc: "numeroCnj",
  "numero": "numeroCnj",

  // Tribunal
  tribunal: "tribunal",
  instancia: "tribunal",
  orgao: "tribunal",

  // Vara
  vara: "vara",
  juizo: "vara",
  varacomarca: "vara",
  unidadejudiciaria: "vara",

  // Comarca
  comarca: "comarca",
  cidade: "comarca",
  foro: "comarca",

  // Classe
  classe: "classe",
  classeprocessual: "classe",
  procedimento: "classe",
  tipoacao: "classe",

  // Valor
  valor: "valorCausa",
  valorcausa: "valorCausa",
  valordacausa: "valorCausa",
  valordodebito: "valorCausa",
  valordaexecucao: "valorCausa",
  valorprincipal: "valorCausa",
  valorr: "valorCausa", // De "Valor (R$)"
  valordacausar: "valorCausa", // De "Valor da Causa (R$)"
  valororiginal: "valorCausa",
  valortotal: "valorCausa",
  importancia: "valorCausa",
  quantum: "valorCausa",
  valoratualizado: "valorCausa",
  valordivida: "valorCausa",
  valorconsolidado: "valorCausa",
  valorintegral: "valorCausa",
  total: "valorCausa",
  debito: "valorCausa",
  saldodevedor: "valorCausa",

  // Data de distribuição
  datadistribuicao: "dataDistribuicao",
  dataajuizamento: "dataDistribuicao",
  distribuicao: "dataDistribuicao",
  datainicial: "dataDistribuicao",
  dataentrada: "dataDistribuicao",

  // Exequente
  exequente: "exequente",
  poloativo: "exequente",
  autor: "exequente",
  credor: "exequente",
  requerente: "exequente",
  padv: "exequente",

  // Executado
  executado: "executado",
  executados: "executado",
  executadosr: "executado", // De "Executado(s)"
  polopassivo: "executado",
  reu: "executado",
  partepassiva: "executado",
  devedor: "executado",
  requerido: "executado",
  padvpassivo: "executado",
  executadodevedor: "executado",
  nomedoexecutado: "executado",
  nomereu: "executado",
  nomedevedor: "executado",
  sujeitopassivo: "executado",
  apelado: "executado",
  impugnado: "executado",
  executada: "executado",
  re: "executado",

  // CNPJ executado
  cnpj: "cnpjExecutado",
  cnpjexecutado: "cnpjExecutado",
  cpfcnpj: "cnpjExecutado",
  doc: "cnpjExecutado",
  documento: "cnpjExecutado",

  // Data do evento
  datamovimento: "dataEvento",
  dataandamento: "dataEvento",
  dataevento: "dataEvento",
  data: "dataEvento",
  datamovto: "dataEvento",
  dtmov: "dataEvento",

  // Texto do evento
  textomovimento: "textoEvento",
  movimentacao: "textoEvento",
  descricao: "textoEvento",
  andamento: "textoEvento",
  texto: "textoEvento",
  textoevento: "textoEvento",
  movimento: "textoEvento",
  resumo: "textoEvento",
};

/** Classifica se o processo é uma execução fiscal pelos metadados. */
function classificarExecucaoFiscal(classe: string, exequente: string): boolean {
  const c = normalizeHeader(classe);
  const e = normalizeHeader(exequente);
  if (/execucaofiscal/.test(c)) return true;
  if (/\b(fazenda|pgfn|procuradoria|municipio|estado|uniao|municipio)\b/.test(e)) return true;
  return false;
}

/** Faz parse de valor monetário (aceita R$ e vírgula decimal). */
function parseValor(raw: string): number | null {
  if (!raw) return null;
  // Remove tudo que não é dígito, vírgula ou ponto
  // Mas antes remove o prefixo R$ e espaços
  let s = raw.replace(/R\$/g, "").trim();

  // Se contiver vírgula e ponto, assumimos BR (dot = thousands, comma = decimal)
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  }
  // Se contiver apenas vírgula, trocamos por ponto
  else if (s.includes(",")) {
    s = s.replace(",", ".");
  }

  // Remove caracteres residuais exceto dígitos, ponto e sinal de menos
  s = s.replace(/[^0-9.\-]/g, "");

  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

/**
 * Faz parse de um CSV de processos/andamentos.
 * Retorna processos com eventos brutos (sem classificação — essa etapa fica em UploadProcessos).
 *
 * Estrutura esperada: flat (uma linha por evento), com numeroCnj repetido.
 * Colunas identificadas por aliases case-insensitive e sem acentos.
 */
export function parseSentinelaCSV(
  buffer: ArrayBuffer
): { processos: Processo[]; avisos: string[] } {
  // ── Decodificação ──────────────────────────────────────────────────────────
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    text = new TextDecoder("iso-8859-1").decode(buffer);
  }

  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    throw new Error("CSV vazio ou sem dados além do cabeçalho.");
  }

  // ── Separador e cabeçalho ──────────────────────────────────────────────────
  const sep = detectSeparator(lines);
  const headerRaw = splitCsvLine(lines[0], sep);
  const header = headerRaw.map(normalizeHeader);

  // Mapeia índice da coluna para chave interna
  const colMap: Record<string, number> = {};
  for (let i = 0; i < header.length; i++) {
    const key = COLUMN_ALIASES[header[i]];
    if (key && !(key in colMap)) {
      colMap[key] = i;
    }
  }

  // FALLBACK: Se colunas essenciais não foram encontradas pelo alias exato, tenta busca parcial
  for (let i = 0; i < header.length; i++) {
    const h = header[i];

    if (!colMap["numeroCnj"] && (h.includes("cnj") || h.includes("processo") || h.includes("numero"))) {
      colMap["numeroCnj"] = i;
    }
    if (!colMap["valorCausa"] && (h.includes("valor") || h.includes("quantum") || h.includes("debito") || h.includes("causa"))) {
      colMap["valorCausa"] = i;
    }
    if (!colMap["executado"] && (h.includes("executad") || h.includes("reu") || h.includes("passivo") || h.includes("devedor"))) {
      colMap["executado"] = i;
    }
    if (!colMap["exequente"] && (h.includes("exequente") || h.includes("autor") || h.includes("ativo") || h.includes("credor"))) {
      colMap["exequente"] = i;
    }
    if (!colMap["textoEvento"] && (h.includes("texto") || h.includes("movimento") || h.includes("andamento") || h.includes("descricao") || h.includes("historico"))) {
      colMap["textoEvento"] = i;
    }
    if (!colMap["dataEvento"] && (h.includes("data") || h.includes("dt") || h.includes("movimento") || h.includes("evento")) && !h.includes("distribuicao")) {
      // Evita pegar data de distribuição se estiver procurando data do evento
      if (!colMap["dataEvento"]) colMap["dataEvento"] = i;
    }
  }

  const avisos: string[] = [];

  if (!("numeroCnj" in colMap) || !("textoEvento" in colMap)) {
    const colunasEncontradas = headerRaw.join(", ");
    throw new Error(
      `Colunas essenciais não encontradas. \n` +
      `Separador utilizado: "${sep}" \n` +
      `Detectamos: [${colunasEncontradas}]. \n` +
      `Certifique-se de que o CSV tem colunas para 'numero_cnj' e 'texto_evento'.`
    );
  }

  // ── Leitura das linhas ────────────────────────────────────────────────────
  const processosMap = new Map<string, ProcessoBruto>();
  let linhasIgnoradas = 0;

  for (let lineIdx = 1; lineIdx < lines.length; lineIdx++) {
    const cols = splitCsvLine(lines[lineIdx], sep);
    const get = (key: string): string =>
      colMap[key] !== undefined ? (cols[colMap[key]] ?? "").trim() : "";

    const numeroCnj = get("numeroCnj");
    if (!numeroCnj) {
      linhasIgnoradas++;
      continue;
    }

    const textoEvento = get("textoEvento");
    if (!textoEvento) {
      linhasIgnoradas++;
      continue;
    }

    if (!processosMap.has(numeroCnj)) {
      const classe = get("classe");
      const exequente = get("exequente");
      processosMap.set(numeroCnj, {
        numeroCnj,
        tribunal: get("tribunal"),
        vara: get("vara"),
        comarca: get("comarca"),
        classe,
        valorCausa: parseValor(get("valorCausa")),
        dataDistribuicao: parseDate(get("dataDistribuicao")),
        exequente,
        executado: get("executado"),
        cnpjExecutado: get("cnpjExecutado"),
        eventos: [],
      });
    }

    const p = processosMap.get(numeroCnj)!;
    const dataEvento = parseDate(get("dataEvento"));
    if (!dataEvento && get("dataEvento")) {
      avisos.push(
        `Linha ${lineIdx + 1}: data "${get("dataEvento")}" não reconhecida — evento adicionado sem data.`
      );
    }

    p.eventos.push({ data: dataEvento, textoBruto: textoEvento });
  }

  if (linhasIgnoradas > 0) {
    avisos.push(`${linhasIgnoradas} linha(s) ignoradas por falta de número do processo ou texto do andamento.`);
  }

  if (processosMap.size === 0) {
    throw new Error("Nenhum processo encontrado no arquivo. Verifique o formato do CSV.");
  }

  // ── Montar Processo[] com eventos brutos (sem classificação) ──────────────
  function generateId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  const processos: Processo[] = Array.from(processosMap.values()).map((pb) => ({
    id: generateId(),
    numeroCnj: pb.numeroCnj,
    tribunal: pb.tribunal,
    vara: pb.vara,
    comarca: pb.comarca,
    classe: pb.classe,
    valorCausa: pb.valorCausa,
    dataDistribuicao: pb.dataDistribuicao,
    exequente: pb.exequente,
    executado: pb.executado,
    cnpjExecutado: pb.cnpjExecutado,
    isExecucaoFiscal: classificarExecucaoFiscal(pb.classe, pb.exequente),
    // Eventos brutos sem classificação — serão processados pelo motor
    eventos: pb.eventos.map((ev) => ({
      id: generateId(),
      data: ev.data,
      textoBruto: ev.textoBruto,
      categoria: "nao_classificado" as const,
      efeitoJuridico: "incerto" as const,
      confianca: 0,
      padraoMatched: null,
    })) as EventoProcessual[],
    modoEntrada: "csv" as const,
  }));

  return { processos, avisos };
}
