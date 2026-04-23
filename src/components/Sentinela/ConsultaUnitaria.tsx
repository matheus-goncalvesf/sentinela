import { useState } from "react";
import { Plus, Trash2, AlertTriangle, List, AlignLeft, Wifi, PenLine } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Card, CardContent } from "../ui/card";
import { processarEventos, analisarPrescricao } from "../../features/sentinela/motorPrescricao";
import { parseDate, formatDateBR } from "../../features/sentinela/dateUtils";
import type { AnalisePrescricao, Processo } from "../../features/sentinela/types";
import { BuscaAutomatica } from "./BuscaAutomatica";

interface ConsultaUnitariaProps {
  onAnalisesRealizadas: (processos: Processo[], analises: AnalisePrescricao[]) => void;
}

type ModoBusca = "automatica" | "manual";
type ModoEntradaEvento = "tabela" | "texto_livre";

interface LinhaEvento {
  id: string;
  data: string;
  texto: string;
}

function gerarId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function parseLinhTextoLivre(linha: string): { data: Date | null; texto: string } {
  const match = linha.match(
    /^(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\d{4}-\d{2}-\d{2})\s*[-–:·]?\s*/
  );
  if (match) {
    const dataStr = match[1];
    const texto = linha.slice(match[0].length).trim();
    return { data: parseDate(dataStr), texto: texto || linha };
  }
  return { data: null, texto: linha.trim() };
}

export function ConsultaUnitaria({ onAnalisesRealizadas }: ConsultaUnitariaProps) {
  const [modoBusca, setModoBusca] = useState<ModoBusca>("automatica");
  const [numeroCnj, setNumeroCnj] = useState("");
  const [tribunal, setTribunal] = useState("");
  const [vara, setVara] = useState("");
  const [exequente, setExequente] = useState("");
  const [executado, setExecutado] = useState("");
  const [valorCausa, setValorCausa] = useState("");
  const [dataDistribuicao, setDataDistribuicao] = useState("");
  const [modoEntrada, setModoEntrada] = useState<ModoEntradaEvento>("tabela");
  const [linhas, setLinhas] = useState<LinhaEvento[]>([{ id: gerarId(), data: "", texto: "" }]);
  const [textoLivre, setTextoLivre] = useState("");
  const [erros, setErros] = useState<string[]>([]);

  const previewTextoLivre = textoLivre
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => parseLinhTextoLivre(l));

  function addLinha() { setLinhas((prev) => [...prev, { id: gerarId(), data: "", texto: "" }]); }
  function removeLinha(id: string) { setLinhas((prev) => prev.filter((l) => l.id !== id)); }
  function updateLinha(id: string, campo: "data" | "texto", valor: string) {
    setLinhas((prev) => prev.map((l) => (l.id === id ? { ...l, [campo]: valor } : l)));
  }

  function validar(): string[] {
    const erros: string[] = [];
    if (!numeroCnj.trim()) erros.push("Número do processo é obrigatório.");
    if (modoEntrada === "tabela") {
      if (linhas.filter((l) => l.texto.trim()).length === 0) erros.push("Informe pelo menos um andamento.");
    } else {
      if (previewTextoLivre.filter((l) => l.texto.trim()).length === 0) erros.push("Cole pelo menos um andamento no campo de texto.");
    }
    return erros;
  }

  function handleAnalisar() {
    const validacoes = validar();
    if (validacoes.length > 0) { setErros(validacoes); return; }
    setErros([]);

    const eventosRaw =
      modoEntrada === "tabela"
        ? linhas.filter((l) => l.texto.trim()).map((l) => ({ data: parseDate(l.data), textoBruto: l.texto.trim() }))
        : previewTextoLivre.filter((l) => l.texto.trim()).map((l) => ({ data: l.data, textoBruto: l.texto }));

    const eventos = processarEventos(eventosRaw);
    const processo: Processo = {
      id: gerarId(),
      numeroCnj: numeroCnj.trim(),
      tribunal: tribunal.trim(),
      vara: vara.trim(),
      comarca: "",
      classe: "Execucao Fiscal",
      valorCausa: valorCausa ? parseFloat(valorCausa.replace(",", ".")) || null : null,
      dataDistribuicao: parseDate(dataDistribuicao),
      exequente: exequente.trim(),
      executado: executado.trim(),
      cnpjExecutado: "",
      isExecucaoFiscal: true,
      eventos,
      modoEntrada: "manual",
    };
    const analise = analisarPrescricao(processo, new Date());
    onAnalisesRealizadas([processo], [analise]);
  }

  const switcher = (
    <div className="flex rounded-lg border border-border bg-card p-1 w-fit">
      <button
        onClick={() => setModoBusca("automatica")}
        className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
          modoBusca === "automatica"
            ? "bg-primary text-white shadow-sm"
            : "text-muted-foreground hover:bg-secondary hover:text-foreground"
        }`}
      >
        <Wifi className="h-4 w-4" />
        Busca automática (TJSP)
      </button>
      <button
        onClick={() => setModoBusca("manual")}
        className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
          modoBusca === "manual"
            ? "bg-primary text-white shadow-sm"
            : "text-muted-foreground hover:bg-secondary hover:text-foreground"
        }`}
      >
        <PenLine className="h-4 w-4" />
        Entrada manual
      </button>
    </div>
  );

  if (modoBusca === "automatica") {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        {switcher}
        <BuscaAutomatica onAnalisesRealizadas={onAnalisesRealizadas} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {switcher}

      <div>
        <h2 className="text-lg font-semibold text-foreground">Entrada manual</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Analise um processo específico inserindo os dados manualmente.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-4 pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Identificação do processo
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label htmlFor="numeroCnj">Número do processo (CNJ) *</Label>
              <Input id="numeroCnj" value={numeroCnj} onChange={(e) => setNumeroCnj(e.target.value)} placeholder="0000000-00.0000.0.00.0000" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="tribunal">Tribunal</Label>
              <Input id="tribunal" value={tribunal} onChange={(e) => setTribunal(e.target.value)} placeholder="Ex: TJSP" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="vara">Vara</Label>
              <Input id="vara" value={vara} onChange={(e) => setVara(e.target.value)} placeholder="Ex: 1a Vara de Fazenda Pública" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="exequente">Exequente</Label>
              <Input id="exequente" value={exequente} onChange={(e) => setExequente(e.target.value)} placeholder="Ex: Fazenda do Estado" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="executado">Executado</Label>
              <Input id="executado" value={executado} onChange={(e) => setExecutado(e.target.value)} placeholder="Ex: Empresa Exemplo Ltda" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="valorCausa">Valor da causa (R$)</Label>
              <Input id="valorCausa" value={valorCausa} onChange={(e) => setValorCausa(e.target.value)} placeholder="Ex: 50000.00" type="number" step="0.01" min="0" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="dataDistribuicao">Data de distribuição</Label>
              <Input id="dataDistribuicao" value={dataDistribuicao} onChange={(e) => setDataDistribuicao(e.target.value)} type="date" className="mt-1" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 pt-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Andamentos processuais *
            </p>
            <div className="flex rounded-md border border-border overflow-hidden">
              <button
                onClick={() => setModoEntrada("tabela")}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors ${
                  modoEntrada === "tabela"
                    ? "bg-primary text-white"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                <List className="h-3.5 w-3.5" />
                Tabela
              </button>
              <button
                onClick={() => setModoEntrada("texto_livre")}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors ${
                  modoEntrada === "texto_livre"
                    ? "bg-primary text-white"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                <AlignLeft className="h-3.5 w-3.5" />
                Texto livre
              </button>
            </div>
          </div>

          {modoEntrada === "tabela" && (
            <div className="space-y-2">
              <div className="grid grid-cols-[140px_1fr_32px] gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <span>Data</span>
                <span>Texto do andamento</span>
                <span />
              </div>
              {linhas.map((linha) => (
                <div key={linha.id} className="grid grid-cols-[140px_1fr_32px] items-center gap-2">
                  <Input type="date" value={linha.data} onChange={(e) => updateLinha(linha.id, "data", e.target.value)} className="text-sm" />
                  <Input value={linha.texto} onChange={(e) => updateLinha(linha.id, "texto", e.target.value)} placeholder="Texto do andamento" className="text-sm" />
                  <button
                    onClick={() => removeLinha(linha.id)}
                    disabled={linhas.length === 1}
                    className="flex h-8 w-8 items-center justify-center rounded text-muted-foreground hover:bg-red-500/10 hover:text-red-400 disabled:opacity-30"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <Button variant="ghost" size="sm" onClick={addLinha} className="gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                <Plus className="h-3.5 w-3.5" />
                Adicionar andamento
              </Button>
            </div>
          )}

          {modoEntrada === "texto_livre" && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Cole os andamentos, um por linha. Se a linha começar com uma data (DD/MM/AAAA ou
                AAAA-MM-DD), ela será detectada automaticamente.
              </p>
              <textarea
                value={textoLivre}
                onChange={(e) => setTextoLivre(e.target.value)}
                placeholder={"15/01/2020 - Devolvido AR - Mudou-se\n01/03/2020 - Ato ordinatorio praticado\n01/06/2020 - Arquivem-se os autos"}
                rows={8}
                className="w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />

              {previewTextoLivre.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold text-muted-foreground">
                    Preview ({previewTextoLivre.length} andamento(s) detectados):
                  </p>
                  <div className="max-h-48 overflow-y-auto rounded border border-border bg-secondary">
                    {previewTextoLivre.map((item, idx) => (
                      <div key={idx} className="flex gap-3 border-b border-border px-3 py-2 last:border-0">
                        <span className="flex-shrink-0 text-xs text-muted-foreground">
                          {item.data ? formatDateBR(item.data) : "s/ data"}
                        </span>
                        <span className="text-xs text-foreground">{item.texto}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {erros.length > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/5 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-400" />
          <ul className="space-y-1 text-sm text-red-400">
            {erros.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}

      <Button onClick={handleAnalisar} className="w-full">
        Analisar prescrição
      </Button>
    </div>
  );
}
