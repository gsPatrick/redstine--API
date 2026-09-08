"use strict";

const { Op, fn, col, literal } = require("sequelize");
const db = require("../../models");
const { AppError } = require("../../utils/app-error");
const { janela, entre, cent } = require("./management.comercial");
const { NOME_MODELO } = require("../me/me.painel");
const { PAYOUT_STATUS, ASSET_STATUS, CAPABILITIES, CAPS_POR_PAPEL, ROLES } = require("../../config/constants");

/**
 * Series temporais e relatorios.
 *
 * Tudo aqui responde ao filtro de periodo, por definicao: sao indicadores de
 * FLUXO. O que e estado vive na visao geral e nao passa por aqui.
 */

/** Evolucao do valor bruto vendido. Baldes vazios entram com zero — buraco no
 *  eixo faria a linha saltar e sugerir um mes sem operacao. */
async function evolucaoDeVendas(query) {
  const periodo = janela(query);
  const dias = periodo.desde ? Math.ceil((periodo.ate - periodo.desde) / 86400000) : 365;
  const unidade = dias <= 31 ? "day" : dias <= 120 ? "week" : "month";
  const inicio = periodo.desde || new Date(periodo.ate.getTime() - 365 * 86400000);

  const linhas = await db.Payout.findAll({
    where: {
      status: { [Op.ne]: PAYOUT_STATUS.CANCELADO },
      createdAt: { [Op.between]: [inicio, periodo.ate] },
    },
    attributes: [
      [fn("DATE_TRUNC", unidade, col("created_at")), "balde"],
      [fn("COALESCE", fn("SUM", col("gross_amount")), 0), "bruto"],
      [fn("COALESCE", fn("SUM", col("red_amount")), 0), "red"],
    ],
    group: [literal("1")],
    order: [literal("1 ASC")],
    raw: true,
  });

  return linhas.map((l) => {
    const d = new Date(l.balde);
    return {
      data: d.toISOString(),
      rotulo:
        unidade === "month"
          ? d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")
          : `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`,
      valor: cent(l.bruto),
      receitaRed: cent(l.red),
    };
  });
}

const CORES = ["#1a8a4a", "#0b5fb0", "#e0a11b", "#8b929c", "#7c3aed", "#c40404"];

/** Vendas por categoria, ja com a cor da fatia — a rosca do painel precisa
 *  de cor estavel entre recargas, e sortear no front trocaria a cada render. */
async function vendasPorCategoria(query) {
  const periodo = janela(query);

  const linhas = await db.Payout.findAll({
    where: { status: { [Op.ne]: PAYOUT_STATUS.CANCELADO }, ...entre("createdAt", periodo) },
    attributes: [
      [col("ativo.category_id"), "categoryId"],
      [col("ativo->categoria.name"), "categoria"],
      [fn("COALESCE", fn("SUM", col("Payout.gross_amount")), 0), "bruto"],
      [fn("COUNT", col("Payout.id")), "operacoes"],
    ],
    include: [
      {
        model: db.Asset,
        as: "ativo",
        attributes: [],
        required: true,
        include: [{ model: db.Category, as: "categoria", attributes: [] }],
      },
    ],
    group: [col("ativo.category_id"), col("ativo->categoria.name")],
    raw: true,
  });

  const total = linhas.reduce((a, l) => a + Number(l.bruto), 0);

  return linhas
    .map((l) => ({
      categoryId: l.categoryId,
      rotulo: l.categoria,
      valor: cent(l.bruto),
      operacoes: Number(l.operacoes),
      percentual: total ? Number(((Number(l.bruto) / total) * 100).toFixed(0)) : 0,
    }))
    .sort((a, b) => b.valor - a.valor)
    .map((l, i) => ({ ...l, cor: CORES[i % CORES.length] }));
}

/** RED Estoque x RED Catalogo. Margens diferentes, comparacao obrigatoria. */
async function resultadoPorModelo(query) {
  const periodo = janela(query);

  const linhas = await db.Payout.findAll({
    where: { status: { [Op.ne]: PAYOUT_STATUS.CANCELADO }, ...entre("createdAt", periodo) },
    attributes: [
      "commercialModel",
      "supplierPercent",
      [fn("COUNT", col("id")), "operacoes"],
      [fn("COALESCE", fn("SUM", col("gross_amount")), 0), "bruto"],
      [fn("COALESCE", fn("SUM", col("approved_costs")), 0), "custos"],
      [fn("COALESCE", fn("SUM", col("net_amount")), 0), "liquido"],
      [fn("COALESCE", fn("SUM", col("supplier_amount")), 0), "fornecedor"],
      [fn("COALESCE", fn("SUM", col("red_amount")), 0), "red"],
    ],
    group: ["commercialModel", "supplierPercent"],
    raw: true,
  });

  return linhas.map((l) => {
    const liquido = cent(l.liquido);
    return {
      modelo: NOME_MODELO[l.commercialModel],
      modeloChave: l.commercialModel,
      // O percentual vem agrupado do PROPRIO repasse: se a tabela mudou no
      // meio do periodo, aparecem duas linhas, e isso e a verdade do que foi
      // praticado — nao um numero unico que apaga a mudanca.
      participacaoFornecedor: Number(l.supplierPercent),
      operacoes: Number(l.operacoes),
      valorBruto: cent(l.bruto),
      custosAprovados: cent(l.custos),
      valorLiquido: liquido,
      valorFornecedores: cent(l.fornecedor),
      receitaRed: cent(l.red),
      margemRed: liquido ? Number(((Number(l.red) / liquido) * 100).toFixed(1)) : null,
    };
  });
}

/** Desempenho por fornecedor — a base do que a V2 vai transformar em ranking. */
async function porFornecedor(query) {
  const periodo = janela(query);

  const linhas = await db.Payout.findAll({
    where: { status: { [Op.ne]: PAYOUT_STATUS.CANCELADO }, ...entre("createdAt", periodo) },
    attributes: [
      "supplierId",
      [col("fornecedor.name"), "nome"],
      [col("fornecedor.company_trade_name"), "fantasia"],
      [fn("COUNT", col("Payout.id")), "operacoes"],
      [fn("COALESCE", fn("SUM", col("Payout.gross_amount")), 0), "bruto"],
      [fn("COALESCE", fn("SUM", col("Payout.supplier_amount")), 0), "repasse"],
      [fn("COALESCE", fn("SUM", col("Payout.red_amount")), 0), "red"],
    ],
    include: [{ model: db.User, as: "fornecedor", attributes: [] }],
    group: ["Payout.supplier_id", col("fornecedor.name"), col("fornecedor.company_trade_name")],
    raw: true,
  });

  return linhas
    .map((l) => ({
      fornecedorId: l.supplierId,
      fornecedor: l.fantasia || l.nome || "—",
      operacoes: Number(l.operacoes),
      valorBruto: cent(l.bruto),
      repasse: cent(l.repasse),
      receitaRed: cent(l.red),
    }))
    .sort((a, b) => b.valorBruto - a.valorBruto);
}

/**
 * Exportacao.
 *
 * Devolve linhas e cabecalhos — a serializacao para CSV acontece no controller.
 * Na V1 relatorio e recorte de dado bruto, nao analise: o documento manda
 * preparar os dados agora e deixar o analytics para a V2.
 */
const RECORTES = {
  vendas: {
    titulo: "Vendas do período",
    async linhas(query) {
      const comercial = require("./management.comercial");
      const r = await comercial.vendas({ ...query, perPage: 1000 }, { comFinanceiro: true });
      return r.rows;
    },
  },
  repasses: {
    titulo: "Repasses aos fornecedores",
    async linhas(query) {
      const fin = require("./management.financeiro");
      const r = await fin.repasses({ ...query, perPage: 1000, aba: query.aba || "pendentes" });
      return r.rows;
    },
  },
  ativos: {
    titulo: "Ativos publicados",
    async linhas(query) {
      const comercial = require("./management.comercial");
      const r = await comercial.ativos({ ...query, perPage: 1000, status: query.status || ASSET_STATUS.PUBLICADO });
      return r.rows;
    },
  },
  consultas: {
    titulo: "Consultas recebidas",
    async linhas(query) {
      const comercial = require("./management.comercial");
      const r = await comercial.consultas({ ...query, perPage: 1000 });
      return r.rows;
    },
  },
};

async function exportar(recorte, query) {
  const def = RECORTES[recorte];
  if (!def) {
    throw AppError.badRequest(`Relatório desconhecido: ${recorte}.`, "UNKNOWN_REPORT", {
      disponiveis: Object.keys(RECORTES),
    });
  }

  const linhas = await def.linhas(query);
  const colunas = linhas.length ? Object.keys(linhas[0]) : [];
  return { recorte, titulo: def.titulo, periodo: janela(query), colunas, linhas };
}

/** Serializa em CSV com separador ";" e BOM — o Excel em pt-BR abre assim sem
 *  perguntar nada ao utilizador, e sem BOM os acentos saem corrompidos. */
function paraCSV({ colunas, linhas }) {
  const escapar = (v) => {
    if (v === null || v === undefined) return "";
    // Data vira ISO antes de virar texto: JSON.stringify de um Date devolve a
    // string ja com aspas, e o escape somava outro par por cima.
    const s =
      v instanceof Date ? v.toISOString() : typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const corpo = linhas.map((l) => colunas.map((c) => escapar(l[c])).join(";")).join("\n");
  return `﻿${colunas.join(";")}\n${corpo}`;
}

/**
 * Matriz de perfis e capacidades.
 *
 * Espelha o que o backend ja aplica — nao e a regra, e a leitura dela. A tela
 * de Permissoes mostra isto para o gestor conferir; o bloqueio real esta no
 * middleware, que recusa por URL mesmo com token valido de outro perfil.
 */
function permissoes() {
  const descricao = {
    [CAPABILITIES.COMMERCIAL_READ]: { label: "Ler dados comerciais", area: "Comercial" },
    [CAPABILITIES.COMMERCIAL_WRITE]: { label: "Editar dados comerciais", area: "Comercial" },
    [CAPABILITIES.FINANCIAL_READ]: { label: "Ler dados financeiros", area: "Financeiro" },
    [CAPABILITIES.FINANCIAL_WRITE]: { label: "Editar dados financeiros", area: "Financeiro" },
    [CAPABILITIES.ADMIN_READ]: { label: "Ler configurações", area: "Administração" },
    [CAPABILITIES.ADMIN_WRITE]: { label: "Editar configurações e usuários", area: "Administração" },
  };

  const rotulo = {
    [ROLES.ADMIN]: { nome: "Master", descricao: "Acesso completo às três áreas." },
    [ROLES.COMERCIAL]: {
      nome: "Comercial",
      descricao:
        "Fornecedores, ativos, consultas e vendas. Não vê receita líquida da RED, repasses consolidados nem pagamentos.",
    },
    [ROLES.CURADOR]: {
      nome: "Curadoria",
      descricao: "Avaliação e aprovação de ativos enviados pelos fornecedores.",
    },
    [ROLES.FINANCEIRO]: {
      nome: "Financeiro",
      descricao:
        "Vendas, cálculos, custos, repasses e pagamentos. Não administra consultas, anúncios nem publicação.",
    },
    [ROLES.FORNECEDOR]: { nome: "Fornecedor", descricao: "Área do Cliente apenas." },
    [ROLES.COMPRADOR]: { nome: "Comprador", descricao: "Área do Cliente apenas." },
  };

  return {
    capacidades: Object.values(CAPABILITIES).map((c) => ({ chave: c, ...descricao[c] })),
    perfis: Object.values(ROLES).map((papel) => ({
      chave: papel,
      ...rotulo[papel],
      capacidades: CAPS_POR_PAPEL[papel] || [],
      acessaPainelDeGestao: (CAPS_POR_PAPEL[papel] || []).length > 0,
    })),
  };
}

module.exports = {
  evolucaoDeVendas,
  vendasPorCategoria,
  resultadoPorModelo,
  porFornecedor,
  exportar,
  paraCSV,
  permissoes,
  RECORTES,
};
