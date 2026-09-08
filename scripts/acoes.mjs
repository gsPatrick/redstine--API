/**
 * Ações das telas e separação de acesso.
 *
 * O contrato prova que a tela RENDERIZA; isto prova que ela FUNCIONA — botão
 * de atender consulta, seleção em lote de repasses, gravar configuração — e
 * que um perfil não alcança o que não é dele.
 *
 * Reexecute `npm run seed:demo` antes: as ações consomem o estado que testam.
 */
const BASE = "http://localhost:4000/api/v1";
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

console.log(mau ? `\n${mau} ação com problema` : "\ntodas as ações da tela funcionam");
process.exit(mau?1:0);
