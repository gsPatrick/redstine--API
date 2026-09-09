/**
 * Conferência de contrato: cada tela dos dois painéis contra a API.
 *
 * Verifica PRESENÇA DE CAMPO, não status 200. Uma rota que responde 200 com
 * um objeto sem `participacao` quebra a coluna da tabela igual — e o smoke
 * não pegaria.
 *
 * Exige `npm run seed:demo` antes: lista vazia esconde campo em falta, e
 * conferir contra array vazio é passar por omissão.
 */
const BASE = "http://localhost:4000/api/v1";

async function token(email, senha) {
  const r = await fetch(`${BASE}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: senha }),
  });
  const j = await r.json();
  if (!j.data?.token) throw new Error(`login falhou para ${email}: ${JSON.stringify(j).slice(0,200)}`);
  return j.data.token;
}

async function get(rota, tk) {
  const r = await fetch(BASE + rota, { headers: { Authorization: `Bearer ${tk}` } });
  return { status: r.status, json: await r.json().catch(() => null) };
}

const chaves = (o) => (o && typeof o === "object" ? Object.keys(o) : []);
const primeira = (d) => (Array.isArray(d) ? d[0] : d);

// tela -> { rota, caminho ate o objeto, campos que o front le }
const CONTRATO = [
  // ---------------- Área do Cliente
  ["Visão Geral / bloco Comprar", "/me/overview", (d) => d.comprar, ["compras","consultas","favoritos"]],
  ["Visão Geral / bloco Vender", "/me/overview", (d) => d.vender, ["ativosPublicados","ativosVendidos","receitaPotencial","aReceber","recebido","vendasRealizadas"]],
  ["Visão Geral / atividades", "/me/overview", (d) => d.atividades?.[0], ["titulo","data","href"]],
  ["Sino", "/notifications", (d) => primeira(d), ["id","title","body","link","readAt","type","createdAt"]],
  ["Minhas Compras / linha", "/me/purchases", (d) => primeira(d), ["id","pedido","data","produto","imagem","quantidade","valor","status"]],
  ["Detalhe da Compra", "__compra__", (d) => d, ["id","pedido","data","valor","formaPagamento","status","itens","retirada","historico"]],
  ["Detalhe da Compra / retirada", "__compra__", (d) => d.retirada, ["local","endereco","responsavel","contato","agendamento","instrucoes"]],
  ["Detalhe da Compra / histórico", "__compra__", (d) => d.historico?.[0], ["titulo"]],
  ["Detalhe da Compra / produto", "__compra__", (d) => d.itens?.[0], ["nome","codigo","imagem","quantidade"]],
  ["Minhas Consultas / linha", "/me/consultations", (d) => primeira(d), ["id","data","produto","imagem","quantidade","status","atualizacao"]],
  ["Detalhe da Consulta", "__consulta__", (d) => d, ["mensagem","resposta","podeComprar","quantidade","status","atualizacao"]],
  ["Favoritos / card", "/wishlist", (d) => primeira(d), ["assetId"]],
  ["Dashboard Vendas / estado", "/me/sales-dashboard", (d) => d.estado, ["ativosPublicados","receitaPotencial","aReceber"]],
  ["Dashboard Vendas / fluxo", "/me/sales-dashboard", (d) => d.fluxo, ["ativosVendidos","vendasRealizadas","recebido"]],
  ["Dashboard Vendas / gráfico 1", "/me/sales-dashboard", (d) => d.graficos?.resultados?.[0], ["rotulo","realizado","recebido"]],
  ["Dashboard Vendas / gráfico 2", "/me/sales-dashboard", (d) => d.graficos?.ativosPorStatus?.[0], ["rotulo","valor","cor"]],
  ["Meus Ativos / linha", "/me/my-assets", (d) => primeira(d), ["id","nome","imagem","codigo","categoria","subcategoria","local","modelo","preco","participacao","receitaPotencial","quantidadeOriginal","quantidadeDisponivel","condicao","status","publicadoEm","atualizadoEm"]],
  ["Vendas / linha", "/me/sales", (d) => primeira(d), ["id","venda","data","ativo","quantidade","valorVenda","participacao","valorFornecedor","modelo","statusRetirada","status"]],
  ["Financeiro / pagamentos", "/me/payments", (d) => primeira(d), ["id","data","venda","ativo","valor","meio","comprovante"]],
  ["Conta / dados", "/me/profile", (d) => d.dados, ["nome","sobrenome","email","telefone","cpf"]],
  ["Conta / empresa", "/me/profile", (d) => d.empresa, ["razaoSocial","nomeFantasia","cnpj","cargo","email"]],
  ["Conta / endereços", "/me/profile", (d) => d.enderecos?.retirada, ["cep","logradouro","numero","complemento","bairro","cidade","estado"]],
  ["Enviar Ativos / categorias", "/catalog/categories", (d) => primeira(d), ["id","name","subcategorias"]],
];

const CONTRATO_GESTAO = [
  ["Gestão Visão Geral / estado", "/management/overview", (d) => d.estado, ["fornecedoresAtivos","ativosPublicados","valorTotalPublicado"]],
  ["Gestão Visão Geral / fluxo", "/management/overview", (d) => d.fluxo, ["vendasRealizadas","valorVendido","ticketMedio"]],
  ["Gestão Visão Geral / financeiro", "/management/overview", (d) => d.financeiro, ["receitaRed","aRepassar","repassado"]],
  ["Gestão Visão Geral / variações", "/management/overview", (d) => d.variacoes, ["vendasRealizadas","valorVendido","consultasRecebidas"]],
  ["Gestão Visão Geral / pendências", "/management/overview", (d) => d.alertas, ["consultasEmAberto","ativosAguardandoAprovacao","enviosSemAvaliacao","repassesForaDoPrazo","prazoRepasseHoras"]],
  ["Gestão Visão Geral / gráfico vendas", "/management/overview", (d) => d.graficos?.evolucaoVendas?.[0], ["rotulo","valor"]],
  ["Gestão Envios / linha", "/submissions", (d) => primeira(d), ["id","reference","assetType","approximateQuantity","company","name","email","city","photos","status","createdAt"]],
  ["Gestão Envio / detalhe", "__envio__", (d) => d, ["id","reference","assetType","description","approximateQuantity","notes","photos","attributes","city","name","company","email","phone","supplierId","status","createdAt","avaliacoes"]],
  ["Gestão Visão Geral / gráfico categoria", "/management/overview", (d) => d.graficos?.vendasPorCategoria?.[0], ["rotulo","valor","cor","percentual"]],
  ["Comercial Consultas / cartões", "/management/consultations/summary", (d) => d, ["total","novas","emAtendimento","respondidas","encerradas"]],
  ["Comercial Consultas / linha", "/management/consultations", (d) => primeira(d), ["id","data","cliente","ativo","quantidade","status","responsavel","atualizacao"]],
  ["Comercial Ativos / linha", "/management/assets", (d) => primeira(d), ["id","codigo","nome","fornecedor","categoria","local","modelo","participacaoFornecedor","preco","potencialFornecedor","potencialRed","status","publicadoEm"]],
  ["Comercial Vendas / linha", "/management/sales", (d) => primeira(d), ["id","venda","data","cliente","fornecedor","ativo","quantidade","valorBruto","participacaoFornecedor","statusRetirada"]],
  ["Comercial Vendas / cartões", "/management/sales/summary", (d) => d, ["vendasRealizadas","valorBrutoVendido","ticketMedio","aguardandoRetirada"]],
  ["Financeiro Movimentações / linha", "/management/financial/movements", (d) => primeira(d), ["id","data","venda","fornecedor","ativo","valorBruto","participacaoFornecedor","repasse","receitaRed","statusFinanceiro"]],
  ["Financeiro Movimentações / totais", "/management/financial/movements", (d, meta) => meta.totais, ["valorBruto","valorFornecedores","receitaRed","custosAprovados","valorLiquido"]],
  ["Detalhe da Venda / informações", "__mov__", (d) => d, ["venda","data","cliente","fornecedor","ativo","quantidade","statusRetirada"]],
  ["Detalhe da Venda / regras", "__mov__", (d) => d.regras, ["modelo","valorBruto","custosAprovados","valorLiquido","participacaoFornecedor","participacaoRed","valorFornecedor","receitaRed"]],
  ["Detalhe da Venda / status", "__mov__", (d) => d.financeiro, ["status","previsaoPagamento","pagamento","comprovante"]],
  ["Detalhe da Venda / histórico", "__mov__", (d) => d.historico?.[0], ["data","titulo","detalhe"]],
  ["Repasses / linha", "/management/financial/payouts?aba=pendentes", (d) => primeira(d), ["id","venda","fornecedor","ativo","valor","prazo","horasRestantes","situacao","status"]],
  ["Repasses / cartões", "/management/financial/payouts?aba=pendentes", (d, meta) => meta.resumo, ["aRepassar","vencidos","programados","repassado","prazoHoras"]],
  ["Relatórios / por modelo", "/management/reports/by-model", (d) => primeira(d), ["modelo","participacaoFornecedor","operacoes","valorBruto","receitaRed","margemRed"]],
  ["Relatórios / por categoria", "/management/reports/by-category", (d) => primeira(d), ["rotulo","valor","percentual","cor"]],
  ["Configurações", "/management/settings", (d) => primeira(d), ["key","value","description","origem"]],
  ["Usuários / linha", "/users", (d) => primeira(d), ["id","nome","email","perfil","capacidades","ativo","ultimoAcesso"]],
  ["Permissões / capacidades", "/management/permissions", (d) => d.capacidades?.[0], ["chave","label","area"]],
  ["Permissões / perfis", "/management/permissions", (d) => d.perfis?.[0], ["chave","nome","descricao","capacidades"]],
];

const tkForn = await token("joao.silva@empresa.com.br", "Fornecedor@2026");
const tkComp = await token("ana.lima@construtoraalfa.com.br", "Fornecedor@2026");
const tkAdmin = await token("admin@redestine.com.br", "RedAdmin2026!");

const compraId = (await get("/me/purchases", tkComp)).json.data[0]?.id;
const consultaId = (await get("/me/consultations", tkComp)).json.data[0]?.id;
const movId = (await get("/management/financial/movements", tkAdmin)).json.data[0]?.id;
const envioId = (await get("/submissions", tkAdmin)).json.data[0]?.id;

const resolver = (rota) =>
  rota === "__compra__" ? `/me/purchases/${compraId}`
  : rota === "__consulta__" ? `/me/consultations/${consultaId}`
  : rota === "__mov__" ? `/management/financial/movements/${movId}`
  : rota === "__envio__" ? `/submissions/${envioId}`
  : rota;

let faltas = 0, vazios = 0, okc = 0;
const cache = new Map();

async function conferir(lista, tk, dono) {
  console.log(`\n${"=".repeat(64)}\n${dono}\n${"=".repeat(64)}`);
  for (const [tela, rota, extrair, campos] of lista) {
    const url = resolver(rota);
    const chave = url + tk.slice(-8);
    if (!cache.has(chave)) cache.set(chave, await get(url, tk));
    const r = cache.get(chave);

    if (r.status !== 200) { console.log(`  ERRO ${r.status}  ${tela} (${url})`); faltas++; continue; }

    let obj;
    try { obj = extrair(r.json.data, r.json.meta || {}); } catch { obj = null; }

    if (obj === undefined || obj === null) {
      console.log(`  VAZIO      ${tela} — sem dado para conferir (${url})`);
      vazios++; continue;
    }
    const tem = new Set(chaves(obj));
    const falta = campos.filter((c) => !tem.has(c));
    if (falta.length) { console.log(`  FALTA      ${tela}: ${falta.join(", ")}`); faltas++; }
    else { console.log(`  ok         ${tela} (${campos.length} campos)`); okc++; }
  }
}

await conferir(CONTRATO.filter(c => !c[0].startsWith("Minhas Compras") && !c[0].startsWith("Detalhe da Compra") && !c[0].startsWith("Minhas Consultas") && !c[0].startsWith("Detalhe da Consulta") && !c[0].startsWith("Favoritos")), tkForn, "ÁREA DO CLIENTE — perfil fornecedor");
await conferir(CONTRATO.filter(c => c[0].startsWith("Minhas Compras") || c[0].startsWith("Detalhe da Compra") || c[0].startsWith("Minhas Consultas") || c[0].startsWith("Detalhe da Consulta") || c[0].startsWith("Favoritos")), tkComp, "ÁREA DO CLIENTE — perfil comprador");
await conferir(CONTRATO_GESTAO, tkAdmin, "PAINEL DE GESTÃO");

console.log(`\n${"=".repeat(64)}`);
console.log(`${okc} contratos ok · ${faltas} com campo em falta · ${vazios} sem dado`);
process.exit(faltas ? 1 : 0);
