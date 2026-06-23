import { useState, useEffect } from "react";
import { ChevronDown, ChevronUp, Copy, ArrowLeft, AlertTriangle, FileDown, Phone, Mail, Loader2, Building2 } from "lucide-react";
import { exportarRelatorioPDF } from "../../features/sentinela/pdfExport";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { SCORE_COLORS } from "../../features/sentinela/constants";
import { formatDateBR } from "../../features/sentinela/dateUtils";
import type { AnalisePrescricao, Processo } from "../../features/sentinela/types";
import { TimelineJuridica } from "./TimelineJuridica";
import { buscarDadosCnpj, formatarTelefone, type DadosCnpj } from "../../services/receitaService";

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
  const [dadosCnpj, setDadosCnpj] = useState<DadosCnpj | null>(null);
  const [loadingCnpj, setLoadingCnpj] = useState(false);

  useEffect(() => {
    const cnpj = processo.cnpjExecutado;
    if (!cnpj || cnpj.replace(/\D/g, "").length !== 14) return;
    setLoadingCnpj(true);
    buscarDadosCnpj(cnpj)
      .then((dados) => setDadosCnpj(dados))
      .finally(() => setLoadingCnpj(false));
  }, [processo.cnpjExecutado]);


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
        <div className="flex-1">
          <h2 className="text-base font-semibold text-foreground">{processo.numeroCnj}</h2>
          <p className="text-xs text-muted-foreground">
            {processo.tribunal}{processo.vara ? ` · ${processo.vara}` : ""}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => exportarRelatorioPDF(processo, analise)}
          className="gap-1.5 text-xs"
        >
          <FileDown className="h-3.5 w-3.5" />
          Exportar PDF
        </Button>
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
              {processo.cnpjExecutado && (
                <p className="mt-0.5 font-mono text-[11px] text-muted-foreground/60">{processo.cnpjExecutado}</p>
              )}
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

      {/* Dados Cadastrais da Receita Federal */}
      {processo.cnpjExecutado && processo.cnpjExecutado.replace(/\D/g, "").length === 14 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                Dados Cadastrais (Receita Federal)
              </CardTitle>
              {loadingCnpj && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </div>
          </CardHeader>
          <CardContent>
            {!loadingCnpj && !dadosCnpj && (
              <p className="text-xs text-muted-foreground/60">Dados não encontrados para este CNPJ.</p>
            )}
            {dadosCnpj && (
              <div className="space-y-3">
                {/* Razão Social / Nome Fantasia */}
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Razão Social</p>
                  <p className="text-sm text-foreground">{dadosCnpj.razao_social}</p>
                  {dadosCnpj.nome_fantasia && dadosCnpj.nome_fantasia !== dadosCnpj.razao_social && (
                    <p className="text-xs text-muted-foreground">{dadosCnpj.nome_fantasia}</p>
                  )}
                </div>

                <div className="h-px bg-border" />

                {/* Contatos em destaque */}
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {(dadosCnpj.ddd_telefone_1 || dadosCnpj.ddd_telefone_2) && (
                    <div className="flex items-start gap-2.5 rounded-lg border border-border bg-secondary/50 px-3 py-2.5">
                      <Phone className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary" />
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Telefone</p>
                        {dadosCnpj.ddd_telefone_1 && (
                          <p className="text-sm font-medium text-foreground">
                            <a
                              href={`tel:+55${dadosCnpj.ddd_telefone_1.replace(/\D/g, "")}`}
                              className="transition-colors hover:text-primary"
                            >
                              {formatarTelefone(dadosCnpj.ddd_telefone_1)}
                            </a>
                          </p>
                        )}
                        {dadosCnpj.ddd_telefone_2 && dadosCnpj.ddd_telefone_2 !== dadosCnpj.ddd_telefone_1 && (
                          <p className="text-xs text-muted-foreground">
                            <a
                              href={`tel:+55${dadosCnpj.ddd_telefone_2.replace(/\D/g, "")}`}
                              className="transition-colors hover:text-primary"
                            >
                              {formatarTelefone(dadosCnpj.ddd_telefone_2)}
                            </a>
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {dadosCnpj.email && (
                    <div className="flex items-start gap-2.5 rounded-lg border border-border bg-secondary/50 px-3 py-2.5">
                      <Mail className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary" />
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">E-mail</p>
                        <p className="truncate text-sm font-medium text-foreground">
                          <a
                            href={`mailto:${dadosCnpj.email}`}
                            className="transition-colors hover:text-primary"
                          >
                            {dadosCnpj.email.toLowerCase()}
                          </a>
                        </p>
                      </div>
                    </div>
                  )}

                  {!dadosCnpj.ddd_telefone_1 && !dadosCnpj.ddd_telefone_2 && !dadosCnpj.email && (
                    <p className="col-span-2 text-xs text-muted-foreground/60">
                      Nenhum telefone ou e-mail cadastrado na Receita Federal.
                    </p>
                  )}
                </div>

                <div className="h-px bg-border" />

                {/* Endereço e situação */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <p className="font-semibold uppercase tracking-wide text-muted-foreground">Situação</p>
                    <p className={`mt-0.5 font-medium ${dadosCnpj.situacao_cadastral === 2 ? "text-emerald-400" : "text-amber-400"
                      }`}>
                      {dadosCnpj.descricao_situacao_cadastral}
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold uppercase tracking-wide text-muted-foreground">Porte</p>
                    <p className="mt-0.5 text-foreground">{dadosCnpj.porte}</p>
                  </div>
                  {(dadosCnpj.municipio || dadosCnpj.uf) && (
                    <div className="col-span-2">
                      <p className="font-semibold uppercase tracking-wide text-muted-foreground">Endereço</p>
                      <p className="mt-0.5 text-foreground">
                        {[dadosCnpj.logradouro, dadosCnpj.numero, dadosCnpj.complemento]
                          .filter(Boolean).join(", ")}
                        {dadosCnpj.bairro ? ` — ${dadosCnpj.bairro}` : ""}
                        {dadosCnpj.municipio ? `, ${dadosCnpj.municipio}/${dadosCnpj.uf}` : ""}
                      </p>
                    </div>
                  )}
                  {dadosCnpj.cnae_fiscal_descricao && (
                    <div className="col-span-2">
                      <p className="font-semibold uppercase tracking-wide text-muted-foreground">Atividade principal</p>
                      <p className="mt-0.5 text-foreground">{dadosCnpj.cnae_fiscal_descricao}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
