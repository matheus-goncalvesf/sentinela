import { useState, useEffect } from "react";
import { Layers, Search, Clock, Trash2, ChevronRight } from "lucide-react";
import type { AnalisePrescricao, Processo } from "../../features/sentinela/types";
import {
  carregarHistorico,
  salvarNoHistorico,
  removerDoHistorico,
  limparHistorico,
  type HistoricoEntry,
} from "../../features/sentinela/storageService";
import { SCORE_COLORS } from "../../features/sentinela/constants";
import { ConsultaUnitaria } from "./ConsultaUnitaria";
import { ProcessoDetalhe } from "./ProcessoDetalhe";
import { ResultadoLista } from "./ResultadoLista";
import { UploadProcessos } from "./UploadProcessos";

type ModoSentinela = "lote" | "unitario";
type EtapaLote = "upload" | "resultado" | "detalhe";
type EtapaUnitario = "input" | "resultado" | "detalhe";

export function SentinelaDashboard() {
  const [modo, setModo] = useState<ModoSentinela>("lote");
  const [etapaLote, setEtapaLote] = useState<EtapaLote>("upload");
  const [etapaUnitario, setEtapaUnitario] = useState<EtapaUnitario>("input");
  const [processos, setProcessos] = useState<Processo[]>([]);
  const [analises, setAnalises] = useState<AnalisePrescricao[]>([]);
  const [processoSelecionado, setProcessoSelecionado] = useState<string | null>(null);
  const [historico, setHistorico] = useState<HistoricoEntry[]>([]);

  // Load history on mount
  useEffect(() => {
    setHistorico(carregarHistorico());
  }, []);

  function refreshHistorico() {
    setHistorico(carregarHistorico());
  }

  function handleModoChange(novoModo: ModoSentinela) {
    if (novoModo === modo) return;
    setModo(novoModo);
    setEtapaLote("upload");
    setEtapaUnitario("input");
    setProcessos([]);
    setAnalises([]);
    setProcessoSelecionado(null);
  }

  function handleProcessosImportados(ps: Processo[], as_: AnalisePrescricao[]) {
    setProcessos(ps);
    setAnalises(as_);
    setEtapaLote("resultado");
    salvarNoHistorico(ps, as_);
    refreshHistorico();
  }

  function handleAnalisesRealizadas(ps: Processo[], as_: AnalisePrescricao[]) {
    setProcessos(ps);
    setAnalises(as_);
    setEtapaUnitario("resultado");
    salvarNoHistorico(ps, as_);
    refreshHistorico();
  }

  function handleCarregarHistorico(entry: HistoricoEntry) {
    setProcessos(entry.processos);
    setAnalises(entry.analises);
    setModo("lote");
    setEtapaLote("resultado");
    setProcessoSelecionado(null);
  }

  function handleRemoverHistorico(id: string) {
    removerDoHistorico(id);
    refreshHistorico();
  }

  function handleLimparHistorico() {
    limparHistorico();
    refreshHistorico();
  }

  const processoAtual: Processo | undefined = (() => {
    if (etapaLote === "detalhe") return processos.find((p) => p.id === processoSelecionado);
    if (etapaUnitario === "resultado" && processos.length === 1) return processos[0];
    if (etapaUnitario === "detalhe") return processos.find((p) => p.id === processoSelecionado);
    return undefined;
  })();

  const analiseAtual = processoAtual
    ? analises.find((a) => a.processoId === processoAtual.id)
    : undefined;

  const estaNaTelaInicial = (modo === "lote" && etapaLote === "upload") || (modo === "unitario" && etapaUnitario === "input");

  function renderConteudo() {
    if (modo === "lote") {
      if (etapaLote === "upload") return <UploadProcessos onProcessosImportados={handleProcessosImportados} />;
      if (etapaLote === "resultado") return (
        <ResultadoLista
          processos={processos}
          analises={analises}
          onSelectProcesso={(id) => { setProcessoSelecionado(id); setEtapaLote("detalhe"); }}
          onNovaImportacao={() => { setEtapaLote("upload"); setProcessos([]); setAnalises([]); }}
        />
      );
      if (etapaLote === "detalhe" && processoAtual && analiseAtual) return (
        <ProcessoDetalhe processo={processoAtual} analise={analiseAtual} onVoltar={() => setEtapaLote("resultado")} />
      );
    }

    if (modo === "unitario") {
      if (etapaUnitario === "input") return <ConsultaUnitaria onAnalisesRealizadas={handleAnalisesRealizadas} />;
      if (etapaUnitario === "resultado" && processos.length === 1 && processoAtual && analiseAtual) return (
        <ProcessoDetalhe
          processo={processoAtual}
          analise={analiseAtual}
          onVoltar={() => { setEtapaUnitario("input"); setProcessos([]); setAnalises([]); }}
        />
      );
      if (etapaUnitario === "resultado" && processos.length > 1) return (
        <ResultadoLista
          processos={processos}
          analises={analises}
          onSelectProcesso={(id) => { setProcessoSelecionado(id); setEtapaUnitario("detalhe"); }}
          onNovaImportacao={() => { setEtapaUnitario("input"); setProcessos([]); setAnalises([]); }}
        />
      );
      if (etapaUnitario === "detalhe" && processoAtual && analiseAtual) return (
        <ProcessoDetalhe processo={processoAtual} analise={analiseAtual} onVoltar={() => setEtapaUnitario("resultado")} />
      );
    }
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs text-muted-foreground mt-1">
            Identificação conservadora de prescrição intercorrente com base no art. 40 da LEF.
          </p>
        </div>

        {estaNaTelaInicial && (
          <div className="flex rounded-lg border border-border bg-card p-1">
            <button
              onClick={() => handleModoChange("lote")}
              className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                modo === "lote"
                  ? "bg-primary text-white shadow-sm"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              <Layers className="h-4 w-4" />
              Importação em lote
            </button>
            <button
              onClick={() => handleModoChange("unitario")}
              className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                modo === "unitario"
                  ? "bg-primary text-white shadow-sm"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              <Search className="h-4 w-4" />
              Consulta unitária
            </button>
          </div>
        )}
      </div>

      {renderConteudo()}

      {/* Histórico de análises */}
      {estaNaTelaInicial && historico.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">Análises anteriores</h3>
              <span className="text-xs text-muted-foreground">({historico.length})</span>
            </div>
            <button
              onClick={handleLimparHistorico}
              className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-red-400"
            >
              <Trash2 className="h-3 w-3" />
              Limpar tudo
            </button>
          </div>

          <div className="divide-y divide-border rounded-xl border border-border bg-card overflow-hidden">
            {historico.map((entry) => {
              const data = new Date(entry.timestamp);
              const dataStr = data.toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              });

              return (
                <div
                  key={entry.id}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-secondary group"
                >
                  <button
                    onClick={() => handleCarregarHistorico(entry)}
                    className="flex flex-1 items-center gap-3 text-left min-w-0"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{entry.label}</p>
                      <p className="text-xs text-muted-foreground">{dataStr}</p>
                    </div>

                    {/* Score badges */}
                    <div className="hidden sm:flex items-center gap-1.5 flex-shrink-0">
                      {(["forte", "medio", "fraco", "sem_base", "inconclusivo"] as const).map((score) => {
                        const count = entry.resumo[score];
                        if (count === 0) return null;
                        const colors = SCORE_COLORS[score];
                        return (
                          <span
                            key={score}
                            className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${colors.bg} ${colors.text}`}
                          >
                            {count}
                          </span>
                        );
                      })}
                    </div>

                    <span className="text-xs text-muted-foreground flex-shrink-0">
                      {entry.totalProcessos} proc.
                    </span>

                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 flex-shrink-0" />
                  </button>

                  <button
                    onClick={() => handleRemoverHistorico(entry.id)}
                    className="flex-shrink-0 text-muted-foreground/30 opacity-0 transition-all group-hover:opacity-100 hover:text-red-400"
                    title="Remover"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
