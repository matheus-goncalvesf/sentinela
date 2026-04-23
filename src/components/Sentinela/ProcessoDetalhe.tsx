import { useState } from "react";
import { ChevronDown, ChevronUp, Copy, ArrowLeft, AlertTriangle } from "lucide-react";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { SCORE_COLORS } from "../../features/sentinela/constants";
import { formatDateBR } from "../../features/sentinela/dateUtils";
import type { AnalisePrescricao, Processo } from "../../features/sentinela/types";
import { TimelineJuridica } from "./TimelineJuridica";

interface ProcessoDetalheProps {
  processo: Processo;
  analise: AnalisePrescricao;
  onVoltar: () => void;
}

const SCORE_LABEL_FULL: Record<string, string> = {
  forte: "Forte indício de prescrição intercorrente",
  medio: "Indício moderado de prescrição intercorrente",
  fraco: "Indício fraco de prescrição intercorrente",
  sem_base: "Dados insuficientes para análise",
  inconclusivo: "Análise inconclusiva — marco não identificado",
};

export function ProcessoDetalhe({ processo, analise, onVoltar }: ProcessoDetalheProps) {
  const [incertezasExpandidas, setIncertezasExpandidas] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const scoreColors = SCORE_COLORS[analise.score] ?? SCORE_COLORS.inconclusivo;

  function handleCopiar() {
    navigator.clipboard.writeText(analise.explicacaoTextual).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    });
  }

  const prazoNecessario = analise.prazoNecessario;
  const diasDecorridos = analise.diasTotaisContagem;
  const porcentagem = Math.min(100, Math.round((diasDecorridos / prazoNecessario) * 100));

  const barColor = porcentagem >= 100 ? "bg-red-500" : porcentagem >= 80 ? "bg-amber-400" : "bg-primary";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onVoltar} className="gap-1.5 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Button>
        <div>
          <h2 className="text-base font-semibold text-foreground">{processo.numeroCnj}</h2>
          <p className="text-xs text-muted-foreground">
            {processo.tribunal}{processo.vara ? ` · ${processo.vara}` : ""}
          </p>
        </div>
      </div>

      {/* Score card */}
      <Card className={`border ${scoreColors.border}`}>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <Badge className={`${scoreColors.bg} ${scoreColors.text} border-0 text-sm font-semibold`}>
                {SCORE_LABEL_FULL[analise.score]}
              </Badge>
              <p className="mt-2 text-xs text-muted-foreground">
                Confiança geral: {Math.round(analise.confiancaGeral * 100)}%
              </p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-foreground">
                {analise.diasSemAtoUtil != null
                  ? analise.diasSemAtoUtil.toLocaleString("pt-BR")
                  : "—"}
              </p>
              <p className="text-xs text-muted-foreground">dias sem ato útil</p>
              <p className="mt-0.5 text-xs text-muted-foreground/60">
                Prazo necessário: {prazoNecessario.toLocaleString("pt-BR")} dias
              </p>
            </div>
          </div>

          {analise.diasSemAtoUtil != null && (
            <div className="mt-4">
              <div className="h-1.5 w-full rounded-full bg-secondary">
                <div
                  className={`h-1.5 rounded-full transition-all ${barColor}`}
                  style={{ width: `${porcentagem}%` }}
                />
              </div>
              <p className="mt-1 text-right text-xs text-muted-foreground">{porcentagem}% do prazo</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Partes */}
      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Exequente</p>
              <p className="text-foreground">{processo.exequente || "—"}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Executado</p>
              <p className="text-foreground">{processo.executado || "—"}</p>
            </div>
            {(processo.comarca || processo.vara) && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Foro / Comarca</p>
                <p className="text-foreground">{[processo.comarca, processo.vara].filter(Boolean).join(" · ")}</p>
              </div>
            )}
            {processo.valorCausa != null && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Valor da causa</p>
                <p className="text-foreground">
                  {processo.valorCausa.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </p>
              </div>
            )}
            {processo.dataDistribuicao && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Distribuição</p>
                <p className="text-foreground">{formatDateBR(processo.dataDistribuicao)}</p>
              </div>
            )}
            {analise.marcoInicialData && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Marco inicial</p>
                <p className="text-foreground">{formatDateBR(analise.marcoInicialData)}</p>
              </div>
            )}
            {analise.ultimoAtoUtilData && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Último ato útil</p>
                <p className="text-foreground">{formatDateBR(analise.ultimoAtoUtilData)}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Via sugerida */}
      <Card className="border-primary/25 bg-primary/5">
        <CardContent className="pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Via sugerida</p>
          <p className="mt-1 text-sm font-medium text-foreground">{analise.viaSugerida}</p>
        </CardContent>
      </Card>

      {/* Pontos de incerteza */}
      {analise.pontosIncerteza.length > 0 && (
        <Card className="border-amber-500/25">
          <CardContent className="pt-4">
            <button
              onClick={() => setIncertezasExpandidas((p) => !p)}
              className="flex w-full items-center justify-between text-left"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-400" />
                <span className="text-sm font-semibold text-amber-400">
                  {analise.pontosIncerteza.length} ponto(s) de incerteza
                </span>
              </div>
              {incertezasExpandidas ? (
                <ChevronUp className="h-4 w-4 text-amber-400" />
              ) : (
                <ChevronDown className="h-4 w-4 text-amber-400" />
              )}
            </button>

            {incertezasExpandidas && (
              <ul className="mt-3 space-y-1.5">
                {analise.pontosIncerteza.map((ponto, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <span className="mt-0.5 flex-shrink-0">-</span>
                    <span>{ponto}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {/* Parcelamentos */}
      {analise.suspensoesEspeciais.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Parcelamentos detectados (suspensão especial)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {analise.suspensoesEspeciais.map((s, idx) => (
                <div key={idx} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="text-xs text-muted-foreground/50">#{idx + 1}</span>
                  <span>{formatDateBR(s.inicio)}</span>
                  <span className="text-border">&rarr;</span>
                  <span>{formatDateBR(s.fim)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Timeline */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Timeline processual</CardTitle>
          <p className="text-xs text-muted-foreground">{processo.eventos.length} eventos</p>
        </CardHeader>
        <CardContent>
          <TimelineJuridica
            eventos={processo.eventos}
            marcoInicialId={analise.marcoInicial?.id ?? null}
            ultimoAtoUtilId={analise.ultimoAtoUtil?.id ?? null}
            interrupcoes={analise.interrupcoes}
          />
        </CardContent>
      </Card>

      {/* Relatório textual */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Relatório</CardTitle>
            <Button variant="ghost" size="sm" onClick={handleCopiar} className="gap-1.5 text-xs text-muted-foreground hover:text-foreground">
              <Copy className="h-3.5 w-3.5" />
              {copiado ? "Copiado!" : "Copiar"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <pre className="overflow-auto whitespace-pre-wrap rounded-lg bg-secondary p-4 text-xs leading-relaxed text-muted-foreground ring-1 ring-inset ring-border">
            {analise.explicacaoTextual}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
