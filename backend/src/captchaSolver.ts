const CAPTCHA_API_KEY = process.env.CAPTCHA_API_KEY || "";
const POLL_INTERVAL = 5000;
const MAX_POLLS = 60;

interface CaptchaResponse {
  success: boolean;
  token?: string;
  error?: string;
}

export async function resolverHCaptcha(
  siteKey: string,
  pageUrl: string
): Promise<CaptchaResponse> {
  if (!CAPTCHA_API_KEY) {
    return { success: false, error: "CAPTCHA_API_KEY não configurada" };
  }

  console.log("[CaptchaSolver] Enviando hCaptcha para 2captcha...");
  console.log(`[CaptchaSolver] SiteKey: ${siteKey}, URL: ${pageUrl}`);

  const submitUrl = `https://2captcha.com/in.php`;
  const params = new URLSearchParams({
    key: CAPTCHA_API_KEY,
    method: "hcaptcha",
    sitekey: siteKey,
    pageurl: pageUrl,
    json: "1",
  });

  try {
    const submitRes = await fetch(`${submitUrl}?${params}`, {
      signal: AbortSignal.timeout(15000),
    });
    const submitData = await submitRes.json();

    if (submitData.status !== 1) {
      return {
        success: false,
        error: `2captcha submit error: ${submitData.request || "unknown"}`,
      };
    }

    const requestId = submitData.request;
    console.log(`[CaptchaSolver] Request ID: ${requestId}, aguardando solução...`);

    const resultUrl = `https://2captcha.com/res.php`;
    const resultParams = new URLSearchParams({
      key: CAPTCHA_API_KEY,
      action: "get",
      id: requestId,
      json: "1",
    });

    for (let i = 0; i < MAX_POLLS; i++) {
      await new Promise(r => setTimeout(r, POLL_INTERVAL));
      const res = await fetch(`${resultUrl}?${resultParams}`, {
        signal: AbortSignal.timeout(10000),
      });
      const data = await res.json();

      if (data.status === 1) {
        console.log(`[CaptchaSolver] Captcha resolvido!`);
        return { success: true, token: data.request };
      }

      if (data.request && data.request !== "CAPCHA_NOT_READY") {
        return {
          success: false,
          error: `2captcha error: ${data.request}`,
        };
      }
    }

    return { success: false, error: "Timeout aguardando solução do captcha" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro de rede ao resolver captcha";
    return { success: false, error: msg };
  }
}
