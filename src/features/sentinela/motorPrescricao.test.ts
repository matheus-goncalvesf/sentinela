import { describe, expect, it } from "vitest";
import { analisarPrescricao, processarEventos } from "./motorPrescricao";
import { parseDate } from "./dateUtils";
import type { Processo } from "./types";

/**
 * Bateria de timelines reais de Execução Fiscal (TJSP) para validar o motor.
 * Data de referência: 2026-04-22 (fixa para determinismo).
 *
 * Aplicações testadas:
 *  - Art. 40 §§ 2º e 4º LEF
 *  - Súmula 314/STJ (1 ano + 5 anos)
 *  - Tema 566/STJ (ciência da Fazenda após tentativa frustrada)
 *  - Tema 566/STJ (ato útil zera o cômputo)
 *  - Tema 566/STJ (pedido genérico da Fazenda NÃO zera)
 *  - Art. 151 VI CTN (parcelamento suspende exigibilidade)
 */

const HOJE = new Date(2026, 3, 22); // 2026-04-22

function mkProc(
  eventos: Array<[string, string]>,
  overrides: Partial<Processo> = {}
): Processo {
  const procEventos = processarEventos(
    eventos.map(([data, texto]) => ({
      data: parseDate(data),
      textoBruto: texto,
    }))
  );
  return {
    id: "test-proc",
    numeroCnj: "1234567-89.2015.8.26.0100",
    tribunal: "TJSP",
    vara: "Vara de Execuções Fiscais",
    comarca: "São Paulo",
    classe: "Execução Fiscal",
    valorCausa: 50000,
    dataDistribuicao: new Date(2015, 0, 1),
    exequente: "Fazenda Pública Estadual",
    executado: "Empresa XYZ Ltda",
    cnpjExecutado: "12.345.678/0001-90",
    isExecucaoFiscal: true,
    modoEntrada: "manual",
    eventos: procEventos,
    ...overrides,
  };
}

describe("motorPrescricao — Tema 566/STJ: marco inicial", () => {
  it("prefere ciência da Fazenda APÓS tentativa frustrada (preferência Tema 566)", () => {
    const p = mkProc([
      ["2015-04-15", "Cite-se o executado, com as advertências legais."],
      ["2015-06-20", "Oficial de justiça certificou que não localizou o executado."],
      ["2015-08-01", "Abra-se vista à Fazenda Pública do Estado de São Paulo."],
      ["2016-08-02", "Arquivem-se os autos sem baixa, nos termos do art. 40 §2º da LEF."],
    ]);
    const a = analisarPrescricao(p, HOJE);
    expect(a.marcoInicial?.categoria).toBe("ciencia_fazenda");
    expect(a.marcoInicialData?.getFullYear()).toBe(2015);
    expect(a.marcoInicialData?.getMonth()).toBe(7); // agosto
  });

  it("prefere arquivamento art. 40 sobre tentativa frustrada quando ambos existem (§2º é o marco literal)", () => {
    const p = mkProc([
      ["2015-04-15", "Cite-se o executado."],
      ["2015-06-20", "Oficial de justiça certificou que não localizou o executado."],
      ["2016-01-02", "Arquivem-se os autos sem baixa, nos termos do art. 40 §2º da LEF."],
    ]);
    const a = analisarPrescricao(p, HOJE);
    // Motor prefere arquivamento_art40 porque é o marco literal do §2º
    expect(a.marcoInicial?.categoria).toBe("arquivamento_art40");
  });

  it("usa tentativa frustrada como marco quando não há ciência posterior nem arquivamento (ciência ficta)", () => {
    const p = mkProc([
      ["2015-04-15", "Cite-se o executado."],
      ["2015-06-20", "Oficial de justiça certificou que não localizou o executado."],
      ["2016-03-01", "Conclusos ao juiz."],
    ]);
    const a = analisarPrescricao(p, HOJE);
    expect(a.marcoInicial?.categoria).toBe("tentativa_frustrada_localizacao");
  });

  it("usa arquivamento art. 40 quando não há tentativa frustrada explícita", () => {
    const p = mkProc([
      ["2018-03-10", "Cite-se o executado."],
      ["2019-05-01", "Arquive-se, nos termos do art. 40 §2º da LEF."],
    ]);
    const a = analisarPrescricao(p, HOJE);
    expect(a.marcoInicial?.categoria).toBe("arquivamento_art40");
  });
});

describe("motorPrescricao — contagem e fases", () => {
  it("prescrição consumada (>2190 dias do marco): fase=prescrita, score=forte", () => {
    const p = mkProc([
      ["2015-04-15", "Cite-se o executado."],
      ["2015-06-20", "Oficial de justiça certificou que não localizou o executado."],
      ["2015-08-01", "Vista à PGE."],
      ["2016-08-02", "Arquivem-se os autos sem baixa, art. 40 §2º LEF."],
    ]);
    const a = analisarPrescricao(p, HOJE);
    expect(a.fase).toBe("prescrita");
    expect(a.score).toBe("forte");
    expect(a.diasTotaisContagem).toBeGreaterThanOrEqual(2190);
    expect(a.dataProvavelPrescricao).not.toBeNull();
    expect(a.diasAteProvavelPrescricao).toBe(0);
    expect(a.statusFinal).toBe("ativa");
  });

  it("dentro do 1 ano de suspensão do art. 40 §2º: fase=suspensao_art40_p2", () => {
    const p = mkProc([
      ["2025-06-15", "Oficial de justiça certificou que não localizou o executado."],
      ["2025-07-10", "Vista à PGE."],
    ]);
    const a = analisarPrescricao(p, HOJE);
    expect(a.fase).toBe("suspensao_art40_p2");
    expect(a.diasTotaisContagem).toBeLessThan(365);
    expect(a.score).toBe("sem_base");
  });

  it("prescrição em curso (entre 365 e 2190 dias): fase=prescricao_em_curso", () => {
    const p = mkProc([
      ["2022-01-10", "Oficial de justiça certificou que não localizou o executado."],
      ["2022-03-15", "Vista à PGE."],
    ]);
    const a = analisarPrescricao(p, HOJE);
    expect(a.fase).toBe("prescricao_em_curso");
    expect(a.diasTotaisContagem).toBeGreaterThanOrEqual(365);
    expect(a.diasTotaisContagem).toBeLessThan(2190);
    expect(a.diasAteProvavelPrescricao).toBeGreaterThan(0);
  });
});

describe("motorPrescricao — Tema 566/STJ: ato útil reseta o cômputo", () => {
  it("constrição positiva posterior ao marco zera a contagem", () => {
    const p = mkProc([
      ["2015-06-20", "Oficial de justiça certificou que não localizou o executado."],
      ["2015-08-01", "Vista à PGE."],
      ["2022-06-01", "Bloqueio realizado via SISBAJUD no valor de R$ 25.000,00."],
    ]);
    const a = analisarPrescricao(p, HOJE);
    expect(a.interrupcoes.length).toBeGreaterThan(0);
    expect(a.interrupcoes[a.interrupcoes.length - 1].categoria).toBe("constricao_positiva");
    // Marco efetivo deve ser 2022-06-01, não 2015-08-01
    // De 2022-06-01 a 2026-04-22 são ~1421 dias (< 2190) → prescrição em curso
    expect(a.fase).toBe("prescricao_em_curso");
    expect(a.diasTotaisContagem).toBeLessThan(2000);
  });

  it("despacho de citação posterior ao marco também zera (art. 174 pu CTN)", () => {
    const p = mkProc([
      ["2015-06-20", "Oficial de justiça certificou que não localizou o executado."],
      ["2015-08-01", "Vista à PGE."],
      ["2023-03-15", "Determino a citação do executado."],
    ]);
    const a = analisarPrescricao(p, HOJE);
    expect(a.interrupcoes.length).toBeGreaterThan(0);
    expect(a.diasTotaisContagem).toBeLessThan(1200);
  });

  it("pedido genérico da Fazenda NÃO zera o cômputo (Tema 566)", () => {
    const p = mkProc([
      ["2015-06-20", "Oficial de justiça certificou que não localizou o executado."],
      ["2015-08-01", "Vista à PGE."],
      ["2020-05-10", "Fazenda reitera pedido genérico de diligência."],
      ["2022-07-22", "A Fazenda Pública requer o prosseguimento do feito, sem indicação de diligência."],
    ]);
    const a = analisarPrescricao(p, HOJE);
    expect(a.atosInuteisIgnorados.length).toBeGreaterThanOrEqual(2);
    expect(a.interrupcoes.length).toBe(0);
    // Deve continuar contando desde 2015-08-01 → prescrita
    expect(a.fase).toBe("prescrita");
  });
});

describe("motorPrescricao — art. 151 VI CTN: parcelamento", () => {
  it("parcelamento ativo sem rescisão: fase=parcelamento_ativo", () => {
    const p = mkProc([
      ["2020-03-10", "Oficial de justiça certificou que não localizou o executado."],
      ["2020-05-01", "Vista à PGE."],
      ["2021-06-01", "Homologada a adesão do executado ao programa de parcelamento PEP-ICMS."],
    ]);
    const a = analisarPrescricao(p, HOJE);
    expect(a.fase).toBe("parcelamento_ativo");
    expect(a.score).toBe("sem_base");
    expect(a.suspensoesEspeciais.length).toBe(1);
    expect(a.suspensoesEspeciais[0].motivo).toContain("ativo");
  });

  it("parcelamento rescindido desconta o período da contagem", () => {
    const pSemParcel = mkProc([
      ["2015-06-01", "Oficial de justiça certificou que não localizou o executado."],
      ["2015-08-01", "Vista à PGE."],
    ]);
    const aSem = analisarPrescricao(pSemParcel, HOJE);

    const pComParcel = mkProc([
      ["2015-06-01", "Oficial de justiça certificou que não localizou o executado."],
      ["2015-08-01", "Vista à PGE."],
      ["2017-01-01", "Homologada a adesão do executado ao parcelamento."],
      ["2019-01-01", "Parcelamento rescindido por inadimplência."],
    ]);
    const aCom = analisarPrescricao(pComParcel, HOJE);

    expect(aCom.suspensoesEspeciais.length).toBe(1);
    // O cômputo com parcelamento deve ser MENOR (dias foram descontados)
    expect(aCom.diasTotaisContagem).toBeLessThan(aSem.diasTotaisContagem);
    // Diferença deve ser ~730 dias (2 anos de parcelamento)
    const diff = aSem.diasTotaisContagem - aCom.diasTotaisContagem;
    expect(diff).toBeGreaterThanOrEqual(700);
    expect(diff).toBeLessThanOrEqual(740);
  });
});

describe("motorPrescricao — status terminais", () => {
  it("prescrição já reconhecida: statusFinal=prescricao_ja_reconhecida", () => {
    const p = mkProc([
      ["2015-06-01", "Oficial de justiça certificou que não localizou o executado."],
      ["2015-08-01", "Vista à PGE."],
      ["2024-02-10", "Reconheço a prescrição intercorrente e julgo extinta a execução fiscal."],
    ]);
    const a = analisarPrescricao(p, HOJE);
    expect(a.statusFinal).toBe("prescricao_ja_reconhecida");
    expect(a.score).toBe("forte");
    expect(a.fundamentosJuridicos.some((f) => f.includes("Tema 566"))).toBe(true);
  });

  it("extinção por pagamento: statusFinal=extinta", () => {
    const p = mkProc([
      ["2020-01-01", "Oficial de justiça certificou que não localizou o executado."],
      ["2023-05-10", "Julgo extinta a execução pelo pagamento integral do débito."],
    ]);
    const a = analisarPrescricao(p, HOJE);
    expect(a.statusFinal).toBe("extinta");
  });

  it("arquivamento provisório NÃO deve ser tratado como extinção", () => {
    const p = mkProc([
      ["2020-03-10", "Oficial de justiça certificou que não localizou o executado."],
      ["2021-05-01", "Determino o arquivamento provisório dos autos."],
    ]);
    const a = analisarPrescricao(p, HOJE);
    // arquivamento provisório (art. 40) NÃO é extinção
    expect(a.statusFinal).toBe("ativa");
  });
});

describe("motorPrescricao — inconclusivo e fundamentos", () => {
  it("sem marco inicial: score=inconclusivo, fase=indefinida", () => {
    const p = mkProc([
      ["2020-01-01", "Juntada de petição."],
      ["2020-02-01", "Conclusos ao juiz."],
    ]);
    const a = analisarPrescricao(p, HOJE);
    expect(a.score).toBe("inconclusivo");
    expect(a.fase).toBe("indefinida");
    expect(a.marcoInicial).toBeNull();
    expect(a.dataProvavelPrescricao).toBeNull();
  });

  it("sempre cita Tema 566/STJ quando há marco", () => {
    const p = mkProc([
      ["2018-06-01", "Oficial de justiça certificou que não localizou o executado."],
    ]);
    const a = analisarPrescricao(p, HOJE);
    expect(a.fundamentosJuridicos.some((f) => f.includes("Tema 566"))).toBe(true);
    expect(a.fundamentosJuridicos.some((f) => f.includes("art. 40"))).toBe(true);
  });

  it("redirecionamento acrescenta fundamento do art. 135 CTN + Súmula 435", () => {
    const p = mkProc([
      ["2018-06-01", "Oficial de justiça certificou que não localizou o executado."],
      ["2019-03-10", "Deferido o redirecionamento da execução em face do sócio administrador."],
    ]);
    const a = analisarPrescricao(p, HOJE);
    expect(
      a.fundamentosJuridicos.some((f) => f.includes("135") || f.includes("Súmula 435"))
    ).toBe(true);
  });
});

describe("motorPrescricao — explicação textual", () => {
  it("inclui seções-chave no texto explicativo", () => {
    const p = mkProc([
      ["2015-06-01", "Oficial de justiça certificou que não localizou o executado."],
      ["2015-08-01", "Vista à PGE."],
    ]);
    const a = analisarPrescricao(p, HOJE);
    expect(a.explicacaoTextual).toContain("SCORE");
    expect(a.explicacaoTextual).toContain("FASE");
    expect(a.explicacaoTextual).toContain("MARCO INICIAL");
    expect(a.explicacaoTextual).toContain("CONTAGEM");
    expect(a.explicacaoTextual).toContain("FUNDAMENTOS");
    expect(a.explicacaoTextual).toContain("VIA SUGERIDA");
  });
});
