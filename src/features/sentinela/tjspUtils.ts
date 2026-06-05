import { processarEventos, analisarPrescricao } from "./motorPrescricao";
import { parseDate } from "./dateUtils";
import { enriquecerProcessoComLLM } from "./classificadorLLM";
import type { AnalisePrescricao, Processo } from "./types";
import type { AndamentoTJSP, ProcessoTJSP } from "../../services/tjspService";

function gerarId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export interface DadosComplementares {
  valorCausa?: number | null;
  exequente?: string;
  executado?: string;
}

/**
 * Monta um objeto Processo a partir de dados do TJSP scraping.
 */
export function montarProcessoDoTjsp(
  p: ProcessoTJSP,
  cnpjOrigem: string,
  andamentos: AndamentoTJSP[],
  extras?: DadosComplementares
): Processo {
  const eventos = processarEventos(
    andamentos.map((a) => ({
      data: parseDate(a.data),
      textoBruto: a.texto,
    }))
  );

  return {
    id: gerarId(),
    numeroCnj: p.numeroCnj,
    tribunal: "TJSP",
    vara: p.vara,
    comarca: p.comarca,
    classe: p.classe,
    valorCausa: extras?.valorCausa ?? null,
    dataDistribuicao: parseDate(p.dataDistribuicao),
    exequente: extras?.exequente || p.exequente,
    executado: extras?.executado || p.executado,
    cnpjExecutado: cnpjOrigem.replace(/\D/g, ""),
    isExecucaoFiscal: true,
    eventos,
    modoEntrada: "tjsp",
  };
}

/**
 * Monta Processo, enriquece com LLM (se configurado) e executa a análise
 * de prescrição em uma só chamada.
 */
export async function montarEAnalisarDoTjsp(
  p: ProcessoTJSP,
  cnpjOrigem: string,
  andamentos: AndamentoTJSP[],
  extras?: DadosComplementares
): Promise<{ processo: Processo; analise: AnalisePrescricao }> {
  const processo = montarProcessoDoTjsp(p, cnpjOrigem, andamentos, extras);
  await enriquecerProcessoComLLM(processo);
  const analise = analisarPrescricao(processo, new Date());
  return { processo, analise };
}
