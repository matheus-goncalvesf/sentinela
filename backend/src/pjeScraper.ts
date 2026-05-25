import puppeteer, { Browser, Page } from "puppeteer-core";
import { TRF_CONFIG, ProcessoPJe, AndamentoPJe } from "./types";
import { resolverHCaptcha } from "./captchaSolver";

const CHROMIUM_PATH = process.env.CHROMIUM_PATH;

function getBrowser() {
  return puppeteer.launch({
    headless: true,
    executablePath: CHROMIUM_PATH || undefined,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--single-process",
    ],
  });
}

// Common selectors used across different PJe versions
const SELETORES = {
  inputBusca: [
    "input[id*='numOuCpfCnpj']",
    "input[id*='inputFiltroNumero']",
    "input[id*='filtroNumero']",
    "input[type='text'][id*='campo']",
    "input[name*='numOuCpfCnpj']",
    "input[name*='numeroProcesso']",
  ],
  botaoBuscar: [
    "button[id*='pesquisar']",
    "button[id*='btnBuscar']",
    "button[id*='buscar']",
    "input[type='submit'][value*='Pesquisar']",
    "input[type='submit'][value*='Buscar']",
    "button:has(span:text('Pesquisar'))",
    "button:has(span:text('Buscar'))",
  ],
  linhaProcesso: [
    "table[id*='processos'] tbody tr",
    "table[id*='resultado'] tbody tr",
    ".rich-table tbody tr",
    "table tbody tr[class*='rich-table-row']",
  ],
  celulaProcesso: [
    "td[id*='numeroProcesso']",
    "td[headers*='numeroProcesso']",
    "td a[href*='processo']",
    "td a",
  ],
  // After clicking a process, extract details
  detalheNumero: [
    "span[id*='numeroProcesso']",
    "span[id*='numProcesso']",
    ".numero-processo",
  ],
  detalheClasse: [
    "span[id*='classe']",
    ".classe-processo",
  ],
  detalheAssunto: [
    "span[id*='assunto']",
    ".assunto-processo",
  ],
  detalheDataDistribuicao: [
    "span[id*='dataDistribuicao']",
    "span[id*='dataAutuacao']",
  ],
  detalhePartes: [
    ".partes-processo span",
    "span[id*='partes']",
    ".nome-parte",
  ],
  andamentoLinha: [
    "table[id*='andamento'] tbody tr",
    "table[id*='movimentacao'] tbody tr",
    ".andamentos tbody tr",
  ],
  andamentoData: [
    "td[id*='dataAndamento']",
    "td[headers*='data']",
    "td:nth-child(1)",
  ],
  andamentoTexto: [
    "td[id*='descricao']",
    "td[headers*='descricao']",
    "td:nth-child(2)",
  ],
};

async function encontrarElemento(page: Page, seletor: string[]): Promise<{ el: any; seletorUsado: string } | null> {
  for (const sel of seletor) {
    try {
      const el = await page.$(sel);
      if (el) return { el, seletorUsado: sel };
    } catch {
      continue;
    }
  }
  return null;
}

function aguardar(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

export async function consultarPorCnpj(cnpj: string, tribunal: string = "TRF3"): Promise<ProcessoPJe[]> {
  const config = TRF_CONFIG[tribunal];
  if (!config) throw new Error(`Tribunal não suportado: ${tribunal}`);

  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setViewport({ width: 1280, height: 900 });
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    const urlBusca = `${config.url}?codigoParte=${cnpj}`;
    console.log(`[PJeScraper] Acessando ${urlBusca}`);
    await page.goto(urlBusca, { waitUntil: "networkidle2", timeout: 30000 });
    await aguardar(3000);

    // Tenta preencher o campo de busca (caso a URL não tenha preenchido automaticamente)
    const input = await encontrarElemento(page, SELETORES.inputBusca);
    if (!input) {
      // Fallback: tenta encontrar qualquer input de texto visível
      const inputs = await page.$$("input[type='text']");
      if (inputs.length === 0) throw new Error("Campo de busca não encontrado no PJe");
      const valorAtual = await page.evaluate(el => (el as HTMLInputElement).value, inputs[0]);
      if (valorAtual !== cnpj) {
        await inputs[0].click({ clickCount: 3 });
        await inputs[0].type(cnpj, { delay: 30 });
      }
    } else {
      const valorAtual = await page.evaluate(el => (el as HTMLInputElement).value, input.el);
      if (valorAtual !== cnpj) {
        await input.el.click({ clickCount: 3 });
        await input.el.type(cnpj, { delay: 30 });
      }
    }

    console.log(`[PJeScraper] CNPJ digitado: ${cnpj}`);

    // Verifica e resolve hCaptcha se presente
    const captchaResolvido = await resolverCaptchaSeExistir(page);
    if (!captchaResolvido) {
      console.log("[PJeScraper] Nenhum captcha detectado, prosseguindo...");
    }

    // Clica em buscar
    const botao = await encontrarElemento(page, SELETORES.botaoBuscar);
    if (botao) {
      await botao.el.click();
    } else {
      // Fallback: tenta Enter
      await page.keyboard.press("Enter");
    }

    // Aguarda resultados (tenta submit do form também)
    await aguardar(3000);
    try {
      await page.waitForSelector("table, .rich-table, [class*='resultado']", { timeout: 12000 });
    } catch {
      // Tenta submeter o formulário diretamente (alguns PJe usam JSF)
      try {
        await page.evaluate(() => {
          const form = document.querySelector("form");
          if (form) {
            const btn = form.querySelector("input[type='submit'], button[type='submit']");
            if (btn) (btn as HTMLButtonElement).click();
          }
        });
        await aguardar(3000);
      } catch {}
    }

    await aguardar(2000);

    // Extrai processos da tabela
    const linhas = await encontrarElemento(page, SELETORES.linhaProcesso);
    if (!linhas) {
      // Tenta extrair via evaluate (captura qualquer tabela)
      const tabelas = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll("table tr"));
        return rows.slice(0, 5).map(r => r.textContent?.trim() || "");
      });
      console.log("[PJeScraper] Nenhum processo encontrado na tabela. Conteúdo:", tabelas);
      return [];
    }

    const processos: ProcessoPJe[] = [];
    const rows = await page.$$(linhas.seletorUsado);

    for (const row of rows) {
      try {
        const cells = await row.$$("td");
        if (cells.length === 0) continue;

        const textoCompleto = await page.evaluate(el => el.textContent?.trim() || "", row);

        // Extrai número CNJ (formato: NNNNNNN-DD.AAAA.J.TR.OOOO)
        const cnjMatch = textoCompleto.match(/\d{7}-\d{2}\.\d{4}\.\d{1}\.\d{2}\.\d{4}/);
        const numeroCnj = cnjMatch ? cnjMatch[0] : `CNPJ ${cnpj} - ${Math.random().toString(36).slice(2, 8)}`;

        processos.push({
          numeroCnj,
          classe: "",
          assunto: "",
          dataDistribuicao: "",
          exequente: "",
          executado: "",
          vara: "",
          comarca: "",
          valorCausa: undefined,
          andamentos: [],
        });

        // Tenta clicar no link do processo para ver detalhes
        const links = await row.$$("a");
        if (links.length > 0) {
          try {
            await links[0].click();
            await aguardar(3000);

            // Extrai dados detalhados da página do processo
            const detalhes = await extrairDetalhesProcesso(page);
            const idx = processos.length - 1;
            Object.assign(processos[idx], detalhes);

            // Volta para a lista
            const btnVoltar = await page.$("button[id*='voltar'], a[id*='voltar'], button:has(span:text('Voltar'))");
            if (btnVoltar) {
              await btnVoltar.click();
              await aguardar(2000);
            } else {
              await page.goBack();
              await aguardar(2000);
            }
          } catch (e) {
            console.log(`[PJeScraper] Erro ao acessar detalhes: ${e}`);
            continue;
          }
        }
      } catch (e) {
        console.log(`[PJeScraper] Erro ao processar linha: ${e}`);
        continue;
      }
    }

    return processos;

  } catch (err) {
    console.error("[PJeScraper] Erro:", err);
    throw err;
  } finally {
    await browser.close();
  }
}

/**
 * Detecta e resolve hCaptcha na página, se presente.
 */
async function resolverCaptchaSeExistir(page: Page): Promise<boolean> {
  try {
    // Verifica se existe o container do hCaptcha
    const temCaptcha = await page.$('.h-captcha, iframe[src*="hcaptcha"], div[data-sitekey]');
    if (!temCaptcha) return false;

    console.log("[PJeScraper] hCaptcha detectado, resolvendo...");

    const siteKey = await page.evaluate(() => {
      const el = document.querySelector('.h-captcha');
      return el?.getAttribute('data-sitekey') || null;
    });

    if (!siteKey) {
      console.log("[PJeScraper] Não foi possível extrair sitekey do captcha");
      return false;
    }

    const resultado = await resolverHCaptcha(siteKey, page.url());

    if (!resultado.success || !resultado.token) {
      console.log(`[PJeScraper] Falha ao resolver captcha: ${resultado.error}`);
      return false;
    }

    console.log("[PJeScraper] Captcha resolvido, injetando token...");

    // Injeta o token na página
    await page.evaluate((token: string) => {
      // Define o token no textarea que o hCaptcha usa
      const textarea = document.querySelector<HTMLTextAreaElement>('textarea[name="h-captcha-response"]');
      if (textarea) {
        textarea.value = token;
      }
      // Tenta acionar o callback do hCaptcha via eventos
      const el = document.querySelector('.h-captcha');
      if (el) {
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
      // Se o hCaptcha expõe o callback global
      if (typeof (window as any).hcaptcha?.setResponse === 'function') {
        (window as any).hcaptcha.setResponse(token);
      }
    }, resultado.token);

    await aguardar(1000);
    return true;
  } catch (err) {
    console.log(`[PJeScraper] Erro ao resolver captcha: ${err}`);
    return false;
  }
}

/**
 * Extrai dados detalhados da página de um processo específico.
 */
async function extrairDetalhesProcesso(page: Page): Promise<Partial<ProcessoPJe>> {
  await aguardar(2000);

  const detalhes: Partial<ProcessoPJe> = {};
  const andamentos: AndamentoPJe[] = [];

  try {
    // Número do processo
    const numEl = await encontrarElemento(page, SELETORES.detalheNumero);
    if (numEl) detalhes.numeroCnj = await page.evaluate(el => el.textContent?.trim() || "", numEl.el);
  } catch {}

  try {
    // Classe
    const classeEl = await encontrarElemento(page, SELETORES.detalheClasse);
    if (classeEl) detalhes.classe = await page.evaluate(el => el.textContent?.trim() || "", classeEl.el);
  } catch {}

  try {
    // Data de distribuição
    const dataEl = await encontrarElemento(page, SELETORES.detalheDataDistribuicao);
    if (dataEl) detalhes.dataDistribuicao = await page.evaluate(el => el.textContent?.trim() || "", dataEl.el);
  } catch {}

  try {
    // Partes (exequente/executado)
    const partesEl = await encontrarElemento(page, SELETORES.detalhePartes);
    if (partesEl) {
      const texto = await page.evaluate(el => el.textContent?.trim() || "", partesEl.el);
      // Tenta identificar exequente e executado
      if (texto.includes("Exequente") || texto.includes("Reqte")) {
        const partes = texto.split("\n").filter(Boolean);
        for (const p of partes) {
          if (p.includes("Exequente") || p.includes("Reqte")) detalhes.exequente = p.replace(/^(Exequente|Reqte):?\s*/i, "").trim();
          if (p.includes("Executado") || p.includes("Reqdo")) detalhes.executado = p.replace(/^(Executado|Reqdo):?\s*/i, "").trim();
        }
      } else {
        detalhes.executado = texto;
      }
    }
  } catch {}

  // Extrai andamentos
  try {
    const tabelaAndamentos = await encontrarElemento(page, SELETORES.andamentoLinha);
    if (tabelaAndamentos) {
      const rows = await page.$$(tabelaAndamentos.seletorUsado);
      for (const row of rows) {
        const cells = await row.$$("td");
        if (cells.length < 2) continue;

        const data = await page.evaluate(el => el.textContent?.trim() || "", cells[0]);
        const texto = await page.evaluate(el => el.textContent?.trim() || "", cells[1]);

        if (data && texto) {
          andamentos.push({ data, texto });
        }
      }
    }
  } catch {}

  detalhes.andamentos = andamentos;
  return detalhes;
}
