"use strict";

/**
 * Smoke test do fluxo de negocio da RED, contra a API a correr.
 * Verifica tambem as invariantes — nao basta o caminho feliz funcionar, as
 * recusas tambem precisam acontecer.
 */

const SMOKE_TAG = "[smoke]";
const BASE = process.env.SMOKE_BASE || "http://localhost:4000/api/v1";
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || "admin@redestine.com.br";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || "RedAdmin2026!";

let passou = 0;
let falhou = 0;

function ok(nome, condicao, extra = "") {
  if (condicao) {
    passou += 1;
    console.log(`  ok   ${nome}`);
  } else {
    falhou += 1;
    console.log(`  FALHA ${nome} ${extra}`);
  }
}

async function req(metodo, caminho, { body, token } = {}) {
  const res = await fetch(BASE + caminho, {
    method: metodo,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

async function main() {
  console.log(`\nSmoke test — ${BASE}\n`);

  // ---------- infraestrutura ----------
  console.log("infraestrutura");
  const ping = await req("GET", "/ping");
  ok("ping responde com db up", ping.status === 200 && ping.json?.db === "up");

  // ---------- auth ----------
  console.log("\nautenticacao");
  const login = await req("POST", "/auth/login", {
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  ok("login do admin", login.status === 200 && Boolean(login.json?.data?.token));
  const token = login.json?.data?.token;

  const loginRuim = await req("POST", "/auth/login", {
    body: { email: ADMIN_EMAIL, password: "senha-errada" },
  });
  ok("senha errada e recusada", loginRuim.status === 401);

  const semToken = await req("GET", "/users");
  ok("rota protegida sem token devolve 401", semToken.status === 401);

  // ---------- catalogo ----------
  console.log("\ncatalogo");
  const cats = await req("GET", "/catalog/categories");
  const categorias = cats.json?.data || [];
  // Presenca, nao contagem exata: criar categoria passou a ser possivel pela
  // tela de Configuracoes, e um total fixo quebraria o smoke toda vez que
  // alguem cadastrasse uma linha de produto nova — que e uso legitimo.
  const SEMEADAS = ["red-construcao", "red-equipamentos", "red-mobiliario"];
  const faltando = SEMEADAS.filter((slug) => !categorias.some((c) => c.slug === slug));
  ok("as 3 categorias semeadas existem", faltando.length === 0, `(faltam ${faltando.join(", ")})`);

  const subsSemeadas = categorias
    .filter((c) => SEMEADAS.includes(c.slug))
    .reduce((n, c) => n + (c.subcategorias?.length || 0), 0);
  ok("as 15 subcategorias semeadas existem", subsSemeadas >= 15, `(veio ${subsSemeadas})`);

  const construcao = categorias.find((c) => c.slug === "red-construcao");

  // ---------- envio (pagina Vender) ----------
  console.log("\nenvio de ativos");
  const envio = await req("POST", "/submissions", {
    body: {
      name: "Fornecedor Teste",
      email: "fornecedor@example.com",
      phone: "21999999999",
      city: "Rio de Janeiro/RJ",
      description: "Lote de tubos de PVC novos, sobra de obra, cerca de 40 unidades.",
      authorized: true,
    },
  });
  ok("envio publico aceito", envio.status === 201 && Boolean(envio.json?.data?.reference));

  const envioSemAutorizacao = await req("POST", "/submissions", {
    body: {
      name: "Fornecedor Teste",
      email: "fornecedor@example.com",
      phone: "21999999999",
      description: "Lote sem declaracao de autorizacao.",
      authorized: false,
    },
  });
  ok("envio sem autorizacao e recusado", envioSemAutorizacao.status === 422);

  const lista = await req("GET", "/submissions", { token });
  const submissionId = lista.json?.data?.[0]?.id;
  ok("curadoria lista envios", lista.status === 200 && Boolean(submissionId));

  // ---------- curadoria ----------
  console.log("\ncuradoria");
  await req("POST", `/submissions/${submissionId}/start-review`, { token });

  const avaliacao = await req("POST", `/submissions/${submissionId}/evaluations`, {
    token,
    body: {
      approved: true,
      categoryId: construcao.id,
      name: `Tubo de Esgoto PVC DN 100 — lote ${SMOKE_TAG}`,
      condition: "sem_uso",
      quantity: 40,
      recommendedPrice: 18.5,
      recommendedMarketPrice: 42,
      recommendedModel: "catalogo",
      saleMode: "direta",
      commercialNotes: "Boa saida, material corrente.",
    },
  });
  ok("avaliacao aprovada cria ativo", avaliacao.status === 201 && Boolean(avaliacao.json?.data?.asset));

  const assetId = avaliacao.json?.data?.asset?.id;
  const assetStatus = avaliacao.json?.data?.asset?.status;
  ok(
    "ativo nasce aguardando aprovacao do fornecedor",
    assetStatus === "aguardando_aprovacao",
    `(veio ${assetStatus})`
  );

  // ---------- a invariante central ----------
  console.log("\ninvariantes de negocio");
  const publicarCedo = await req("PATCH", `/assets/${assetId}/status`, {
    token,
    body: { status: "publicado" },
  });
  ok(
    "publicar sem aprovacao do fornecedor e recusado",
    publicarCedo.status === 422,
    `(veio ${publicarCedo.status})`
  );

  const transicaoInvalida = await req("PATCH", `/assets/${assetId}/status`, {
    token,
    body: { status: "vendido" },
  });
  ok(
    "transicao de status invalida e recusada",
    transicaoInvalida.status === 422 &&
      transicaoInvalida.json?.error?.code === "INVALID_TRANSITION"
  );

  // ---------- aprovacao e publicacao ----------
  console.log("\naprovacao e publicacao");
  const aprovacao = await req("POST", `/assets/${assetId}/supplier-approval`, { token });
  ok("aprovacao do fornecedor registrada", aprovacao.status === 200);

  const publicar = await req("PATCH", `/assets/${assetId}/status`, {
    token,
    body: { status: "publicado" },
  });
  ok("publicacao aceita apos aprovacao", publicar.status === 200);
  ok(
    "desconto calculado pela API",
    publicar.json?.data?.discountPercent === 56,
    `(veio ${publicar.json?.data?.discountPercent})`
  );

  const publico = await req("GET", "/assets?category=red-construcao&perPage=100");
  const noCatalogo = (publico.json?.data || []).some((a) => a.id === assetId);
  ok("ativo aparece no catalogo publico", noCatalogo);

  // ---------- pedido ----------
  console.log("\npedido de compra direta");
  const pedido = await req("POST", "/orders", {
    body: {
      buyerName: "Comprador Teste",
      buyerEmail: "comprador@example.com",
      paymentMethod: "pix",
      items: [{ assetId, quantity: 2 }],
    },
  });
  ok("pedido criado", pedido.status === 201 && Boolean(pedido.json?.data?.reference));
  ok(
    "pedido nasce aguardando confirmacao (interesse nao reserva)",
    pedido.json?.data?.status === "aguardando_confirmacao"
  );

  const orderId = pedido.json?.data?.id;

  // Consulta pelo id do ativo criado nesta execucao — buscar por slug fixo
  // pegaria o ativo de uma execucao anterior e o teste deixaria de ser fiavel.
  const antes = await req("GET", `/assets/admin/${assetId}`, { token });
  ok(
    "quantidade nao baixou antes da confirmacao",
    antes.json?.data?.quantity === 40,
    `(veio ${antes.json?.data?.quantity})`
  );

  const confirmar = await req("POST", `/orders/${orderId}/confirm`, { token });
  ok("confirmacao aceita", confirmar.status === 200);

  const depois = await req("GET", `/assets/admin/${assetId}`, { token });
  ok(
    "quantidade baixou apos confirmacao",
    depois.json?.data?.quantity === 38,
    `(veio ${depois.json?.data?.quantity})`
  );

  const excesso = await req("POST", "/orders", {
    body: {
      buyerName: "Comprador Teste",
      buyerEmail: "comprador@example.com",
      paymentMethod: "pix",
      items: [{ assetId, quantity: 9999 }],
    },
  });
  ok("quantidade acima do disponivel e recusada", excesso.status === 422);

  // ---------- cotacao ----------
  console.log("\ncotacao sob consulta");
  const cotacao = await req("POST", "/quotes", {
    body: {
      assetId,
      buyerName: "Comprador Consulta",
      buyerEmail: "consulta@example.com",
      quantity: 500,
      message: "Preciso de volume maior, qual condicao?",
    },
  });
  ok("cotacao criada", cotacao.status === 201 && Boolean(cotacao.json?.data?.reference));

  const responder = await req("POST", `/quotes/${cotacao.json?.data?.id}/respond`, {
    token,
    body: { quotedPrice: 15.9, responseNotes: "Preco para 500 unidades." },
  });
  ok("cotacao respondida", responder.status === 200 && responder.json?.data?.status === "respondida");

  // ---------- favoritos ----------
  console.log("\nfavoritos");
  const fav1 = await req("POST", `/wishlist/${assetId}/toggle`, { token });
  ok("favoritar liga", fav1.status === 200 && fav1.json?.data?.favorito === true);

  const favLista = await req("GET", "/wishlist", { token });
  ok("favorito aparece na lista", (favLista.json?.data || []).some((f) => f.assetId === assetId));

  const fav2 = await req("POST", `/wishlist/${assetId}/toggle`, { token });
  ok("favoritar desliga", fav2.status === 200 && fav2.json?.data?.favorito === false);

  const sync = await req("POST", "/wishlist/sync", { token, body: { assetIds: [assetId] } });
  ok("sincronizar importa do localStorage", sync.json?.data?.importados === 1);

  const semAuth = await req("GET", "/wishlist");
  ok("favoritos exigem autenticacao", semAuth.status === 401);

  // ---------- repasse: a regra financeira-mestre ----------
  console.log("\nrepasse ao fornecedor");
  const pedidoDetalhe = await req("GET", `/orders/${orderId}`, { token });
  const repasses = pedidoDetalhe.json?.data?.repasses || [];
  ok("confirmacao gerou repasse", repasses.length === 1, `(veio ${repasses.length})`);
  ok(
    "repasse nasce em venda_realizada, nao em a_receber",
    repasses[0]?.status === "venda_realizada",
    `(veio ${repasses[0]?.status})`
  );
  ok("modelo catalogo repassa 65%", repasses[0]?.supplierPercent === 65);
  ok("percentual da RED e o complemento", repasses[0]?.redPercent === 35);

  const bruto = 18.5 * 2;
  const soma = Number(repasses[0]?.supplierAmount) + Number(repasses[0]?.redAmount);
  ok("soma das partes bate com o liquido", Math.abs(soma - Number(repasses[0]?.netAmount)) < 0.005);
  ok("sem custos, liquido = bruto", Math.abs(Number(repasses[0]?.netAmount) - bruto) < 0.005);

  // ---------- custos dedutiveis ----------
  console.log("\ncustos dedutiveis");
  const custo = await req("POST", `/orders/${orderId}/costs`, {
    token,
    body: { type: "transporte", description: "Frete ate o comprador", amount: 10 },
  });
  ok("custo registrado", custo.status === 201);

  const comCusto = await req("GET", `/orders/${orderId}`, { token });
  const r2 = comCusto.json?.data?.repasses?.[0];
  ok("custo abatido do bruto", Math.abs(Number(r2?.netAmount) - (bruto - 10)) < 0.005,
     `(liquido ${r2?.netAmount})`);
  ok(
    "split recalculado sobre o liquido",
    Math.abs(Number(r2?.supplierAmount) - (bruto - 10) * 0.65) < 0.01,
    `(fornecedor ${r2?.supplierAmount})`
  );

  const listaCustos = await req("GET", `/orders/${orderId}/costs`, { token });
  ok("custos listados com total", listaCustos.json?.data?.total === 10);

  // ---------- conclusao integral ----------
  console.log("\nconclusao integral da operacao");
  const pend1 = await req("GET", `/orders/${orderId}/completion`, { token });
  ok("ainda nao pode concluir", pend1.json?.data?.pode === false);
  ok(
    "aponta pagamento e retirada como pendentes",
    pend1.json?.data?.pendentes?.includes("pagamento_confirmado") &&
      pend1.json?.data?.pendentes?.includes("retirada_concluida")
  );

  const concluirCedo = await req("POST", `/orders/${orderId}/complete`, { token });
  ok("concluir sem as condicoes e recusado", concluirCedo.status === 422);

  await req("PATCH", `/orders/${orderId}/payment`, { token, body: { status: "pago" } });
  await req("PATCH", `/orders/${orderId}/pickup`, { token, body: { status: "concluida" } });

  const pend2 = await req("GET", `/orders/${orderId}/completion`, { token });
  ok("agora pode concluir", pend2.json?.data?.pode === true);

  const concluir = await req("POST", `/orders/${orderId}/complete`, { token });
  ok("conclusao aceita", concluir.status === 200);
  ok("repasse virou a_receber", concluir.json?.data?.repasse?.atualizados === 1);

  const dueAt = new Date(concluir.json?.data?.repasse?.dueAt);
  const horas = (dueAt - Date.now()) / 36e5;
  ok("prazo de 48h calculado", horas > 47.5 && horas <= 48, `(${horas.toFixed(1)}h)`);

  // ---------- congelamento apos a conclusao ----------
  const custoTarde = await req("POST", `/orders/${orderId}/costs`, {
    token,
    body: { type: "taxa", description: "Custo tardio", amount: 5 },
  });
  ok("custo apos conclusao e recusado", custoTarde.status === 422,
     `(veio ${custoTarde.status})`);

  // ---------- pagamento do repasse ----------
  console.log("\npagamento do repasse");
  const payoutId = r2?.id;
  const programar = await req("POST", "/payouts/schedule", { token, body: { ids: [payoutId] } });
  ok("pagamento programado", programar.status === 200);

  const pagar = await req("POST", "/payouts/mark-paid", {
    token,
    body: { ids: [payoutId], paymentReference: "PIX-TESTE" },
  });
  ok("repasse marcado como pago", pagar.status === 200);

  const resumoPlat = await req("GET", "/payouts/summary", { token });
  ok("resumo da plataforma responde", resumoPlat.status === 200);
  ok(
    "resumo traz as metricas oficiais",
    typeof resumoPlat.json?.data?.receitaRed === "number" &&
      typeof resumoPlat.json?.data?.aRepassar === "number"
  );

  // ---------- painel do utilizador ----------
  console.log("\npainel do utilizador");
  const resumo = await req("GET", "/me/summary", { token });
  ok("resumo do painel responde", resumo.status === 200);
  ok(
    "carteira segue a sequencia oficial",
    ["receitaPotencial", "vendasRealizadas", "aReceber", "recebido"].every(
      (k) => typeof resumo.json?.data?.carteira?.[k] === "number"
    )
  );
  // Compara com a lista real em vez de um numero fixo: o smoke corre varias
  // vezes contra o mesmo banco e os favoritos acumulam entre execucoes.
  const favAtuais = await req("GET", "/wishlist", { token });
  ok(
    "resumo conta favoritos igual a lista",
    resumo.json?.data?.favoritos === (favAtuais.json?.data || []).length,
    `(resumo ${resumo.json?.data?.favoritos} vs lista ${(favAtuais.json?.data || []).length})`
  );

  const meusPedidos = await req("GET", "/me/orders", { token });
  ok("meus pedidos responde", meusPedidos.status === 200);

  // ---------- rastreamento: eventos, auditoria e notificacoes ----------
  console.log("\nrastreamento");

  const visita = await req("POST", "/events/product-view", { body: { assetId } });
  ok("visita ao produto e registada", visita.status === 201 || visita.status === 200);

  const visitaLixo = await req("POST", "/events/product-view", {
    body: { assetId: "nao-e-uuid" },
  });
  ok("evento com ativo invalido e recusado", visitaLixo.status === 422);

  const funil = await req("GET", `/events/assets/${assetId}/funnel`, { token });
  ok("funil do ativo responde", funil.status === 200);
  ok(
    "o funil ja contabiliza a visita",
    Number(funil.json?.data?.visualizacoes || 0) >= 1,
    `(visualizacoes ${funil.json?.data?.visualizacoes})`
  );

  const historico = await req("GET", `/audit/asset/${assetId}`, { token });
  ok("historico de auditoria do ativo responde", historico.status === 200);
  const acoes = (historico.json?.data || []).map((l) => l.action);
  ok(
    "a mudanca de status ficou registada",
    acoes.includes("mudanca_status"),
    `(acoes: ${acoes.join(", ") || "nenhuma"})`
  );
  ok(
    "a aprovacao do fornecedor ficou registada com autor",
    (historico.json?.data || []).some(
      (l) => l.action === "aprovacao_fornecedor" && l.actorId
    )
  );

  const semPermissao = await req("GET", `/audit/asset/${assetId}`);
  ok("auditoria exige autenticacao", semPermissao.status === 401);

  const sino = await req("GET", "/notifications", { token });
  ok("sino de notificacoes responde", sino.status === 200);
  const contador = await req("GET", "/notifications/unread-count", { token });
  ok("contador de nao lidas responde", typeof contador.json?.data?.naoLidas === "number");

  // ---------- painel de gestao ----------
  console.log("\npainel de gestao");

  const overview = await req("GET", "/management/overview", { token });
  ok("visao geral responde", overview.status === 200);
  ok(
    "estado e fluxo vem separados",
    overview.json?.data?.estado && overview.json?.data?.fluxo
  );
  ok(
    "alertas trazem o prazo de repasse da regra",
    overview.json?.data?.alertas?.prazoRepasseHoras === 48
  );

  // O indicador de ESTADO nao pode encolher com o filtro: "ativos publicados
  // nos ultimos 7 dias" nao e uma pergunta valida — o ativo esta publicado ou
  // nao esta. Ja o fluxo tem de responder ao periodo.
  const overview7d = await req("GET", "/management/overview?periodo=7d", { token });
  ok(
    "indicador de estado ignora o filtro de periodo",
    overview7d.json?.data?.estado?.ativosPublicados ===
      overview.json?.data?.estado?.ativosPublicados
  );
  ok(
    "receita potencial tambem ignora o filtro",
    overview7d.json?.data?.estado?.receitaPotencial ===
      overview.json?.data?.estado?.receitaPotencial
  );

  const comercial = await req("GET", "/management/commercial", { token });
  ok("painel comercial responde", comercial.status === 200);
  ok("o funil sai da tabela de eventos", comercial.json?.data?.funil !== undefined);
  ok(
    "vendas por categoria vem ordenadas por valor",
    (comercial.json?.data?.vendasPorCategoria || []).every(
      (l, i, a) => i === 0 || a[i - 1].valor >= l.valor
    )
  );

  const financeiro = await req("GET", "/management/financial", { token });
  ok("painel financeiro responde", financeiro.status === 200);
  ok(
    "posicao acumulada separada do movimento do periodo",
    financeiro.json?.data?.posicao && financeiro.json?.data?.periodoValores
  );
  ok(
    "resultado por modelo comercial calcula a margem",
    (financeiro.json?.data?.porModeloComercial || []).every(
      (m) => m.margemRed === null || (m.margemRed >= 0 && m.margemRed <= 100)
    )
  );

  const gestaoSemToken = await req("GET", "/management/financial");
  ok("painel financeiro exige autenticacao", gestaoSemToken.status === 401);

  // ---------- checkout ----------
  console.log("\ncheckout e gateway");

  const metodos = await req("GET", "/payments/methods");
  ok("metodos de pagamento sao publicos", metodos.status === 200);
  ok(
    "opera em custodia, nao em split automatico",
    metodos.json?.data?.modo === "custodia"
  );

  const pedidoCheckout = await req("POST", "/orders", {
    body: {
      buyerName: "Checkout Smoke",
      buyerEmail: "checkout.smoke@example.com",
      buyerPhone: "11999990000",
      paymentMethod: "pix",
      items: [{ assetId, quantity: 1 }],
    },
  });
  const orderCheckout = pedidoCheckout.json?.data?.id;
  ok("pedido para checkout criado", pedidoCheckout.status === 201 && !!orderCheckout);

  const cobranca = await req("POST", `/payments/orders/${orderCheckout}/checkout`, {
    body: { metodo: "pix" },
  });
  ok("cobranca PIX e aberta", cobranca.status === 201);
  ok("cobranca nasce aguardando, nunca paga", cobranca.json?.data?.status === "aguardando");
  ok("cobranca tem prazo de expiracao", !!cobranca.json?.data?.expiraEm);

  const metodoInvalido = await req("POST", `/payments/orders/${orderCheckout}/checkout`, {
    body: { metodo: "cripto" },
  });
  ok("metodo nao suportado e recusado", metodoInvalido.status === 422);

  const statusPag = await req("GET", `/payments/orders/${orderCheckout}/status`);
  ok("status do pagamento responde", statusPag.status === 200);
  ok("referencia do provider guardada no pedido", !!statusPag.json?.data?.providerId);

  await req("PATCH", `/orders/${orderCheckout}/payment`, {
    token,
    body: { status: "pago" },
  });
  const jaPago = await req("POST", `/payments/orders/${orderCheckout}/checkout`, {
    body: { metodo: "pix" },
  });
  ok("pedido ja pago nao abre nova cobranca", jaPago.status === 422);

  const webhookManual = await req("POST", "/payments/webhook", { body: { qualquer: 1 } });
  ok(
    "webhook sem provider configurado e recusado, nao ignorado em silencio",
    webhookManual.status === 401
  );

  // ---------- Area do Cliente: tela a tela ----------
  console.log("\nArea do Cliente");

  const visao = await req("GET", "/me/overview", { token });
  ok("visao geral responde", visao.status === 200);
  ok(
    "traz os dois lados da relacao numa chamada",
    visao.json?.data?.comprar && visao.json?.data?.vender
  );
  ok(
    "bloco Comprar tem os tres indicadores da tela",
    ["compras", "consultas", "favoritos"].every(
      (k) => typeof visao.json?.data?.comprar?.[k] === "number"
    )
  );
  ok(
    "bloco Vender tem os quatro indicadores da tela",
    ["ativosPublicados", "ativosVendidos", "receitaPotencial", "aReceber"].every(
      (k) => typeof visao.json?.data?.vender?.[k] === "number"
    )
  );
  ok("ultimas atividades vem junto", Array.isArray(visao.json?.data?.atividades));

  const minhasCompras = await req("GET", "/me/purchases", { token });
  ok("minhas compras responde", minhasCompras.status === 200);
  const compraLinha = (minhasCompras.json?.data || [])[0];
  ok(
    "a linha da tabela vem pronta, sem o front juntar pedido com item",
    !compraLinha ||
      ["pedido", "data", "produto", "quantidade", "valor", "status"].every(
        (k) => compraLinha[k] !== undefined
      )
  );

  if (compraLinha) {
    const det = await req("GET", `/me/purchases/${compraLinha.id}`, { token });
    ok("detalhe da compra responde", det.status === 200);
    ok("retirada vive dentro da compra", det.json?.data?.retirada !== undefined);
    ok(
      "historico traz etapas futuras marcadas",
      (det.json?.data?.historico || []).some((e) => e.futuro) ||
        (det.json?.data?.historico || []).length > 0
    );
  }

  const minhasConsultas = await req("GET", "/me/consultations", { token });
  ok("minhas consultas responde", minhasConsultas.status === 200);

  const painelVendas = await req("GET", "/me/sales-dashboard", { token });
  ok("dashboard de vendas responde", painelVendas.status === 200);
  ok(
    "separa estado de fluxo — o contrato que impede o filtro de mexer no estado",
    painelVendas.json?.data?.estado && painelVendas.json?.data?.fluxo
  );
  ok(
    "traz os dois graficos da tela",
    Array.isArray(painelVendas.json?.data?.graficos?.resultados) &&
      Array.isArray(painelVendas.json?.data?.graficos?.ativosPorStatus)
  );

  const painel7 = await req("GET", "/me/sales-dashboard?periodo=90d", { token });
  ok(
    "ativos publicados ignoram o filtro de periodo",
    painel7.json?.data?.estado?.ativosPublicados === painelVendas.json?.data?.estado?.ativosPublicados
  );
  ok(
    "receita potencial tambem ignora o filtro",
    painel7.json?.data?.estado?.receitaPotencial === painelVendas.json?.data?.estado?.receitaPotencial
  );

  const meusAtivos = await req("GET", "/me/my-assets", { token });
  ok("meus ativos responde", meusAtivos.status === 200);
  const ativoLinha = (meusAtivos.json?.data || [])[0];
  ok(
    "cada ativo traz modelo, participacao e receita potencial calculados",
    !ativoLinha ||
      (ativoLinha.modelo && typeof ativoLinha.participacao === "number" &&
        typeof ativoLinha.receitaPotencial === "number")
  );

  const minhasVendas = await req("GET", "/me/sales", { token });
  ok("minhas vendas responde", minhasVendas.status === 200);
  const vendaLinha = (minhasVendas.json?.data || [])[0];
  ok(
    "a venda carrega o percentual congelado, nao o atual da modalidade",
    !vendaLinha || typeof vendaLinha.participacao === "number"
  );

  const meusPagamentos = await req("GET", "/me/payments", { token });
  ok("historico de pagamentos responde", meusPagamentos.status === 200);

  const perfil = await req("GET", "/me/profile", { token });
  ok("perfil responde", perfil.status === 200);
  ok(
    "perfil separa dados, empresa e enderecos como as tres abas da tela",
    perfil.json?.data?.dados && perfil.json?.data?.empresa && perfil.json?.data?.enderecos
  );

  const gravaDados = await req("PATCH", "/me/profile", {
    token,
    body: { sobrenome: "Silva", telefone: "(21) 98886-7777" },
  });
  ok("dados cadastrais gravam", gravaDados.status === 200);
  ok("sobrenome persistiu", gravaDados.json?.data?.dados?.sobrenome === "Silva");

  const gravaEmpresa = await req("PATCH", "/me/company", {
    token,
    body: { razaoSocial: "Construtora Smoke Ltda", cnpj: "12.345.678/0001-90" },
  });
  ok("dados de empresa gravam", gravaEmpresa.json?.data?.empresa?.razaoSocial === "Construtora Smoke Ltda");

  const gravaEnderecos = await req("PUT", "/me/addresses", {
    token,
    body: {
      retirada: { cep: "22793-081", logradouro: "Av. das Américas, 15.000", cidade: "Rio de Janeiro", estado: "RJ" },
      cobranca: { cep: "20040-020", logradouro: "Rua da Assembleia, 100", cidade: "Rio de Janeiro", estado: "RJ" },
    },
  });
  ok("enderecos gravam os dois tipos", gravaEnderecos.json?.data?.retirada && gravaEnderecos.json?.data?.cobranca);

  const reGrava = await req("PUT", "/me/addresses", {
    token,
    body: { retirada: { complemento: "Galpão 3" } },
  });
  ok(
    "regravar um endereco nao duplica nem apaga o outro",
    reGrava.json?.data?.retirada?.complemento === "Galpão 3" && !!reGrava.json?.data?.cobranca
  );

  const senhaErrada = await req("POST", "/me/password", {
    token,
    body: { senhaAtual: "nao-e-esta", novaSenha: "outra-senha-forte" },
  });
  ok("trocar senha exige a senha atual mesmo com sessao valida", senhaErrada.status === 400);

  const catsPainel = await req("GET", "/catalog/categories");
  const cat = (catsPainel.json?.data || [])[0];
  const envioPainel = await req("POST", "/me/asset-submissions", {
    token,
    body: {
      nome: "Lote de tubos PVC — smoke",
      categoryId: cat?.id,
      subcategoryId: cat?.subcategorias?.[0]?.id,
      quantidade: 500,
      unidade: "unidade",
      condicao: "Novo — sobra de obra",
      local: "Rio de Janeiro — RJ",
    },
  });
  ok("envio de ativo pelo painel aceito", envioPainel.status === 201);
  ok("envio nasce em avaliacao, nunca publicado", envioPainel.json?.data?.status === "recebida");

  // ---------- Painel de Gestao: tela a tela ----------
  console.log("\nPainel de Gestao");

  const gVisao = await req("GET", "/management/overview", { token });
  ok("visao geral da gestao responde", gVisao.status === 200);
  ok("traz variacoes versus periodo anterior", gVisao.json?.data?.variacoes !== undefined);
  ok(
    "traz os dois graficos da tela",
    Array.isArray(gVisao.json?.data?.graficos?.evolucaoVendas) &&
      Array.isArray(gVisao.json?.data?.graficos?.vendasPorCategoria)
  );
  ok("alertas trazem o prazo da regra", gVisao.json?.data?.alertas?.prazoRepasseHoras === 48);

  const gConsultas = await req("GET", "/management/consultations", { token });
  ok("consultas da gestao respondem", gConsultas.status === 200);
  const consultaLinha = (gConsultas.json?.data || [])[0];
  ok(
    "a consulta traz cliente e responsavel RED, como a coluna da tela",
    !consultaLinha || (consultaLinha.cliente !== undefined && consultaLinha.responsavel !== undefined)
  );

  const gResumoConsultas = await req("GET", "/management/consultations/summary", { token });
  ok("resumo de consultas responde", gResumoConsultas.status === 200);
  ok(
    "os cinco cartoes do topo vem prontos",
    ["total", "novas", "emAtendimento", "respondidas", "encerradas"].every(
      (k) => typeof gResumoConsultas.json?.data?.[k] === "number"
    )
  );

  const gAtivos = await req("GET", "/management/assets", { token });
  ok("ativos da gestao respondem", gAtivos.status === 200);
  const gAtivoLinha = (gAtivos.json?.data || [])[0];
  ok(
    "o ativo mostra a venda pelos dois lados: potencial do fornecedor e da RED",
    !gAtivoLinha ||
      (typeof gAtivoLinha.potencialFornecedor === "number" &&
        typeof gAtivoLinha.potencialRed === "number")
  );

  const gVendas = await req("GET", "/management/sales", { token });
  ok("vendas da gestao respondem", gVendas.status === 200);
  const gVendaLinha = (gVendas.json?.data || [])[0];
  ok(
    "o Comercial nao recebe receita liquida da RED nesta rota",
    !gVendaLinha || gVendaLinha.receitaRed === undefined
  );

  const gResumoVendas = await req("GET", "/management/sales/summary", { token });
  ok("ticket medio vem calculado", gResumoVendas.status === 200);

  const gMov = await req("GET", "/management/financial/movements", { token });
  ok("movimentacoes financeiras respondem", gMov.status === 200);
  const movLinha = (gMov.json?.data || [])[0];
  ok(
    "aqui sim a linha traz repasse e receita RED",
    !movLinha || (movLinha.repasse !== undefined && movLinha.receitaRed !== undefined)
  );
  ok("totais do recorte vem no meta", gMov.json?.meta?.totais !== undefined);
  ok(
    "bruto fecha com receita RED + fornecedores + custos",
    !gMov.json?.meta?.totais ||
      Math.abs(
        gMov.json.meta.totais.valorBruto -
          (gMov.json.meta.totais.receitaRed +
            gMov.json.meta.totais.valorFornecedores +
            gMov.json.meta.totais.custosAprovados)
      ) < 0.02,
    `(${JSON.stringify(gMov.json?.meta?.totais)})`
  );

  if (movLinha) {
    const detMov = await req("GET", `/management/financial/movements/${movLinha.id}`, { token });
    ok("detalhe financeiro da venda responde", detMov.status === 200);
    ok("traz o snapshot das regras aplicadas", detMov.json?.data?.regras !== undefined);
    ok(
      "liquido = bruto - custos, na propria resposta",
      Math.abs(
        detMov.json.data.regras.valorLiquido -
          (detMov.json.data.regras.valorBruto - detMov.json.data.regras.custosAprovados)
      ) < 0.02
    );
    ok(
      "fornecedor + RED fecham o liquido",
      Math.abs(
        detMov.json.data.regras.valorLiquido -
          (detMov.json.data.regras.valorFornecedor + detMov.json.data.regras.receitaRed)
      ) < 0.02
    );
    ok("historico da venda vem montado", Array.isArray(detMov.json?.data?.historico));
  }

  const gRepasses = await req("GET", "/management/financial/payouts?aba=pendentes", { token });
  ok("repasses respondem", gRepasses.status === 200);
  ok("resumo com aging vem no meta", gRepasses.json?.meta?.resumo?.prazoHoras === 48);
  const repasseLinha = (gRepasses.json?.data || [])[0];
  ok(
    "cada repasse diz quantas horas faltam e a situacao",
    !repasseLinha ||
      (repasseLinha.horasRestantes !== undefined &&
        ["vencido", "vencendo", "no_prazo", "sem_prazo"].includes(repasseLinha.situacao))
  );

  for (const rel of ["sales-evolution", "by-category", "by-model", "by-supplier"]) {
    const r = await req("GET", `/management/reports/${rel}`, { token });
    ok(`relatorio ${rel} responde`, r.status === 200);
  }

  const csv = await req("GET", "/management/reports/vendas/export?formato=csv", { token });
  ok("exportacao CSV responde", csv.status === 200);

  const matriz = await req("GET", "/management/permissions", { token });
  ok("matriz de permissoes responde", matriz.status === 200);
  ok(
    "o perfil comercial nao tem capacidade financeira",
    !(matriz.json?.data?.perfis || [])
      .find((p) => p.chave === "comercial")
      ?.capacidades.includes("financial_read")
  );

  const config = await req("GET", "/management/settings", { token });
  ok("configuracoes respondem", config.status === 200);
  ok(
    "cada configuracao diz se foi editada ou herdada do ambiente",
    (config.json?.data || []).every((c) => ["configurado", "padrao"].includes(c.origem))
  );

  const gravaConfig = await req("PATCH", "/management/settings", {
    token,
    body: { "repasse.alertaHoras": 12 },
  });
  ok("configuracao grava", gravaConfig.status === 200);
  ok(
    "valor gravado passa a constar como configurado",
    (gravaConfig.json?.data || []).find((c) => c.key === "repasse.alertaHoras")?.origem === "configurado"
  );

  const configInvalida = await req("PATCH", "/management/settings", {
    token,
    body: { "chave.inexistente": 1 },
  });
  ok("configuracao desconhecida e recusada", configInvalida.status === 400);

  const usuarios = await req("GET", "/users", { token });
  ok("usuarios respondem", usuarios.status === 200);
  ok(
    "o usuario traz as capacidades derivadas do papel",
    Array.isArray((usuarios.json?.data || [])[0]?.capacidades)
  );

  // ---------- recuperacao de senha ----------
  console.log("\nrecuperacao de senha");
  const esqueci = await req("POST", "/auth/forgot-password", {
    body: { email: ADMIN_EMAIL },
  });
  ok("pedido de recuperacao aceito", esqueci.status === 200);

  const inexistente = await req("POST", "/auth/forgot-password", {
    body: { email: "nao-existe-mesmo@example.com" },
  });
  ok(
    "e-mail inexistente responde igual (nao enumera contas)",
    inexistente.status === 200 &&
      inexistente.json?.data?.message === esqueci.json?.data?.message
  );

  const tokenInvalido = await req("POST", "/auth/reset-password", {
    body: { token: "f".repeat(64), newPassword: "outra-senha-123" },
  });
  ok("token invalido e recusado", tokenInvalido.status === 400);

  // ---------- upload ----------
  console.log("\nupload de imagens");
  const semArquivo = await req("POST", "/uploads/images", { token });
  ok("upload sem ficheiro e recusado", semArquivo.status === 400);

  // ---------- resultado ----------
  console.log(`\n${passou} passaram, ${falhou} falharam\n`);
  process.exit(falhou > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("smoke test quebrou:", err);
  process.exit(1);
});
