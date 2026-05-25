import { processarEventos } from "../features/sentinela/motorPrescricao";
import { parseDate } from "../features/sentinela/dateUtils";
import { montarEAnalisarDoTjsp } from "../features/sentinela/tjspUtils";
import type { Processo } from "../features/sentinela/types";

// TRFs que cobrem cada estado (Execução Fiscal na Justiça Federal)
const TRF_POR_UF: Record<string, { sigla: string; nome: string; url: string }> = {
  AC: { sigla: "TRF1", nome: "TRF 1ª Região (AC, AP, AM, BA, DF, GO, MA, MT, PA, PI, RO, RR, TO)", url: "https://pje1g.trf1.jus.br/pje/ConsultaPublica/listView.seam" },
  AL: { sigla: "TRF5", nome: "TRF 5ª Região (AL, CE, PB, PE, RN, SE)", url: "https://pje.trf5.jus.br/pje/ConsultaPublica/listView.seam" },
  AP: { sigla: "TRF1", nome: "TRF 1ª Região (AC, AP, AM, BA, DF, GO, MA, MT, PA, PI, RO, RR, TO)", url: "https://pje1g.trf1.jus.br/pje/ConsultaPublica/listView.seam" },
  AM: { sigla: "TRF1", nome: "TRF 1ª Região (AC, AP, AM, BA, DF, GO, MA, MT, PA, PI, RO, RR, TO)", url: "https://pje1g.trf1.jus.br/pje/ConsultaPublica/listView.seam" },
  BA: { sigla: "TRF1", nome: "TRF 1ª Região (AC, AP, AM, BA, DF, GO, MA, MT, PA, PI, RO, RR, TO)", url: "https://pje1g.trf1.jus.br/pje/ConsultaPublica/listView.seam" },
  CE: { sigla: "TRF5", nome: "TRF 5ª Região (AL, CE, PB, PE, RN, SE)", url: "https://pje.trf5.jus.br/pje/ConsultaPublica/listView.seam" },
  DF: { sigla: "TRF1", nome: "TRF 1ª Região (AC, AP, AM, BA, DF, GO, MA, MT, PA, PI, RO, RR, TO)", url: "https://pje1g.trf1.jus.br/pje/ConsultaPublica/listView.seam" },
  ES: { sigla: "TRF2", nome: "TRF 2ª Região (ES, RJ)", url: "https://pje.trf2.jus.br/pje/ConsultaPublica/listView.seam" },
  GO: { sigla: "TRF1", nome: "TRF 1ª Região (AC, AP, AM, BA, DF, GO, MA, MT, PA, PI, RO, RR, TO)", url: "https://pje1g.trf1.jus.br/pje/ConsultaPublica/listView.seam" },
  MA: { sigla: "TRF1", nome: "TRF 1ª Região (AC, AP, AM, BA, DF, GO, MA, MT, PA, PI, RO, RR, TO)", url: "https://pje1g.trf1.jus.br/pje/ConsultaPublica/listView.seam" },
  MG: { sigla: "TRF1", nome: "TRF 1ª Região (AC, AP, AM, BA, DF, GO, MA, MT, PA, PI, RO, RR, TO)", url: "https://pje1g.trf1.jus.br/pje/ConsultaPublica/listView.seam" },
  MS: { sigla: "TRF3", nome: "TRF 3ª Região (MS, SP)", url: "https://pje1g.trf3.jus.br/pje/ConsultaPublica/listView.seam" },
  MT: { sigla: "TRF1", nome: "TRF 1ª Região (AC, AP, AM, BA, DF, GO, MA, MT, PA, PI, RO, RR, TO)", url: "https://pje1g.trf1.jus.br/pje/ConsultaPublica/listView.seam" },
  PA: { sigla: "TRF1", nome: "TRF 1ª Região (AC, AP, AM, BA, DF, GO, MA, MT, PA, PI, RO, RR, TO)", url: "https://pje1g.trf1.jus.br/pje/ConsultaPublica/listView.seam" },
  PB: { sigla: "TRF5", nome: "TRF 5ª Região (AL, CE, PB, PE, RN, SE)", url: "https://pje.trf5.jus.br/pje/ConsultaPublica/listView.seam" },
  PE: { sigla: "TRF5", nome: "TRF 5ª Região (AL, CE, PB, PE, RN, SE)", url: "https://pje.trf5.jus.br/pje/ConsultaPublica/listView.seam" },
  PI: { sigla: "TRF1", nome: "TRF 1ª Região (AC, AP, AM, BA, DF, GO, MA, MT, PA, PI, RO, RR, TO)", url: "https://pje1g.trf1.jus.br/pje/ConsultaPublica/listView.seam" },
  PR: { sigla: "TRF4", nome: "TRF 4ª Região (PR, RS, SC)", url: "https://pje.trf4.jus.br/pje/ConsultaPublica/listView.seam" },
  RJ: { sigla: "TRF2", nome: "TRF 2ª Região (ES, RJ)", url: "https://pje.trf2.jus.br/pje/ConsultaPublica/listView.seam" },
  RN: { sigla: "TRF5", nome: "TRF 5ª Região (AL, CE, PB, PE, RN, SE)", url: "https://pje.trf5.jus.br/pje/ConsultaPublica/listView.seam" },
  RO: { sigla: "TRF1", nome: "TRF 1ª Região (AC, AP, AM, BA, DF, GO, MA, MT, PA, PI, RO, RR, TO)", url: "https://pje1g.trf1.jus.br/pje/ConsultaPublica/listView.seam" },
  RR: { sigla: "TRF1", nome: "TRF 1ª Região (AC, AP, AM, BA, DF, GO, MA, MT, PA, PI, RO, RR, TO)", url: "https://pje1g.trf1.jus.br/pje/ConsultaPublica/listView.seam" },
  RS: { sigla: "TRF4", nome: "TRF 4ª Região (PR, RS, SC)", url: "https://pje.trf4.jus.br/pje/ConsultaPublica/listView.seam" },
  SC: { sigla: "TRF4", nome: "TRF 4ª Região (PR, RS, SC)", url: "https://pje.trf4.jus.br/pje/ConsultaPublica/listView.seam" },
  SE: { sigla: "TRF5", nome: "TRF 5ª Região (AL, CE, PB, PE, RN, SE)", url: "https://pje.trf5.jus.br/pje/ConsultaPublica/listView.seam" },
  SP: { sigla: "TRF3", nome: "TRF 3ª Região (MS, SP)", url: "https://pje1g.trf3.jus.br/pje/ConsultaPublica/listView.seam" },
  TO: { sigla: "TRF1", nome: "TRF 1ª Região (AC, AP, AM, BA, DF, GO, MA, MT, PA, PI, RO, RR, TO)", url: "https://pje1g.trf1.jus.br/pje/ConsultaPublica/listView.seam" },
};

export function getTrfPorUf(uf: string) {
  return TRF_POR_UF[uf.toUpperCase()] ?? TRF_POR_UF["SP"];
}

export function gerarUrlBuscaPje(cnpj: string, uf: string): string {
  const cnpjLimpo = cnpj.replace(/\D/g, "");
  if (cnpjLimpo.length !== 14) return "";
  const trf = getTrfPorUf(uf);
  return `${trf.url}?codigoParte=${cnpjLimpo}`;
}

export function extrairCnpjUrl(url: string): string {
  const match = url.match(/[?&]codigoParte=(\d{14})/);
  return match ? match[1] : "";
}

export function parseCsvTxtPje(
  texto: string,
  cnpjOrigem: string
): { processos: Processo[] } {
  const linhas = texto.split("\n").filter(l => l.trim());
  const processos: Processo[] = [];

  // Tenta detectar se é CSV (tem ; ou , com cabeçalho)
  const primeiraLinha = linhas[0]?.toLowerCase() || "";
  const isCsv = primeiraLinha.includes("numero_cnj") || primeiraLinha.includes("cnj") || primeiraLinha.includes("processo");

  if (isCsv) {
    const separador = primeiraLinha.includes(";") ? ";" : ",";
    const cabecalho = linhas[0].split(separador).map(h => h.trim().toLowerCase());
    const colCnj = cabecalho.findIndex(h => h.includes("numero_cnj") || h === "cnj" || h === "processo" || h.includes("processo"));
    const colData = cabecalho.findIndex(h => h.includes("data") && (h.includes("evento") || h.includes("anda") || h === "data"));
    const colTexto = cabecalho.findIndex(h => h.includes("texto") || h.includes("evento") || h.includes("anda"));

    for (let i = 1; i < linhas.length; i++) {
      const cols = linhas[i].split(separador).map(c => c.trim());
      const numeroCnj = colCnj >= 0 ? cols[colCnj] : "";
      if (!numeroCnj) continue;

      const processo = montarEAnalisarDoTjsp({
        numeroCnj,
        codigoProcesso: numeroCnj,
        foro: "", vara: "", comarca: "", classe: "", assunto: "",
        dataDistribuicao: "", exequente: "", executado: "",
      }, cnpjOrigem, colData >= 0 && colTexto >= 0 ? [{
        data: cols[colData],
        texto: cols[colTexto],
      }] : []);

      const proc = processo.processo;
      proc.tribunal = "PJe Federal";
      proc.isExecucaoFiscal = true;
      proc.modoEntrada = "manual";
      proc.cnpjExecutado = cnpjOrigem.replace(/\D/g, "");
      processos.push(proc);
    }
  } else {
    // TXT com um CNPJ por linha → gera processos vazios para analisar
    for (const linha of linhas) {
      const cnpj = linha.replace(/\D/g, "");
      if (cnpj.length !== 14) continue;

      const processo: Processo = {
        id: crypto.randomUUID(),
        numeroCnj: "",
        tribunal: "PJe Federal",
        vara: "", comarca: "", classe: "",
        valorCausa: null,
        dataDistribuicao: null,
        exequente: "", executado: "",
        cnpjExecutado: cnpj,
        isExecucaoFiscal: true,
        modoEntrada: "manual",
        eventos: [],
      };
      processos.push(processo);
    }
  }

  return { processos };
}

export function parseJsonExportadoPje(
  jsonData: unknown,
  cnpjOrigem: string
): { processos: Processo[] } {
  if (!Array.isArray(jsonData)) {
    throw new Error("Formato inválido. O JSON deve ser um array de processos.");
  }

  const processos: Processo[] = [];

  for (const item of jsonData) {
    const numeroCnj = item.numeroCnj || item.numero_cnj || item.cnj || item.processo || "";
    if (!numeroCnj) continue;

    const andamentos = (item.andamentos || item.Andamentos || item.eventos || []).map((a: any) => ({
      data: a.data || a.Data || "",
      texto: a.texto || a.Texto || a.descricao || a.Descricao || a.movimento || "",
    }));

    const processo = montarEAnalisarDoTjsp({
      numeroCnj,
      codigoProcesso: numeroCnj,
      foro: "",
      vara: item.vara || item.Vara || "",
      comarca: item.comarca || item.Comarca || "",
      classe: item.classe || item.Classe || "",
      assunto: item.assunto || item.Assunto || "",
      dataDistribuicao: item.dataDistribuicao || item.DataDistribuicao || "",
      exequente: item.exequente || item.Exequente || "",
      executado: item.executado || item.Executado || item.Cnpj || cnpjOrigem,
    }, cnpjOrigem, andamentos);

    const proc = processo.processo;
    proc.tribunal = "PJe Federal";
    proc.isExecucaoFiscal = /execu[çc][aã]o\s+fiscal/i.test(proc.classe || "") || /fazenda/i.test(proc.exequente || "");
    proc.modoEntrada = "manual";

    processos.push({
      ...proc,
      eventos: processarEventos(
        andamentos.map((a: any) => ({
          data: parseDate(a.data),
          textoBruto: a.texto,
        }))
      ),
    });
  }

  return { processos };
}
