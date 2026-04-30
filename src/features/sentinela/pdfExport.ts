import { formatDateBR } from "./dateUtils";
import { PRAZO_TOTAL_DIAS, PRAZO_SUSPENSAO_DIAS, PRAZO_PRESCRICAO_DIAS } from "./constants";
import type { AnalisePrescricao, Processo, EventoProcessual } from "./types";

// ══════════════════════════════════════════════════════════════════════════════
// PDF Export — Gera relatório HTML formatado e abre para impressão/salvar PDF.
//
// Usa window.open + window.print() para máxima compatibilidade cross-browser.
// O usuário pode "Salvar como PDF" no diálogo de impressão do browser.
// ══════════════════════════════════════════════════════════════════════════════

const SCORE_LABELS: Record<string, string> = {
  forte: "FORTE",
  medio: "MODERADO",
  fraco: "FRACO",
  sem_base: "SEM BASE",
  inconclusivo: "INCONCLUSIVO",
};

const SCORE_COLORS: Record<string, string> = {
  forte: "#22d3a4",
  medio: "#f59e0b",
  fraco: "#3b82f6",
  sem_base: "#94a3b8",
  inconclusivo: "#94a3b8",
};

const FASE_LABELS: Record<string, string> = {
  pre_marco: "Pré-marco",
  suspensao_art40_p2: "Suspensão do art. 40, §2º LEF (1 ano)",
  prescricao_em_curso: "Prescrição intercorrente em curso (5 anos)",
  prescrita: "Prescrição consumada",
  parcelamento_ativo: "Parcelamento ativo (exigibilidade suspensa)",
  indefinida: "Indefinida",
};

const EFEITO_LABELS: Record<string, string> = {
  inicia_contagem: "Inicia contagem",
  interrompe: "Interrompe",
  suspende: "Suspende",
  encerra: "Encerra",
  neutro: "Neutro",
  incerto: "Incerto",
};

const CATEGORIA_LABELS: Record<string, string> = {
  suspensao_art40: "Suspensão art. 40",
  arquivamento_art40: "Arquivamento art. 40",
  tentativa_frustrada_localizacao: "Tentativa frustrada (localização)",
  tentativa_frustrada_bens: "Tentativa frustrada (bens)",
  constricao_positiva: "Constrição positiva",
  penhora_rosto_autos: "Penhora no rosto dos autos",
  ciencia_fazenda: "Ciência da Fazenda",
  parcelamento: "Parcelamento",
  parcelamento_rescindido: "Rescisão de parcelamento",
  redirecionamento: "Redirecionamento",
  despacho_citacao: "Despacho de citação",
  citacao_valida: "Citação válida",
  indicacao_bens: "Indicação de bens",
  embargos_executado: "Embargos do executado",
  excecao_pre_executividade: "Exceção de pré-executividade",
  prescricao_reconhecida: "Prescrição reconhecida",
  pedido_fazenda_sem_efeito: "Pedido da Fazenda (sem efeito)",
  ato_neutro: "Ato neutro",
  extincao: "Extinção",
  nao_classificado: "Não classificado",
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function fmtDate(d: Date | null): string {
  return d ? formatDateBR(d) : "—";
}

function fmtValor(v: number | null): string {
  if (v == null) return "Não informado";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function buildEventoRow(
  ev: EventoProcessual,
  marcoId: string | null,
  ultimoAtoId: string | null,
  interrupcaoIds: Set<string>
): string {
  const isMarco = ev.id === marcoId;
  const isUltimoAto = ev.id === ultimoAtoId;
  const isInterrupcao = interrupcaoIds.has(ev.id);

  const badges: string[] = [];
  if (isMarco) badges.push('<span class="badge badge-marco">MARCO INICIAL</span>');
  if (isInterrupcao && !isMarco) badges.push('<span class="badge badge-interrupcao">INTERRUPÇÃO</span>');
  if (isUltimoAto && !isMarco) badges.push('<span class="badge badge-ato">ÚLTIMO ATO ÚTIL</span>');

  const highlight = isMarco || isInterrupcao || isUltimoAto;

  return `
    <tr class="${highlight ? "row-highlight" : ""}">
      <td class="col-data">${fmtDate(ev.data)}</td>
      <td class="col-cat">${CATEGORIA_LABELS[ev.categoria] ?? ev.categoria}</td>
      <td class="col-efeito">${EFEITO_LABELS[ev.efeitoJuridico] ?? ev.efeitoJuridico}</td>
      <td class="col-texto">${escapeHtml(truncate(ev.textoBruto, 120))}${badges.length > 0 ? "<br/>" + badges.join(" ") : ""}</td>
    </tr>`;
}

/**
 * Gera o HTML completo do relatório de prescrição intercorrente.
 */
function buildReportHtml(processo: Processo, analise: AnalisePrescricao): string {
  const scoreColor = SCORE_COLORS[analise.score] ?? "#94a3b8";
  const scoreLabel = SCORE_LABELS[analise.score] ?? analise.score;
  const faseLabel = FASE_LABELS[analise.fase] ?? analise.fase;
  const confianca = Math.round(analise.confiancaGeral * 100);
  const porcentagem = Math.min(100, Math.round((analise.diasTotaisContagem / PRAZO_TOTAL_DIAS) * 100));

  const interrupcaoIds = new Set(analise.interrupcoes.map((ev) => ev.id));

  const eventosComData = processo.eventos.filter((ev) => ev.data !== null);

  const now = new Date();
  const dataRelatorio = formatDateBR(now);

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Relatório — ${escapeHtml(processo.numeroCnj)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
      font-size: 11px;
      line-height: 1.5;
      color: #1a1a1a;
      padding: 24px 32px;
      max-width: 210mm;
      margin: 0 auto;
    }

    @media print {
      body { padding: 0; margin: 0; }
      .no-print { display: none !important; }
      @page { margin: 16mm 14mm; size: A4; }
    }

    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; padding-bottom: 12px; border-bottom: 2px solid #e5e5e5; }
    .header-left h1 { font-size: 18px; font-weight: 800; color: #111; letter-spacing: -0.02em; }
    .header-left .subtitle { font-size: 10px; color: #777; margin-top: 2px; }
    .header-right { text-align: right; font-size: 10px; color: #777; }
    .header-right .data { font-weight: 600; color: #333; }

    .score-box { display: inline-flex; align-items: center; gap: 8px; padding: 8px 16px; border-radius: 8px; margin-bottom: 16px; }
    .score-label { font-size: 14px; font-weight: 800; letter-spacing: 0.04em; }
    .score-sub { font-size: 10px; color: #666; }

    .section { margin-bottom: 16px; }
    .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #555; margin-bottom: 6px; padding-bottom: 4px; border-bottom: 1px solid #e5e5e5; }

    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 20px; }
    .grid-2 .field-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #888; }
    .grid-2 .field-value { font-size: 11px; color: #222; margin-bottom: 6px; }

    .bar-container { height: 8px; background: #e5e5e5; border-radius: 4px; margin: 6px 0 4px; }
    .bar-fill { height: 8px; border-radius: 4px; transition: width 0.3s; }
    .bar-label { font-size: 9px; color: #888; text-align: right; }

    .via-box { padding: 10px 14px; border-radius: 6px; border-left: 3px solid ${scoreColor}; background: #f8f9fa; margin-bottom: 16px; }
    .via-box .via-title { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: ${scoreColor}; margin-bottom: 4px; }
    .via-box .via-text { font-size: 11px; color: #222; font-weight: 500; }

    .warning-box { padding: 8px 12px; border-radius: 6px; background: #fff8e1; border: 1px solid #ffe082; margin-bottom: 16px; }
    .warning-box .warning-title { font-size: 9px; font-weight: 700; color: #f59e0b; margin-bottom: 4px; }
    .warning-box li { font-size: 10px; color: #555; margin-left: 12px; }

    table { width: 100%; border-collapse: collapse; font-size: 10px; }
    table th { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #888; text-align: left; padding: 6px 8px; border-bottom: 2px solid #e5e5e5; }
    table td { padding: 5px 8px; border-bottom: 1px solid #f0f0f0; vertical-align: top; }
    .col-data { width: 75px; white-space: nowrap; color: #555; }
    .col-cat { width: 140px; font-size: 9px; color: #666; }
    .col-efeito { width: 80px; font-size: 9px; }
    .col-texto { font-size: 10px; color: #333; }
    .row-highlight { background: #fafafa; }
    .row-highlight td { font-weight: 500; }

    .badge { display: inline-block; font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; padding: 1px 6px; border-radius: 3px; margin-top: 3px; margin-right: 3px; }
    .badge-marco { background: #fef3c7; color: #d97706; }
    .badge-interrupcao { background: #d1fae5; color: #059669; }
    .badge-ato { background: #e0e7ff; color: #4f46e5; }

    .fundamentos-list { list-style: none; padding: 0; }
    .fundamentos-list li { padding: 3px 0; font-size: 10px; color: #333; }
    .fundamentos-list li::before { content: "•"; color: ${scoreColor}; font-weight: bold; margin-right: 6px; }

    .footer { margin-top: 20px; padding-top: 10px; border-top: 1px solid #e5e5e5; font-size: 9px; color: #999; text-align: center; }
    .footer strong { color: #666; }

    .print-btn { position: fixed; top: 16px; right: 16px; padding: 10px 20px; background: #111; color: white; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; z-index: 100; }
    .print-btn:hover { background: #333; }

    .parcelamento-row { display: flex; gap: 8px; align-items: center; font-size: 10px; color: #555; padding: 2px 0; }
    .parcelamento-arrow { color: #ccc; }
  </style>
</head>
<body>
  <button class="print-btn no-print" onclick="window.print()">⬇ Salvar como PDF</button>

  <div class="header">
    <div class="header-left">
      <h1>Relatório de Prescrição Intercorrente</h1>
      <div class="subtitle">Processo ${escapeHtml(processo.numeroCnj)} — ${escapeHtml(processo.tribunal)}${processo.vara ? " · " + escapeHtml(processo.vara) : ""}</div>
    </div>
    <div class="header-right">
      <div class="data">${dataRelatorio}</div>
      <div>Gerado por Sentinela</div>
    </div>
  </div>

  <!-- Score -->
  <div class="score-box" style="background: ${scoreColor}18; border: 1px solid ${scoreColor}40;">
    <span class="score-label" style="color: ${scoreColor};">${scoreLabel}</span>
    <span class="score-sub">Confiança: ${confianca}% · Fase: ${faseLabel}</span>
  </div>

  <!-- Contagem -->
  <div class="section">
    <div class="section-title">Contagem de prazo</div>
    <div class="grid-2">
      <div>
        <div class="field-label">Dias computados</div>
        <div class="field-value"><strong>${analise.diasTotaisContagem.toLocaleString("pt-BR")}</strong> de ${PRAZO_TOTAL_DIAS.toLocaleString("pt-BR")} (${PRAZO_SUSPENSAO_DIAS} suspensão + ${PRAZO_PRESCRICAO_DIAS} prescrição)</div>
      </div>
      <div>
        <div class="field-label">Data provável da prescrição</div>
        <div class="field-value">${analise.dataProvavelPrescricao ? formatDateBR(analise.dataProvavelPrescricao) : "—"}${analise.diasAteProvavelPrescricao != null && analise.diasAteProvavelPrescricao > 0 ? ` (faltam ${analise.diasAteProvavelPrescricao.toLocaleString("pt-BR")} dias)` : analise.diasAteProvavelPrescricao === 0 ? " (consumada)" : ""}</div>
      </div>
    </div>
    <div class="bar-container">
      <div class="bar-fill" style="width: ${porcentagem}%; background: ${scoreColor};"></div>
    </div>
    <div class="bar-label">${porcentagem}% do prazo total</div>
  </div>

  <!-- Partes -->
  <div class="section">
    <div class="section-title">Identificação</div>
    <div class="grid-2">
      <div>
        <div class="field-label">Exequente</div>
        <div class="field-value">${escapeHtml(processo.exequente || "—")}</div>
      </div>
      <div>
        <div class="field-label">Executado</div>
        <div class="field-value">${escapeHtml(processo.executado || "—")}</div>
      </div>
      <div>
        <div class="field-label">Valor da causa</div>
        <div class="field-value">${fmtValor(processo.valorCausa)}</div>
      </div>
      <div>
        <div class="field-label">Distribuição</div>
        <div class="field-value">${fmtDate(processo.dataDistribuicao)}</div>
      </div>
      <div>
        <div class="field-label">Marco inicial</div>
        <div class="field-value">${fmtDate(analise.marcoInicialData)}${analise.marcoInicial ? " — " + escapeHtml(CATEGORIA_LABELS[analise.marcoInicial.categoria] ?? analise.marcoInicial.categoria) : ""}</div>
      </div>
      <div>
        <div class="field-label">Último ato útil</div>
        <div class="field-value">${fmtDate(analise.ultimoAtoUtilData)}</div>
      </div>
    </div>
  </div>

  <!-- Via sugerida -->
  <div class="via-box">
    <div class="via-title">Via sugerida</div>
    <div class="via-text">${escapeHtml(analise.viaSugerida)}</div>
  </div>

  ${analise.pontosIncerteza.length > 0 ? `
  <div class="warning-box">
    <div class="warning-title">⚠ ${analise.pontosIncerteza.length} ponto(s) de incerteza</div>
    <ul>
      ${analise.pontosIncerteza.map((p) => `<li>${escapeHtml(p)}</li>`).join("")}
    </ul>
  </div>` : ""}

  ${analise.suspensoesEspeciais.length > 0 ? `
  <div class="section">
    <div class="section-title">Parcelamentos (art. 151 VI CTN)</div>
    ${analise.suspensoesEspeciais.map((s, i) => `
      <div class="parcelamento-row">
        <span>#${i + 1}</span>
        <span>${formatDateBR(s.inicio)}</span>
        <span class="parcelamento-arrow">→</span>
        <span>${formatDateBR(s.fim)}</span>
        <span style="color: #888;">— ${escapeHtml(s.motivo)}</span>
      </div>
    `).join("")}
  </div>` : ""}

  <!-- Timeline -->
  <div class="section">
    <div class="section-title">Timeline processual (${eventosComData.length} eventos)</div>
    <table>
      <thead>
        <tr>
          <th>Data</th>
          <th>Categoria</th>
          <th>Efeito</th>
          <th>Descrição</th>
        </tr>
      </thead>
      <tbody>
        ${eventosComData.map((ev) => buildEventoRow(ev, analise.marcoInicial?.id ?? null, analise.ultimoAtoUtil?.id ?? null, interrupcaoIds)).join("")}
      </tbody>
    </table>
  </div>

  <!-- Fundamentos -->
  ${analise.fundamentosJuridicos.length > 0 ? `
  <div class="section">
    <div class="section-title">Fundamentos jurídicos aplicados</div>
    <ul class="fundamentos-list">
      ${analise.fundamentosJuridicos.map((f) => `<li>${escapeHtml(f)}</li>`).join("")}
    </ul>
  </div>` : ""}

  <!-- Footer -->
  <div class="footer">
    <strong>⚠️ Análise automatizada com base nos andamentos. Não substitui parecer jurídico.</strong><br/>
    Verifique os marcos nos autos. Relatório gerado em ${dataRelatorio} por Sentinela.
  </div>
</body>
</html>`;
}

/**
 * Exporta o relatório de prescrição como PDF.
 * Abre uma nova janela com o relatório formatado e dispara window.print().
 */
export function exportarRelatorioPDF(processo: Processo, analise: AnalisePrescricao): void {
  const html = buildReportHtml(processo, analise);
  const win = window.open("", "_blank");
  if (!win) {
    alert("Popup bloqueado pelo navegador. Permita popups para este site e tente novamente.");
    return;
  }
  win.document.write(html);
  win.document.close();
  // Small delay to ensure styles are applied before print dialog
  setTimeout(() => {
    win.print();
  }, 400);
}
