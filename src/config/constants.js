"use strict";

/** Vocabulario do dominio. Usado por models, services e validacao. */

const ROLES = {
  // MASTER no documento — acesso completo.
  ADMIN: "admin",
  // Avalia envios e administra ativos.
  CURADOR: "curador",
  // Relacionamento, ativos, consultas e vendas. NAO ve receita RED nem repasses.
  COMERCIAL: "comercial",
  // Vendas, calculos, custos, repasses e pagamentos.
  FINANCEIRO: "financeiro",
  FORNECEDOR: "fornecedor",
  COMPRADOR: "comprador",
};

/**
 * Capacidades por papel. O documento e explicito: "esconder um menu no
 * front-end nao e controle de seguranca" — a checagem vive no backend.
 */
const CAPABILITIES = {
  COMMERCIAL_READ: "commercial_read",
  COMMERCIAL_WRITE: "commercial_write",
  FINANCIAL_READ: "financial_read",
  FINANCIAL_WRITE: "financial_write",
  ADMIN_READ: "admin_read",
  ADMIN_WRITE: "admin_write",
};

const CAPS_POR_PAPEL = {
  admin: Object.values(CAPABILITIES),
  curador: [CAPABILITIES.COMMERCIAL_READ, CAPABILITIES.COMMERCIAL_WRITE],
  comercial: [CAPABILITIES.COMMERCIAL_READ, CAPABILITIES.COMMERCIAL_WRITE],
  financeiro: [CAPABILITIES.FINANCIAL_READ, CAPABILITIES.FINANCIAL_WRITE],
  fornecedor: [],
  comprador: [],
};

const USER_STATUS = { ATIVO: "ativo", INATIVO: "inativo", PENDENTE: "pendente" };

/** Condicao do ativo — espelha o atributo pa_condicao do catalogo atual. */
/**
 * Condição do ativo — os cinco valores do filtro da página Comprar.
 *
 * "usado" sozinho não distinguia um ativo em bom estado de um que precisa de
 * reparo, e essa diferença muda o preço e a decisão de compra.
 */
const CONDICOES = ["sem_uso", "seminovo", "usado_bom", "usado_sinais", "necessita_reparo"];

const ROTULO_CONDICAO = {
  sem_uso: "Sem uso",
  seminovo: "Seminovo",
  usado_bom: "Usado em bom estado",
  usado_sinais: "Usado com sinais de uso",
  necessita_reparo: "Necessita reparo",
};

/**
 * Forma de venda: COMO o ativo é vendido.
 * Não confundir com MODALIDADES, que diz SE o preço já está fechado — um lote
 * pode ser compra direta e uma unidade pode ser sob consulta.
 */
const FORMAS_DE_VENDA = { UNIDADE: "unidade", CONJUNTO: "conjunto", LOTE: "lote" };

const ROTULO_FORMA_VENDA = { unidade: "Unidade", conjunto: "Conjunto", lote: "Lote" };

/**
 * Disponibilidade operacional, independente do status do ativo: um ativo
 * publicado pode estar reservado enquanto uma negociação corre.
 */
const DISPONIBILIDADE = {
  DISPONIVEL: "disponivel",
  SUJEITO_CONFIRMACAO: "sujeito_confirmacao",
  RESERVADO: "reservado",
};

const ROTULO_DISPONIBILIDADE = {
  disponivel: "Disponível",
  sujeito_confirmacao: "Sujeito à confirmação",
  reservado: "Reservado",
};

/**
 * Campos técnicos exibidos apenas quando preenchidos e relevantes (V3.2).
 * Vivem em `attributes` porque variam por categoria — como colunas seriam
 * dezenas de nulos em todo ativo.
 */
const CAMPOS_TECNICOS = [
  "modelo",
  "dimensoes",
  "peso",
  "potencia",
  "voltagem",
  "capacidade",
  "acabamento",
];

/**
 * Ciclo de vida do ativo. A regra central da RED e que o fornecedor NAO publica
 * direto: o ativo so chega a PUBLICADO depois de curadoria e de aprovacao
 * explicita do fornecedor sobre preco e modelo.
 */
const ASSET_STATUS = {
  RASCUNHO: "rascunho",
  EM_AVALIACAO: "em_avaliacao",
  AGUARDANDO_APROVACAO: "aguardando_aprovacao",
  APROVADO: "aprovado",
  PUBLICADO: "publicado",
  VENDIDO: "vendido",
  INATIVO: "inativo",
};

/** Transicoes permitidas. Qualquer salto fora daqui e recusado no service. */
const ASSET_TRANSICOES = {
  rascunho: ["em_avaliacao", "inativo"],
  em_avaliacao: ["aguardando_aprovacao", "inativo"],
  aguardando_aprovacao: ["aprovado", "em_avaliacao", "inativo"],
  aprovado: ["publicado", "em_avaliacao", "inativo"],
  publicado: ["vendido", "inativo"],
  vendido: ["inativo"],
  inativo: [],
};

/** Modelo comercial: onde o ativo fica e como o resultado e dividido. */
const MODELOS_COMERCIAIS = { ESTOQUE: "estoque", CATALOGO: "catalogo" };

/** Modalidade de venda. "consulta" nunca gera pedido direto — gera cotacao. */
const MODALIDADES = { DIRETA: "direta", CONSULTA: "consulta" };

const SUBMISSION_STATUS = {
  RECEBIDA: "recebida",
  EM_AVALIACAO: "em_avaliacao",
  APROVADA: "aprovada",
  RECUSADA: "recusada",
};

const ORDER_STATUS = {
  AGUARDANDO_CONFIRMACAO: "aguardando_confirmacao",
  CONFIRMADO: "confirmado",
  EM_SEPARACAO: "em_separacao",
  AGUARDANDO_RETIRADA: "aguardando_retirada",
  CONCLUIDO: "concluido",
  CANCELADO: "cancelado",
};

/**
 * Formas de pagamento do pedido.
 *
 * `consulta` nao e meio de pagamento: marca o pedido cujo valor sera fechado
 * pelo comercial antes de existir cobranca. Fica aqui porque a coluna e a
 * mesma, e separar em duas criaria um pedido sem forma de pagamento nenhuma.
 */
const PAGAMENTOS = {
  PIX: "pix",
  BOLETO: "boleto",
  CARTAO: "cartao",
  TRANSFERENCIA: "transferencia",
  CONSULTA: "consulta",
};

/**
 * Status FINANCEIRO do repasse (documento oficial, secao 18).
 * Independente do status do ativo e do status de retirada — de proposito.
 *
 * Sequencia oficial: POTENCIAL -> REALIZADO -> A RECEBER -> RECEBIDO.
 * O valor so entra em A_RECEBER apos a conclusao integral da operacao.
 */
const PAYOUT_STATUS = {
  VENDA_REALIZADA: "venda_realizada",
  A_RECEBER: "a_receber",
  PAGAMENTO_PROGRAMADO: "pagamento_programado",
  PAGO: "pago",
  CANCELADO: "cancelado",
};

/** Pagamento do comprador. Uma das condicoes da conclusao integral. */
const PAYMENT_STATUS = {
  AGUARDANDO: "aguardando",
  PAGO: "pago",
  ESTORNADO: "estornado",
};

/** Retirada/entrega. Outra condicao da conclusao integral. */
const PICKUP_STATUS = {
  NAO_APLICAVEL: "nao_aplicavel",
  AGUARDANDO: "aguardando",
  AGENDADA: "agendada",
  CONCLUIDA: "concluida",
};

/** Custos dedutiveis do bruto antes do split (secao 5.1). */
const TIPOS_CUSTO = [
  "transporte",
  "movimentacao",
  "carregamento",
  "desmontagem",
  "impostos",
  "comissao_terceiros",
  "taxa",
  "outro",
];

/** Prazo para repasse a partir da conclusao integral (secao 17). */
const PRAZO_REPASSE_HORAS = 48;

/**
 * Eventos de analytics (secao 24).
 *
 * O documento e explicito: "Armazenar eventos com timestamp desde o lancamento.
 * Nao esperar a implementacao do analytics para comecar a coletar dados."
 * Dado nao coletado hoje nao se recupera depois.
 */
const EVENTOS = {
  PRODUCT_VIEW: "product_view",
  FAVORITE_ADDED: "favorite_added",
  FAVORITE_REMOVED: "favorite_removed",
  CONSULTATION_CREATED: "consultation_created",
  CONSULTATION_ANSWERED: "consultation_answered",
  PURCHASE_COMPLETED: "purchase_completed",
  ASSET_PUBLISHED: "asset_published",
  ASSET_SOLD: "asset_sold",
  OPERATION_COMPLETED: "operation_completed",
  PAYMENT_COMPLETED: "payment_completed",
};

/** Entidades rastreadas no historico (secao 23). */
const ENTIDADES_AUDITAVEIS = [
  "asset",
  "submission",
  "evaluation",
  "order",
  "quote",
  "cost",
  "payout",
  "user",
];

/** Tipos de notificacao da V1 (area do cliente e painel de gestao). */
const NOTIFICACOES = {
  // Comprador
  CONSULTA_RESPONDIDA: "consulta_respondida",
  COMPRA_CONFIRMADA: "compra_confirmada",
  COMPRA_PRONTA_RETIRADA: "compra_pronta_retirada",
  // Fornecedor
  ATIVO_AGUARDANDO_APROVACAO: "ativo_aguardando_aprovacao",
  ATIVO_PUBLICADO: "ativo_publicado",
  ATIVO_VENDIDO: "ativo_vendido",
  VALOR_A_RECEBER: "valor_a_receber",
  PAGAMENTO_REALIZADO: "pagamento_realizado",
  // Gestao
  NOVA_CONSULTA: "nova_consulta",
  NOVO_ENVIO: "novo_envio",
  VENDA_REALIZADA: "venda_realizada",
  REPASSE_PENDENTE: "repasse_pendente",
};

/** Status da consulta — vocabulario oficial do painel (secao 10). */
const QUOTE_STATUS = {
  NOVA: "nova",
  EM_ATENDIMENTO: "em_atendimento",
  RESPONDIDA: "respondida",
  ENCERRADA: "encerrada",
};

module.exports = {
  ROLES,
  CAPABILITIES,
  CAPS_POR_PAPEL,
  PAYOUT_STATUS,
  PAYMENT_STATUS,
  PICKUP_STATUS,
  TIPOS_CUSTO,
  PRAZO_REPASSE_HORAS,
  EVENTOS,
  ENTIDADES_AUDITAVEIS,
  NOTIFICACOES,
  USER_STATUS,
  CONDICOES,
  ROTULO_CONDICAO,
  FORMAS_DE_VENDA,
  ROTULO_FORMA_VENDA,
  DISPONIBILIDADE,
  ROTULO_DISPONIBILIDADE,
  CAMPOS_TECNICOS,
  ASSET_STATUS,
  ASSET_TRANSICOES,
  MODELOS_COMERCIAIS,
  MODALIDADES,
  SUBMISSION_STATUS,
  ORDER_STATUS,
  PAGAMENTOS,
  QUOTE_STATUS,
};
