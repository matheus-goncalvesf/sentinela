const DEFAULT_BACKEND_URL = "http://localhost:3001";
const DEFAULT_API_KEY = "sentinela-dev-key";

let backendUrl = DEFAULT_BACKEND_URL;
let apiKey = DEFAULT_API_KEY;

export function configurarBackend(url: string, key: string) {
  backendUrl = url.replace(/\/$/, "");
  apiKey = key;
}

export function getBackendUrl() {
  return backendUrl;
}

export interface ProcessoPJeResultado {
  numeroCnj: string;
  classe?: string;
  assunto?: string;
  dataDistribuicao?: string;
  exequente?: string;
  executado?: string;
  vara?: string;
  comarca?: string;
  valorCausa?: number;
  andamentos: Array<{ data: string; texto: string }>;
}

export async function consultarCnpj(cnpj: string, tribunal: string = "TRF3"): Promise<ProcessoPJeResultado[]> {
  const res = await fetch(`${backendUrl}/api/consulta-pje`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({ cnpj: cnpj.replace(/\D/g, ""), tribunal }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `Erro ${res.status} ao consultar PJe`);
  }

  const data = await res.json();
  if (!data.success) throw new Error(data.error || "Erro ao consultar PJe");

  return data.processos;
}

export interface ResultadoLote {
  cnpj: string;
  processos: ProcessoPJeResultado[];
  error?: string;
}

export async function consultarLote(
  cnpjs: string[],
  tribunal: string = "TRF3",
  onProgress?: (idx: number, total: number) => void
): Promise<ResultadoLote[]> {
  const resultados: ResultadoLote[] = [];

  for (let i = 0; i < cnpjs.length; i++) {
    const cnpj = cnpjs[i].replace(/\D/g, "");
    onProgress?.(i + 1, cnpjs.length);

    try {
      const processos = await consultarCnpj(cnpj, tribunal);
      resultados.push({ cnpj, processos });
    } catch (err) {
      resultados.push({ cnpj, processos: [], error: err instanceof Error ? err.message : "Erro desconhecido" });
    }
  }

  return resultados;
}

export async function healthCheck(): Promise<boolean> {
  try {
    const res = await fetch(`${backendUrl}/health`, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}
