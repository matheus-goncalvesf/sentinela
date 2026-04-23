import { useState } from "react";
import { Search, CheckSquare, Square, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Card, CardContent } from "../ui/card";
import { buscarProcessosPorCnpj, buscarAndamentos } from "../../services/tjspService";
import type { ProcessoTJSP } from "../../services/tjspService";
import { montarEAnalisarDoTjsp } from "../../features/sentinela/tjspUtils";
import type { AnalisePrescricao, Processo } from "../../features/sentinela/types";

interface BuscaAutomaticaProps {
  onAnalisesRealizadas: (processos: Processo[], analises: AnalisePrescricao[]) => void;
}

type Etapa = "cnpj" | "selecao" | "processando";

function mascaraCnpj(valor: string): string {
  const d = valor.replace(/\D/g, "").slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

function getChaveTjsp(p: ProcessoTJSP): string { return p.codigoProcesso; }

export function BuscaAutomatica({ onAnalisesRealizadas }: BuscaAutomaticaProps) {
  const [etapa, setEtapa] = useState<Etapa>("cnpj");
  const [cnpj, setCnpj] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [processosEncontradosTjsp, setProcessosEncontradosTjsp] = useState<ProcessoTJSP[]>([]);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [progresso, setProgresso] = useState({ atual: 0, total: 0 });
  const [avisos, setAvisos] = useState<string[]>([]);

  const totalEncontrados = processosEncontradosTjsp.length;

  async function handleBuscarProcessos() {
    setErro(null);
    setCarregando(true);
    try {
      const processos = await buscarProcessosPorCnpj(cnpj);
      if (processos.length === 0) {
        setErro("Nenhum processo de execução fiscal encontrado para este CNPJ no TJSP.");
        return;
      }
      setProcessosEncontradosTjsp(processos);
      setSelecionados(new Set(processos.map(getChaveTjsp)));
      setEtapa("selecao");
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao consultar o TJSP.");
    } finally {
      setCarregando(false);
    }
  }

  async function handleAnalisar() {
    setEtapa("processando");
    setAvisos([]);
    const resultados: Array<{ processo: Processo; analise: AnalisePrescricao }> = [];
    const novosAvisos: string[] = [];
    const paraAnalisar = processosEncontradosTjsp.filter((p) => selecionados.has(getChaveTjsp(p)));
    if (paraAnalisar.length === 0) { setEtapa("selecao"); return; }
    setProgresso({ atual: 0, total: paraAnalisar.length });
    const promessas = paraAnalisar.map((p) =>
      buscarAndamentos(p.codigoProcesso, p.foro).then((andamentos) => ({ p, andamentos }))
    );
    const settled = await Promise.allSettled(promessas);
    settled.forEach((result, idx) => {
      const p = paraAnalisar[idx];
      setProgresso((prev) => ({ ...prev, atual: idx + 1 }));
      if (result.status === "rejected") {
        const msg = result.reason instanceof Error ? result.reason.message : String(result.reason);
        novosAvisos.push(`${p.numeroCnj}: falha ao buscar andamentos — ${msg}`);
        return;
      }
      const { andamentos } = result.value;
      if (andamentos.length === 0) novosAvisos.push(`${p.numeroCnj}: nenhum andamento encontrado no TJSP.`);
      const { processo, analise } = montarEAnalisarDoTjsp(p, cnpj, andamentos);
      resultados.push({ processo, analise });
    });
    setAvisos(novosAvisos);
    if (resultados.length === 0) {
      setErro("Não foi possível obter andamentos de nenhum processo selecionado. " + (novosAvisos.length > 0 ? novosAvisos.join(" ") : ""));
      setEtapa("selecao");
      return;
    }
    onAnalisesRealizadas(resultados.map((r) => r.processo), resultados.map((r) => r.analise));
  }

  function toggleSelecionado(chave: string) {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(chave)) next.delete(chave);
      else next.add(chave);
      return next;
    });
  }

  function toggleTodos() {
    if (selecionados.size === totalEncontrados) setSelecionados(new Set());
    else setSelecionados(new Set(processosEncontradosTjsp.map(getChaveTjsp)));
  }

  function resetarParaCnpj() {
    setEtapa("cnpj");
    setProcessosEncontradosTjsp([]);
    setSelecionados(new Set());
    setErro(null);
  }

  if (etapa === "cnpj") {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Informe o CNPJ do executado. O sistema consultará o TJSP e listará as execuções
          fiscais encontradas para análise de prescrição intercorrente.
        </p>

        <div className="flex gap-3">
          <Input
            value={cnpj}
            onChange={(e) => setCnpj(mascaraCnpj(e.target.value))}
            onKeyDown={(e) => e.key === "Enter" && !carregando && handleBuscarProcessos()}
            placeholder="00.000.000/0001-00"
            className="max-w-xs font-mono"
            disabled={carregando}
          />
          <Button onClick={handleBuscarProcessos} disabled={carregando || cnpj.replace(/\D/g, "").length < 14} className="gap-2">
            {carregando ? (
              <><Loader2 className="h-4 w-4 animate-spin" />Consultando TJSP...</>
            ) : (
              <><Search className="h-4 w-4" />Buscar processos</>
            )}
          </Button>
        </div>

        {erro && (
          <div className="flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/5 p-4">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-400" />
            <p className="text-sm text-red-400">{erro}</p>
          </div>
        )}

        <p className="text-xs text-muted-foreground/60">
          Fonte: TJSP — Consulta de Processos do 1º Grau (CPOPG). Apenas execuções fiscais são exibidas.
        </p>
      </div>
    );
  }

  if (etapa === "selecao") {
    const todosSelecionados = selecionados.size === totalEncontrados;
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-foreground">
            {totalEncontrados} processo(s) de execução fiscal encontrado(s) no TJSP
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={toggleTodos} className="gap-1.5 text-xs text-muted-foreground hover:text-foreground">
              {todosSelecionados ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
              {todosSelecionados ? "Desmarcar todos" : "Selecionar todos"}
            </Button>
            <Button variant="ghost" size="sm" onClick={resetarParaCnpj} className="text-xs text-muted-foreground">
              Novo CNPJ
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {processosEncontradosTjsp.map((p) => {
                const sel = selecionados.has(getChaveTjsp(p));
                return (
                  <button
                    key={getChaveTjsp(p)}
                    onClick={() => toggleSelecionado(getChaveTjsp(p))}
                    className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary ${sel ? "bg-primary/5" : ""}`}
                  >
                    <div className={`mt-0.5 h-4 w-4 flex-shrink-0 ${sel ? "text-primary" : "text-muted-foreground/30"}`}>
                      {sel ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-mono text-xs font-medium text-foreground">{p.numeroCnj}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {p.vara || p.comarca ? `${p.vara}${p.comarca ? " - " + p.comarca : ""}` : "Vara não identificada"}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground/60">
                        {p.exequente && <span>Exequente: {p.exequente}</span>}
                        {p.dataDistribuicao && <span>Dist.: {p.dataDistribuicao}</span>}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {erro && (
          <div className="flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/5 p-4">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-400" />
            <p className="text-sm text-red-400">{erro}</p>
          </div>
        )}

        <Button onClick={handleAnalisar} disabled={selecionados.size === 0} className="w-full">
          Analisar {selecionados.size} processo(s) selecionado(s)
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 py-8 text-center">
      <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
      <p className="text-sm font-medium text-foreground">
        Buscando andamentos... {progresso.atual} de {progresso.total}
      </p>
      <div className="mx-auto h-1.5 max-w-xs rounded-full bg-secondary">
        <div
          className="h-1.5 rounded-full bg-primary transition-all"
          style={{ width: progresso.total > 0 ? `${(progresso.atual / progresso.total) * 100}%` : "0%" }}
        />
      </div>
      {avisos.length > 0 && (
        <div className="mx-auto max-w-sm text-left">
          {avisos.map((a, i) => <p key={i} className="text-xs text-amber-400">! {a}</p>)}
        </div>
      )}
    </div>
  );
}
