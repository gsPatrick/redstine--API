"use strict";

const { Router } = require("express");
const { z } = require("zod");
const controller = require("./management.controller");
const { validate } = require("../../middlewares/validate");
const { requireAuth } = require("../../middlewares/auth");
const { requireCapability } = require("../../middlewares/capability");
const {
  CAPABILITIES,
  ASSET_STATUS,
  QUOTE_STATUS,
  PAYOUT_STATUS,
  MODELOS_COMERCIAIS,
} = require("../../config/constants");

const router = Router();

const paginacao = {
  page: z.coerce.number().int().min(1).optional(),
  perPage: z.coerce.number().int().min(1).max(1000).optional(),
};

const periodo = {
  periodo: z.enum(["7d", "30d", "90d", "12m", "tudo"]).optional(),
  desde: z.coerce.date().optional(),
  ate: z.coerce.date().optional(),
};

const filtroPeriodo = z.object(periodo);
const idParam = z.object({ id: z.string().uuid() });

const consultasQuery = z.object({
  ...paginacao,
  ...periodo,
  status: z.nativeEnum(QUOTE_STATUS).optional(),
  assignedTo: z.string().uuid().optional(),
});

const ativosQuery = z.object({
  ...paginacao,
  status: z.nativeEnum(ASSET_STATUS).optional(),
  commercialModel: z.nativeEnum(MODELOS_COMERCIAIS).optional(),
  supplierId: z.string().uuid().optional(),
  category: z.string().trim().optional(),
  location: z.string().trim().optional(),
  search: z.string().trim().min(1).max(120).optional(),
});

const vendasQuery = z.object({
  ...paginacao,
  ...periodo,
  supplierId: z.string().uuid().optional(),
  commercialModel: z.nativeEnum(MODELOS_COMERCIAIS).optional(),
  status: z.nativeEnum(PAYOUT_STATUS).optional(),
});

const repassesQuery = z.object({
  ...paginacao,
  aba: z.enum(["devidos", "programados", "pagos", "pendentes"]).optional(),
  supplierId: z.string().uuid().optional(),
});

const exportQuery = z.object({
  ...periodo,
  formato: z.enum(["json", "csv"]).optional(),
  supplierId: z.string().uuid().optional(),
  commercialModel: z.nativeEnum(MODELOS_COMERCIAIS).optional(),
  status: z.string().optional(),
  aba: z.enum(["devidos", "programados", "pagos", "pendentes"]).optional(),
});

const configSchema = z.record(z.union([z.string(), z.number(), z.boolean()]));

router.use(requireAuth);

const comercialRead = requireCapability(CAPABILITIES.COMMERCIAL_READ);
const financeiroRead = requireCapability(CAPABILITIES.FINANCIAL_READ);
const adminRead = requireCapability(CAPABILITIES.ADMIN_READ);
const adminWrite = requireCapability(CAPABILITIES.ADMIN_WRITE);

// ---------------------------------------------------------------- Visão Geral
router.get("/overview", comercialRead, validate({ query: filtroPeriodo }), controller.visaoGeral);

// ------------------------------------------------------------------ Comercial
router.get("/commercial", comercialRead, validate({ query: filtroPeriodo }), controller.painelComercial);
router.get("/consultations", comercialRead, validate({ query: consultasQuery }), controller.consultas);
router.get(
  "/consultations/summary",
  comercialRead,
  validate({ query: filtroPeriodo }),
  controller.resumoConsultas
);
router.get("/assets", comercialRead, validate({ query: ativosQuery }), controller.ativos);
router.get("/sales", comercialRead, validate({ query: vendasQuery }), controller.vendas);
router.get("/sales/summary", comercialRead, validate({ query: filtroPeriodo }), controller.resumoVendas);

// ------------------------------------------------------------------ Financeiro
router.get("/financial", financeiroRead, validate({ query: filtroPeriodo }), controller.painelFinanceiro);
router.get(
  "/financial/indicators",
  financeiroRead,
  validate({ query: filtroPeriodo }),
  controller.indicadores
);
router.get(
  "/financial/movements",
  financeiroRead,
  validate({ query: vendasQuery }),
  controller.movimentacoes
);
router.get(
  "/financial/movements/:id",
  financeiroRead,
  validate({ params: idParam }),
  controller.movimentacao
);
router.get("/financial/payouts", financeiroRead, validate({ query: repassesQuery }), controller.repasses);

// ------------------------------------------------------------------ Relatórios
router.get("/reports/sales-evolution", comercialRead, validate({ query: filtroPeriodo }), controller.evolucao);
router.get("/reports/by-category", comercialRead, validate({ query: filtroPeriodo }), controller.porCategoria);
router.get("/reports/by-model", financeiroRead, validate({ query: filtroPeriodo }), controller.porModelo);
router.get("/reports/by-supplier", financeiroRead, validate({ query: filtroPeriodo }), controller.porFornecedor);

// A exportacao carrega dado financeiro em qualquer recorte — exige a
// capacidade financeira mesmo quando o recorte parece comercial.
router.get(
  "/reports/:recorte/export",
  financeiroRead,
  validate({
    params: z.object({ recorte: z.enum(["vendas", "repasses", "ativos", "consultas"]) }),
    query: exportQuery,
  }),
  controller.exportar
);

// --------------------------------------------------- Permissões e configurações
router.get("/permissions", adminRead, controller.permissoes);
router.get("/settings", adminRead, controller.configuracoes);
router.patch("/settings", adminWrite, validate({ body: configSchema }), controller.gravarConfiguracoes);

module.exports = router;
