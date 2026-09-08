"use strict";

const { Router } = require("express");
const controller = require("./me.controller");
const painel = require("./me.painel.controller");
const schemas = require("./me.schemas");
const ps = require("./me.painel.schemas");
const { validate } = require("../../middlewares/validate");
const { requireAuth } = require("../../middlewares/auth");

const router = Router();

/**
 * Area do Cliente.
 *
 * Tudo escopado ao token — nao existe parametro de utilizador em rota nenhuma
 * daqui. O isolamento acontece no backend, nao em filtro visual: o Usuario A
 * so enxerga ativos do Usuario A, e as vendas e o financeiro dele derivam
 * exclusivamente desses ativos.
 */
router.use(requireAuth);

// ---------------------------------------------------------------- Visão Geral
router.get("/overview", painel.visaoGeral);
router.get("/activity", painel.atividades);

// Mantido: resumo enxuto usado por integrações anteriores ao painel.
router.get("/summary", controller.resumo);

// -------------------------------------------------------------------- Comprar
router.get("/purchases", validate({ query: ps.comprasQuerySchema }), painel.compras);
router.get("/purchases/:id", validate({ params: ps.idParamSchema }), painel.compra);

router.get("/consultations", validate({ query: ps.consultasQuerySchema }), painel.consultas);
router.get("/consultations/:id", validate({ params: ps.idParamSchema }), painel.consulta);

// --------------------------------------------------------------------- Vender
router.get("/sales-dashboard", validate({ query: ps.periodoSchema }), painel.painelDeVendas);
router.get("/my-assets", validate({ query: ps.ativosQuerySchema }), painel.ativos);
router.get("/sales", validate({ query: ps.vendasQuerySchema }), painel.vendas);
router.get("/payments", validate({ query: ps.periodoSchema }), painel.pagamentos);
router.post("/asset-submissions", validate({ body: ps.envioSchema }), painel.enviarAtivo);

// ---------------------------------------------------------------- Minha Conta
router.get("/profile", painel.perfil);
router.patch("/profile", validate({ body: ps.dadosSchema }), painel.atualizarDados);
router.patch("/company", validate({ body: ps.empresaSchema }), painel.atualizarEmpresa);
router.put("/addresses", validate({ body: ps.enderecosSchema }), painel.gravarEnderecos);
router.post("/password", validate({ body: ps.senhaSchema }), painel.alterarSenha);

// ---------------------------------------- listagens cruas (mantidas)
router.get("/orders", validate({ query: schemas.pedidosQuerySchema }), controller.pedidos);
router.get("/assets", validate({ query: schemas.ativosQuerySchema }), controller.ativos);
router.get("/submissions", validate({ query: schemas.enviosQuerySchema }), controller.envios);
router.get("/quotes", validate({ query: schemas.cotacoesQuerySchema }), controller.cotacoes);
router.get("/payouts", validate({ query: schemas.repassesQuerySchema }), controller.repasses);

module.exports = router;
