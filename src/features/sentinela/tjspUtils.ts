import { processarEventos, analisarPrescricao } from "./motorPrescricao";
import { parseDate } from "./dateUtils";
import type { AnalisePrescricao, Processo } from "./types";
import type { AndamentoTJSP, ProcessoTJSP } from "../../services/tjspService";

function gerarId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * Monta um objeto Processo a partir de dados do TJSP scraping.
 */
export function montarProcessoDoTjsp(
  p: ProcessoTJSP,
  cnpjOrigem: string,
  andamentos: AndamentoTJSP[]
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
    valorCausa: null,
    dataDistribuicao: parseDate(p.dataDistribuicao),
    exequente: p.exequente,
    executado: p.executado,
    cnpjExecutado: cnpjOrigem.replace(/\D/g, ""),
    isExecucaoFiscal: true,
    eventos,
    modoEntrada: "tjsp",
  };
}

/**
 * Monta Processo e executa a análise de prescrição em uma só chamada.
 */
export function montarEAnalisarDoTjsp(
  p: ProcessoTJSP,
  cnpjOrigem: string,
  andamentos: AndamentoTJSP[]
): { processo: Processo; analise: AnalisePrescricao } {
  const processo = montarProcessoDoTjsp(p, cnpjOrigem, andamentos);
  const analise = analisarPrescricao(processo, new Date());
  return { processo, analise };
}
