import "dotenv/config";
import express from "express";
import cors from "cors";

const app = express();
const PORT = parseInt(process.env.PORT || "3001", 10);
const API_KEY = process.env.API_KEY || "sentinela-dev-key";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = "gemini-1.5-flash";

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-api-key', 'Authorization'],
}));
app.use(express.json({ limit: "5mb" }));

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    gemini: GEMINI_API_KEY ? "configurado" : "não configurado",
  });
});

app.post("/api/mapear-colunas", async (req, res) => {
  const apiKey = req.headers["x-api-key"] as string;
  if (apiKey !== API_KEY) return res.status(401).json({ error: "API key inválida" });
  if (!GEMINI_API_KEY) return res.status(400).json({ error: "GEMINI_API_KEY não configurada" });

  const { colunas, amostra } = req.body as { colunas: string[]; amostra: string[][] };

  const prompt = `Você é um assistente especializado em dados jurídicos brasileiros. 
Dada a lista de nomes de colunas de um CSV e uma amostra de 3 linhas, identifique qual índice (0-based) corresponde a cada campo abaixo.

CAMPOS:
- numeroCnj: Número do processo (CNJ)
- classe: Classe processual (Execução Fiscal, etc)
- valorCausa: Valor da causa/ação/débito
- dataDistribuicao: Data de ajuizamento
- exequente: Polo ativo (Fazenda, União, Município)
- executado: Polo passivo (Empresa, Devedor, Réu)
- dataEvento: Data do andamento/movimentação
- textoEvento: Texto do andamento/movimentação

Colunas: [${colunas.join(", ")}]
Amostra: ${JSON.stringify(amostra)}

Responda APENAS JSON sem markdown: {"mapeamento":{"campo":"índice"}} ou {"mapeamento":{}} se não encontrar.`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 512 },
        }),
      }
    );
    const data = (await response.json()) as any;
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    const jsonStr = text.replace(/```json\s*|\s*```/g, "").trim();
    const parsed = JSON.parse(jsonStr);
    res.json({ mapeamento: parsed.mapeamento || parsed });
  } catch (err) {
    const errorMsg = (err as Error).message;
    console.error(`[Gemini Mapear] Erro:`, errorMsg);
    res.status(502).json({ error: "Erro na API do Gemini", details: errorMsg });
  }
});

app.post("/api/classificar", async (req, res) => {
  const apiKey = req.headers["x-api-key"] as string;
  if (apiKey !== API_KEY) {
    return res.status(401).json({ error: "API key inválida" });
  }

  if (!GEMINI_API_KEY) {
    return res.status(400).json({ error: "GEMINI_API_KEY não configurada no servidor" });
  }

  const { textos } = req.body as { textos: string[] };
  if (!Array.isArray(textos) || textos.length === 0) {
    return res.status(400).json({ error: "textos é obrigatório" });
  }

  if (textos.length > 100) {
    return res.status(400).json({ error: "Máximo de 100 textos por requisição" });
  }

  const eventosStr = textos.map((t, i) => `${i}: "${t}"`).join("\n");

  const prompt = `Você é um especialista em Direito Processual brasileiro, especificamente em Execução Fiscal (LEF 6.830/80) e Prescrição Intercorrente.

Classifique cada evento processual abaixo em EXATAMENTE uma das categorias abaixo.

CATEGORIAS:
- suspensao_art40: Suspensão da execução com base no art. 40 caput da LEF. Efeito: suspende.
- arquivamento_art40: Arquivamento provisório art. 40 §2º LEF. Efeito: inicia contagem.
- tentativa_frustrada_localizacao: Tentativa frustrada de localizar o devedor. Efeito: inicia contagem.
- tentativa_frustrada_bens: Tentativa frustrada de localizar bens penhoráveis. Efeito: inicia contagem.
- constricao_positiva: Penhora/bloqueio efetivado. Efeito: interrompe.
- penhora_rosto_autos: Penhora no rosto dos autos. Efeito: interrompe.
- ciencia_fazenda: Ciência da Fazenda Pública. Efeito: inicia contagem.
- parcelamento: Parcelamento do débito. Efeito: suspende.
- parcelamento_rescindido: Parcelamento rescindido/cancelado. Efeito: neutro.
- redirecionamento: Redirecionamento para sócio. Efeito: neutro.
- despacho_citacao: Despacho que ordena a citação. Efeito: interrompe.
- citacao_valida: Citação válida do executado. Efeito: interrompe.
- indicacao_bens: Indicação de bens pelo executado. Efeito: neutro.
- embargos_executado: Embargos à execução. Efeito: neutro.
- excecao_pre_executividade: Exceção de pré-executividade. Efeito: neutro.
- prescricao_reconhecida: Prescrição intercorrente reconhecida. Efeito: encerra.
- pedido_fazenda_sem_efeito: Pedido genérico da Fazenda. Efeito: neutro.
- ato_neutro: Ato ordinatório, mero expediente. Efeito: neutro.
- extincao: Extinção do processo. Efeito: encerra.

Responda APENAS JSON sem markdown: {"classificacoes":[{"indice":0,"categoria":"...","confianca":0.95}]}

Eventos:
${eventosStr}`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 2048 },
        }),
      }
    );

    const data = (await response.json()) as any;
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      return res.status(502).json({ error: "Resposta vazia do Gemini" });
    }

    const jsonStr = text.replace(/```json\s*|\s*```/g, "").trim();
    const parsed = JSON.parse(jsonStr);
    const classificacoes = parsed.classificacoes || parsed;

    res.json({ classificacoes });
  } catch (err) {
    const errorMsg = (err as Error).message;
    console.error(`[Gemini Classificar] Erro:`, errorMsg);
    res.status(502).json({ error: "Erro na API do Gemini", details: errorMsg });
  }
});

app.options("/api/proxy-tjsp", (_req, res) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, x-api-key, Authorization");
  res.sendStatus(204);
});

app.get("/api/proxy-tjsp", async (req, res) => {
  // Força cabeçalhos de CORS manualmente para evitar bloqueios se o middleware falhar
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, x-api-key, Authorization");

  const targetUrl = req.query.url as string;

  if (!targetUrl || !targetUrl.includes("tjsp.jus.br")) {
    return res.status(400).json({ error: "URL inválida ou ausente" });
  }

  try {
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
      }
    });

    const html = await response.text();
    res.set("Content-Type", "text/html; charset=UTF-8");
    res.send(html);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Retornamos 200 com erro no JSON para evitar que o gateway do Railway dê 502
    res.status(200).json({
      proxy_error: true,
      message: "Erro na ponte do servidor",
      details: msg
    });
  }
});

app.listen(PORT, () => {
  console.log(`[Server] Sentinela rodando na porta ${PORT}`);
  console.log(`[Server] Health: http://localhost:${PORT}/health`);
});
