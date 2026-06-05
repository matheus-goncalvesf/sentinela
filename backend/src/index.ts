import "dotenv/config";
import express from "express";
import cors from "cors";

const app = express();
const PORT = parseInt(process.env.PORT || "3001", 10);
const API_KEY = process.env.API_KEY || "sentinela-dev-key";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = "gemini-1.5-flash";

app.use(cors());
app.use(express.json({ limit: "5mb" }));

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    gemini: GEMINI_API_KEY ? "configurado" : "não configurado",
  });
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

    if (!response.ok) {
      const err = await response.text().catch(() => "");
      console.error(`[Gemini] Erro ${response.status}: ${err}`);
      return res.status(502).json({ error: `Gemini API error: ${response.status}` });
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      return res.status(502).json({ error: "Resposta vazia do Gemini" });
    }

    const jsonStr = text.replace(/```json\s*|\s*```/g, "").trim();
    const parsed = JSON.parse(jsonStr);
    const classificacoes = parsed.classificacoes || parsed;

    res.json({ classificacoes });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Gemini] Erro: ${msg}`);
    res.status(502).json({ error: msg });
  }
});

app.listen(PORT, () => {
  console.log(`[Server] Sentinela rodando na porta ${PORT}`);
  console.log(`[Server] Health: http://localhost:${PORT}/health`);
});
