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
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/** Detecta o separador mais frequente nas primeiras 5 linhas de dados. */
function detectSeparator(lines: string[]): string {
  const sample = lines.slice(0, 6).join("\n");
  const counts = {
    ";": (sample.match(/;/g) ?? []).length,
    ",": (sample.match(/,/g) ?? []).length,
    "\t": (sample.match(/\t/g) ?? []).length,
  };
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
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
  numero_cnj: "numeroCnj",
  numerocnj: "numeroCnj",
  numero_processo: "numeroCnj",
  numeroprocesso: "numeroCnj",
  processo: "numeroCnj",
  cnj: "numeroCnj",
  // Tribunal
  tribunal: "tribunal",
  // Vara
  vara: "vara",
  vara_comarca: "vara",
  varacomarca: "vara",
  // Comarca
  comarca: "comarca",
  // Classe
  classe: "classe",
  classe_processual: "classe",
  // Valor
  valor: "valorCausa",
  valor_causa: "valorCausa",
  valorcausa: "valorCausa",
  valor_da_causa: "valorCausa",
  // Data de distribuição
  data_distribuicao: "dataDistribuicao",
  datadistribuicao: "dataDistribuicao",
  data_ajuizamento: "dataDistribuicao",
  distribuicao: "dataDistribuicao",
  // Exequente
  exequente: "exequente",
  polo_ativo: "exequente",
  poloativo: "exequente",
  autor: "exequente",
  // Executado
  executado: "executado",
  polo_passivo: "executado",
  polopassivo: "executado",
  reu: "executado",
  réu: "executado",
  // CNPJ executado
  cnpj: "cnpjExecutado",
  cnpj_executado: "cnpjExecutado",
  // Data do evento
  data_movimento: "dataEvento",
  datamovimento: "dataEvento",
  data_andamento: "dataEvento",
  dataandamento: "dataEvento",
  data_evento: "dataEvento",
  dataevento: "dataEvento",
  data: "dataEvento",
  // Texto do evento
  texto_movimento: "textoEvento",
  textomovimento: "textoEvento",
  movimentacao: "textoEvento",
  movimentação: "textoEvento",
  descricao: "textoEvento",
  descrição: "textoEvento",
  andamento: "textoEvento",
  texto: "textoEvento",
  texto_evento: "textoEvento",
  textoevento: "textoEvento",
};

/** Classifica se o processo é uma execução fiscal pelos metadados. */
function classificarExecucaoFiscal(classe: string, exequente: string): boolean {
  const c = normalizeHeader(classe);
  const e = normalizeHeader(exequente);
  if (/execu[cç][aã]o\s+fiscal/.test(c)) return true;
  if (/\b(fazenda|pgfn|procuradoria|municipio|estado|uniao|municipio)\b/.test(e)) return true;
  return false;
}

/** Faz parse de valor monetário (aceita R$ e vírgula decimal). */
function parseValor(raw: string): number | null {
  if (!raw) return null;
  const limpo = raw.replace(/R\$\s*/g, "").replace(/\./g, "").replace(",", ".").trim();
  const n = parseFloat(limpo);
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

  const avisos: string[] = [];

  if (!("numeroCnj" in colMap)) {
    throw new Error(
      "Coluna com número do processo não encontrada. " +
      "Use um dos nomes: numero_cnj, numero_processo, processo, cnj."
    );
  }
  if (!("textoEvento" in colMap)) {
    throw new Error(
      "Coluna com texto do andamento não encontrada. " +
      "Use um dos nomes: texto_movimento, texto_evento, andamento, movimentacao, descricao."
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
