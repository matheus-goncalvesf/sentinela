import { useRef, useState } from "react";
import { ExternalLink, Upload, CheckCircle2, Globe, Loader2, Wifi, WifiOff, Play, Settings2 } from "lucide-react";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { parseJsonExportadoPje, parseCsvTxtPje, getTrfPorUf } from "../../services/pjeService";
import {
  consultarLote,
  healthCheck,
  getBackendUrl,
  configurarBackend,
} from "../../services/pjeBackendClient";
import { processarEventos, analisarPrescricao } from "../../features/sentinela/motorPrescricao";
import { parseDate } from "../../features/sentinela/dateUtils";
import { montarEAnalisarDoTjsp } from "../../features/sentinela/tjspUtils";
import type { AnalisePrescricao, Processo } from "../../features/sentinela/types";

const UFS = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS",
  "MG","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO",
];

interface UploadCnpjsFederalProps {
  onProcessosImportados: (processos: Processo[], analises: AnalisePrescricao[]) => void;
}

function limparCnpj(s: string) { return s.replace(/\D/g, ""); }
function formatarCnpj(cnpj: string): string {
  const d = cnpj.replace(/\D/g, "");
  if (d.length !== 14) return cnpj;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export function UploadCnpjsFederal({ onProcessosImportados }: UploadCnpjsFederalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [cnpjs, setCnpjs] = useState<string[]>([]);
  const [uf, setUf] = useState("SP");
  const [processos, setProcessos] = useState<Processo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progresso, setProgresso] = useState({ atual: 0, total: 0 });
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [backendUrlInput, setBackendUrlInput] = useState(getBackendUrl());

  const trf = getTrfPorUf(uf);

  function handleCnpjInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const linhas = e.target.value.split("\n");
    const parsed: string[] = [];
    for (const linha of linhas) {
      const d = limparCnpj(linha);
      if (d.length === 14) parsed.push(d);
    }
    setCnpjs(parsed);
  }

  async function handleBuscarAutomatico() {
    setError(null);
    setIsProcessing(true);
    try {
      const tribunal = trf?.sigla || "TRF3";
      const resultados = await consultarLote(cnpjs, tribunal, (atual, total) => {
        setProgresso({ atual, total });
      });

      const todosProcessos: Processo[] = [];

      for (const r of resultados) {
        for (const pje of r.processos) {
          const andamentos = pje.andamentos.map(a => ({
            data: a.data,
            texto: a.texto,
          }));

          const resultado = montarEAnalisarDoTjsp({
            numeroCnj: pje.numeroCnj,
            codigoProcesso: pje.numeroCnj,
            foro: "",
            vara: pje.vara || "",
            comarca: pje.comarca || "",
            classe: pje.classe || "",
            assunto: pje.assunto || "",
            dataDistribuicao: pje.dataDistribuicao || "",
            exequente: pje.exequente || "",
            executado: pje.executado || "",
          }, r.cnpj, andamentos);

          const proc = resultado.processo;
          proc.tribunal = tribunal;
          proc.isExecucaoFiscal = true;
          proc.modoEntrada = "tjsp";
          proc.cnpjExecutado = r.cnpj;

          const eventos = processarEventos(
            andamentos.map(a => ({ data: parseDate(a.data), textoBruto: a.texto }))
          );

          todosProcessos.push({ ...proc, eventos });
        }
      }

      const analises = todosProcessos.map(p => analisarPrescricao(p, new Date()));
      setProcessos(todosProcessos);
      onProcessosImportados(todosProcessos, analises);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao buscar processos no PJe");
    } finally {
      setIsProcessing(false);
      setProgresso({ atual: 0, total: 0 });
    }
  }

  async function handleHealthCheck() {
    const ok = await healthCheck();
    setBackendOnline(ok);
  }

  function handleSalvarConfig() {
    const key = prompt("API Key do backend:", "sentinela-dev-key");
    if (key) configurarBackend(backendUrlInput, key);
    setShowConfig(false);
    handleHealthCheck();
  }

  function handleArquivo(file: File) {
    setError(null);
    setIsProcessing(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const texto = e.target?.result as string;
        const ext = file.name.toLowerCase();
        let resultado: { processos: Processo[] };

        if (ext.endsWith(".json")) {
          resultado = parseJsonExportadoPje(JSON.parse(texto), cnpjs[0] || "");
        } else {
          resultado = parseCsvTxtPje(texto, cnpjs[0] || "");
        }

        const analises = resultado.processos.map(p => analisarPrescricao(p, new Date()));
        setProcessos(resultado.processos);
        onProcessosImportados(resultado.processos, analises);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao processar arquivo.");
      } finally {
        setIsProcessing(false);
      }
    };
    reader.onerror = () => { setError("Erro ao ler arquivo."); setIsProcessing(false); };
    reader.readAsText(file, "UTF-8");
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Config */}
      {showConfig && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <label className="text-sm font-medium text-foreground">URL do backend Puppeteer</label>
            <input
              value={backendUrlInput}
              onChange={e => setBackendUrlInput(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm"
              placeholder="http://localhost:3001"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSalvarConfig}>Salvar</Button>
              <Button size="sm" variant="ghost" onClick={() => setShowConfig(false)}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Status + Config button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">PJe Federal</span>
          <button
            onClick={() => { handleHealthCheck(); setShowConfig(!showConfig); }}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Settings2 className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          {backendOnline === null ? (
            <button onClick={handleHealthCheck} className="text-xs text-muted-foreground hover:text-foreground">
              <WifiOff className="h-3.5 w-3.5" />
            </button>
          ) : backendOnline ? (
            <span className="flex items-center gap-1 text-xs text-emerald-400">
              <Wifi className="h-3 w-3" /> Online
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-amber-400">
              <WifiOff className="h-3 w-3" /> Offline
            </span>
          )}
          <span className="text-xs text-muted-foreground">{getBackendUrl()}</span>
        </div>
      </div>

      <div className="rounded-lg border border-blue-500/25 bg-blue-500/5 p-4">
        <p className="text-sm text-blue-400">
          <strong>Busca automática:</strong> O backend Puppeteer acessa o PJe, faz a consulta e retorna os processos.
          Se o backend estiver offline, exporte manualmente do PJe como CSV e importe abaixo.
        </p>
      </div>

      {/* TRF Selector */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">1. Tribunal Regional Federal</label>
        <select
          value={uf}
          onChange={e => setUf(e.target.value)}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
        >
          {UFS.map(estado => (
            <option key={estado} value={estado}>
              {estado} - {getTrfPorUf(estado).sigla} ({getTrfPorUf(estado).nome.split("(")[1]?.replace(")", "") || ""})
            </option>
          ))}
        </select>
      </div>

      {/* CNPJs input */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">2. CNPJs para consultar</label>
        <textarea
          placeholder="Cole os CNPJs (um por linha):&#10;11.222.333/0001-81&#10;99.888.777/0001-66"
          className="w-full rounded-lg border border-border bg-background p-3 font-mono text-sm"
          rows={4}
          onChange={handleCnpjInput}
        />
        {cnpjs.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {cnpjs.map(c => (
              <span key={c} className="rounded-md bg-secondary px-2 py-0.5 font-mono text-xs">{formatarCnpj(c)}</span>
            ))}
          </div>
        )}
      </div>

      {/* Action buttons */}
      {cnpjs.length > 0 && (
        <div className="flex gap-2">
          <Button onClick={handleBuscarAutomatico} disabled={isProcessing || !backendOnline} className="flex-1">
            {isProcessing ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Buscando {progresso.atual}/{progresso.total}...</>
            ) : (
              <><Play className="mr-2 h-4 w-4" /> Buscar automaticamente ({cnpjs.length} CNPJs)</>
            )}
          </Button>
          <Button variant="outline" onClick={() => cnpjs.forEach(cnpj => {
            window.open(`https://${getTrfPorUf(uf).sigla.toLowerCase().replace("trf", "pje")}.trf${getTrfPorUf(uf).sigla.replace("TRF", "")}.jus.br/pje/ConsultaPublica/listView.seam?cnpj=${cnpj}`, "_blank");
          })}>
            <ExternalLink className="mr-2 h-4 w-4" /> Abrir PJe
          </Button>
        </div>
      )}

      {/* Fallback: file upload */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">3. Ou importe manualmente (CSV/TXT/JSON)</label>
        <p className="text-xs text-muted-foreground">
          Exporte os processos do PJe como CSV (colunas: numero_cnj;data_evento;texto_evento) e importe aqui.
        </p>

        {isProcessing && !progresso.total ? (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Processando...
          </div>
        ) : (
          <div
            onClick={() => inputRef.current?.click()}
            className="cursor-pointer rounded-xl border-2 border-dashed border-border p-6 text-center transition-colors hover:border-primary/40"
          >
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.txt,.json"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleArquivo(file);
                e.target.value = "";
              }}
              className="hidden"
            />
            <Upload className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm font-medium text-foreground">Clique para selecionar o arquivo</p>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {processos.length > 0 && (
        <Card className="border-emerald-500/30">
          <CardContent className="pt-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-400" />
              <div>
                <p className="font-semibold text-emerald-400">{processos.length} processo(s) encontrado(s)</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {processos.reduce((s, p) => s + p.eventos.length, 0)} eventos classificados
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="rounded-lg border border-border bg-secondary p-4 space-y-2 text-xs text-muted-foreground">
        <p className="font-semibold text-foreground">Como configurar o backend:</p>
        <ol className="list-decimal pl-4 space-y-1">
          <li><code className="rounded bg-card px-1">cd backend &amp;&amp; npm install</code></li>
          <li><code className="rounded bg-card px-1">npm run dev</code> (precisa ter Chrome/Chromium instalado)</li>
          <li>Volte aqui, clique no <Settings2 className="inline h-3 w-3" /> e configure a URL</li>
          <li>Clique em "Buscar automaticamente"</li>
        </ol>
        <p className="mt-2">Docker: <code className="rounded bg-card px-1">docker build -t sentinela-pje . &amp;&amp; docker run -p 3001:3001 sentinela-pje</code></p>
      </div>
    </div>
  );
}
