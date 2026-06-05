import type { CategoriaEvento, Processo } from "./types";
import { CATEGORIA_EFEITO_MAP } from "./constants";

const DEFAULT_BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "https://sentinela-production-5bbf.up.railway.app";
const BACKEND_URL_KEY = "sentinela_backend_url";
const API_KEY_STORAGE = "sentinela_api_key";
const MIN_CONFIANCA_REGEX = 0.70;

interface ClassificacaoLLM {
  categoria: CategoriaEvento;
  confianca: number;
}

const cache = new Map<string, ClassificacaoLLM>();

export function getBackendUrl(): string {
  try {
    return localStorage.getItem(BACKEND_URL_KEY) || DEFAULT_BACKEND_URL;
  } catch {
    return DEFAULT_BACKEND_URL;
  }
}

function getApiKey(): string {
  try {
    return localStorage.getItem(API_KEY_STORAGE) || "sentinela-dev-key";
  } catch {
    return "sentinela-dev-key";
  }
}

export function isGeminiConfigurado(): boolean {
  return !!getApiKey();
}

export async function classificarLote(textos: string[]): Promise<(ClassificacaoLLM | null)[]> {
  const backendUrl = getBackendUrl();

  const uncached: { idx: number; texto: string }[] = [];
  const results: (ClassificacaoLLM | null)[] = new Array(textos.length);

  for (let i = 0; i < textos.length; i++) {
    const cached = cache.get(textos[i]);
    if (cached) {
      results[i] = cached;
    } else {
      uncached.push({ idx: i, texto: textos[i] });
    }
  }

  if (uncached.length === 0) return results;

  try {
    const response = await fetch(`${backendUrl}/api/classificar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": getApiKey(),
      },
      body: JSON.stringify({ textos: uncached.map((u) => u.texto) }),
    });

    if (!response.ok) {
      console.warn(`[classificadorLLM] Backend error ${response.status}`);
      return textos.map(() => null);
    }

    const data = await response.json();
    const classificacoes = data.classificacoes as Array<{ indice: number; categoria: string; confianca: number }>;

    if (!Array.isArray(classificacoes)) {
      console.warn("[classificadorLLM] Resposta inválida do backend");
      return textos.map(() => null);
    }

    for (const item of classificacoes) {
      if (typeof item.indice !== "number" || item.indice < 0 || item.indice >= uncached.length) continue;
      const { idx, texto } = uncached[item.indice];
      const llm: ClassificacaoLLM = {
        categoria: (item.categoria || "nao_classificado") as CategoriaEvento,
        confianca: typeof item.confianca === "number" ? Math.max(0, Math.min(1, item.confianca)) : 0,
      };
      if (llm.categoria !== "nao_classificado") {
        results[idx] = llm;
        cache.set(texto, llm);
      }
    }
  } catch (err) {
    console.warn("[classificadorLLM] Erro de rede:", err);
    return textos.map(() => null);
  }

  return results;
}

export async function enriquecerProcessoComLLM(processo: Processo): Promise<void> {
  try {
    const backendUrl = getBackendUrl();
    const health = await fetch(`${backendUrl}/health`, { signal: AbortSignal.timeout(3000) });
    if (!health.ok) return;
    const healthData = await health.json();
    if (healthData.gemini !== "configurado") return;
  } catch {
    return;
  }

  const baixaConfianca = processo.eventos.filter(
    (e) => e.categoria === "nao_classificado" || e.confianca < MIN_CONFIANCA_REGEX
  );
  if (baixaConfianca.length === 0) return;

  const textos = baixaConfianca.map((e) => e.textoBruto);
  const llmResults = await classificarLote(textos);

  for (let i = 0; i < llmResults.length; i++) {
    const llm = llmResults[i];
    if (!llm || llm.categoria === "nao_classificado") continue;
    if (llm.categoria === baixaConfianca[i].categoria && llm.confianca <= baixaConfianca[i].confianca) continue;

    baixaConfianca[i].categoria = llm.categoria;
    baixaConfianca[i].efeitoJuridico = CATEGORIA_EFEITO_MAP[llm.categoria] || "incerto";
    baixaConfianca[i].confianca = Math.max(baixaConfianca[i].confianca, llm.confianca);
    baixaConfianca[i].padraoMatched = "llm";
  }
}
