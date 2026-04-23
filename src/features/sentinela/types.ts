export type ModoEntrada = "csv" | "manual" | "tjsp";

export type CategoriaEvento =
  | "suspensao_art40"
  | "arquivamento_art40"
  | "tentativa_frustrada_localizacao"
  | "tentativa_frustrada_bens"
  | "constricao_positiva"
  | "penhora_rosto_autos"
  | "ciencia_fazenda"
  | "parcelamento"
  | "parcelamento_rescindido"
  | "redirecionamento"
  | "despacho_citacao"
  | "citacao_valida"
  | "indicacao_bens"
  | "embargos_executado"
  | "excecao_pre_executividade"
  | "prescricao_reconhecida"
  | "pedido_fazenda_sem_efeito"
  | "ato_neutro"
  | "extincao"
  | "nao_classificado";

export type EfeitoJuridico =
  | "inicia_contagem"
  | "interrompe"
  | "suspende"
  | "encerra"
  | "neutro"
  | "incerto";

export type ScorePrescricao =
  | "forte"
  | "medio"
  | "fraco"
  | "sem_base"
  | "inconclusivo";

export interface EventoProcessual {
  id: string;
  data: Date | null;
  textoBruto: string;
  categoria: CategoriaEvento;
  efeitoJuridico: EfeitoJuridico;
  confianca: number;
  padraoMatched: string | null;
}

export interface Processo {
  id: string;
  numeroCnj: string;
  tribunal: string;
  vara: string;
  comarca: string;
  classe: string;
  valorCausa: number | null;
  dataDistribuicao: Date | null;
  exequente: string;
  executado: string;
  cnpjExecutado: string;
  isExecucaoFiscal: boolean;
  eventos: EventoProcessual[];
  modoEntrada: ModoEntrada;
}

export interface AnalisePrescricao {
  processoId: string;
  score: ScorePrescricao;
  confiancaGeral: number;
  marcoInicial: EventoProcessual | null;
  marcoInicialData: Date | null;
  ultimoAtoUtil: EventoProcessual | null;
  ultimoAtoUtilData: Date | null;
  diasSemAtoUtil: number | null;
  diasTotaisContagem: number;
  prazoNecessario: number;
  interrupcoes: EventoProcessual[];
  suspensoesEspeciais: { inicio: Date; fim: Date }[];
  pontosIncerteza: string[];
  explicacaoTextual: string;
  viaSugerida: string;
}

export interface ResultadoImportacao {
  processos: Processo[];
  totalProcessos: number;
  totalEventos: number;
  eventosClassificados: number;
  eventosNaoClassificados: number;
  execucoesFiscais: number;
}
