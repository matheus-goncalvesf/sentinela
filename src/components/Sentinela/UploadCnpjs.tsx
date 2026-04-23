import { useRef, useState, useCallback } from "react";
import { Users, CheckCircle2, XCircle, Loader2, FileText } from "lucide-react";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { buscarProcessosPorCnpj, buscarAndamentos } from "../../services/tjspService";
import { montarEAnalisarDoTjsp } from "../../features/sentinela/tjspUtils";
import type { AnalisePrescricao, Processo } from "../../features/sentinela/types";

interface UploadCnpjsProps {
  onProcessosImportados: (processos: Processo[], analises: AnalisePrescricao[]) => void;
}

type Etapa = "idle" | "confirmacao" | "processando" | "concluido";

type StatusCnpj =
  | { tipo: "aguardando" }
  | { tipo: "buscando_processos" }
  | { tipo: "buscando_andamentos"; nProcessos: number }
  | { tipo: "concluido"; nProcessos: number }
  | { tipo: "sem_resultado" }
  | { tipo: "erro"; mensagem: string };

interface ItemCnpj {
  cnpj: string;
  status: StatusCnpj;
}

const CONCURRENCY_CNPJ = 2;

const CNPJ_TEMPLATE = `# Formato: um CNPJ por linha (com ou sem mascara).
# Linhas comecando com # sao ignoradas.
# Exemplos de CNPJs ficticios:
11.222.333/0001-81
44.555.666/0001-09
77.888.999/0001-35
`;

function limparCnpj(s: string): string { return s.replace(/\D/g, ""); }

function formatarCnpj(cnpj: string): string {
  const d = cnpj.replace(/\D/g, "");
  if (d.length !== 14) return cnpj;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

function formatarTempo(segundos: number): string {
  if (segundos < 60) return `~${segundos}s`;
  return `~${Math.ceil(segundos / 60)} min`;
}

async function processWithConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<void>
): Promise<void> {
  let nextIdx = 0;
  async function worker() {
    while (nextIdx < items.length) {
      const i = nextIdx++;
      await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
}

function parseCnpjsDoArquivo(texto: string): { cnpjs: string[]; avisos: string[] } {
  const linhas = texto.split(/\r?\n/);
  const avisos: string[] = [];
  const vistos = new Set<string>();
  const cnpjs: string[] = [];

  const primeiraLinhaDados = linhas.find((l) => l.trim() && !l.trim().startsWith("#"));
  const temCabecalho = primeiraLinhaDados != null && /cnpj|empresa|razao|nome/i.test(primeiraLinhaDados);
  let primeiraLinhaProcessada = false;

  for (const linha of linhas) {
    const trimmed = linha.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const colunas = trimmed.split(/[;,\t]/);
    const valorBruto = colunas[0].trim();
    if (temCabecalho && !primeiraLinhaProcessada) { primeiraLinhaProcessada = true; continue; }
    primeiraLinhaProcessada = true;
    const digitos = limparCnpj(valorBruto);
    if (digitos.length !== 14) { avisos.push(`"${valorBruto}" ignorado — não contém 14 dígitos`); continue; }
    if (vistos.has(digitos)) { avisos.push(`CNPJ ${formatarCnpj(digitos)} duplicado — ignorado`); continue; }
    vistos.add(digitos);
    cnpjs.push(digitos);
  }
  return { cnpjs, avisos };
}

export function UploadCnpjs({ onProcessosImportados }: UploadCnpjsProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const canceladoRef = useRef(false);

  const [etapa, setEtapa] = useState<Etapa>("idle");
  const [isDragging, setIsDragging] = useState(false);
  const [cnpjs, setCnpjs] = useState<string[]>([]);
  const [avisosParse, setAvisosParse] = useState<string[]>([]);
  const [itens, setItens] = useState<ItemCnpj[]>([]);
  const [totalConcluidos, setTotalConcluidos] = useState(0);
  const [resumoFinal, setResumoFinal] = useState({ processosAnalisados: 0, semResultado: 0, erros: 0 });

  function atualizarStatus(cnpj: string, status: StatusCnpj) {
    setItens((prev) => prev.map((it) => (it.cnpj === cnpj ? { ...it, status } : it)));
  }

  function handleFile(file: File) {
    const nome = file.name.toLowerCase();
    if (!nome.endsWith(".csv") && !nome.endsWith(".txt")) {
      setAvisosParse(["Arquivo inválido — selecione um .csv ou .txt"]);
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const texto = e.target?.result as string;
      const { cnpjs: cnpjsParsed, avisos } = parseCnpjsDoArquivo(texto);
      setCnpjs(cnpjsParsed);
      setAvisosParse(avisos);
      if (cnpjsParsed.length > 0) setEtapa("confirmacao");
    };
    reader.readAsText(file, "UTF-8");
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function handleDownloadTemplate() {
    const blob = new Blob([CNPJ_TEMPLATE], { type: "text/plain;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cnpjs-modelo.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  const handleIniciar = useCallback(async () => {
    canceladoRef.current = false;
    const itensIniciais: ItemCnpj[] = cnpjs.map((c) => ({ cnpj: c, status: { tipo: "aguardando" } }));
    setItens(itensIniciais);
    setTotalConcluidos(0);
    setEtapa("processando");

    const todosProcessos: Processo[] = [];
    const todasAnalises: AnalisePrescricao[] = [];
    let nSemResultado = 0;
    let nErros = 0;

    await processWithConcurrency(cnpjs, CONCURRENCY_CNPJ, async (cnpj, index) => {
      if (canceladoRef.current) return;
      await new Promise((r) => setTimeout(r, 300 * index));
      if (canceladoRef.current) return;
      atualizarStatus(cnpj, { tipo: "buscando_processos" });
      let processosEncontrados;
      try {
        processosEncontrados = await buscarProcessosPorCnpj(cnpj);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        atualizarStatus(cnpj, { tipo: "erro", mensagem: msg });
        nErros++;
        setTotalConcluidos((n) => n + 1);
        return;
      }
      if (canceladoRef.current) return;
      if (processosEncontrados.length === 0) {
        atualizarStatus(cnpj, { tipo: "sem_resultado" });
        nSemResultado++;
        setTotalConcluidos((n) => n + 1);
        return;
      }
      atualizarStatus(cnpj, { tipo: "buscando_andamentos", nProcessos: processosEncontrados.length });
      const promessas = processosEncontrados.map((p) =>
        buscarAndamentos(p.codigoProcesso, p.foro).then((andamentos) => ({ p, andamentos }))
      );
      const settled = await Promise.allSettled(promessas);
      if (canceladoRef.current) return;
      let nAnalisadosNesteCnpj = 0;
      settled.forEach((result) => {
        if (result.status === "rejected") return;
        const { p, andamentos } = result.value;
        const { processo, analise } = montarEAnalisarDoTjsp(p, cnpj, andamentos);
        todosProcessos.push(processo);
        todasAnalises.push(analise);
        nAnalisadosNesteCnpj++;
      });
      atualizarStatus(cnpj, { tipo: "concluido", nProcessos: nAnalisadosNesteCnpj });
      setTotalConcluidos((n) => n + 1);
    });

    setResumoFinal({ processosAnalisados: todosProcessos.length, semResultado: nSemResultado, erros: nErros });
    setEtapa("concluido");
    if (todosProcessos.length > 0) onProcessosImportados(todosProcessos, todasAnalises);
  }, [cnpjs, onProcessosImportados]);

  function handleCancelar() { canceladoRef.current = true; setEtapa("concluido"); }

  function handleNovoScraping() {
    setCnpjs([]); setAvisosParse([]); setItens([]); setTotalConcluidos(0);
    canceladoRef.current = false; setEtapa("idle");
  }

  if (etapa === "idle") {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Importe um arquivo com CNPJs para scraping automático no TJSP.
        </p>
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`cursor-pointer rounded-xl border-2 border-dashed p-10 text-center transition-colors ${
            isDragging
              ? "border-primary bg-primary/5"
              : "border-border bg-secondary hover:border-primary/40"
          }`}
        >
          <input ref={inputRef} type="file" accept=".csv,.txt" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleFile(file); e.target.value = ""; }} className="hidden" />
          <Users className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
          <p className="text-sm font-medium text-foreground">
            Arraste um arquivo CSV ou TXT ou <span className="text-primary">clique para selecionar</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Um CNPJ por linha</p>
        </div>

        {avisosParse.length > 0 && (
          <div className="space-y-1">
            {avisosParse.map((a, i) => <p key={i} className="text-xs text-amber-400">! {a}</p>)}
          </div>
        )}

        <div className="flex items-center gap-3 rounded-lg border border-border bg-secondary p-4">
          <FileText className="h-5 w-5 flex-shrink-0 text-muted-foreground/40" />
          <p className="flex-1 text-xs text-muted-foreground">Baixe o modelo para ver o formato esperado.</p>
          <Button variant="ghost" size="sm" onClick={handleDownloadTemplate} className="text-xs text-muted-foreground hover:text-foreground">
            Baixar modelo
          </Button>
        </div>
      </div>
    );
  }

  if (etapa === "confirmacao") {
    const estimativaSegundos = cnpjs.length * 3 * 2;
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm font-semibold text-foreground">{cnpjs.length} CNPJ(s) prontos para scraping</p>
            <p className="mt-1 text-xs text-muted-foreground">Estimativa: {formatarTempo(estimativaSegundos)}</p>
            {avisosParse.length > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer text-xs text-amber-400">{avisosParse.length} aviso(s) durante o parse</summary>
                <ul className="mt-2 space-y-0.5 text-xs text-amber-400/80">
                  {avisosParse.map((a, i) => <li key={i}>- {a}</li>)}
                </ul>
              </details>
            )}
            <div className="mt-3 max-h-40 overflow-y-auto rounded border border-border bg-background p-2">
              {cnpjs.map((c) => <p key={c} className="font-mono text-xs text-muted-foreground">{formatarCnpj(c)}</p>)}
            </div>
          </CardContent>
        </Card>
        <div className="flex gap-3">
          <Button onClick={handleIniciar} className="flex-1">Iniciar scraping</Button>
          <Button variant="outline" onClick={() => { setCnpjs([]); setAvisosParse([]); setEtapa("idle"); }}>Cancelar</Button>
        </div>
      </div>
    );
  }

  if (etapa === "processando") {
    const pct = cnpjs.length > 0 ? (totalConcluidos / cnpjs.length) * 100 : 0;
    return (
      <div className="space-y-4">
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Progresso geral</span>
            <span>{totalConcluidos} de {cnpjs.length}</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-secondary">
            <div className="h-1.5 rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto rounded-lg border border-border divide-y divide-border">
          {itens.map((item) => (
            <div key={item.cnpj} className="flex items-center gap-3 px-3 py-2">
              <StatusIcon status={item.status} />
              <span className="font-mono text-xs text-foreground">{formatarCnpj(item.cnpj)}</span>
              <span className="ml-auto text-xs text-muted-foreground"><StatusLabel status={item.status} /></span>
            </div>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={handleCancelar} className="w-full text-xs">
          Cancelar (mantém resultados parciais)
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border-emerald-500/30">
        <CardContent className="pt-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-400" />
            <div>
              <p className="text-sm font-semibold text-emerald-400">Scraping concluído</p>
              <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                <li>+ {resumoFinal.processosAnalisados} processo(s) analisado(s)</li>
                {resumoFinal.semResultado > 0 && <li className="text-muted-foreground/60">○ {resumoFinal.semResultado} CNPJ(s) sem resultados no TJSP</li>}
                {resumoFinal.erros > 0 && <li className="text-red-400">✗ {resumoFinal.erros} CNPJ(s) com erro</li>}
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
      <Button variant="outline" onClick={handleNovoScraping} className="w-full">Novo scraping</Button>
    </div>
  );
}

function StatusIcon({ status }: { status: StatusCnpj }) {
  switch (status.tipo) {
    case "aguardando": return <span className="h-3 w-3 rounded-full bg-secondary flex-shrink-0 border border-border" />;
    case "buscando_processos":
    case "buscando_andamentos": return <Loader2 className="h-3 w-3 animate-spin text-primary flex-shrink-0" />;
    case "concluido": return <CheckCircle2 className="h-3 w-3 text-emerald-400 flex-shrink-0" />;
    case "sem_resultado": return <span className="text-xs font-bold text-muted-foreground/50 flex-shrink-0">0</span>;
    case "erro": return <XCircle className="h-3 w-3 text-red-400 flex-shrink-0" />;
  }
}

function StatusLabel({ status }: { status: StatusCnpj }) {
  switch (status.tipo) {
    case "aguardando": return <>aguardando</>;
    case "buscando_processos": return <>consultando TJSP...</>;
    case "buscando_andamentos": return <>{status.nProcessos} processo(s) - buscando andamentos...</>;
    case "concluido": return <>{status.nProcessos} processo(s) analisado(s)</>;
    case "sem_resultado": return <>nenhum processo encontrado</>;
    case "erro": return <span className="text-red-400">{status.mensagem.slice(0, 50)}</span>;
  }
}
