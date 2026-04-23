import { useState } from "react";
import { Layers, Search } from "lucide-react";
import type { AnalisePrescricao, Processo } from "../../features/sentinela/types";
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
  }

  function handleAnalisesRealizadas(ps: Processo[], as_: AnalisePrescricao[]) {
    setProcessos(ps);
    setAnalises(as_);
    setEtapaUnitario("resultado");
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

        {(etapaLote === "upload" || etapaUnitario === "input") && (
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
    </div>
  );
}
