/**
 * Serviço para consultar dados cadastrais do CNPJ via BrasilAPI.
 * A BrasilAPI agrega dados públicos da Receita Federal (CNPJ-reva)
 * sem necessidade de CAPTCHA.
 *
 * Endpoint: https://brasilapi.com.br/api/cnpj/v1/{cnpj}
 */

export interface DadosCnpj {
    cnpj: string;
    razao_social: string;
    nome_fantasia: string;
    situacao_cadastral: number;
    descricao_situacao_cadastral: string;
    data_inicio_atividade: string;
    cnae_fiscal_descricao: string;
    logradouro: string;
    numero: string;
    complemento: string;
    bairro: string;
    municipio: string;
    uf: string;
    cep: string;
    ddd_telefone_1: string;
    ddd_telefone_2: string;
    ddd_fax: string;
    email: string | null;
    porte: string;
    capital_social: number;
    natureza_juridica: string;
}

/** Cache em memória para evitar consultas repetidas no mesmo CNPJ. */
const cache = new Map<string, DadosCnpj | null>();

/**
 * Formata um número de telefone bruto (ex: "1134567890") para exibição legível.
 * Ex: "11 3456-7890" ou "11 98765-4321"
 */
export function formatarTelefone(raw: string | null | undefined): string {
    if (!raw) return "";
    const digits = raw.replace(/\D/g, "");
    if (digits.length === 10) {
        return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    }
    if (digits.length === 11) {
        return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    }
    return raw;
}

/**
 * Busca os dados cadastrais de um CNPJ na BrasilAPI.
 * Retorna null se o CNPJ não for encontrado ou se houver erro de rede.
 * Utiliza cache em memória para evitar consultas duplicadas.
 */
export async function buscarDadosCnpj(cnpj: string): Promise<DadosCnpj | null> {
    const cnpjLimpo = cnpj.replace(/\D/g, "");
    if (cnpjLimpo.length !== 14) return null;

    if (cache.has(cnpjLimpo)) {
        return cache.get(cnpjLimpo) ?? null;
    }

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpjLimpo}`, {
            signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!res.ok) {
            console.warn(`[receitaService] CNPJ ${cnpjLimpo} não encontrado (status ${res.status})`);
            cache.set(cnpjLimpo, null);
            return null;
        }

        const data: DadosCnpj = await res.json();
        cache.set(cnpjLimpo, data);
        return data;
    } catch (err) {
        console.warn(`[receitaService] Erro ao consultar CNPJ ${cnpjLimpo}:`, err);
        cache.set(cnpjLimpo, null);
        return null;
    }
}
