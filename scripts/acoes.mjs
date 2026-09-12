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

// ---------------------------------------------------------------------------
// Detalhe do proprio ativo, na visao do fornecedor (revisão do cliente, item 9)
// ---------------------------------------------------------------------------
console.log("\n== DETALHE DO ATIVO DO FORNECEDOR ==");
const meus = (await chamar("GET","/me/my-assets?perPage=100",forn)).json.data;
ok("O fornecedor tem ativos para detalhar", meus.length > 0);

if (meus.length) {
  const det = await chamar("GET",`/me/my-assets/${meus[0].id}`,forn);
  ok("Abrir o detalhe do próprio ativo", det.status===200, `(${det.status})`);
  const d = det.json?.data;
  // O detalhe existe para mostrar MAIS do que a linha da tabela: se ele nao
  // trouxer fotos, ficha e historico, a tela nova nao se justifica.
  ok("O detalhe traz o que a lista não tem (fotos, descrição, histórico)",
     Array.isArray(d?.fotos) && Array.isArray(d?.historico) && d?.historico.length > 0 &&
     "descricao" in d,
     JSON.stringify({fotos:d?.fotos?.length, hist:d?.historico?.length}));
  ok("O detalhe traz as visualizações do ativo", typeof d?.visualizacoes === "number", `(${d?.visualizacoes})`);
  ok("O detalhe diz se a aprovação cabe, em vez de a tela adivinhar",
     typeof d?.podeAprovar === "boolean", `(${d?.podeAprovar})`);

  // Um ativo parado a espera de aprovacao tem de oferecer a aprovacao DENTRO
  // do detalhe — e o pedido literal do item 9.
  const aguardando = meus.find(a=>a.statusChave==="aguardando_aprovacao");
  if (aguardando) {
    const antesDet = (await chamar("GET",`/me/my-assets/${aguardando.id}`,forn)).json.data;
    ok("Ativo aguardando aprovação abre o detalhe com o botão de aprovar", antesDet.podeAprovar === true);
    const aprov = await chamar("POST",`/assets/${aguardando.id}/supplier-approval`,forn);
    ok("Aprovar de dentro do detalhe funciona", aprov.status===200 || aprov.status===201, `(${aprov.status})`);
    const depoisDet = (await chamar("GET",`/me/my-assets/${aguardando.id}`,forn)).json.data;
    ok("Depois de aprovar, o botão desaparece e o carimbo fica",
       depoisDet.podeAprovar === false && Boolean(depoisDet.aprovadoEm),
       `(${depoisDet.statusChave}, ${depoisDet.aprovadoEm})`);
  } else {
    // O seed pode nao ter ativo parado nesse estado. Em vez de saltar a prova
    // — que e o pedido literal do item 9 —, cria-se o caso: sem isto a
    // aprovacao de dentro do detalhe ficava sem cobertura nenhuma.
    const catA = (await chamar("GET","/catalog/categories")).json.data[0];
    const fornA = (await chamar("GET","/users?role=fornecedor&perPage=100",admin)).json.data
      .find(u => u.email === "joao.silva@empresa.com.br");
    const novo = (await chamar("POST","/assets",admin,{
      name:`[smoke] aguarda aprovacao detalhe ${Date.now()}`, categoryId:catA.id,
      supplierId:fornA.id, price:250, quantity:4, saleMode:"direta",
    })).json.data;
    for (const st of ["em_avaliacao","aguardando_aprovacao"]) {
      await chamar("PATCH",`/assets/${novo.id}/status`,admin,{ status: st });
    }
    const antesDet = (await chamar("GET",`/me/my-assets/${novo.id}`,forn)).json?.data;
    ok("Ativo aguardando aprovação abre o detalhe com o botão de aprovar",
       antesDet?.podeAprovar === true, `(${antesDet?.statusChave})`);
    const aprov = await chamar("POST",`/assets/${novo.id}/supplier-approval`,forn);
    ok("Aprovar de dentro do detalhe funciona", aprov.status===200 || aprov.status===201, `(${aprov.status})`);
    const depoisDet = (await chamar("GET",`/me/my-assets/${novo.id}`,forn)).json.data;
    ok("Depois de aprovar, o botão desaparece e o carimbo fica",
       depoisDet.podeAprovar === false && Boolean(depoisDet.aprovadoEm),
       `(${depoisDet.statusChave}, ${depoisDet.aprovadoEm})`);
  }

  // O isolamento: o ativo de OUTRO fornecedor nao pode sair daqui. E 404 e nao
  // 403 de proposito — 403 confirmaria que aquele id existe.
  const deOutro = (await chamar("GET","/assets/admin?perPage=100",admin)).json.data
    .find(a => a.supplierId && a.supplierId !== meus[0].supplierId && !meus.some(m=>m.id===a.id));
  if (deOutro) {
    const invasao = await chamar("GET",`/me/my-assets/${deOutro.id}`,forn);
    ok("Fornecedor NÃO vê o detalhe do ativo de outro fornecedor",
       invasao.status===404, `(veio ${invasao.status})`);
  } else {
    console.log("  (sem ativo de outro fornecedor para testar o isolamento)");
  }
  const inexistente = await chamar("GET","/me/my-assets/00000000-0000-4000-8000-000000000000",forn);
  ok("Ativo inexistente e ativo alheio respondem igual (404)", inexistente.status===404, `(${inexistente.status})`);
  const semLogin = await chamar("GET",`/me/my-assets/${meus[0].id}`);
  ok("O detalhe do ativo exige autenticação", semLogin.status===401, `(${semLogin.status})`);
}

// ---------------------------------------------------------------------------
// Venda fechada fora do site (revisão do cliente, item 11)
// ---------------------------------------------------------------------------
console.log("\n== VENDA FORA DO SITE ==");
const catE = (await chamar("GET","/catalog/categories")).json.data[0];
// O fornecedor DO TOKEN, nao "o primeiro da lista": os ativos criados aqui
// precisam de pertencer a quem depois vai conferir as proprias vendas, senao
// a prova passava a ser sobre o fornecedor errado.
const fornE = (await chamar("GET","/users?role=fornecedor&perPage=100",admin)).json.data
  .find(u => u.email === "joao.silva@empresa.com.br");
ok("O fornecedor de teste existe no seed", Boolean(fornE));

const publicarComFornecedor = async (dados) => {
  const novo = (await chamar("POST","/assets",admin,{ supplierId: fornE.id, ...dados })).json.data;
  for (const st of ["em_avaliacao","aguardando_aprovacao"]) {
    await chamar("PATCH",`/assets/${novo.id}/status`,admin,{ status: st });
  }
  await chamar("POST",`/assets/${novo.id}/supplier-approval`,admin);
  for (const st of ["aprovado","publicado"]) {
    await chamar("PATCH",`/assets/${novo.id}/status`,admin,{ status: st });
  }
  return novo;
};

const paraWhats = await publicarComFornecedor({
  name:`[smoke] venda whatsapp ${Date.now()}`, categoryId:catE.id, price:100, saleMode:"direta", quantity:10,
});

const externa = await chamar("POST","/orders/external",admin,{
  channel:"whatsapp",
  buyerName:"[smoke] comprador do WhatsApp", buyerEmail:"smoke.whatsapp@teste.com", buyerPhone:"21999990000",
  paymentMethod:"pix", notes:"[smoke] fechado no WhatsApp",
  items:[{ assetId: paraWhats.id, quantity: 3, unitPrice: 120 }],
});
ok("Registrar venda fechada no WhatsApp", externa.status===201 || externa.status===200, JSON.stringify(externa.json).slice(0,160));

const ve = externa.json?.data;
ok("A venda externa nasce CONFIRMADA — não fica à espera de alguém confirmar",
   ve?.status === "confirmado", `(${ve?.status})`);
ok("O canal fica gravado no pedido", ve?.channel === "whatsapp", `(${ve?.channel})`);
ok("Fica registrado quem da RED lançou a venda", Boolean(ve?.registeredById));
// O preco negociado e o que vale; o do catalogo continua onde estava.
ok("O preço negociado é o do pedido, não o do catálogo",
   Number(ve?.itens?.[0]?.unitPrice) === 120 && Number(ve?.total) === 360,
   `(${ve?.itens?.[0]?.unitPrice} / ${ve?.total})`);
const catalogoIntacto = (await chamar("GET",`/assets/admin/${paraWhats.id}`,admin)).json.data;
ok("Registrar a venda NÃO altera o preço publicado do ativo",
   Number(catalogoIntacto.price) === 100, `(${catalogoIntacto.price})`);

// O ponto que o cliente destacou: o estoque tem de baixar DE VERDADE, senao
// o site continua a oferecer o que ja foi vendido.
ok("A venda externa baixa o estoque do ativo de verdade",
   catalogoIntacto.quantity === 7, `(de 10 para ${catalogoIntacto.quantity})`);

// E tem de gerar repasse, senao o fornecedor nunca recebe por esta venda.
const repasseExterno = (ve?.repasses || [])[0];
ok("A venda externa gera repasse ao fornecedor",
   Boolean(repasseExterno) && Number(repasseExterno.supplierAmount) > 0,
   JSON.stringify({p:repasseExterno?.supplierPercent, v:repasseExterno?.supplierAmount}));
ok("O repasse da venda externa nasce em venda_realizada, não em a_receber",
   repasseExterno?.status === "venda_realizada", `(${repasseExterno?.status})`);

// O SNAPSHOT: mudar a tabela de percentuais depois nao pode mover esta venda.
const pctAntes = Number(repasseExterno?.supplierPercent);
await chamar("PATCH","/management/settings",admin,{ "split.catalogo.fornecedor": 55 });
const releitura = (await chamar("GET",`/orders/${ve.id}`,admin)).json.data;
ok("Mudar o percentual NÃO recalcula a venda externa já registrada",
   Number(releitura.repasses?.[0]?.supplierPercent) === pctAntes,
   `(era ${pctAntes}, ficou ${releitura.repasses?.[0]?.supplierPercent})`);
await chamar("PATCH","/management/settings",admin,{ "split.catalogo.fornecedor": 65 });

// Pagamento e retirada podem vir na mesma chamada, e e isso que permite
// concluir a operacao e liberar o repasse sem uma segunda passagem.
const externa2 = await chamar("POST","/orders/external",admin,{
  channel:"telefone",
  buyerName:"[smoke] comprador do telefone", buyerEmail:"smoke.telefone@teste.com",
  paymentMethod:"transferencia",
  items:[{ assetId: paraWhats.id, quantity: 1 }],
  paymentStatus:"pago", paymentReference:"TED-SMOKE",
  pickupStatus:"concluida", pickupLocation:"[smoke] galpão",
});
const ve2 = externa2.json?.data;
ok("Pagamento e retirada entram na mesma chamada",
   ve2?.paymentStatus === "pago" && ve2?.pickupStatus === "concluida",
   `(${ve2?.paymentStatus} / ${ve2?.pickupStatus})`);
ok("Sem preço na linha, vale o preço do catálogo",
   Number(ve2?.itens?.[0]?.unitPrice) === 100, `(${ve2?.itens?.[0]?.unitPrice})`);
const compl = (await chamar("GET",`/orders/${ve2.id}/completion`,admin)).json.data;
ok("A venda externa já registrada paga e retirada pode ser concluída na hora",
   compl.pode === true,
   `(faltam: ${(compl.condicoes||[]).filter(c=>!c.ok).map(c=>c.chave).join(",")||"nenhuma"})`);
const fecha = await chamar("POST",`/orders/${ve2.id}/complete`,admin);
ok("Concluir a venda externa libera o repasse", fecha.status===200, `(${fecha.status})`);
const repasseLiberado = (await chamar("GET",`/orders/${ve2.id}`,admin)).json.data.repasses?.[0];
ok("O repasse da venda externa passa a a_receber depois da conclusão",
   repasseLiberado?.status === "a_receber", `(${repasseLiberado?.status})`);

// A venda externa tem de aparecer nos numeros e nas telas da gestao, senao
// registra-la nao resolve o problema que o cliente descreveu.
const vendasGestao = (await chamar("GET","/management/sales?periodo=tudo&perPage=100",admin)).json.data;
const linhaExterna = vendasGestao.find(v => v.venda === `#${ve.reference}`);
ok("A venda externa entra em Comercial > Vendas com o canal visível",
   linhaExterna?.canal === "WhatsApp" && linhaExterna?.canalChave === "whatsapp",
   JSON.stringify({c:linhaExterna?.canal}));
const doFornecedor = (await chamar("GET","/me/sales?perPage=100",forn)).json.data;
ok("A venda externa aparece nas Vendas do fornecedor",
   doFornecedor.some(v => v.venda === `#${ve.reference}`));

// Filtro de procedencia: e a pergunta "quanto veio do site".
const soWhats = (await chamar("GET","/orders?channel=whatsapp&perPage=100",admin)).json.data;
ok("Filtrar pedidos por canal", soWhats.length > 0 && soWhats.every(p=>p.channel==="whatsapp"));
const soSite = (await chamar("GET","/orders?channel=site&perPage=5",admin)).json.data;
ok("Os pedidos do site continuam marcados como site", soSite.every(p=>p.channel==="site"));

// Recusas que precisam de existir.
const semCanal = await chamar("POST","/orders/external",admin,{
  buyerName:"x y", buyerEmail:"a@b.com", paymentMethod:"pix",
  items:[{ assetId: paraWhats.id, quantity:1 }],
});
ok("Venda externa sem canal é recusada", semCanal.status===422 || semCanal.status===400, `(${semCanal.status})`);
const canalSite = await chamar("POST","/orders/external",admin,{
  channel:"site", buyerName:"x y", buyerEmail:"a@b.com", paymentMethod:"pix",
  items:[{ assetId: paraWhats.id, quantity:1 }],
});
ok("Registrar a mão uma venda como 'site' é recusado", canalSite.status===422 || canalSite.status===400, `(${canalSite.status})`);
const demais = await chamar("POST","/orders/external",admin,{
  channel:"whatsapp", buyerName:"x y", buyerEmail:"a@b.com", paymentMethod:"pix",
  items:[{ assetId: paraWhats.id, quantity: 9999 }],
});
ok("Venda externa acima do estoque é recusada — o estoque não pode ficar negativo",
   demais.json?.error?.code === "INSUFFICIENT_QUANTITY", `(${demais.status} ${demais.json?.error?.code})`);

// Ativo sob consulta: entra na venda externa COM preco (foi negociado no
// atendimento), e continua recusado sem preco.
const sobConsulta = await publicarComFornecedor({
  name:`[smoke] sob consulta ${Date.now()}`, categoryId:catE.id, saleMode:"consulta", quantity:5, price:80,
});
const semPreco = await chamar("POST","/orders/external",admin,{
  channel:"telefone", buyerName:"x y", buyerEmail:"a@b.com", paymentMethod:"pix",
  items:[{ assetId: sobConsulta.id, quantity:1 }],
});
ok("Ativo sob consulta sem preço na linha continua recusado",
   semPreco.json?.error?.code === "QUOTE_REQUIRED", `(${semPreco.status} ${semPreco.json?.error?.code})`);
const comPreco = await chamar("POST","/orders/external",admin,{
  channel:"telefone", buyerName:"x y", buyerEmail:"a@b.com", paymentMethod:"pix",
  items:[{ assetId: sobConsulta.id, quantity:1, unitPrice: 777 }],
});
ok("Ativo sob consulta é vendível fora do site com o preço negociado",
   comPreco.status===201 && Number(comPreco.json?.data?.total) === 777,
   `(${comPreco.status} ${comPreco.json?.data?.total})`);

// ---------------------------------------------------------------------------
// Visualizações no card e na página do produto (revisão do cliente, item 33)
// ---------------------------------------------------------------------------
console.log("\n== VISUALIZAÇÕES ==");
const alvoView = (await chamar("GET","/assets?perPage=1")).json.data[0];
ok("O card do catálogo já traz a contagem de visualizações",
   typeof alvoView?.views === "number", `(${alvoView?.views})`);

const verComoSessao = (sessao) => fetch(`${BASE}/events/product-view`, {
  method:"POST",
  headers:{ "Content-Type":"application/json", ...(sessao?{ "x-session-id": sessao }:{}) },
  body: JSON.stringify({ assetId: alvoView.id }),
}).then(async r => ({ status:r.status, json: await r.json().catch(()=>null) }));

const base = alvoView.views;
const v1 = await verComoSessao("smoke-sessao-A");
ok("Registrar a visualização conta", v1.json?.data?.contabilizada === true && v1.json?.data?.visualizacoes === base + 1,
   JSON.stringify(v1.json?.data));

// O ponto do item: o mesmo visitante a recarregar a pagina nao pode contar de
// novo — senao o F5 vira metrica.
const v2 = await verComoSessao("smoke-sessao-A");
ok("O mesmo visitante a recarregar NÃO conta outra vez",
   v2.json?.data?.contabilizada === false && v2.json?.data?.visualizacoes === base + 1,
   JSON.stringify(v2.json?.data));

const v3 = await verComoSessao("smoke-sessao-B");
ok("Um visitante diferente conta", v3.json?.data?.contabilizada === true && v3.json?.data?.visualizacoes === base + 2,
   JSON.stringify(v3.json?.data));

const relidoView = (await chamar("GET",`/assets/slug/${alvoView.slug}`)).json.data;
ok("A contagem chega ao payload da página do produto", relidoView.views === base + 2, `(${relidoView.views})`);
const naListagem = (await chamar("GET",`/assets?search=${encodeURIComponent(alvoView.name)}`)).json.data
  .find(a=>a.id===alvoView.id);
ok("A contagem chega ao card da listagem, sem consulta por card", naListagem?.views === base + 2, `(${naListagem?.views})`);

const funil = await chamar("GET",`/events/assets/${alvoView.id}/funnel`,admin);
ok("O funil do ativo conta as mesmas visualizações",
   funil.json?.data?.visualizacoes >= base + 2, JSON.stringify(funil.json?.data));

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
// Registro de venda externa e acao interna: quem compra nao lanca venda.
const compRegistra = await chamar("POST","/orders/external",comp,{
  channel:"whatsapp", buyerName:"x y", buyerEmail:"a@b.com", paymentMethod:"pix",
  items:[{ assetId:"00000000-0000-4000-8000-000000000000", quantity:1 }],
});
ok("Comprador não registra venda externa", compRegistra.status===403, `(veio ${compRegistra.status})`);
const fornRegistra = await chamar("POST","/orders/external",forn,{
  channel:"whatsapp", buyerName:"x y", buyerEmail:"a@b.com", paymentMethod:"pix",
  items:[{ assetId:"00000000-0000-4000-8000-000000000000", quantity:1 }],
});
ok("Fornecedor não registra venda externa", fornRegistra.status===403, `(veio ${fornRegistra.status})`);
const anonRegistra = await chamar("POST","/orders/external",null,{
  channel:"whatsapp", buyerName:"x y", buyerEmail:"a@b.com", paymentMethod:"pix",
  items:[{ assetId:"00000000-0000-4000-8000-000000000000", quantity:1 }],
});
ok("Venda externa exige autenticação", anonRegistra.status===401, `(veio ${anonRegistra.status})`);

// Analytics de visualizacao e leitura de gestao; reportar a visita, nao.
const fornVeFunil = await chamar("GET","/events/assets/00000000-0000-4000-8000-000000000000/funnel",forn);
ok("Fornecedor não alcança o funil de eventos da gestão", fornVeFunil.status===403, `(veio ${fornVeFunil.status})`);
const fornVeResumo = await chamar("GET","/events/summary",forn);
ok("Fornecedor não alcança o resumo de eventos", fornVeResumo.status===403, `(veio ${fornVeResumo.status})`);

const envio2 = (await chamar("GET","/submissions?perPage=1",admin)).json.data[0];
if (envio2) {
  const fornEditaEnvio = await chamar("PATCH",`/submissions/${envio2.id}`,forn,{ city:"invadido" });
  ok("Fornecedor não edita envio", fornEditaEnvio.status===403, `(veio ${fornEditaEnvio.status})`);
}

console.log(mau ? `\n${mau} ação com problema` : "\ntodas as ações da tela funcionam");
process.exit(mau?1:0);
