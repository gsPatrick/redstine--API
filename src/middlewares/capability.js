"use strict";

const { AppError } = require("../utils/app-error");
const { CAPS_POR_PAPEL } = require("../config/constants");

/**
 * Controle de acesso por capacidade, nao por papel.
 *
 * O documento oficial e explicito (painel, secao 19): "Um usuario sem permissao
 * financeira nao pode acessar o dado por URL ou API, mesmo que o botao esteja
 * oculto." Esconder menu no front nao e seguranca.
 *
 * Capacidade em vez de papel porque a lista de papeis cresce (comercial,
 * financeiro, curador...) e a pergunta que importa e sempre a mesma: este
 * utilizador pode ler/escrever dado financeiro?
 */
function capacidadesDe(user) {
  return CAPS_POR_PAPEL[user?.role] || [];
}

const requireCapability =
  (...necessarias) =>
  (req, res, next) => {
    if (!req.user) return next(AppError.unauthorized());

    const minhas = capacidadesDe(req.user);
    const faltando = necessarias.filter((c) => !minhas.includes(c));

    if (faltando.length) {
      return next(
        AppError.forbidden(
          "Sem permissao para esta operacao.",
          "MISSING_CAPABILITY"
        )
      );
    }
    next();
  };

/** Qualquer uma serve — para rotas que atendem mais de um perfil. */
const requireAnyCapability =
  (...opcoes) =>
  (req, res, next) => {
    if (!req.user) return next(AppError.unauthorized());
    const minhas = capacidadesDe(req.user);
    if (opcoes.some((c) => minhas.includes(c))) return next();
    return next(AppError.forbidden("Sem permissao para esta operacao.", "MISSING_CAPABILITY"));
  };

module.exports = { requireCapability, requireAnyCapability, capacidadesDe };
