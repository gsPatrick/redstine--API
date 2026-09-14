"use strict";

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

process.env.JWT_SECRET = process.env.JWT_SECRET || "x".repeat(48);

const {
  diasEmEstoque,
  statusOperacionalDe,
  janelaDoInventario,
  CHAVES_OPERACIONAIS,
  REGRAS,
} = require("../src/features/management/management.operacao");
const {
  ASSET_STATUS,
  MODELOS_COMERCIAIS,
  STATUS_OPERACIONAL,
  ROTULO_STATUS_OPERACIONAL,
  INVENTARIO_STATUS,
  CAPS_POR_PAPEL,
  CAPABILITIES,
  ROLES,
} = require("../src/config/constants");

const diasAtras = (n) => new Date(Date.now() - n * 86400000);

/**
 * "Dias em estoque" é regra de negócio, não formatação: define o que a RED
 * chama de ativo parado, e é o número que decide o que se liquida.
 */
describe("dias em estoque", () => {
  test("conta da publicação, que é quando o ativo passou a poder sair", () => {
    const a = { publishedAt: diasAtras(30), createdAt: diasAtras(90), status: ASSET_STATUS.PUBLICADO };
    assert.equal(diasEmEstoque(a), 30);
  });

  test("sem publicação recua para o cadastro — é a única data que a RED controla", () => {
    const a = { publishedAt: null, createdAt: diasAtras(12), status: ASSET_STATUS.APROVADO };
    assert.equal(diasEmEstoque(a), 12);
  });

  test("ativo vendido para de contar na data da venda", () => {
    // Publicado há 100 dias, vendido há 40: passou 60 dias em estoque, não 100.
    const a = {
      publishedAt: diasAtras(100),
      soldAt: diasAtras(40),
      status: ASSET_STATUS.VENDIDO,
    };
    assert.equal(diasEmEstoque(a), 60);
  });

  test("vendido sem carimbo de venda não inventa a data — continua a contar", () => {
    // Preferível a assumir "hoje" ou "nunca": o dado em falta fica visível em
    // vez de virar um número plausível e errado.
    const a = { publishedAt: diasAtras(10), soldAt: null, status: ASSET_STATUS.VENDIDO };
    assert.equal(diasEmEstoque(a), 10);
  });

  test("sem data nenhuma devolve null, não zero", () => {
    // Zero dia em estoque é uma medida; "não há base" é outra coisa, e a tela
    // mostra as duas de forma diferente.
    assert.equal(diasEmEstoque({ publishedAt: null, createdAt: null }), null);
  });

  test("nunca devolve negativo, mesmo com publicação no futuro", () => {
    const a = { publishedAt: new Date(Date.now() + 86400000), status: ASSET_STATUS.PUBLICADO };
    assert.equal(diasEmEstoque(a), 0);
  });
});

describe("status operacional", () => {
  const base = {
    id: "a1",
    status: ASSET_STATUS.PUBLICADO,
    quantity: 10,
    availability: "disponivel",
    commercialModel: MODELOS_COMERCIAIS.CATALOGO,
  };
  const semRetirada = new Set();
  const comRetirada = new Set(["a1"]);

  test("retirada pendente vence tudo — é a única que exige ação hoje", () => {
    assert.equal(
      statusOperacionalDe({ ...base, status: ASSET_STATUS.VENDIDO, quantity: 0 }, comRetirada),
      STATUS_OPERACIONAL.AGUARDANDO_RETIRADA
    );
  });

  test("aprovado e fora do catálogo é 'pronto para publicar'", () => {
    assert.equal(
      statusOperacionalDe({ ...base, status: ASSET_STATUS.APROVADO }, semRetirada),
      STATUS_OPERACIONAL.PRONTO_PARA_PUBLICAR
    );
  });

  test("vendido sem carga pendente saiu do inventário", () => {
    assert.equal(
      statusOperacionalDe({ ...base, status: ASSET_STATUS.VENDIDO, quantity: 0 }, semRetirada),
      STATUS_OPERACIONAL.SAIU_DO_INVENTARIO
    );
  });

  test("publicado sem saldo é inconsistência, não 'em catálogo'", () => {
    // Está anunciado e não há o que entregar: o status tem de dizer isso, senão
    // a linha some no meio das outras quarenta que estão em ordem.
    assert.equal(statusOperacionalDe({ ...base, quantity: 0 }, semRetirada), STATUS_OPERACIONAL.SEM_SALDO);
  });

  test("sem saldo vence reservado — a falta de estoque é o problema maior", () => {
    assert.equal(
      statusOperacionalDe({ ...base, quantity: 0, availability: "reservado" }, semRetirada),
      STATUS_OPERACIONAL.SEM_SALDO
    );
  });

  test("RED Estoque e acervo próprio ficam em guarda da RED; catálogo, no fornecedor", () => {
    for (const modelo of [MODELOS_COMERCIAIS.ESTOQUE, MODELOS_COMERCIAIS.PROPRIO]) {
      assert.equal(
        statusOperacionalDe({ ...base, commercialModel: modelo }, semRetirada),
        STATUS_OPERACIONAL.EM_GUARDA_RED,
        modelo
      );
    }
    assert.equal(statusOperacionalDe(base, semRetirada), STATUS_OPERACIONAL.EM_CATALOGO);
  });

  test("toda regra tem rótulo e toda chave do vocabulário tem regra", () => {
    // O filtro da tela é montado a partir do vocabulário; uma chave sem regra
    // vira uma opção que nunca devolve linha.
    for (const chave of CHAVES_OPERACIONAIS) {
      assert.ok(ROTULO_STATUS_OPERACIONAL[chave], `sem rótulo: ${chave}`);
    }
    assert.equal(
      new Set(CHAVES_OPERACIONAIS).size,
      Object.values(STATUS_OPERACIONAL).length,
      "regras e vocabulário divergiram"
    );
  });

  test("cada regra sabe filtrar a base e rotular a linha — as duas faces existem", () => {
    // É o par que evita o bug clássico: o filtro "sem saldo" devolver linhas
    // rotuladas "em guarda" porque alguém mexeu num dos lados só.
    for (const r of REGRAS) {
      assert.equal(typeof r.onde, "function", r.chave);
      assert.equal(typeof r.vale, "function", r.chave);
    }
  });
});

describe("escopo do inventário", () => {
  test("é aprovado e publicado — nem rascunho em curadoria, nem vendido", () => {
    assert.deepEqual([...INVENTARIO_STATUS].sort(), ["aprovado", "publicado"]);
    for (const fora of ["rascunho", "em_avaliacao", "aguardando_aprovacao", "vendido", "inativo"]) {
      assert.ok(!INVENTARIO_STATUS.includes(fora), fora);
    }
  });

  test("sem período explícito o inventário é TUDO — um estoque não é um mês", () => {
    assert.equal(janelaDoInventario({}).desde, null);
  });

  test("mas o período explícito continua a valer, para recortar a entrada", () => {
    assert.ok(janelaDoInventario({ periodo: "30d" }).desde instanceof Date);
  });
});

/**
 * Separação de acesso do perfil novo.
 *
 * O teste que importa não é "Operação tem operation_read" — é que ela NÃO tem
 * as outras. Um perfil de Operação que enxergue receita da RED ou repasse
 * quebra a regra de negócio, e o erro entraria por uma linha só em
 * CAPS_POR_PAPEL.
 */
describe("separação de acesso do perfil Operação", () => {
  const caps = CAPS_POR_PAPEL[ROLES.OPERACAO];

  test("tem a sua própria capacidade", () => {
    assert.ok(caps.includes(CAPABILITIES.OPERATION_READ));
    assert.ok(caps.includes(CAPABILITIES.OPERATION_WRITE));
  });

  test("NÃO vê receita da RED nem repasse — não tem capacidade financeira", () => {
    assert.ok(!caps.includes(CAPABILITIES.FINANCIAL_READ));
    assert.ok(!caps.includes(CAPABILITIES.FINANCIAL_WRITE));
  });

  test("NÃO administra consultas, anúncios nem vendas", () => {
    assert.ok(!caps.includes(CAPABILITIES.COMMERCIAL_READ));
    assert.ok(!caps.includes(CAPABILITIES.COMMERCIAL_WRITE));
  });

  test("NÃO administra utilizadores nem configurações", () => {
    assert.ok(!caps.includes(CAPABILITIES.ADMIN_READ));
    assert.ok(!caps.includes(CAPABILITIES.ADMIN_WRITE));
  });

  test("e a recíproca: Comercial e Financeiro não alcançam a Operação", () => {
    for (const papel of [ROLES.COMERCIAL, ROLES.FINANCEIRO, ROLES.CURADOR]) {
      assert.ok(
        !CAPS_POR_PAPEL[papel].includes(CAPABILITIES.OPERATION_READ),
        `${papel} não devia alcançar a Operação`
      );
    }
  });

  test("Master continua a ver as quatro áreas", () => {
    for (const c of Object.values(CAPABILITIES)) {
      assert.ok(CAPS_POR_PAPEL[ROLES.ADMIN].includes(c), c);
    }
  });

  test("fornecedor e comprador continuam fora do painel", () => {
    for (const papel of [ROLES.FORNECEDOR, ROLES.COMPRADOR]) {
      assert.equal((CAPS_POR_PAPEL[papel] || []).length, 0, papel);
    }
  });
});
