"use strict";

const db = require("../../models");
const { parsePagination } = require("../../utils/pagination");

/**
 * Rastreabilidade (documento oficial, secao 23).
 *
 * Cada evento registra data/hora, usuario, entidade, acao, estado anterior e
 * novo estado. E o que responde "quem mudou este preco, quando, e de quanto
 * para quanto" seis meses depois.
 *
 * Como os eventos, nunca derruba a operacao que o gerou.
 */

/** So o que realmente mudou — diff evita gravar o objeto inteiro a cada acao. */
function diferenca(antes = {}, depois = {}) {
  const before = {};
  const after = {};

  for (const campo of new Set([...Object.keys(antes), ...Object.keys(depois)])) {
    const a = antes[campo];
    const b = depois[campo];
    const iguais = a instanceof Date && b instanceof Date
      ? a.getTime() === b.getTime()
      : JSON.stringify(a) === JSON.stringify(b);
    if (!iguais) {
      before[campo] = a ?? null;
      after[campo] = b ?? null;
    }
  }

  return { before, after, mudou: Object.keys(after).length > 0 };
}

async function registrar(
  { entity, entityId, action, antes, depois, ator, notes },
  { transaction } = {}
) {
  try {
    const { before, after, mudou } = diferenca(antes, depois);

    // Acao sem mudanca de estado (ex.: publicar) ainda vale registrar; acao de
    // update sem diferenca nenhuma, nao.
    if (action === "update" && !mudou) return null;

    return await db.AuditLog.create(
      {
        entity,
        entityId,
        action,
        actorId: ator?.id || null,
        actorRole: ator?.role || null,
        before: Object.keys(before).length ? before : null,
        after: Object.keys(after).length ? after : null,
        notes,
        occurredAt: new Date(),
      },
      { transaction }
    );
  } catch (err) {
    console.error(`[audit] falha ao registrar ${entity}.${action}:`, err.message);
    return null;
  }
}

/** Historico completo de uma entidade, do mais recente ao mais antigo. */
async function historico(entity, entityId, query = {}) {
  const { page, perPage, limit, offset } = parsePagination(query);

  const resultado = await db.AuditLog.findAndCountAll({
    where: { entity, entityId },
    include: [{ model: db.User, as: "autor", attributes: ["id", "name", "email", "role"] }],
    order: [["occurredAt", "DESC"]],
    limit,
    offset,
  });

  return { ...resultado, page, perPage };
}

module.exports = { registrar, historico, diferenca };
