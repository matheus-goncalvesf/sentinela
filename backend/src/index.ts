import express from "express";
import cors from "cors";
import { consultarPorCnpj } from "./pjeScraper";
import type { ConsultaRequest, ConsultaResponse } from "./types";

const app = express();
const PORT = parseInt(process.env.PORT || "3001", 10);
const API_KEY = process.env.API_KEY || "sentinela-dev-key";

app.use(cors());
app.use(express.json());

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Consulta PJe
app.post("/api/consulta-pje", async (req, res) => {
  const apiKey = req.headers["x-api-key"] as string;
  if (apiKey !== API_KEY) {
    return res.status(401).json({ success: false, error: "API key inválida" } as ConsultaResponse);
  }

  const { cnpj, tribunal } = req.body as ConsultaRequest;

  if (!cnpj) {
    return res.status(400).json({ success: false, error: "CNPJ é obrigatório" } as ConsultaResponse);
  }

  const cnpjLimpo = cnpj.replace(/\D/g, "");
  if (cnpjLimpo.length !== 14) {
    return res.status(400).json({ success: false, error: "CNPJ inválido" } as ConsultaResponse);
  }

  try {
    console.log(`[API] Consultando CNPJ ${cnpjLimpo} no ${tribunal || "TRF3"}...`);
    const processos = await consultarPorCnpj(cnpjLimpo, tribunal || "TRF3");
    console.log(`[API] Encontrados ${processos.length} processos para CNPJ ${cnpjLimpo}`);

    const response: ConsultaResponse = {
      success: true,
      processos,
    };

    res.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro interno ao consultar PJe";
    console.error(`[API] Erro: ${message}`);
    res.status(500).json({ success: false, error: message } as ConsultaResponse);
  }
});

// Consulta em lote (vários CNPJs)
app.post("/api/consulta-pje-lote", async (req, res) => {
  const apiKey = req.headers["x-api-key"] as string;
  if (apiKey !== API_KEY) {
    return res.status(401).json({ success: false, error: "API key inválida" });
  }

  const { cnpjs, tribunal } = req.body as { cnpjs: string[]; tribunal?: string };

  if (!Array.isArray(cnpjs) || cnpjs.length === 0) {
    return res.status(400).json({ success: false, error: "Lista de CNPJs é obrigatória" });
  }

  const resultados: Array<{ cnpj: string; processos: any[]; error?: string }> = [];

  for (const cnpj of cnpjs) {
    const cnpjLimpo = cnpj.replace(/\D/g, "");
    if (cnpjLimpo.length !== 14) {
      resultados.push({ cnpj, processos: [], error: "CNPJ inválido" });
      continue;
    }

    try {
      console.log(`[API Lote] Consultando CNPJ ${cnpjLimpo}...`);
      const processos = await consultarPorCnpj(cnpjLimpo, tribunal || "TRF3");
      resultados.push({ cnpj: cnpjLimpo, processos });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao consultar";
      resultados.push({ cnpj: cnpjLimpo, processos: [], error: message });
    }
  }

  res.json({ success: true, resultados });
});

app.listen(PORT, () => {
  console.log(`[Server] Sentinela PJe Scraper rodando na porta ${PORT}`);
  console.log(`[Server] Health: http://localhost:${PORT}/health`);
  console.log(`[Server] API: POST http://localhost:${PORT}/api/consulta-pje`);
});
