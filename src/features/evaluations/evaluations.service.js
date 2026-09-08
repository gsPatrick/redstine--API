"use strict";

const db = require("../../models");
const { AppError } = require("../../utils/app-error");
const { slugUnico } = require("../../utils/slug");
const mailer = require("../../providers/mailer");
const audit = require("../audit/audit.service");
const notificacoes = require("../notifications/notifications.service");
const {
  SUBMISSION_STATUS,
  ASSET_STATUS,
  MODELOS_COMERCIAIS,
} = require("../../config/constants");

/**
 * Curadoria de um envio.
 *
 * Esta e a peca que sustenta a frase publica "fornecedores nao publicam
 * diretamente; cada ativo e avaliado antes de integrar o catalogo". Nenhum
 * caminho da API cria um Asset a partir de uma Submission sem passar aqui.
 */
async function avaliar(submissionId, dados, { curatorId }) {
  return db.sequelize.transaction(async (t) => {
    const submission = await db.Submission.findByPk(submissionId, { transaction: t });
    if (!submission) throw AppError.notFound("Envio nao encontrado.", "SUBMISSION_NOT_FOUND");

    if (
      submission.status === SUBMISSION_STATUS.APROVADA ||
      submission.status === SUBMISSION_STATUS.RECUSADA
    ) {
      throw AppError.unprocessable(
        "Envio ja possui decisao registrada.",
        "SUBMISSION_ALREADY_DECIDED",
        { status: submission.status }
      );
    }

    const evaluation = await db.Evaluation.create(
      {
        submissionId: submission.id,
        curatorId,
        conditionNotes: dados.conditionNotes,
        quantityNotes: dados.quantityNotes,
        provenanceNotes: dados.provenanceNotes,
        logisticsNotes: dados.logisticsNotes,
        commercialNotes: dados.commercialNotes,
        recommendedPrice: dados.recommendedPrice,
        recommendedMarketPrice: dados.recommendedMarketPrice,
        recommendedModel: dados.recommendedModel,
        approved: dados.approved,
        decisionReason: dados.decisionReason,
        decidedAt: new Date(),
      },
      { transaction: t }
    );

    if (!dados.approved) {
      await submission.update({ status: SUBMISSION_STATUS.RECUSADA }, { transaction: t });
      await audit.registrar(
        {
          entity: "evaluation",
          entityId: evaluation.id,
          action: "avaliacao",
          depois: { approved: false },
          ator: { id: curatorId },
          notes: dados.decisionReason,
        },
        { transaction: t }
      );
      return { evaluation, asset: null };
    }

    // Aprovado: nasce o ativo, mas em AGUARDANDO_APROVACAO — o fornecedor ainda
    // precisa carimbar preco e modelo antes de qualquer publicacao.
    const categoria = await db.Category.findByPk(dados.categoryId, { transaction: t });
    if (!categoria) throw AppError.badRequest("Categoria invalida.", "CATEGORY_INVALID");

    const nome = dados.name || submission.assetType || submission.description.slice(0, 120);
    const slug = await slugUnico(db.Asset, nome);

    const asset = await db.Asset.create(
      {
        name: nome,
        slug,
        shortDescription: dados.shortDescription || submission.description,
        description: dados.description,
        supplierId: submission.supplierId,
        categoryId: dados.categoryId,
        subcategoryId: dados.subcategoryId,
        condition: dados.condition,
        location: dados.location || submission.city,
        quantity: dados.quantity ?? 1,
        unit: dados.unit || "unidade",
        price: dados.recommendedPrice,
        marketPrice: dados.recommendedMarketPrice,
        commercialModel: dados.recommendedModel || MODELOS_COMERCIAIS.CATALOGO,
        saleMode: dados.saleMode,
        status: ASSET_STATUS.AGUARDANDO_APROVACAO,
      },
      { transaction: t }
    );

    // Fotos do envio entram como imagens iniciais do ativo.
    const fotos = Array.isArray(submission.photos) ? submission.photos : [];
    if (fotos.length) {
      await db.AssetImage.bulkCreate(
        fotos.slice(0, 20).map((url, i) => ({ assetId: asset.id, url, position: i })),
        { transaction: t }
      );
    }

    await evaluation.update({ assetId: asset.id }, { transaction: t });
    await submission.update({ status: SUBMISSION_STATUS.APROVADA }, { transaction: t });

    // O fornecedor precisa aprovar preco e modelo antes da publicacao — avisa-lo
    // e o que destrava o fluxo.
    const destinatario = submission.supplierId
      ? await db.User.findByPk(submission.supplierId, { transaction: t })
      : { name: submission.name, email: submission.email };
    if (destinatario?.email) {
      mailer.ativoAguardandoAprovacao(asset, destinatario).catch(() => {});
    }

    await audit.registrar(
      {
        entity: "evaluation",
        entityId: evaluation.id,
        action: "avaliacao",
        depois: {
          approved: true,
          assetId: asset.id,
          recommendedPrice: dados.recommendedPrice,
          recommendedModel: asset.commercialModel,
        },
        ator: { id: curatorId },
      },
      { transaction: t }
    );

    if (submission.supplierId) {
      notificacoes.notificar(submission.supplierId, notificacoes.TIPOS.ATIVO_AGUARDANDO_APROVACAO, {
        assetName: asset.name,
        entity: "asset",
        entityId: asset.id,
      });
    }

    return { evaluation, asset };
  });
}

async function listarPorEnvio(submissionId) {
  return db.Evaluation.findAll({
    where: { submissionId },
    include: [
      { model: db.User, as: "curador", attributes: ["id", "name", "email"] },
      { model: db.Asset, as: "ativo", attributes: ["id", "slug", "name", "status"] },
    ],
    order: [["createdAt", "DESC"]],
  });
}

module.exports = { avaliar, listarPorEnvio };
