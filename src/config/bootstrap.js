"use strict";

const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execArquivo = promisify(execFile);
const RAIZ = path.resolve(__dirname, "../..");

/**
 * Preparação do banco no arranque.
 *
 * Existe para que um deploy novo suba funcionando, sem alguém precisar abrir
 * um terminal no servidor e lembrar a ordem dos comandos.
 *
 * Três passos, com garantias diferentes:
 *
 *   MIGRAÇÕES  sempre. São idempotentes por natureza — o sequelize registra o
 *              que já rodou. Se falharem, a aplicação NÃO sobe: um esquema
 *              incompleto produz erro em toda requisição, e falhar no arranque
 *              com mensagem clara é melhor do que servir 500 em silêncio.
 *
 *   SEED       sempre. Usa findOrCreate: categorias e admin existentes são
 *              respeitados, nunca sobrescritos.
 *
 *   CATÁLOGO   SÓ QUANDO NÃO HÁ NENHUM ATIVO. Este é o passo perigoso: a
 *              importação atualiza pelo slug, então rodá-la a cada arranque
 *              desfaria qualquer preço ou descrição que a curadoria tivesse
 *              ajustado no painel. Um reinício não pode reverter trabalho.
 *
 * Tudo isto pode ser desligado com BOOTSTRAP_DB=false, para o caso de uma
 * migração precisar ser conduzida à mão.
 */

const ligado = (v, padrao) => {
  if (v === undefined || v === "") return padrao;
  return ["1", "true", "yes", "on"].includes(String(v).toLowerCase());
};

async function rodar(rotulo, comando, args) {
  const inicio = Date.now();
  try {
    const { stdout } = await execArquivo(comando, args, {
      cwd: RAIZ,
      env: process.env,
      maxBuffer: 10 * 1024 * 1024,
    });
    const ms = Date.now() - inicio;
    const ultima = stdout.trim().split("\n").filter(Boolean).pop() || "concluído";
    console.log(`[bootstrap] ${rotulo}: ${ultima} (${ms}ms)`);
    return { ok: true, stdout };
  } catch (e) {
    console.error(`[bootstrap] ${rotulo} FALHOU: ${(e.stderr || e.message || "").trim().slice(0, 600)}`);
    return { ok: false, erro: e };
  }
}

async function catalogoVazio(db) {
  const total = await db.Asset.count();
  return total === 0;
}

async function prepararBanco(db) {
  if (!ligado(process.env.BOOTSTRAP_DB, true)) {
    console.log("[bootstrap] desligado por BOOTSTRAP_DB — nada será executado.");
    return;
  }

  console.log("[bootstrap] preparando o banco…");

  const migracoes = await rodar("migrações", "npx", ["sequelize-cli", "db:migrate"]);
  if (!migracoes.ok) {
    // Sem esquema não há aplicação. Morrer aqui deixa o erro visível no log do
    // contêiner, em vez de esconder o problema atrás de 500 em cada rota.
    throw new Error("Migrações falharam. A API não pode subir com o esquema incompleto.");
  }

  // Do seed em diante, falha não impede o arranque: a aplicação funciona sem
  // catálogo, e o operador pode corrigir sem o serviço ficar fora do ar.
  await rodar("seed", "node", ["scripts/seed.js"]);

  if (ligado(process.env.BOOTSTRAP_CATALOG, true)) {
    if (await catalogoVazio(db)) {
      await rodar("catálogo inicial", "node", ["scripts/importar-catalogo.js"]);
    } else {
      console.log("[bootstrap] catálogo já tem ativos — importação inicial ignorada.");
    }
  }

  console.log("[bootstrap] pronto.");
}

module.exports = { prepararBanco };
