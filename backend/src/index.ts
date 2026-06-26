import "dotenv/config";
import express from "express";

const app = express();
const PORT = parseInt(process.env.PORT || "3001", 10);
const API_KEY = process.env.API_KEY || "sentinela-dev-key";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = "gemini-1.5-flash";

// Rota de Health Check - ANTES de tudo para garantir que o Railway veja o servidor ativo
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    env: {
      gemini: !!GEMINI_API_KEY,
      port: PORT
    }
  });
});

// Middleware de CORS ultra-permissivo (versão final)
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE");
  res.header("Access-Control-Allow-Headers", "Content-Type, x-api-key, Authorization, Origin, Accept, X-Requested-With");

  if (req.method === "OPTIONS") {
    console.log(`[CORS] Respondendo OPTIONS para ${req.url}`);
    return res.status(204).send();
  }
  next();
});

app.use(express.json({ limit: "10mb" }));

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

app.post("/api/gerar-email", async (req, res) => {
  const apiKey = req.headers["x-api-key"] as string;
  if (apiKey !== API_KEY) return res.status(401).json({ error: "API key inválida" });
  if (!GEMINI_API_KEY) return res.status(400).json({ error: "GEMINI_API_KEY não configurada" });

  const { processo, analise } = req.body;

  const prompt = `Você é um advogado especialista em Execução Fiscal e Direito Tributário.
Escreva um e-mail profissional, informativo e ético (respeitando as normas da OAB contra captação ativa de clientes) para um executado cujo processo foi identificado com possível prescrição intercorrente pelo sistema "Sentinela".

DADOS DO PROCESSO:
- Número CNJ: ${processo.numeroCnj}
- Executado: ${processo.executado}
- Valor da Causa: ${processo.valorCausa ? `R$ ${processo.valorCausa.toLocaleString("pt-BR")}` : "Não informado"}
- Score de Prescrição: ${analise.score}
- Dias sem ato útil: ${analise.diasSemAtoUtil}
- Fase atual: ${analise.fase}
- Via sugerida: ${analise.viaSugerida}

DIRETRIZES:
1. O tom deve ser de "Alerta Informativo" e não de "Venda de Serviço".
2. Explique brevemente o que é a Prescrição Intercorrente (Art. 40 LEF) de forma simples para um leigo.
3. Mencione que o sistema Sentinela (ferramenta de inteligência jurídica) identificou essa situação no processo.
4. O e-mail deve ser elegante e passar autoridade técnica.
5. Mencione que, se confirmada a prescrição, o débito pode ser extinto judicialmente.
6. No final, coloque que em caso de dúvidas ele pode entrar em contato pelo WhatsApp: +55 (19) 99585-9317.
7. O e-mail deve ser assinado como "Equipe de Monitoramento Sentinela".

Importante: O e-mail deve ser redigido em Português do Brasil.
Retorne APENAS um JSON válido sem markdown: {"assunto": "...", "corpo": "..."}`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
        }),
      }
    );
    const data = (await response.json()) as any;
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    const jsonStr = text.replace(/```json\s*|\s*```/g, "").trim();
    const parsed = JSON.parse(jsonStr);
    res.json(parsed);
  } catch (err) {
    console.error(`[Gemini Email] Erro:`, err);
    res.status(502).json({ error: "Erro ao gerar e-mail com IA" });
  }
});

app.get("/api/proxy-tjsp", async (req, res) => {
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

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[Server] Sentinela rodando em 0.0.0.0:${PORT}`);
  console.log(`[Server] Health Check em: /health`);
});
