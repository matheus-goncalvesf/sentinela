import { useState, useEffect } from "react";
import { carregarHistorico } from "../../features/sentinela/storageService";
import type { Processo, AnalisePrescricao } from "../../features/sentinela/types";
import { ResultadoLista } from "./ResultadoLista";
import { ProcessoDetalhe } from "./ProcessoDetalhe";

export function ProcessosPage() {
  const [processos, setProcessos] = useState<Processo[]>([]);
  const [analises, setAnalises] = useState<AnalisePrescricao[]>([]);
  const [view, setView] = useState<"list" | "detail">("list");
  const [processoSelecionado, setProcessoSelecionado] = useState<string | null>(null);

  useEffect(() => {
    const historico = carregarHistorico();
    const todosProcessos: Processo[] = [];
    const todasAnalises: AnalisePrescricao[] = [];
    
    const procIds = new Set<string>();
    
    for (const entry of historico) {
      entry.processos.forEach(p => {
        if (!procIds.has(p.id)) {
          procIds.add(p.id);
          todosProcessos.push(p);
        }
      });
      entry.analises.forEach(a => {
        if (!todasAnalises.some(ext => ext.processoId === a.processoId)) {
          todasAnalises.push(a);
        }
      });
    }
    
    setProcessos(todosProcessos);
    setAnalises(todasAnalises);
  }, []);

  const processoAtual = view === "detail" ? processos.find((p) => p.id === processoSelecionado) : undefined;
  const analiseAtual = processoAtual ? analises.find((a) => a.processoId === processoAtual.id) : undefined;

  if (view === "detail" && processoAtual && analiseAtual) {
    return <ProcessoDetalhe processo={processoAtual} analise={analiseAtual} onVoltar={() => setView("list")} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-extrabold tracking-tight text-foreground">Meus Processos</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Histórico consolidado de todos os processos monitorados pela sua conta.
        </p>
      </div>
      
      {processos.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <p className="text-sm font-medium text-foreground">Nenhum processo salvo no histórico.</p>
          <p className="text-xs text-muted-foreground mt-2">Use o Dashboard para importar ou buscar processos no TJSP.</p>
        </div>
      ) : (
        <ResultadoLista
          processos={processos}
          analises={analises}
          onSelectProcesso={(id) => { setProcessoSelecionado(id); setView("detail"); }}
        />
      )}
    </div>
  );
}
