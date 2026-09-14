"use strict";

/**
 * Cenario de demonstracao — o mesmo dos dois paineis.
 *
 * Existe para a conferencia de contrato ter dado real: uma lista vazia esconde
 * campo em falta, e "a API responde 200" nao prova que a tela renderiza.
 *
 * Cria um fornecedor com ativos nos DOIS modelos comerciais (65% e 50%), leva
 * uma venda ate a conclusao integral e o repasse pago, e deixa outra a receber
 * — assim cada aba de cada tela tem pelo menos uma linha.
 *
 * Idempotente: pode correr quantas vezes for preciso.
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || "x".repeat(48);

const bcrypt = require("bcryptjs");
const { Op } = require("sequelize");
const db = require("../src/models");
const { gerarReferencia } = require("../src/utils/reference");
const { slugUnico } = require("../src/utils/slug");
const ordersService = require("../src/features/orders/orders.service");
const payoutsService = require("../src/features/payouts/payouts.service");
const {
  ASSET_STATUS,
  MODELOS_COMERCIAIS,
  MODALIDADES,
  QUOTE_STATUS,
  PICKUP_STATUS,
  PAYMENT_STATUS,
  SUBMISSION_STATUS,
} = require("../src/config/constants");

const SENHA = "Fornecedor@2026";

async function utilizador(email, dados) {
  const [u] = await db.User.findOrCreate({
    where: { email },
    defaults: { ...dados, email, passwordHash: await bcrypt.hash(SENHA, 10) },
  });
  await u.update(dados);
  return u;
}

async function main() {
  await db.sequelize.authenticate();

  const categorias = await db.Category.findAll({ include: [{ model: db.Subcategory, as: "subcategorias" }] });
  if (!categorias.length) throw new Error("Rode `npm run seed` antes: faltam categorias.");
  const construcao = categorias.find((c) => c.slug.includes("constru")) || categorias[0];
  const sub = construcao.subcategorias?.[0];

  const fornecedor = await utilizador("joao.silva@empresa.com.br", {
    name: "João",
    lastName: "Silva",
    role: "fornecedor",
    phone: "(21) 98886-7777",
    document: "123.456.789-00",
    city: "Rio de Janeiro",
    state: "RJ",
    companyLegalName: "Construtora Silva & Filhos Ltda",
    companyTradeName: "Silva Construções",
    companyDocument: "12.345.678/0001-90",
    companyRole: "Diretor de Suprimentos",
    companyEmail: "contato@silvaconstrucoes.com.br",
  });

  const comprador = await utilizador("ana.lima@construtoraalfa.com.br", {
    name: "Ana",
    lastName: "Lima",
    role: "comprador",
    phone: "(11) 97777-1234",
    companyTradeName: "Construtora Alfa",
  });

  /**
   * Utilizadores internos, um por area.
   *
   * Existem para a separacao de acesso ser TESTADA, e nao apenas descrita: sem
   * um login de cada perfil, `check:acoes` so conseguia provar que fornecedor
   * e comprador nao entram na gestao — e a pergunta que a regra de negocio faz
   * e outra: o perfil Operacao alcanca o financeiro? O Comercial alcanca a
   * Operacao? Sem estes tres logins, essas duas respostas nunca eram medidas.
   */
  await utilizador("comercial@redestine.com.br", { name: "Maria", lastName: "Santos", role: "comercial" });
  await utilizador("operacao@redestine.com.br", { name: "Rita", lastName: "Correia", role: "operacao" });
  await utilizador("financeiro@redestine.com.br", { name: "Fernanda", lastName: "Lima", role: "financeiro" });

  for (const tipo of ["retirada", "cobranca"]) {
    await db.Address.findOrCreate({
      where: { userId: fornecedor.id, type: tipo },
      defaults: {
        userId: fornecedor.id,
        type: tipo,
        zip: tipo === "retirada" ? "22793-081" : "20040-020",
        street: tipo === "retirada" ? "Av. das Américas, 15.000" : "Rua da Assembleia, 100",
        district: tipo === "retirada" ? "Barra da Tijuca" : "Centro",
        city: "Rio de Janeiro",
        state: "RJ",
      },
    });
  }

  // Ativos nos dois modelos: o mesmo fornecedor com 65% e 50% e o caso que
  // prova que a participacao e por ativo, nao por fornecedor.
  /**
   * Preco UNITARIO, nao de lote.
   *
   * A receita potencial e `preco x quantidade x percentual`. Cadastrar o preco
   * do lote junto com a quantidade em unidades multiplica os dois e produz um
   * potencial de milhoes — exatamente o erro que a curadoria precisa evitar no
   * cadastro real.
   */
  /**
   * As localizacoes deixaram de ser texto no seed.
   *
   * Antes havia aqui "Rio de Janeiro — RJ", "Pilares/RJ", "Belo Horizonte —
   * MG", "Curitiba — PR" e "Salvador — BA" — cinco grafias, tres cidades sem
   * opcao na lista. Era o seed a reproduzir o problema que a lista fechada
   * veio resolver. Agora cada linha aponta o SLUG da localizacao, o mesmo
   * caminho que o formulario de cadastro usa, e o que nao cabe nas duas
   * opcoes fica sem localizacao — nao se inventa cidade nem no seed.
   */
  const locais = Object.fromEntries(
    (await db.Location.findAll()).map((l) => [l.slug, l])
  );
  if (!locais["rio-de-janeiro-rj"]) {
    throw new Error("Localizacoes ausentes. Corra `npm run seed` antes do seed:demo.");
  }

  const catalogo = [
    { nome: "Lote de Tubos PVC Tigre", preco: 13.5, mercado: 27, qtd: 900, orig: 1000, forma: "lote", modelo: MODELOS_COMERCIAIS.CATALOGO, status: ASSET_STATUS.PUBLICADO, local: "rio-de-janeiro-rj", condicao: "sem_uso" },
    { nome: "Conexões PVC Tigre", preco: 20.6, mercado: 37.5, qtd: 400, orig: 400, forma: "conjunto", modelo: MODELOS_COMERCIAIS.ESTOQUE, status: ASSET_STATUS.PUBLICADO, local: "sao-paulo-sp", condicao: "seminovo" },
    { nome: "Registros PVC", preco: 8, mercado: 14, qtd: 300, orig: 300, forma: "unidade", modelo: MODELOS_COMERCIAIS.CATALOGO, status: ASSET_STATUS.EM_AVALIACAO, local: "rio-de-janeiro-rj", condicao: "usado_bom" },
    // Um ativo no modelo PROPRIO: sem ele nenhuma tela da gestao mostrava a
    // terceira linha do relatorio por modelo, e o 0%/100% so aparecia depois
    // de alguem cadastrar acervo proprio a mao.
    { nome: "Painéis Divisórios RED", preco: 150, mercado: 320, qtd: 12, orig: 12, forma: "unidade", modelo: MODELOS_COMERCIAIS.PROPRIO, status: ASSET_STATUS.PUBLICADO, local: "rio-de-janeiro-rj", condicao: "seminovo", daRed: true },
    { nome: "Luva Soldável 25mm", preco: 3.2, mercado: 5.8, qtd: 0, orig: 500, forma: "conjunto", modelo: MODELOS_COMERCIAIS.CATALOGO, status: ASSET_STATUS.INATIVO, local: "sao-paulo-sp", condicao: "usado_sinais" },
    // Os tres seguintes existem para a area de OPERACAO ter pendencia real.
    // Sem eles, "Pendencias operacionais" nascia em zero e a conferencia
    // passava por omissao — que e o modo mais silencioso de um painel mentir.
    //
    // Aprovado e nao publicado: pronto para publicar, a pendencia que a
    // Operacao resolve num clique.
    { nome: "Grades Metálicas Galvanizadas", preco: 45, mercado: 98, qtd: 60, orig: 60, forma: "conjunto", modelo: MODELOS_COMERCIAIS.ESTOQUE, status: ASSET_STATUS.APROVADO, local: "rio-de-janeiro-rj", condicao: "usado_bom" },
    // Sem localizacao — de proposito, e continua a ser de proposito depois da
    // lista fechada. A lista resolve a AMBIGUIDADE ("Rio/RJ" vs "Rio — RJ"),
    // nao a AUSENCIA: ha ativo no galpao que ninguem localizou ainda. Esta
    // linha e a que mantem viva a pendencia "ativos sem localizacao" e a
    // ultima barra do indicador de Localizacoes.
    { nome: "Portas Corta-Fogo", preco: 380, mercado: 820, qtd: 14, orig: 14, forma: "unidade", modelo: MODELOS_COMERCIAIS.ESTOQUE, status: ASSET_STATUS.PUBLICADO, local: "", condicao: "seminovo" },
    // Publicado com saldo zero: anuncia o que nao ha para entregar.
    { nome: "Perfis de Alumínio Anodizado", preco: 62, mercado: 130, qtd: 0, orig: 200, forma: "lote", modelo: MODELOS_COMERCIAIS.CATALOGO, status: ASSET_STATUS.PUBLICADO, local: "sao-paulo-sp", condicao: "usado_bom" },
  ];

  const ativos = [];
  for (const [i, a] of catalogo.entries()) {
    // Procura pelo SKU, nao pelo nome: o nome e editavel no Painel de Gestao,
    // e depois de alguem renomear um ativo demo o seed deixava de o encontrar,
    // tentava criar outro e batia no SKU fixo, que continua ocupado.
    const sku = `RED-${String(451 - i).padStart(4, "0")}`;
    const existente = await db.Asset.findOne({ where: { sku } });
    const dados = {
      // Ativo proprio nao tem fornecedor: e isso que o define. Deixa-lo com
      // fornecedor mostraria na Area do Cliente dele um ativo a 0% que ele
      // nao entenderia — e nao e dele.
      supplierId: a.daRed ? null : fornecedor.id,
      categoryId: construcao.id,
      subcategoryId: sub?.id || null,
      name: a.nome,
      shortDescription: `${a.nome} — lote disponível para retirada.`,
      condition: a.condicao,
      locationId: a.local ? locais[a.local].id : null,
      location: a.local ? locais[a.local].name : null,
      originalQuantity: a.orig,
      quantity: a.qtd,
      unit: "unidade",
      price: a.preco,
      marketPrice: a.mercado,
      saleMode: MODALIDADES.DIRETA,
      saleFormat: a.forma,
      commercialModel: a.modelo,
      status: a.status,
      supplierApprovedAt: new Date(),
      // Quem autoriza o preco do ativo proprio e a propria RED: o carimbo
      // nao pode ficar em nome de um fornecedor que nao participa.
      supplierApprovedBy: a.daRed ? null : fornecedor.id,
      publishedAt: a.status === ASSET_STATUS.PUBLICADO ? new Date(Date.now() - i * 86400000 * 3) : null,
    };

    const ativo = existente
      ? await existente.update(dados)
      : await db.Asset.create({
          ...dados,
          sku,
          slug: await slugUnico(db.Asset, a.nome),
        });

    const temImagem = await db.AssetImage.count({ where: { assetId: ativo.id } });
    if (!temImagem) {
      await db.AssetImage.create({
        assetId: ativo.id,
        url: "/images/2026/07/DIFUSOR-LINEAR-142x12-fundo-galpao-01--300x300.png",
        position: 0,
      });
    }
    ativos.push(ativo);
  }

  // Consultas nos quatro status, para as abas da tela terem linha.
  const statusConsulta = [QUOTE_STATUS.NOVA, QUOTE_STATUS.EM_ATENDIMENTO, QUOTE_STATUS.RESPONDIDA, QUOTE_STATUS.ENCERRADA];
  for (const [i, st] of statusConsulta.entries()) {
    const ativo = ativos[i % 2];
    const ja = await db.Quote.findOne({ where: { buyerId: comprador.id, assetId: ativo.id, status: st } });
    if (ja) continue;
    await db.Quote.create({
      reference: gerarReferencia("COT"),
      assetId: ativo.id,
      buyerId: comprador.id,
      buyerName: "Ana Lima",
      buyerEmail: comprador.email,
      buyerPhone: "(11) 97777-1234",
      company: "Construtora Alfa",
      quantity: 100 * (i + 1),
      message: "Preciso confirmar disponibilidade e condições de retirada.",
      status: st,
      ...(st === QUOTE_STATUS.RESPONDIDA || st === QUOTE_STATUS.ENCERRADA
        ? {
            quotedPrice: ativo.price,
            responseNotes: "Disponibilidade confirmada. Retirada em até 15 dias, sem custo adicional.",
            respondedAt: new Date(),
          }
        : {}),
    });
  }

  // Duas vendas do mesmo comprador: uma concluida e paga, outra a receber.
  const jaTemPedidos = await db.Order.count({ where: { buyerId: comprador.id } });
  if (!jaTemPedidos) {
    const concluida = await ordersService.criar(
      {
        buyerName: "Ana Lima",
        buyerEmail: comprador.email,
        buyerPhone: "(11) 97777-1234",
        paymentMethod: "pix",
        items: [{ assetId: ativos[1].id, quantity: 150 }],
      },
      { atorId: comprador.id }
    );
    await ordersService.confirmar(concluida.id);
    await ordersService.registrarPagamento(concluida.id, { status: PAYMENT_STATUS.PAGO });
    await ordersService.registrarRetirada(concluida.id, {
      status: PICKUP_STATUS.CONCLUIDA,
      local: "Estoque RED — Belo Horizonte",
      endereco: "Rua Sapucaí, 320 — Floresta, Belo Horizonte / MG",
      responsavel: "Equipe RED",
      contato: "(31) 3333-2222",
      agendamento: new Date(Date.now() - 2 * 86400000),
      instrucoes: "Retirada com veículo próprio.",
    });
    await ordersService.concluirOperacao(concluida.id);

    const repassesPagos = await db.Payout.findAll({ where: { orderId: concluida.id } });
    await payoutsService.marcarPagos(repassesPagos.map((r) => r.id), {
      paymentMethod: "pix",
      paymentReference: "PIX-8842197",
    });

    const aReceber = await ordersService.criar(
      {
        buyerName: "Ana Lima",
        buyerEmail: comprador.email,
        buyerPhone: "(11) 97777-1234",
        paymentMethod: "transferencia",
        items: [{ assetId: ativos[0].id, quantity: 100 }],
      },
      { atorId: comprador.id }
    );
    await ordersService.confirmar(aReceber.id);
    await ordersService.registrarPagamento(aReceber.id, { status: PAYMENT_STATUS.PAGO });
    await ordersService.registrarRetirada(aReceber.id, {
      status: PICKUP_STATUS.AGUARDANDO,
      local: "Obra Barra da Tijuca",
      endereco: "Av. das Américas, 15.000 — Barra da Tijuca, Rio de Janeiro / RJ, 22793-081",
      responsavel: "Carlos Henrique",
      contato: "(21) 99999-8888",
      instrucoes: "Apresentar documento com foto. Horário comercial.",
    });
  }

  // Favoritos do comprador: a tela tem card, entao precisa de linha.
  for (const ativo of ativos.slice(0, 3)) {
    await db.Wishlist.findOrCreate({
      where: { userId: comprador.id, assetId: ativo.id },
      defaults: { userId: comprador.id, assetId: ativo.id },
    });
  }

  // Uma terceira venda que fica devendo repasse: sem ela a aba "Devidos" de
  // Repasses nasce vazia e a conferencia passaria por omissao.
  const temDevido = await db.Payout.count({
    where: { supplierId: fornecedor.id, status: "a_receber" },
  });
  if (!temDevido) {
    const pendente = await ordersService.criar(
      {
        buyerName: "Ana Lima",
        buyerEmail: comprador.email,
        buyerPhone: "(11) 97777-1234",
        paymentMethod: "boleto",
        items: [{ assetId: ativos[1].id, quantity: 80 }],
      },
      { atorId: comprador.id }
    );
    await ordersService.confirmar(pendente.id);
    await ordersService.registrarPagamento(pendente.id, { status: PAYMENT_STATUS.PAGO });
    await ordersService.registrarRetirada(pendente.id, {
      status: PICKUP_STATUS.CONCLUIDA,
      local: "Estoque RED — Belo Horizonte",
      endereco: "Rua Sapucaí, 320 — Floresta, Belo Horizonte / MG",
      responsavel: "Equipe RED",
      contato: "(31) 3333-2222",
    });
    await ordersService.concluirOperacao(pendente.id);
  }

  /**
   * Retiradas pendentes — o indicador "Aguardando retirada" da Operacao.
   *
   * Este bloco NAO esta dentro do `if (!jaTemPedidos)` de proposito, e a razao
   * e um bug que aconteceu: a venda com retirada pendente era criada uma vez,
   * a conferencia de acoes concluia-a (e o proposito dela e mesmo concluir
   * pedidos), e a partir da segunda execucao o painel de Operacao abria com
   * "0 aguardando retirada". A conferencia continuava verde — contra zero.
   *
   * Sao duas: uma dentro do prazo e uma atrasada. Sem a segunda, a pendencia
   * "retiradas atrasadas" nunca era exercitada, e e justamente a que faz
   * alguem pegar o telefone.
   */
  const pendenteDeRetirada = {
    pickupStatus: [PICKUP_STATUS.AGUARDANDO, PICKUP_STATUS.AGENDADA],
    status: { [Op.notIn]: ["cancelado", "aguardando_confirmacao"] },
  };

  if (!(await db.Order.count({ where: { ...pendenteDeRetirada, pickupStatus: PICKUP_STATUS.AGUARDANDO } }))) {
    const aguardando = await ordersService.criar(
      {
        buyerName: "Ana Lima",
        buyerEmail: comprador.email,
        buyerPhone: "(11) 97777-1234",
        paymentMethod: "pix",
        items: [{ assetId: ativos[0].id, quantity: 40 }],
      },
      { atorId: comprador.id }
    );
    await ordersService.confirmar(aguardando.id);
    await ordersService.registrarRetirada(aguardando.id, {
      status: PICKUP_STATUS.AGUARDANDO,
      local: "Obra Barra da Tijuca",
      endereco: "Av. das Américas, 15.000 — Barra da Tijuca, Rio de Janeiro / RJ",
      responsavel: "Carlos Henrique",
      contato: "(21) 99999-8888",
    });
  }

  if (!(await db.Order.count({ where: { ...pendenteDeRetirada, pickupStatus: PICKUP_STATUS.AGENDADA } }))) {
    const atrasada = await ordersService.criar(
      {
        buyerName: "Ana Lima",
        buyerEmail: comprador.email,
        buyerPhone: "(11) 97777-1234",
        paymentMethod: "pix",
        items: [{ assetId: ativos[1].id, quantity: 20 }],
      },
      { atorId: comprador.id }
    );
    await ordersService.confirmar(atrasada.id);
    await ordersService.registrarRetirada(atrasada.id, {
      status: PICKUP_STATUS.AGENDADA,
      local: "Estoque RED — Belo Horizonte",
      endereco: "Rua Sapucaí, 320 — Floresta, Belo Horizonte / MG",
      responsavel: "Equipe RED",
      contato: "(31) 3333-2222",
      // Agendada para a semana passada e ainda nao retirada: o caminhao nao veio.
      agendamento: new Date(Date.now() - 6 * 86400000),
    });
  }

  const envio = await db.Submission.findOne({ where: { supplierId: fornecedor.id } });
  if (!envio) {
    await db.Submission.create({
      reference: gerarReferencia("ENV"),
      supplierId: fornecedor.id,
      name: "João Silva",
      company: "Silva Construções",
      email: fornecedor.email,
      phone: "(21) 98886-7777",
      city: "Rio de Janeiro — RJ",
      assetType: "Cadeiras corporativas",
      description: "Lote de cadeiras corporativas de escritório desmobilizado.",
      approximateQuantity: "120 unidade",
      authorized: true,
      status: SUBMISSION_STATUS.RECEBIDA,
      attributes: { categoryId: construcao.id, condicao: "usado", origem: "painel" },
    });
  }

  const contagem = {
    fornecedor: fornecedor.email,
    comprador: comprador.email,
    internos: "comercial@ / operacao@ / financeiro@redestine.com.br",
    senha: SENHA,
    ativos: await db.Asset.count({ where: { supplierId: fornecedor.id } }),
    consultas: await db.Quote.count({ where: { buyerId: comprador.id } }),
    pedidos: await db.Order.count({ where: { buyerId: comprador.id } }),
    repasses: await db.Payout.count({ where: { supplierId: fornecedor.id } }),
    retiradasPendentes: await db.Order.count({ where: pendenteDeRetirada }),
  };
  console.log("cenário de demonstração pronto:", contagem);
  await db.sequelize.close();
}

main().catch((e) => {
  console.error("seed-demo falhou:", e.message);
  if (e.errors) console.error(e.errors.map((x) => `  ${x.path}: ${x.message}`).join("\n"));
  process.exit(1);
});
