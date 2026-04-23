import { describe, expect, it } from "vitest";
import { classificarEvento } from "./classificadorRegras";
import type { CategoriaEvento } from "./types";

/**
 * Bateria de casos reais extraídos de andamentos do TJSP/eSaj/CPOPG.
 * Cada entrada: [texto, categoria esperada].
 *
 * Objetivo: garantir > 99% de precisão no regex em cenários típicos de
 * execução fiscal estadual/municipal no TJSP.
 */
type Caso = [string, CategoriaEvento];

const CASOS: Caso[] = [
  // ── suspensao_art40 ──────────────────────────────────────────────────────
  ["Proferida decisão: Suspensão do feito por 1 (um) ano, nos termos do art. 40 da Lei nº 6.830/80.", "suspensao_art40"],
  ["Aguarde-se o decurso do prazo de suspensão do art. 40 da LEF.", "suspensao_art40"],
  ["Nos termos do artigo 40 da Lei de Execução Fiscal, suspendo o processo.", "suspensao_art40"],
  ["Suspensa a execução pelo prazo de 1 ano (art. 40, LEF).", "suspensao_art40"],
  ["Aplico a Súmula 314 do STJ. Suspenda-se.", "suspensao_art40"],

  // ── arquivamento_art40 ───────────────────────────────────────────────────
  ["Decorrido o prazo de suspensão, arquivem-se os autos sem baixa na distribuição.", "arquivamento_art40"],
  ["Arquive-se, nos termos do art. 40, § 2º, da LEF.", "arquivamento_art40"],
  ["Remetam-se os autos ao arquivo, sem baixa, nos termos do art. 40 da Lei 6.830/80.", "arquivamento_art40"],
  ["Determino o arquivamento provisório dos autos.", "arquivamento_art40"],
  ["Arquivem-se os autos pelo prazo de 1 (um) ano, nos termos do § 2º do artigo 40.", "arquivamento_art40"],

  // ── tentativa_frustrada_localizacao ──────────────────────────────────────
  ["Oficial de justiça certificou que não localizou o executado no endereço informado.", "tentativa_frustrada_localizacao"],
  ["AR devolvido com a informação 'mudou-se'.", "tentativa_frustrada_localizacao"],
  ["Certidão negativa do oficial de justiça.", "tentativa_frustrada_localizacao"],
  ["Citação por edital deferida em razão de não localização do devedor.", "tentativa_frustrada_localizacao"],
  ["Mandado de citação devolvido negativo.", "tentativa_frustrada_localizacao"],
  ["Não foi possível localizar o executado.", "tentativa_frustrada_localizacao"],

  // ── tentativa_frustrada_bens ─────────────────────────────────────────────
  ["Resultado negativo de consulta ao SISBAJUD.", "tentativa_frustrada_bens"],
  ["SISBAJUD sem valores a bloquear.", "tentativa_frustrada_bens"],
  ["Consulta ao RENAJUD: negativa.", "tentativa_frustrada_bens"],
  ["Pesquisa de bens pelo BACENJUD resultou infrutífera.", "tentativa_frustrada_bens"],
  ["Não foram encontrados bens penhoráveis em nome do executado.", "tentativa_frustrada_bens"],
  ["Penhora negativa — executado não possui bens.", "tentativa_frustrada_bens"],
  ["Inexistência de bens penhoráveis.", "tentativa_frustrada_bens"],

  // ── constricao_positiva ──────────────────────────────────────────────────
  ["Penhora realizada sobre o imóvel matrícula 12.345.", "constricao_positiva"],
  ["Bloqueio realizado via SISBAJUD no valor de R$ 25.000,00.", "constricao_positiva"],
  ["Lavrado auto de penhora sobre veículo.", "constricao_positiva"],
  ["SISBAJUD positivo. Valores bloqueados.", "constricao_positiva"],
  ["Arresto efetivado e convertido em penhora.", "constricao_positiva"],
  ["Designado leilão dos bens penhorados.", "constricao_positiva"],

  // ── penhora_rosto_autos ──────────────────────────────────────────────────
  ["Expedido ofício para penhora no rosto dos autos da ação nº 1234567-89.", "penhora_rosto_autos"],

  // ── ciencia_fazenda ──────────────────────────────────────────────────────
  ["Intime-se a Fazenda Pública Estadual.", "ciencia_fazenda"],
  ["Vista à PGE.", "ciencia_fazenda"],
  ["Abra-se vista à Fazenda Pública do Estado de São Paulo.", "ciencia_fazenda"],
  ["Ciência à Procuradoria do Município.", "ciencia_fazenda"],
  ["A Fazenda Pública tomou ciência.", "ciencia_fazenda"],

  // ── parcelamento ─────────────────────────────────────────────────────────
  ["Homologada a adesão do executado ao programa de parcelamento PEP-ICMS.", "parcelamento"],
  ["Parcelamento deferido. Suspensa a exigibilidade do crédito.", "parcelamento"],
  ["Aderiu o executado ao REFIS.", "parcelamento"],
  ["Débito incluído no parcelamento ordinário, em vigor.", "parcelamento"],

  // ── parcelamento_rescindido ──────────────────────────────────────────────
  ["Parcelamento rescindido por inadimplência.", "parcelamento_rescindido"],
  ["Exclusão do executado do parcelamento.", "parcelamento_rescindido"],
  ["Cancelamento do parcelamento. Prossiga-se a execução.", "parcelamento_rescindido"],

  // ── redirecionamento ─────────────────────────────────────────────────────
  ["Deferido o redirecionamento da execução em face do sócio administrador.", "redirecionamento"],
  ["Instaurado incidente de desconsideração da personalidade jurídica (IDPJ).", "redirecionamento"],
  ["Determinada a inclusão do sócio no polo passivo.", "redirecionamento"],
  ["Dissolução irregular configurada. Súmula 435 do STJ.", "redirecionamento"],

  // ── despacho_citacao ─────────────────────────────────────────────────────
  ["Cite-se o executado, com as advertências legais.", "despacho_citacao"],
  ["Determino a citação do executado.", "despacho_citacao"],
  ["Despacho que ordena a citação, nos termos do art. 174 do CTN.", "despacho_citacao"],

  // ── citacao_valida ───────────────────────────────────────────────────────
  ["Executado citado pessoalmente.", "citacao_valida"],
  ["Citação realizada na pessoa do representante legal.", "citacao_valida"],
  ["Mandado de citação cumprido com êxito.", "citacao_valida"],
  ["AR positivo — citação realizada.", "citacao_valida"],

  // ── indicacao_bens ───────────────────────────────────────────────────────
  ["O executado indicou bens à penhora: imóvel matrícula 98765.", "indicacao_bens"],
  ["Oferecimento de bens à penhora pelo executado.", "indicacao_bens"],

  // ── embargos_executado ───────────────────────────────────────────────────
  ["Distribuídos os embargos à execução em apenso.", "embargos_executado"],
  ["Opostos embargos do executado.", "embargos_executado"],

  // ── excecao_pre_executividade ────────────────────────────────────────────
  ["Apresentada exceção de pré-executividade pelo devedor.", "excecao_pre_executividade"],
  ["Objeção de pré-executividade: prescrição.", "excecao_pre_executividade"],

  // ── prescricao_reconhecida ───────────────────────────────────────────────
  ["Reconheço a prescrição intercorrente e julgo extinta a execução fiscal.", "prescricao_reconhecida"],
  ["Declarada a prescrição intercorrente, nos termos do art. 40, § 4º, da LEF.", "prescricao_reconhecida"],
  ["Decretada de ofício a prescrição intercorrente.", "prescricao_reconhecida"],

  // ── pedido_fazenda_sem_efeito ────────────────────────────────────────────
  ["A Fazenda Pública requer o prosseguimento do feito, sem indicação de diligência.", "pedido_fazenda_sem_efeito"],
  ["PGFN pede prazo para manifestação.", "pedido_fazenda_sem_efeito"],
  ["Fazenda reitera pedido genérico de diligência.", "pedido_fazenda_sem_efeito"],

  // ── ato_neutro ───────────────────────────────────────────────────────────
  ["Conclusos ao juiz.", "ato_neutro"],
  ["Juntada de petição.", "ato_neutro"],
  ["Certifico o decurso do prazo.", "ato_neutro"],
  ["Expedição de mandado.", "ato_neutro"],
  ["Cálculos atualizados apresentados.", "ato_neutro"],

  // ── extincao ─────────────────────────────────────────────────────────────
  ["Julgo extinta a execução pelo pagamento integral do débito.", "extincao"],
  ["Débito quitado. Extingo o processo.", "extincao"],
  ["Homologo a desistência da execução.", "extincao"],
  ["Trânsito em julgado. Arquivamento definitivo.", "extincao"],
];

describe("classificadorRegras — bateria jurisprudencial", () => {
  let acertos = 0;
  let total = CASOS.length;
  const falhas: string[] = [];

  for (const [texto, esperada] of CASOS) {
    it(`[${esperada}] "${texto.slice(0, 70)}..."`, () => {
      const resultado = classificarEvento(texto);
      if (resultado.categoria === esperada) {
        acertos++;
      } else {
        falhas.push(`✗ esperado=${esperada}, obtido=${resultado.categoria} (conf=${resultado.confianca}) — "${texto}"`);
      }
      expect(resultado.categoria).toBe(esperada);
    });
  }

  it("precisão geral ≥ 99%", () => {
    const precisao = acertos / total;
    if (falhas.length > 0) console.warn(falhas.join("\n"));
    expect(precisao).toBeGreaterThanOrEqual(0.99);
  });
});

describe("classificadorRegras — negativos (não deve confundir)", () => {
  const NEGATIVOS: [string, CategoriaEvento][] = [
    // "suspenso" sozinho NÃO é art. 40 (pode ser liminar)
    ["Concedida liminar. Processo suspenso até julgamento do recurso especial.", "nao_classificado"],
    // Citação positiva NÃO deve cair em tentativa frustrada
    ["Citação realizada com sucesso na pessoa do executado.", "citacao_valida"],
    // Bloqueio positivo NÃO deve cair em tentativa frustrada de bens
    ["Bloqueio realizado com êxito no valor de R$ 10.000,00.", "constricao_positiva"],
    // "Negativação" (Serasa) NÃO é certidão negativa
    ["Requerida a negativação do devedor junto aos órgãos de proteção ao crédito.", "nao_classificado"],
    // Arquivamento DEFINITIVO não é art. 40
    ["Arquivamento definitivo do processo.", "extincao"],
  ];

  for (const [texto, esperada] of NEGATIVOS) {
    it(`NEG [${esperada}] "${texto.slice(0, 60)}..."`, () => {
      const resultado = classificarEvento(texto);
      expect(resultado.categoria).toBe(esperada);
    });
  }
});
