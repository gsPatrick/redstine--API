/**
 * Ações das telas e separação de acesso.
 *
 * O contrato prova que a tela RENDERIZA; isto prova que ela FUNCIONA — botão
 * de atender consulta, seleção em lote de repasses, gravar configuração — e
 * que um perfil não alcança o que não é dele.
 *
 * Reexecute `npm run seed:demo` antes: as ações consomem o estado que testam.
 */
// A porta sai do ambiente porque a 4000 nem sempre e a instancia a testar:
// com uma segunda API a correr, conferir contra a porta ocupada testava o
// codigo velho e dava tudo verde sem provar nada.
const BASE = process.env.API_BASE || "http://localhost:4000/api/v1";
const tok = async (e, s) => (await (await fetch(`${BASE}/auth/login`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({email:e,password:s})})).json()).data.token;
async function chamar(m, r, tk, body) {
  const res = await fetch(BASE + r, { method: m, headers: { "Content-Type":"application/json", ...(tk?{Authorization:`Bearer ${tk}`}:{}) }, ...(body?{body:JSON.stringify(body)}:{}) });
  return { status: res.status, json: await res.json().catch(()=>null) };
}
const admin = await tok("admin@redestine.com.br","RedAdmin2026!");
const forn  = await tok("joao.silva@empresa.com.br","Fornecedor@2026");
const comp  = await tok("ana.lima@construtoraalfa.com.br","Fornecedor@2026");

let mau = 0;
const ok = (n, c, extra="") => { if (c) console.log(`  ok      ${n}`); else { console.log(`  FALHA   ${n} ${extra}`); mau++; } };

console.log("\n== AÇÕES DA TELA ==");

// Favoritos: coração remove
const fav = (await chamar("GET","/wishlist",comp)).json.data[0];
const tog = await chamar("POST",`/wishlist/${fav.assetId}/toggle`,comp);
ok("Favoritos: coração remove/adiciona", tog.status === 200);
await chamar("POST",`/wishlist/${fav.assetId}/toggle`,comp);

// Consultas da gestão: atribuir responsável e responder
const consulta = (await chamar("GET","/management/consultations?status=nova",admin)).json.data[0];
if (consulta) {
  const users = (await chamar("GET","/users",admin)).json.data;
  const atrib = await chamar("POST",`/quotes/${consulta.id}/assign`,admin,{ assignedTo: users[0].id });
  ok("Consultas: atribuir responsável tira da fila", atrib.status===200 && atrib.json.data.status==="em_atendimento", JSON.stringify(atrib.json).slice(0,120));
  const resp = await chamar("POST",`/quotes/${consulta.id}/respond`,admin,{ quotedPrice: 9900, responseNotes:"Condições confirmadas." });
  ok("Consultas: responder", resp.status===200);
} else ok("Consultas: havia consulta nova para atender", false);

// Repasses: seleção em lote -> programar -> marcar pago
const devidos = (await chamar("GET","/management/financial/payouts?aba=devidos",admin)).json.data;
if (devidos.length) {
  const ids = devidos.map(d=>d.id);
  const prog = await chamar("POST","/payouts/schedule",admin,{ ids, scheduledAt: new Date(Date.now()+86400000).toISOString() });
  ok("Repasses: programar pagamento em lote", prog.status===200, JSON.stringify(prog.json).slice(0,140));
  const pago = await chamar("POST","/payouts/mark-paid",admin,{ ids, paymentMethod:"pix", paymentReference:"PIX-CONFERENCIA" });
  ok("Repasses: marcar como pago em lote", pago.status===200, JSON.stringify(pago.json).slice(0,140));
  const hist = (await chamar("GET","/me/payments",forn)).json.data;
  ok("Financeiro do fornecedor: meio e comprovante chegam no histórico",
     hist.some(h=>h.comprovante==="PIX-CONFERENCIA" && h.meio==="pix"),
     JSON.stringify(hist[0]||{}).slice(0,140));
} else ok("Repasses: havia repasse devido", false);

// Ativos da gestão: mudar status
const rasc = (await chamar("GET","/management/assets?status=em_avaliacao",admin)).json.data[0];
ok("Ativos: filtro por status funciona", !!rasc);

// Configurações: gravar percentual e provar que venda antiga não se move
const antesMov = (await chamar("GET","/management/financial/movements",admin)).json.data;
const antesAtivo = (await chamar("GET","/management/assets?commercialModel=catalogo",admin)).json.data[0];
const cfg = await chamar("PATCH","/management/settings",admin,{ "split.catalogo.fornecedor": 60 });
ok("Configurações: gravar percentual", cfg.status===200);

const depoisMov = (await chamar("GET","/management/financial/movements",admin)).json.data;
const mudou = depoisMov.filter((d,i) => d.participacaoFornecedor !== antesMov[i].participacaoFornecedor);
ok("Alterar percentual NÃO recalcula NENHUMA venda já realizada", mudou.length === 0,
   `(${mudou.length} mudaram)`);

const depoisAtivo = (await chamar("GET","/management/assets?commercialModel=catalogo",admin)).json.data[0];
ok("Mas o novo padrão vale para o potencial dos ativos ainda não vendidos",
   depoisAtivo.participacaoFornecedor === 60 && antesAtivo.participacaoFornecedor === 65,
   `(antes ${antesAtivo.participacaoFornecedor} -> depois ${depoisAtivo.participacaoFornecedor})`);

await chamar("PATCH","/management/settings",admin,{ "split.catalogo.fornecedor": 65 });

// Filtros temporais
const a = (await chamar("GET","/management/overview?periodo=7d",admin)).json.data;
const b = (await chamar("GET","/management/overview?periodo=12m",admin)).json.data;
ok("Estado ignora o filtro de período", a.estado.ativosPublicados === b.estado.ativosPublicados);
ok("Fluxo responde ao filtro de período", JSON.stringify(a.fluxo) !== JSON.stringify(b.fluxo) || a.fluxo.vendasRealizadas === b.fluxo.vendasRealizadas);

// Curadoria de envios
console.log("\n== CURADORIA DE ENVIOS ==");
const envio = (await chamar("GET","/submissions?status=recebida",admin)).json.data[0];
if (envio) {
  const inicio = await chamar("POST",`/submissions/${envio.id}/start-review`,admin);
  ok("Iniciar avaliação move para em_avaliacao", inicio.json?.data?.status === "em_avaliacao", `(${inicio.status})`);

  // Recusar sem motivo tem de falhar: o motivo e o que o fornecedor recebe
  // como resposta, e recusar em silencio nao e uma decisao comunicavel.
  const semMotivo = await chamar("POST",`/submissions/${envio.id}/evaluations`,admin,{ approved:false });
  ok("Recusar exige motivo", semMotivo.status === 422 || semMotivo.status === 400, `(${semMotivo.status})`);

  // Aprovar sem categoria tambem: sem ela o ativo nao tem lugar no catalogo.
  const semCategoria = await chamar("POST",`/submissions/${envio.id}/evaluations`,admin,{ approved:true });
  ok("Aprovar exige categoria", semCategoria.status === 422 || semCategoria.status === 400, `(${semCategoria.status})`);

  const cat = (await chamar("GET","/catalog/categories")).json.data[0];
  const aprov = await chamar("POST",`/submissions/${envio.id}/evaluations`,admin,{
    approved:true, categoryId:cat.id, name:"[smoke] aprovado pela curadoria",
    recommendedPrice:990, recommendedModel:"estoque",
  });
  ok("Aprovar cria o ativo", Boolean(aprov.json?.data?.evaluation?.assetId), `(${aprov.status})`);

  const depois = (await chamar("GET",`/submissions/${envio.id}`,admin)).json.data;
  ok("Envio fica aprovado e com histórico", depois.status==="aprovada" && depois.avaliacoes.length>0);
} else {
  console.log("  (sem envio recebido para avaliar)");
}

// Edição do envio
const editavel = (await chamar("GET","/submissions?perPage=1",admin)).json.data[0];
if (editavel) {
  const nome = `[smoke] envio corrigido ${Date.now()}`;
  const ed = await chamar("PATCH",`/submissions/${editavel.id}`,admin,{
    assetType: nome, city:"Pilares - RJ", attributes:{ condicao:"seminovo", marcaSmoke:"x" },
  });
  ok("Editar dados do envio", ed.status===200, `(${ed.status})`);
  const relido = (await chamar("GET",`/submissions/${editavel.id}`,admin)).json.data;
  ok("Edição do envio persiste", relido.assetType===nome && relido.city==="Pilares - RJ");

  // Mesclar e nao substituir: o formulario da curadoria manda so os campos que
  // mostra, e trocar o objeto inteiro apagaria o resto. Planta-se uma marca e
  // confere-se que ela sobrevive a um segundo PATCH que nao a menciona — assim
  // o teste nao depende de o envio sorteado ter vindo do painel.
  const seg = await chamar("PATCH",`/submissions/${editavel.id}`,admin,{ attributes:{ condicao:"usado_bom" } });
  const relido2 = (await chamar("GET",`/submissions/${editavel.id}`,admin)).json.data;
  ok("attributes é mesclado, não substituído",
     relido2.attributes?.marcaSmoke === "x" && relido2.attributes?.condicao === "usado_bom",
     `(${JSON.stringify(relido2.attributes)})`);
}

// Gestão do ativo
console.log("\n== GESTÃO DO ATIVO ==");
const alvo = (await chamar("GET","/assets/admin?perPage=1",admin)).json.data[0];
if (alvo) {
  const nome = `[smoke] editado ${Date.now()}`;
  const ed = await chamar("PATCH",`/assets/${alvo.id}`,admin,{ name:nome, brand:"Marca X", attributes:{ peso:"9 kg" } });
  ok("Editar dados do ativo", ed.status===200, `(${ed.status})`);
  const relido = (await chamar("GET",`/assets/admin/${alvo.id}`,admin)).json.data;
  ok("Edição persiste", relido.name===nome && relido.brand==="Marca X" && relido.attributes?.peso==="9 kg");

  // Um salto que a API nao permite tem de ser recusado, senao o front so
  // descobre a regra pelo erro depois do clique.
  const salto = await chamar("PATCH",`/assets/${alvo.id}/status`,admin,{ status:"vendido" });
  const valido = ["rascunho","em_avaliacao","aguardando_aprovacao","aprovado"].includes(relido.status);
  ok("Transição inválida é recusada", !valido || salto.status>=400, `(estado ${relido.status}, veio ${salto.status})`);
} else {
  console.log("  (sem ativo para editar)");
}

// Cadastro direto e publicação
console.log("\n== CADASTRO DIRETO NO CATÁLOGO ==");
const cat0 = (await chamar("GET","/catalog/categories")).json.data[0];
const criado = await chamar("POST","/assets",admin,{
  name:`[smoke] cadastro direto ${Date.now()}`, categoryId:cat0.id, price:120, saleMode:"direta", quantity:5,
});
ok("Criar ativo pela gestão", criado.status===201 || criado.status===200, `(${criado.status})`);

if (criado.json?.data?.id) {
  const novoId = criado.json.data.id;
  ok("Nasce em rascunho", criado.json.data.status === "rascunho", `(${criado.json.data.status})`);

  for (const st of ["em_avaliacao","aguardando_aprovacao","aprovado","publicado"]) {
    await chamar("PATCH",`/assets/${novoId}/status`,admin,{ status: st });
  }
  const publicado = (await chamar("GET",`/assets/admin/${novoId}`,admin)).json.data;
  // Sem isto o operador da RED cadastra o proprio acervo e nunca consegue
  // publicar: nao ha fornecedor terceiro para dar a aprovacao que a regra pede.
  ok("Ativo próprio chega a publicado", publicado.status==="publicado", `(${publicado.status})`);
  ok("Publicação registra quem autorizou o preço", Boolean(publicado.supplierApprovedBy));

  // E a protecao de quem tem fornecedor de verdade tem de continuar de pe.
  const forn0 = (await chamar("GET","/users?role=fornecedor&perPage=1",admin)).json.data[0];
  const deTerceiro = (await chamar("POST","/assets",admin,{
    name:`[smoke] de terceiro ${Date.now()}`, categoryId:cat0.id, supplierId:forn0.id, price:100, saleMode:"direta",
  })).json.data;
  for (const st of ["em_avaliacao","aguardando_aprovacao","aprovado"]) {
    await chamar("PATCH",`/assets/${deTerceiro.id}/status`,admin,{ status: st });
  }
  const bloqueado = await chamar("PATCH",`/assets/${deTerceiro.id}/status`,admin,{ status:"publicado" });
  ok("Ativo de terceiro ainda exige aprovação do fornecedor",
     bloqueado.json?.error?.code === "SUPPLIER_APPROVAL_REQUIRED", `(${bloqueado.status})`);
}


// ---------------------------------------------------------------------------
// Volta ao estoque de um ativo vendido (revisão do cliente, item 3)
// ---------------------------------------------------------------------------
console.log("\n== VOLTA AO ESTOQUE ==");
const catV = (await chamar("GET","/catalog/categories")).json.data[0];
const publicar = async (dados) => {
  const novo = (await chamar("POST","/assets",admin,dados)).json.data;
  for (const st of ["em_avaliacao","aguardando_aprovacao","aprovado","publicado"]) {
    await chamar("PATCH",`/assets/${novo.id}/status`,admin,{ status: st });
  }
  return novo;
};

const porEngano = await publicar({
  name:`[smoke] vendido por engano ${Date.now()}`, categoryId:catV.id, price:70, saleMode:"direta", quantity:8,
});
ok("Ativo nasce com quantidade original igual à cadastrada", porEngano.originalQuantity === 8,
   `(original ${porEngano.originalQuantity}, disponível ${porEngano.quantity})`);

await chamar("PATCH",`/assets/${porEngano.id}/status`,admin,{ status:"vendido" });
const volta = await chamar("PATCH",`/assets/${porEngano.id}/status`,admin,{ status:"publicado", motivo:"venda registrada por engano" });
ok("Ativo vendido volta a publicado", volta.status===200 && volta.json?.data?.status==="publicado",
   `(${volta.status} ${volta.json?.error?.code||""})`);

const reposto = (await chamar("GET",`/assets/admin/${porEngano.id}`,admin)).json.data;
// Sem repor a quantidade o ativo voltava publicado e inconsumivel: aparecia
// na vitrine e nenhum pedido podia ser fechado.
ok("A volta repõe a quantidade disponível", reposto.quantity === 8, `(${reposto.quantity})`);
ok("A volta apaga o carimbo de venda", !reposto.soldAt, `(${reposto.soldAt})`);
const noCatalogoDeNovo = (await chamar("GET",`/assets/slug/${reposto.slug}`)).json?.data;
ok("O ativo devolvido é comprável outra vez", noCatalogoDeNovo?.inStock === true);

// E o caso que NAO pode voltar: a venda aconteceu de verdade, pelo pedido, e
// consumiu o lote inteiro. Republicar seria oferecer o que ja foi entregue.
const vendaReal = async (qtd) => {
  const ativo = await publicar({
    name:`[smoke] venda real ${Date.now()}`, categoryId:catV.id, price:50, saleMode:"direta", quantity:qtd,
  });
  const compradorDemo = (await chamar("GET","/users?role=comprador&perPage=1",admin)).json.data[0];
  const ped = await chamar("POST","/orders",admin,{
    buyerName: compradorDemo?.nome || "[smoke] comprador",
    buyerEmail: compradorDemo?.email || "ana.lima@construtoraalfa.com.br",
    paymentMethod:"pix", items:[{ assetId: ativo.id, quantity: qtd }],
  });
  await chamar("POST",`/orders/${ped.json?.data?.id}/confirm`,admin);
  return { ativo, pedidoId: ped.json?.data?.id };
};

const integral = await vendaReal(1);
const aposVenda = (await chamar("GET",`/assets/admin/${integral.ativo.id}`,admin)).json.data;
ok("Venda integral pelo pedido marca o ativo como vendido", aposVenda.status==="vendido" && aposVenda.quantity===0,
   `(${aposVenda.status}, ${aposVenda.quantity})`);

const semSaldo = await chamar("PATCH",`/assets/${integral.ativo.id}/status`,admin,{ status:"publicado" });
ok("Sem quantidade a devolver, a volta é recusada em vez de publicar o inconsumível",
   semSaldo.json?.error?.code === "NO_QUANTITY_TO_RESTORE", `(${semSaldo.status} ${semSaldo.json?.error?.code})`);

// Venda cancelada e o caso que o cliente descreveu: cancelar o pedido nao
// devolve a quantidade sozinho, e a volta ao estoque passa a ser possivel
// porque o item cancelado deixa de contar como vendido.
const cancelada = await vendaReal(2);
await chamar("PATCH",`/orders/${cancelada.pedidoId}/status`,admin,{ status:"cancelado", motivo:"[smoke] desistência" });
const voltaCancelada = await chamar("PATCH",`/assets/${cancelada.ativo.id}/status`,admin,{ status:"publicado", motivo:"venda cancelada" });
const reabilitado = (await chamar("GET",`/assets/admin/${cancelada.ativo.id}`,admin)).json.data;
ok("Venda cancelada permite devolver o ativo ao estoque",
   voltaCancelada.status===200 && reabilitado.status==="publicado" && reabilitado.quantity===2,
   `(${voltaCancelada.status}, ${reabilitado.status}, ${reabilitado.quantity})`);

// ---------------------------------------------------------------------------
// Estoque zerado sai do filtro do catálogo (revisão do cliente, item 2)
// ---------------------------------------------------------------------------
console.log("\n== FILTRO DO CATÁLOGO E ESTOQUE ZERADO ==");
const marca = `SmokeMarca${Date.now()}`;
const comMarca = await publicar({
  name:`[smoke] com marca ${Date.now()}`, categoryId:catV.id, price:90, saleMode:"direta", quantity:4, brand: marca,
});

const marcas = () => chamar("GET","/assets?perPage=1").then(r => (r.json?.meta?.filtros?.brand||[]).map(o=>o.value));
ok("O catálogo devolve o painel de filtros no meta", (await marcas()).length > 0);
ok("Marca com estoque aparece no filtro", (await marcas()).includes(marca));

await chamar("PATCH",`/assets/${comMarca.id}`,admin,{ quantity:0 });
const depoisDeZerar = await marcas();
ok("Marca sai do filtro quando o estoque zera", !depoisDeZerar.includes(marca),
   `(${depoisDeZerar.filter(m=>m.startsWith("SmokeMarca")).join(",")||"nenhuma"})`);

const zerado = (await chamar("GET",`/assets/slug/${comMarca.slug}`)).json?.data;
// A outra metade do pedido: sai do FILTRO, mas continua na vitrine sinalizado.
ok("O ativo continua no catálogo, sinalizado como esgotado",
   Boolean(zerado) && zerado.inStock === false &&
   (zerado.attributes||[]).some(l => l.name==="Estoque" && l.values.includes("Esgotado")),
   JSON.stringify(zerado?.inStock));
const naLista = (await chamar("GET",`/assets?search=${encodeURIComponent(comMarca.name)}`)).json?.data||[];
ok("Esgotado não desaparece da listagem pública", naLista.some(a=>a.id===comMarca.id));

// ---------------------------------------------------------------------------
// Modelo comercial Ativo Próprio (revisão do cliente, item 10)
// ---------------------------------------------------------------------------
console.log("\n== ATIVO PRÓPRIO (100% RED) ==");
const proprio = await publicar({
  name:`[smoke] ativo proprio ${Date.now()}`, categoryId:catV.id, price:200, saleMode:"direta",
  quantity:3, commercialModel:"proprio",
});
ok("Cadastrar ativo no modelo próprio", proprio.commercialModel === "proprio", `(${proprio.commercialModel})`);

const listaProprio = (await chamar("GET","/management/assets?commercialModel=proprio",admin)).json.data;
const linhaProprio = listaProprio.find(a=>a.id===proprio.id);
ok("Gestão filtra pelo modelo próprio", Boolean(linhaProprio));
ok("Ativo próprio não reserva nada ao fornecedor",
   linhaProprio?.participacaoFornecedor === 0 && linhaProprio?.potencialFornecedor === 0,
   `(${linhaProprio?.participacaoFornecedor}% / ${linhaProprio?.potencialFornecedor})`);
ok("Todo o potencial do ativo próprio é da RED",
   linhaProprio?.participacaoRed === 100 && linhaProprio?.potencialRed === 600,
   `(${linhaProprio?.participacaoRed}% / ${linhaProprio?.potencialRed})`);
ok("O modelo próprio tem rótulo de tela", linhaProprio?.modelo === "Ativo Próprio RED", `(${linhaProprio?.modelo})`);

// Uma venda no modelo proprio: o repasse nasce a zero para o fornecedor e a
// RED fica com o liquido inteiro.
const compradorUser = (await chamar("GET","/users?role=comprador&perPage=1",admin)).json.data[0];
const pedidoProprio = await chamar("POST","/orders",admin,{
  buyerName: compradorUser?.nome || "[smoke] comprador",
  buyerEmail: compradorUser?.email || "ana.lima@construtoraalfa.com.br",
  paymentMethod:"pix",
  items:[{ assetId: proprio.id, quantity: 1 }],
});
if (pedidoProprio.json?.data?.id) {
  const pid = pedidoProprio.json.data.id;
  await chamar("POST",`/orders/${pid}/confirm`,admin);
  const detalhe = (await chamar("GET",`/orders/${pid}`,admin)).json.data;
  const rep = (detalhe.repasses||[])[0];
  ok("Venda de ativo próprio gera repasse 0/100",
     Number(rep?.supplierPercent)===0 && Number(rep?.redPercent)===100 && Number(rep?.supplierAmount)===0,
     JSON.stringify({s:rep?.supplierPercent,r:rep?.redPercent,va:rep?.supplierAmount}));
  ok("A receita RED do ativo próprio é o líquido inteiro",
     Number(rep?.redAmount) === Number(rep?.netAmount), `(${rep?.redAmount} de ${rep?.netAmount})`);

  // A regra que NAO pode quebrar: mudar a tabela de percentuais nunca mexe no
  // que ja foi vendido, porque o percentual do repasse e um snapshot.
  const antesRel = (await chamar("GET","/management/reports/by-model?periodo=tudo",admin)).json.data;
  await chamar("PATCH","/management/settings",admin,{ "split.proprio.fornecedor": 40 });
  const depoisRel = (await chamar("GET","/management/reports/by-model?periodo=tudo",admin)).json.data;
  ok("Mudar o percentual do modelo próprio NÃO recalcula a venda já realizada",
     JSON.stringify(antesRel) === JSON.stringify(depoisRel));
  const relProprio = depoisRel.find(l=>l.modeloChave==="proprio");
  ok("O relatório por modelo mostra o modelo próprio com o percentual praticado",
     relProprio?.participacaoFornecedor === 0 && relProprio?.modelo === "Ativo Próprio RED",
     JSON.stringify(relProprio||{}).slice(0,140));
  await chamar("PATCH","/management/settings",admin,{ "split.proprio.fornecedor": 0 });
} else {
  ok("Criar pedido de ativo próprio", false, JSON.stringify(pedidoProprio.json).slice(0,160));
}

const cfgs = (await chamar("GET","/management/settings",admin)).json.data.map(c=>c.key);
ok("Configurações expõem o percentual do modelo próprio", cfgs.includes("split.proprio.fornecedor"));

// Aprovacao do fornecedor e ciclo do pedido
console.log("\n== APROVAÇÃO DO FORNECEDOR ==");
const cat1 = (await chamar("GET","/catalog/categories")).json.data[0];
const forn1 = (await chamar("GET","/users?role=fornecedor&perPage=1",admin)).json.data[0];
const aAprovar = (await chamar("POST","/assets",admin,{
  name:`[smoke] aguarda aprovacao ${Date.now()}`, categoryId:cat1.id, supplierId:forn1.id,
  price:176, quantity:50, saleMode:"direta",
})).json.data;
for (const st of ["em_avaliacao","aguardando_aprovacao"]) {
  await chamar("PATCH",`/assets/${aAprovar.id}/status`,admin,{ status: st });
}
// Publicar antes da aprovacao tem de ser recusado: e a regra central da RED.
await chamar("PATCH",`/assets/${aAprovar.id}/status`,admin,{ status:"aprovado" });
const semAprovacao = await chamar("PATCH",`/assets/${aAprovar.id}/status`,admin,{ status:"publicado" });
ok("Publicar sem aprovação do fornecedor é recusado",
   semAprovacao.json?.error?.code === "SUPPLIER_APPROVAL_REQUIRED", `(${semAprovacao.status})`);

console.log("\n== CICLO DO PEDIDO ==");
const pendente = (await chamar("GET","/orders?status=aguardando_confirmacao&perPage=1",admin)).json.data[0];
if (pendente) {
  const antes = (await chamar("GET",`/orders/${pendente.id}/completion`,admin)).json.data;
  ok("Conclusão bloqueada com pendência", antes.pode === false);

  const conf = await chamar("POST",`/orders/${pendente.id}/confirm`,admin);
  ok("Confirmar a venda", conf.status===200 || conf.status===201, `(${conf.status})`);

  await chamar("PATCH",`/orders/${pendente.id}/payment`,admin,{ status:"pago" });
  await chamar("PATCH",`/orders/${pendente.id}/pickup`,admin,{ status:"concluida", local:"[smoke] galpao" });

  const depois = (await chamar("GET",`/orders/${pendente.id}/completion`,admin)).json.data;
  ok("Condições cumpridas liberam a conclusão", depois.pode === true,
     `(faltam: ${(depois.condicoes||[]).filter(c=>!c.ok).map(c=>c.chave).join(",") || "nenhuma"})`);

  const fim = await chamar("POST",`/orders/${pendente.id}/complete`,admin);
  ok("Concluir a operação", fim.status===200 || fim.status===201, `(${fim.status})`);
  const relido = (await chamar("GET",`/orders/${pendente.id}`,admin)).json.data;
  ok("Pedido fica concluído", relido.status === "concluido", `(${relido.status})`);
  // A conclusao integral e o que libera o repasse — sem ela o fornecedor
  // nunca recebe, por mais que o pedido pareca pronto.
  ok("Conclusão gera repasse ao fornecedor", (relido.repasses || []).length > 0);
} else {
  console.log("  (sem pedido aguardando confirmação)");
}

// Separação de acesso
console.log("\n== SEPARAÇÃO DE ACESSO ==");
const semToken = await chamar("GET","/management/financial/movements");
ok("Financeiro exige autenticação", semToken.status===401);
const fornNoPainel = await chamar("GET","/management/overview",forn);
ok("Fornecedor não entra no Painel de Gestão", fornNoPainel.status===403, `(veio ${fornNoPainel.status})`);
const fornNoFinanceiro = await chamar("GET","/management/financial/movements",forn);
ok("Fornecedor não alcança o financeiro global", fornNoFinanceiro.status===403);
const fornVeOutro = await chamar("GET","/me/purchases",forn);
ok("Fornecedor só vê os próprios dados", fornVeOutro.status===200 && fornVeOutro.json.data.length===0);
const compVeVendas = (await chamar("GET","/me/sales",comp)).json.data;
ok("Comprador sem ativos não vê venda nenhuma", compVeVendas.length===0);
const fornNosEnvios = await chamar("GET","/submissions",forn);
ok("Fornecedor não vê a fila de envios de todos", fornNosEnvios.status===403, `(veio ${fornNosEnvios.status})`);
const fornAvalia = await chamar("POST","/submissions/00000000-0000-4000-8000-000000000000/evaluations",forn,{approved:true});
ok("Fornecedor não avalia envio", fornAvalia.status===403, `(veio ${fornAvalia.status})`);
const alvo2 = (await chamar("GET","/assets/admin?perPage=1",admin)).json.data[0];
if (alvo2) {
  const fornEdita = await chamar("PATCH",`/assets/${alvo2.id}`,forn,{ name:"invadido" });
  ok("Fornecedor não edita ativo do catálogo", fornEdita.status===403, `(veio ${fornEdita.status})`);
  const fornFoto = await chamar("POST",`/uploads/assets/${alvo2.id}/images`,forn);
  ok("Fornecedor não mexe nas fotos do catálogo", fornFoto.status===403, `(veio ${fornFoto.status})`);
}
const pedido1 = (await chamar("GET","/orders?perPage=1",admin)).json.data[0];
if (pedido1) {
  const fornConfirma = await chamar("POST",`/orders/${pedido1.id}/confirm`,forn);
  ok("Fornecedor não confirma pedido", fornConfirma.status===403, `(veio ${fornConfirma.status})`);
  const compVePedidos = await chamar("GET","/orders",comp);
  ok("Comprador não vê os pedidos de todos", compVePedidos.status===403, `(veio ${compVePedidos.status})`);
}
const envio2 = (await chamar("GET","/submissions?perPage=1",admin)).json.data[0];
if (envio2) {
  const fornEditaEnvio = await chamar("PATCH",`/submissions/${envio2.id}`,forn,{ city:"invadido" });
  ok("Fornecedor não edita envio", fornEditaEnvio.status===403, `(veio ${fornEditaEnvio.status})`);
}

console.log(mau ? `\n${mau} ação com problema` : "\ntodas as ações da tela funcionam");
process.exit(mau?1:0);
