import type { AnalisePrescricao, Processo } from "./types";

// ══════════════════════════════════════════════════════════════════════════════
// Serviço de persistência local — salva análises no localStorage.
//
// Permite que o usuário não perca seus dados ao recarregar a página.
// Cada sessão de análise gera um registro com timestamp, processos e análises.
// Limite de 50 registros — remove o mais antigo ao exceder.
// ══════════════════════════════════════════════════════════════════════════════

const STORAGE_KEY = "sentinela:historico";
const MAX_ENTRIES = 50;

export interface HistoricoEntry {
  id: string;
  timestamp: number;
  label: string;
  totalProcessos: number;
  resumo: {
    forte: number;
    medio: number;
    fraco: number;
    sem_base: number;
    inconclusivo: number;
  };
  processos: Processo[];
  analises: AnalisePrescricao[];
}

function gerarId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * Serializa Date objects para strings ISO antes de salvar.
 * O JSON.stringify converte Date para string automaticamente,
 * mas precisamos restaurá-las no parse.
 */
function serializeForStorage(data: unknown): string {
  return JSON.stringify(data);
}

/**
 * Restaura Date objects de strings ISO após ler do localStorage.
 */
function deserializeDates(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "string") {
    // ISO 8601 date pattern
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(obj)) {
      const d = new Date(obj);
      if (!isNaN(d.getTime())) return d;
    }
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(deserializeDates);
  }
  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = deserializeDates(value);
    }
    return result;
  }
  return obj;
}

/**
 * Carrega o histórico do localStorage.
 */
export function carregarHistorico(): HistoricoEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Restaurar dates nos processos e análises
    return parsed.map((entry: HistoricoEntry) => ({
      ...entry,
      processos: deserializeDates(entry.processos) as Processo[],
      analises: deserializeDates(entry.analises) as AnalisePrescricao[],
    }));
  } catch {
    return [];
  }
}

/**
 * Salva uma nova sessão de análise no histórico.
 */
export function salvarNoHistorico(
  processos: Processo[],
  analises: AnalisePrescricao[],
  label?: string
): HistoricoEntry {
  const resumo = {
    forte: 0,
    medio: 0,
    fraco: 0,
    sem_base: 0,
    inconclusivo: 0,
  };
  for (const a of analises) {
    if (a.score in resumo) {
      resumo[a.score as keyof typeof resumo]++;
    }
  }

  const autoLabel = label || gerarLabel(processos);

  const entry: HistoricoEntry = {
    id: gerarId(),
    timestamp: Date.now(),
    label: autoLabel,
    totalProcessos: processos.length,
    resumo,
    processos,
    analises,
  };

  const historico = carregarHistorico();
  historico.unshift(entry);

  // Limit to MAX_ENTRIES
  while (historico.length > MAX_ENTRIES) {
    historico.pop();
  }

  try {
    localStorage.setItem(STORAGE_KEY, serializeForStorage(historico));
  } catch (e) {
    // localStorage full — remove oldest entries and try again
    console.warn("[storageService] localStorage cheio, removendo entradas antigas.", e);
    while (historico.length > 5) {
      historico.pop();
    }
    try {
      localStorage.setItem(STORAGE_KEY, serializeForStorage(historico));
    } catch {
      // Give up silently
      console.error("[storageService] Não foi possível salvar no localStorage.");
    }
  }

  return entry;
}

/**
 * Remove uma entrada do histórico pelo ID.
 */
export function removerDoHistorico(id: string): void {
  const historico = carregarHistorico().filter((e) => e.id !== id);
  localStorage.setItem(STORAGE_KEY, serializeForStorage(historico));
}

/**
 * Limpa todo o histórico.
 */
export function limparHistorico(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Gera um label descritivo para a sessão.
 */
function gerarLabel(processos: Processo[]): string {
  if (processos.length === 0) return "Análise vazia";
  if (processos.length === 1) {
    const p = processos[0];
    return p.executado
      ? `${p.executado} (${p.numeroCnj})`
      : p.numeroCnj;
  }
  // Multiple processes
  const modo = processos[0].modoEntrada;
  if (modo === "tjsp") {
    const cnpjs = new Set(processos.map((p) => p.cnpjExecutado).filter(Boolean));
    if (cnpjs.size === 1) {
      return `TJSP · CNPJ ${processos[0].cnpjExecutado} · ${processos.length} processos`;
    }
    return `TJSP · ${cnpjs.size} CNPJs · ${processos.length} processos`;
  }
  return `${processos.length} processos (${modo.toUpperCase()})`;
}
