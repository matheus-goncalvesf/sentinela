import { useMemo, useState } from "react";
import { Search, RotateCcw, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Card, CardContent } from "../ui/card";
import { Input } from "../ui/input";
import { SCORE_COLORS } from "../../features/sentinela/constants";
import { formatDateBR } from "../../features/sentinela/dateUtils";
import type { AnalisePrescricao, Processo, ScorePrescricao } from "../../features/sentinela/types";

interface ResultadoListaProps {
  processos: Processo[];
  analises: AnalisePrescricao[];
  onSelectProcesso: (processoId: string) => void;
  onNovaImportacao: () => void;
}

const SCORE_ORDER: Record<ScorePrescricao, number> = {
  forte: 0,
  medio: 1,
  fraco: 2,
  sem_base: 3,
  inconclusivo: 4,
};

const SCORES_FILTRO: { valor: ScorePrescricao; label: string }[] = [
  { valor: "forte", label: "Forte indício" },
  { valor: "medio", label: "Moderado" },
  { valor: "fraco", label: "Fraco" },
  { valor: "sem_base", label: "Sem base" },
  { valor: "inconclusivo", label: "Inconclusivo" },
];

type OrdemLista = "urgencia" | "distribuicao" | "cnj";

function normalizarBusca(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function formatarCnpj(cnpj: string): string {
  const d = cnpj.replace(/\D/g, "");
  if (d.length !== 14) return cnpj;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export function ResultadoLista({ processos, analises, onSelectProcesso, onNovaImportacao }: ResultadoListaProps) {
  const [filtroTexto, setFiltroTexto] = useState("");
  const [scoresFiltro, setScoresFiltro] = useState<Set<ScorePrescricao>>(new Set());
  const [ordem, setOrdem] = useState<OrdemLista>("urgencia");
  const [visualizacao, setVisualizacao] = useState<"processos" | "cnpj">("processos");
  const [gruposAbertos, setGruposAbertos] = useState<Set<string>>(new Set());

  const analiseMap = useMemo(() => new Map(analises.map((a) => [a.processoId, a])), [analises]);

  const todosDoTjsp = useMemo(
    () => processos.length > 0 && processos.every((p) => p.modoEntrada === "tjsp"),
    [processos]
  );

  const processosFiltrados = useMemo(() => {
    const textoBusca = normalizarBusca(filtroTexto);
    return processos
      .filter((p) => {
        if (scoresFiltro.size > 0) {
          const analise = analiseMap.get(p.id);
          if (!analise || !scoresFiltro.has(analise.score)) return false;
        }
        if (!textoBusca) return true;
        return (
          normalizarBusca(p.numeroCnj).includes(textoBusca) ||
          normalizarBusca(p.executado).includes(textoBusca) ||
          normalizarBusca(p.exequente).includes(textoBusca)
        );
      })
      .sort((a, b) => {
        if (ordem === "distribuicao") {
          const da = a.dataDistribuicao?.getTime() ?? Infinity;
          const db = b.dataDistribuicao?.getTime() ?? Infinity;
          return da - db;
        }
        if (ordem === "cnj") return a.numeroCnj.localeCompare(b.numeroCnj);
        const sa = analiseMap.get(a.id)?.score ?? "inconclusivo";
        const sb = analiseMap.get(b.id)?.score ?? "inconclusivo";
        return SCORE_ORDER[sa] - SCORE_ORDER[sb];
      });
  }, [processos, analiseMap, filtroTexto, scoresFiltro, ordem]);

  const contadores = useMemo(
    () =>
      SCORES_FILTRO.reduce((acc, { valor }) => {
        acc[valor] = analises.filter((a) => a.score === valor).length;
        return acc;
      }, {} as Record<ScorePrescricao, number>),
    [analises]
  );

  const gruposPorCnpj = useMemo(() => {
    if (!todosDoTjsp) return [];
    const mapa = new Map<string, Processo[]>();
    for (const p of processosFiltrados) {
      const cnpj = p.cnpjExecutado || "sem-cnpj";
      const lista = mapa.get(cnpj) ?? [];
      lista.push(p);
      mapa.set(cnpj, lista);
    }
    return Array.from(mapa.entries())
      .map(([cnpj, procs]) => {
        const piorScore = procs.reduce<ScorePrescricao>((melhor, p) => {
          const score = analiseMap.get(p.id)?.score ?? "inconclusivo";
          return SCORE_ORDER[score] < SCORE_ORDER[melhor] ? score : melhor;
        }, "inconclusivo");
        return { cnpj, procs, piorScore };
      })
      .sort((a, b) => SCORE_ORDER[a.piorScore] - SCORE_ORDER[b.piorScore]);
  }, [todosDoTjsp, processosFiltrados, analiseMap]);

  function toggleScore(score: ScorePrescricao) {
    setScoresFiltro((prev) => {
      const next = new Set(prev);
      if (next.has(score)) next.delete(score);
      else next.add(score);
      return next;
    });
  }

  function toggleGrupo(cnpj: string) {
    setGruposAbertos((prev) => {
      const next = new Set(prev);
      if (next.has(cnpj)) next.delete(cnpj);
      else next.add(cnpj);
      return next;
    });
  }

  const mostrarFiltros = processos.length > 5;

  return (
    <div className="space-y-4">
      {/* Resumo */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {SCORES_FILTRO.map(({ valor, label }) => {
          const colors = SCORE_COLORS[valor];
          const count = contadores[valor] ?? 0;
          const ativo = scoresFiltro.has(valor);
          return (
            <button
              key={valor}
              onClick={() => toggleScore(valor)}
              className={`rounded-lg border p-3 text-left transition-all ${
                ativo
                  ? `${colors.bg} ${colors.border}`
                  : "border-border bg-card hover:border-primary/30 hover:bg-secondary"
              }`}
            >
              <p className={`text-2xl font-bold ${ativo ? colors.text : "text-foreground"}`}>
                {count}
              </p>
              <p className={`text-xs ${ativo ? colors.text + "/70" : "text-muted-foreground"}`}>{label}</p>
            </button>
          );
        })}
      </div>

      {/* Controles */}
      <div className="flex flex-wrap items-center gap-3">
        {mostrarFiltros && (
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filtroTexto}
              onChange={(e) => setFiltroTexto(e.target.value)}
              placeholder="Filtrar por processo, executado ou exequente..."
              className="pl-9"
            />
          </div>
        )}

        {mostrarFiltros && (
          <select
            value={ordem}
            onChange={(e) => setOrdem(e.target.value as OrdemLista)}
            className="rounded-md border border-border bg-secondary px-3 py-2 text-xs text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="urgencia">Mais urgente primeiro</option>
            <option value="distribuicao">Distribuição mais antiga</option>
            <option value="cnj">Número CNJ (A-Z)</option>
          </select>
        )}

        {todosDoTjsp && (
          <div className="inline-flex rounded-lg border border-border bg-card p-1">
            <button
              onClick={() => setVisualizacao("processos")}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                visualizacao === "processos"
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Por processo
            </button>
            <button
              onClick={() => setVisualizacao("cnpj")}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                visualizacao === "cnpj"
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Por CNPJ
            </button>
          </div>
        )}

        {(scoresFiltro.size > 0 || filtroTexto) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setFiltroTexto(""); setScoresFiltro(new Set()); }}
            className="gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Limpar filtros
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={onNovaImportacao}>
          Nova importação
        </Button>
      </div>

      {/* Visualização por CNPJ */}
      {visualizacao === "cnpj" && todosDoTjsp ? (
        <div className="space-y-3">
          {gruposPorCnpj.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Nenhum processo corresponde aos filtros aplicados.
            </p>
          ) : (
            gruposPorCnpj.map(({ cnpj, procs, piorScore }) => {
              const aberto = gruposAbertos.has(cnpj);
              const colors = SCORE_COLORS[piorScore] ?? SCORE_COLORS.inconclusivo;
              const nomeExecutado = procs[0]?.executado || "—";
              return (
                <Card key={cnpj} className="overflow-hidden">
                  <button
                    onClick={() => toggleGrupo(cnpj)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-secondary"
                  >
                    {aberto ? (
                      <ChevronDown className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-mono text-xs font-semibold text-foreground">{formatarCnpj(cnpj)}</p>
                      <p className="truncate text-xs text-muted-foreground">{nomeExecutado}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">{procs.length} processo(s)</span>
                    <Badge className={`${colors.bg} ${colors.text} border-0 text-xs font-semibold`}>
                      {SCORE_COLORS[piorScore]?.label ?? piorScore}
                    </Badge>
                  </button>
                  {aberto && (
                    <CardContent className="p-0 border-t border-border">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <tbody>
                            {procs.map((processo) => {
                              const analise = analiseMap.get(processo.id);
                              if (!analise) return null;
                              const c = SCORE_COLORS[analise.score] ?? SCORE_COLORS.inconclusivo;
                              return (
                                <tr key={processo.id} className="border-b border-border last:border-0 hover:bg-secondary">
                                  <td className="px-4 py-3">
                                    <p className="font-mono text-xs font-medium text-foreground">{processo.numeroCnj}</p>
                                    {processo.vara && <p className="text-xs text-muted-foreground">{processo.vara}</p>}
                                  </td>
                                  <td className="px-4 py-3 text-xs text-muted-foreground">
                                    {processo.dataDistribuicao ? formatDateBR(processo.dataDistribuicao) : "—"}
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    <Badge className={`${c.bg} ${c.text} border-0 text-xs font-semibold`}>
                                      {SCORE_COLORS[analise.score]?.label ?? analise.score}
                                    </Badge>
                                  </td>
                                  <td className="px-4 py-3 text-center text-xs text-muted-foreground">
                                    {analise.diasSemAtoUtil != null ? analise.diasSemAtoUtil.toLocaleString("pt-BR") : "—"}
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    <Button variant="outline" size="sm" onClick={() => onSelectProcesso(processo.id)} className="text-xs">
                                      Ver detalhe
                                    </Button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  )}
                </Card>
              );
            })
          )}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs font-semibold uppercase tracking-wide text-muted-foreground bg-secondary">
                    <th className="px-4 py-3 text-left">Processo</th>
                    <th className="px-4 py-3 text-left">Executado</th>
                    <th className="px-4 py-3 text-left">Valor</th>
                    <th className="px-4 py-3 text-left">Distribuição</th>
                    <th className="px-4 py-3 text-center">Eventos</th>
                    <th className="px-4 py-3 text-center">Score</th>
                    <th className="px-4 py-3 text-center">Dias</th>
                    <th className="px-4 py-3 text-right">Confiança</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {processosFiltrados.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-muted-foreground">
                        Nenhum processo corresponde aos filtros aplicados.
                      </td>
                    </tr>
                  ) : (
                    processosFiltrados.map((processo) => {
                      const analise = analiseMap.get(processo.id);
                      if (!analise) return null;
                      const colors = SCORE_COLORS[analise.score] ?? SCORE_COLORS.inconclusivo;
                      return (
                        <tr
                          key={processo.id}
                          className="border-b border-border transition-colors last:border-0 hover:bg-secondary"
                        >
                          <td className="px-4 py-3">
                            <p className="font-mono text-xs font-medium text-foreground">{processo.numeroCnj}</p>
                            {processo.modoEntrada === "tjsp" && (
                              <span className="mt-0.5 inline-block rounded bg-primary/10 px-1 py-0.5 text-[10px] font-medium text-primary">
                                TJSP
                              </span>
                            )}
                            {processo.modoEntrada === "csv" && (
                              <span className="mt-0.5 inline-block rounded bg-secondary px-1 py-0.5 text-[10px] font-medium text-muted-foreground">
                                CSV
                              </span>
                            )}
                          </td>
                          <td className="max-w-[180px] px-4 py-3">
                            <p className="truncate text-sm text-foreground">{processo.executado || "—"}</p>
                          </td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">
                            {processo.valorCausa != null
                              ? processo.valorCausa.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
                              : "—"}
                          </td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">
                            {processo.dataDistribuicao ? formatDateBR(processo.dataDistribuicao) : "—"}
                          </td>
                          <td className="px-4 py-3 text-center text-sm text-muted-foreground">
                            {processo.eventos.length}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Badge className={`${colors.bg} ${colors.text} border-0 text-xs font-semibold`}>
                              {SCORE_COLORS[analise.score]?.label ?? analise.score}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-center text-sm font-medium text-foreground">
                            {analise.diasSemAtoUtil != null ? analise.diasSemAtoUtil.toLocaleString("pt-BR") : "—"}
                          </td>
                          <td className="px-4 py-3 text-right text-sm text-muted-foreground">
                            {Math.round(analise.confiancaGeral * 100)}%
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Button variant="outline" size="sm" onClick={() => onSelectProcesso(processo.id)} className="text-xs">
                              Ver detalhe
                            </Button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <p className="text-right text-xs text-muted-foreground">
        {processosFiltrados.length} de {processos.length} processo(s)
      </p>
    </div>
  );
}
