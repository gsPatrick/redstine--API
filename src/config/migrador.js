"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { Sequelize } = require("sequelize");

const PASTA = path.resolve(__dirname, "../../migrations");

/**
 * Executor de migrações, dentro do próprio processo.
 *
 * Antes isto era `npx sequelize-cli db:migrate` num processo filho, e havia
 * duas coisas erradas com essa abordagem num contêiner:
 *
 *  1. `npx` resolve o binário e, quando NÃO o encontra em `node_modules/.bin`,
 *     tenta BAIXAR o pacote. Num contêiner sem rede de saída isso não falha
 *     depressa: fica preso até o timeout, e o log mostra um erro de registry
 *     onde o problema real é outro. Com a migração a bloquear o arranque, o
 *     resultado é um serviço que não sobe por um motivo que o log não explica.
 *  2. O processo filho só devolve texto. O arranque não sabia QUAIS migrações
 *     correram — e é justamente isso que se quer ler no log depois de um
 *     deploy, para confirmar que a coluna nova chegou ao servidor.
 *
 * O formato é o mesmo do sequelize-cli, de propósito: a mesma tabela
 * `SequelizeMeta` com a mesma coluna `name`, e os mesmos ficheiros
 * `up(queryInterface, Sequelize)`. Quem rodar `npm run migrate` à mão continua
 * a ver o estado correto, e uma migração aplicada por aqui não é reaplicada
 * por lá (nem o contrário).
 *
 * O que este executor NÃO faz, e é importante saber: ele não envolve a migração
 * numa transação. O sequelize-cli também não, e a razão é a mesma — as
 * migrações recebem o `queryInterface` cru e cada chamada decide sozinha se
 * leva uma transação nas opções. Abrir uma transação aqui e não a passar
 * adiante daria uma garantia FALSA: o `addColumn` correria fora dela e a
 * coluna ficaria criada mesmo com o rollback. (Foi exatamente o que aconteceu
 * ao testar uma migração que falha de propósito.)
 *
 * A consequência real: uma migração que falhe no meio deixa o esquema
 * parcialmente alterado e ela PRÓPRIA por aplicar — a API não sobe, e a
 * tentativa seguinte volta a falhar, agora em "a coluna já existe". Sair disso
 * é trabalho manual no banco, e por isso a regra é escrever cada migração de
 * forma a poder correr duas vezes (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`),
 * como as que já existem fazem.
 *
 * O que se garante é a ORDEM: o registro em `SequelizeMeta` só entra depois de
 * `up()` terminar sem erro. Uma migração que falhou nunca fica marcada como
 * aplicada, que é o estado que esconderia o problema do deploy seguinte.
 */

const TABELA = "SequelizeMeta";

/** Os ficheiros de migração, por ordem — o nome começa com a data, e é ela que ordena. */
function listarArquivos() {
  if (!fs.existsSync(PASTA)) return [];
  return fs
    .readdirSync(PASTA)
    .filter((f) => f.endsWith(".js") && !f.startsWith("."))
    .sort();
}

async function garantirTabela(sequelize) {
  // Mesma forma que o sequelize-cli cria, para os dois lados lerem o mesmo
  // estado. `IF NOT EXISTS` porque o caso comum é a tabela já existir.
  await sequelize.query(
    `CREATE TABLE IF NOT EXISTS "${TABELA}" ("name" VARCHAR(255) NOT NULL, PRIMARY KEY ("name"));`
  );
}

async function jaAplicadas(sequelize) {
  const [linhas] = await sequelize.query(`SELECT "name" FROM "${TABELA}";`);
  return new Set(linhas.map((l) => l.name));
}

/**
 * Aplica o que falta e devolve os nomes do que correu AGORA.
 *
 * Devolver a lista (e não só "ok") é o que permite ao arranque escrever no log
 * exatamente o que mudou neste deploy.
 */
async function migrar(sequelize) {
  await garantirTabela(sequelize);

  const aplicadas = await jaAplicadas(sequelize);
  const pendentes = listarArquivos().filter((f) => !aplicadas.has(f));

  const executadas = [];

  for (const arquivo of pendentes) {
    const migracao = require(path.join(PASTA, arquivo));
    if (typeof migracao.up !== "function") {
      throw new Error(`Migração "${arquivo}" não exporta up().`);
    }

    // Sem transação à volta, de propósito — ver o cabeçalho. A ordem é que
    // importa: marca-se como aplicada SÓ depois de `up()` devolver sem erro.
    await migracao.up(sequelize.getQueryInterface(), Sequelize);
    await sequelize.query(`INSERT INTO "${TABELA}" ("name") VALUES (:nome);`, {
      replacements: { nome: arquivo },
    });

    executadas.push(arquivo);
  }

  return { executadas, jaEstavam: aplicadas.size, total: listarArquivos().length };
}

module.exports = { migrar, listarArquivos };
