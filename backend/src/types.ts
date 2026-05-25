export interface AndamentoPJe {
  data: string;
  texto: string;
}

export interface ProcessoPJe {
  numeroCnj: string;
  classe?: string;
  assunto?: string;
  dataDistribuicao?: string;
  exequente?: string;
  executado?: string;
  vara?: string;
  comarca?: string;
  valorCausa?: number;
  andamentos: AndamentoPJe[];
}

export interface ConsultaRequest {
  cnpj: string;
  tribunal?: string; // "TRF1" | "TRF2" | "TRF3" | "TRF4" | "TRF5"
}

export interface ConsultaResponse {
  success: boolean;
  processos: ProcessoPJe[];
  error?: string;
}

export const TRF_CONFIG: Record<string, { url: string; nome: string }> = {
  TRF1: { url: "https://pje1g.trf1.jus.br/pje/ConsultaPublica/listView.seam", nome: "TRF 1ª Região" },
  TRF2: { url: "https://pje.trf2.jus.br/pje/ConsultaPublica/listView.seam", nome: "TRF 2ª Região" },
  TRF3: { url: "https://pje1g.trf3.jus.br/pje/ConsultaPublica/listView.seam", nome: "TRF 3ª Região" },
  TRF4: { url: "https://pje.trf4.jus.br/pje/ConsultaPublica/listView.seam", nome: "TRF 4ª Região" },
  TRF5: { url: "https://pje.trf5.jus.br/pje/ConsultaPublica/listView.seam", nome: "TRF 5ª Região" },
};
