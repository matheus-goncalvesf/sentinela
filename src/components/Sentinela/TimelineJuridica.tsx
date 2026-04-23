import { useState } from "react";
import { EFEITO_DOT_COLORS } from "../../features/sentinela/constants";
import { formatDateBR } from "../../features/sentinela/dateUtils";
import type { EventoProcessual } from "../../features/sentinela/types";

interface TimelineJuridicaProps {
  eventos: EventoProcessual[];
  marcoInicialId: string | null;
  ultimoAtoUtilId: string | null;
  interrupcoes: EventoProcessual[];
}

const EFEITO_LABEL: Record<string, string> = {
  inicia_contagem: "inicia contagem",
  interrompe: "interrompe",
  suspende: "suspende",
  encerra: "encerra",
  neutro: "neutro",
  incerto: "incerto",
};

const CATEGORIA_LABEL: Record<string, string> = {
  suspensao_art40: "Suspensão art. 40",
  arquivamento_art40: "Arquivamento art. 40",
  tentativa_frustrada_localizacao: "Tentativa frustrada (localização)",
  tentativa_frustrada_bens: "Tentativa frustrada (bens)",
  constricao_positiva: "Constrição positiva",
  ciencia_fazenda: "Ciência da Fazenda",
  parcelamento: "Parcelamento",
  parcelamento_rescindido: "Rescisão de parcelamento",
  redirecionamento: "Redirecionamento",
  citacao_valida: "Citação válida",
  pedido_fazenda_sem_efeito: "Pedido da Fazenda (sem efeito)",
  ato_neutro: "Ato neutro",
  extincao: "Extinção",
  nao_classificado: "Não classificado",
};

function EventoItem({
  evento,
  isMarco,
  isUltimoAto,
  isInterrupcao,
}: {
  evento: EventoProcessual;
  isMarco: boolean;
  isUltimoAto: boolean;
  isInterrupcao: boolean;
}) {
  const [expandido, setExpandido] = useState(false);
  const dotColor = EFEITO_DOT_COLORS[evento.efeitoJuridico] ?? "bg-slate-500";
  const lowConfianca = evento.confianca > 0 && evento.confianca < 0.70;

  return (
    <div className={`relative pl-8 pb-6 ${evento.categoria === "nao_classificado" ? "opacity-50" : ""}`}>
      <span className="absolute left-3 top-3 h-full w-px bg-border" aria-hidden />

      <span
        className={`absolute left-0 top-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-card bg-card shadow-sm ${
          isMarco || isUltimoAto || isInterrupcao
            ? "ring-2 ring-offset-1 ring-offset-background " + (isMarco ? "ring-amber-400" : isInterrupcao ? "ring-emerald-400" : "ring-primary")
            : ""
        }`}
      >
        <span className={`h-3 w-3 rounded-full ${dotColor}`} />
      </span>

      <div className="rounded-lg border border-border bg-card p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground">
            {evento.data ? formatDateBR(evento.data) : "Data não identificada"}
          </span>

          {isMarco && (
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-400">
              Marco inicial
            </span>
          )}
          {isUltimoAto && !isMarco && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
              Último ato útil
            </span>
          )}
          {isInterrupcao && !isMarco && (
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-400">
              Interrupção
            </span>
          )}

          <span className="ml-auto rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground ring-1 ring-inset ring-border">
            {EFEITO_LABEL[evento.efeitoJuridico] ?? evento.efeitoJuridico}
          </span>
        </div>

        <p className="mt-1 text-sm text-foreground">
          {expandido || evento.textoBruto.length <= 80
            ? evento.textoBruto
            : evento.textoBruto.slice(0, 80) + "..."}
          {evento.textoBruto.length > 80 && (
            <button
              onClick={() => setExpandido((p) => !p)}
              className="ml-1 text-xs text-primary hover:underline"
            >
              {expandido ? "menos" : "mais"}
            </button>
          )}
        </p>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-[10px] text-muted-foreground/60">
            {CATEGORIA_LABEL[evento.categoria] ?? evento.categoria}
          </span>
          {lowConfianca && (
            <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-400 ring-1 ring-inset ring-amber-500/20">
              Confiança {Math.round(evento.confianca * 100)}%
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function TimelineJuridica({
  eventos,
  marcoInicialId,
  ultimoAtoUtilId,
  interrupcoes,
}: TimelineJuridicaProps) {
  const interrupcoesIds = new Set(interrupcoes.map((ev) => ev.id));
  const comData = eventos.filter((ev) => ev.data !== null);
  const semData = eventos.filter((ev) => ev.data === null);

  if (eventos.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Nenhum evento registrado.
      </p>
    );
  }

  return (
    <div>
      <div className="relative">
        {comData.map((evento) => (
          <EventoItem
            key={evento.id}
            evento={evento}
            isMarco={evento.id === marcoInicialId}
            isUltimoAto={evento.id === ultimoAtoUtilId}
            isInterrupcao={interrupcoesIds.has(evento.id)}
          />
        ))}
      </div>

      {semData.length > 0 && (
        <div className="mt-4 border-t border-dashed border-border pt-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Eventos sem data identificada
          </p>
          <div className="space-y-2">
            {semData.map((evento) => (
              <div
                key={evento.id}
                className="rounded border border-dashed border-border bg-secondary p-2 text-xs text-muted-foreground"
              >
                {evento.textoBruto}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
