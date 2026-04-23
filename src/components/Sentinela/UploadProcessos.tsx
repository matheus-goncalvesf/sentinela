import { useRef, useState } from "react";
import { Upload, AlertTriangle, CheckCircle2, FileText, Table2, Users } from "lucide-react";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { parseSentinelaCSV } from "../../features/sentinela/csvParser";
import { processarEventos, analisarPrescricao } from "../../features/sentinela/motorPrescricao";
import type { AnalisePrescricao, Processo } from "../../features/sentinela/types";
import { UploadCnpjs } from "./UploadCnpjs";

type SubModo = "csv-completo" | "csv-cnpjs";

interface UploadProcessosProps {
  onProcessosImportados: (processos: Processo[], analises: AnalisePrescricao[]) => void;
}

const CSV_TEMPLATE = `numero_cnj;tribunal;vara;exequente;executado;valor_causa;data_distribuicao;data_evento;texto_evento
0001234-56.2020.8.26.0001;TJSP;1a Vara de Fazenda Publica;Fazenda do Estado;Empresa Exemplo Ltda;50000;01/01/2020;15/01/2020;Devolvido AR - Mudou-se
0001234-56.2020.8.26.0001;TJSP;1a Vara de Fazenda Publica;Fazenda do Estado;Empresa Exemplo Ltda;50000;01/01/2020;01/03/2020;Ato ordinatorio praticado
0001234-56.2020.8.26.0001;TJSP;1a Vara de Fazenda Publica;Fazenda do Estado;Empresa Exemplo Ltda;50000;01/01/2020;01/06/2020;Arquivem-se os autos
`;

export function UploadProcessos({ onProcessosImportados }: UploadProcessosProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [subModo, setSubModo] = useState<SubModo>("csv-completo");
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [preview, setPreview] = useState<{ processos: Processo[]; analises: AnalisePrescricao[] } | null>(null);

  function handleSubModoChange(novoModo: SubModo) {
    if (novoModo === subModo) return;
    setSubModo(novoModo);
    setPreview(null);
    setError(null);
    setAvisos([]);
  }

  function handleFile(file: File) {
    setError(null);
    setAvisos([]);
    setPreview(null);
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Arquivo inválido. Selecione um arquivo .csv");
      return;
    }
    setIsProcessing(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const buffer = e.target?.result as ArrayBuffer;
        const { processos: processosBrutos, avisos: avisosParse } = parseSentinelaCSV(buffer);
        const processos: Processo[] = processosBrutos.map((p) => ({
          ...p,
          eventos: processarEventos(p.eventos.map((ev) => ({ data: ev.data, textoBruto: ev.textoBruto }))),
        }));
        const analises: AnalisePrescricao[] = processos.map((p) => analisarPrescricao(p, new Date()));
        setAvisos(avisosParse);
        setPreview({ processos, analises });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao processar o arquivo.");
      } finally {
        setIsProcessing(false);
      }
    };
    reader.onerror = () => { setError("Erro ao ler o arquivo."); setIsProcessing(false); };
    reader.readAsArrayBuffer(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  }

  function handleConfirmar() {
    if (preview) onProcessosImportados(preview.processos, preview.analises);
  }

  function handleDownloadTemplate() {
    const blob = new Blob([CSV_TEMPLATE], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "modelo-sentinela.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Importação em lote</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Importe processos de execução fiscal para análise de prescrição intercorrente (art. 40 da LEF).
        </p>
      </div>

      <div className="flex rounded-lg border border-border bg-card p-1 w-fit">
        <button
          onClick={() => handleSubModoChange("csv-completo")}
          className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            subModo === "csv-completo"
              ? "bg-primary text-white shadow-sm"
              : "text-muted-foreground hover:bg-secondary hover:text-foreground"
          }`}
        >
          <Table2 className="h-4 w-4" />
          CSV completo
        </button>
        <button
          onClick={() => handleSubModoChange("csv-cnpjs")}
          className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            subModo === "csv-cnpjs"
              ? "bg-primary text-white shadow-sm"
              : "text-muted-foreground hover:bg-secondary hover:text-foreground"
          }`}
        >
          <Users className="h-4 w-4" />
          CSV de CNPJs - scraping automático
        </button>
      </div>

      {subModo === "csv-cnpjs" && (
        <UploadCnpjs onProcessosImportados={onProcessosImportados} />
      )}

      {subModo === "csv-completo" && (
        <>
          {!preview && (
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              className={`cursor-pointer rounded-xl border-2 border-dashed p-12 text-center transition-colors ${
                isDragging
                  ? "border-primary bg-primary/5"
                  : "border-border bg-secondary hover:border-primary/40 hover:bg-secondary"
              }`}
            >
              <input ref={inputRef} type="file" accept=".csv" onChange={handleInputChange} className="hidden" />
              <Upload className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm font-medium text-foreground">
                Arraste um arquivo CSV ou <span className="text-primary">clique para selecionar</span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Apenas arquivos .csv - UTF-8 ou Latin-1</p>
            </div>
          )}

          {isProcessing && (
            <div className="flex items-center justify-center gap-3 py-8 text-sm text-muted-foreground">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              Processando andamentos...
            </div>
          )}

          {error && (
            <div className="flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/5 p-4">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-400" />
              <div>
                <p className="text-sm font-medium text-red-400">Erro ao importar</p>
                <p className="text-xs text-red-400/80">{error}</p>
              </div>
            </div>
          )}

          {preview && (
            <Card className="border-emerald-500/30">
              <CardContent className="pt-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-400" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-emerald-400">
                      {preview.processos.length} processo(s) importado(s) com sucesso
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {preview.processos.reduce((s, p) => s + p.eventos.length, 0)} eventos classificados
                    </p>
                    {avisos.length > 0 && (
                      <details className="mt-3">
                        <summary className="cursor-pointer text-xs text-amber-400">
                          {avisos.length} aviso(s) durante a importação
                        </summary>
                        <ul className="mt-2 space-y-1 text-xs text-amber-400/80">
                          {avisos.map((a, i) => <li key={i}>- {a}</li>)}
                        </ul>
                      </details>
                    )}
                  </div>
                </div>
                <div className="mt-4 flex gap-3">
                  <Button onClick={handleConfirmar} className="flex-1">Ver resultados</Button>
                  <Button variant="outline" onClick={() => { setPreview(null); setAvisos([]); }}>Reimportar</Button>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex items-center gap-3 rounded-lg bg-secondary p-4 border border-border">
            <FileText className="h-5 w-5 flex-shrink-0 text-muted-foreground/50" />
            <div className="flex-1 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Formato do CSV</p>
              <p>
                Colunas: <code className="rounded bg-card px-1 py-0.5 text-primary">numero_cnj</code>{" "}
                <code className="rounded bg-card px-1 py-0.5 text-primary">data_evento</code>{" "}
                <code className="rounded bg-card px-1 py-0.5 text-primary">texto_evento</code>{" "}
                + campos opcionais de metadados
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={handleDownloadTemplate} className="text-xs text-muted-foreground hover:text-foreground">
              Baixar modelo
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
