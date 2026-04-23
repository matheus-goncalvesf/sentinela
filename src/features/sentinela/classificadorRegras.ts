import { CATEGORIA_EFEITO_MAP, DEFINICOES_CATEGORIAS } from "./constants";
import type { CategoriaEvento, EfeitoJuridico } from "./types";

interface ResultadoClassificacao {
  categoria: CategoriaEvento;
  efeitoJuridico: EfeitoJuridico;
  confianca: number;
  padraoMatched: string | null;
}

interface Candidato {
  categoria: CategoriaEvento;
  confianca: number;
  specificity: number;
  padraoMatched: string;
}

/**
 * Classifica um evento processual pelo texto bruto usando um sistema de regras
 * conservador em 3 passos:
 *
 * Pass 1 — Matching positivo: registra TODOS os padrões que disparam.
 * Pass 2 — Negative check: padrões disqualificadores reduzem confiança em 0.25.
 *           Candidatos com confiança < 0.50 são eliminados.
 * Pass 3 — Resolução de ambiguidade: se 2+ candidatos com confiança ≥ 0.70,
 *           prefere o de maior specificity e reduz sua confiança em 0.15.
 *
 * Se nenhum candidato sobrar ou confiança final < 0.50 → nao_classificado.
 */
export function classificarEvento(textoBruto: string): ResultadoClassificacao {
  const NAO_CLASSIFICADO: ResultadoClassificacao = {
    categoria: "nao_classificado",
    efeitoJuridico: "incerto",
    confianca: 0,
    padraoMatched: null,
  };

  if (!textoBruto || typeof textoBruto !== "string") return NAO_CLASSIFICADO;
  const texto = textoBruto.trim();
  if (!texto) return NAO_CLASSIFICADO;

  // ── Pass 1: Matching positivo ─────────────────────────────────────────────
  const candidatos: Candidato[] = [];

  const categorias = Object.keys(DEFINICOES_CATEGORIAS) as CategoriaEvento[];
  for (const categoria of categorias) {
    if (categoria === "nao_classificado") continue;
    const def = DEFINICOES_CATEGORIAS[categoria];
    for (const pattern of def.patterns) {
      if (pattern.test(texto)) {
        candidatos.push({
          categoria,
          confianca: def.baseConfidence,
          specificity: def.specificity,
          padraoMatched: pattern.source,
        });
        break; // apenas o primeiro pattern por categoria que dispara
      }
    }
  }

  if (candidatos.length === 0) return NAO_CLASSIFICADO;

  // ── Pass 2: Negative check ────────────────────────────────────────────────
  const candidatosFiltrados: Candidato[] = [];
  for (const candidato of candidatos) {
    const def = DEFINICOES_CATEGORIAS[candidato.categoria];
    let confianca = candidato.confianca;

    for (const negPattern of def.negativePatterns) {
      if (negPattern.test(texto)) {
        confianca -= 0.25;
      }
    }

    if (confianca >= 0.50) {
      candidatosFiltrados.push({ ...candidato, confianca });
    }
  }

  if (candidatosFiltrados.length === 0) return NAO_CLASSIFICADO;

  // ── Pass 3: Resolução de ambiguidade ──────────────────────────────────────
  // Ordena por confiança DESC, depois specificity DESC
  candidatosFiltrados.sort((a, b) => {
    if (b.confianca !== a.confianca) return b.confianca - a.confianca;
    return b.specificity - a.specificity;
  });

  const vencedor = candidatosFiltrados[0];
  const segundo = candidatosFiltrados[1];

  let confiancaFinal = vencedor.confianca;

  // Se há disputa real entre candidatos, penaliza a confiança
  if (segundo && segundo.confianca >= 0.70 && vencedor.confianca >= 0.70) {
    confiancaFinal = Math.max(0.50, vencedor.confianca - 0.15);
  }

  if (confiancaFinal < 0.50) return NAO_CLASSIFICADO;

  return {
    categoria: vencedor.categoria,
    efeitoJuridico: CATEGORIA_EFEITO_MAP[vencedor.categoria],
    confianca: Math.round(confiancaFinal * 100) / 100,
    padraoMatched: vencedor.padraoMatched,
  };
}
