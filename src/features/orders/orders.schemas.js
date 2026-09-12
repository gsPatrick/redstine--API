"use strict";

const { z } = require("zod");
const {
  ORDER_STATUS,
  PAGAMENTOS,
  PAYMENT_STATUS,
  PICKUP_STATUS,
  CANAIS_VENDA,
} = require("../../config/constants");

const criarSchema = z.object({
  buyerName: z.string().min(2).max(160),
  buyerEmail: z.string().email(),
  buyerPhone: z.string().max(40).optional(),
  buyerDocument: z.string().max(32).optional(),
  buyerId: z.string().uuid().optional(),
  billing: z.record(z.any()).optional(),
  paymentMethod: z.nativeEnum(PAGAMENTOS),
  notes: z.string().max(2000).optional(),
  items: z
    .array(
      z.object({
        assetId: z.string().uuid(),
        quantity: z.coerce.number().int().min(1),
      })
    )
    .min(1, "O pedido precisa de pelo menos um item."),
});

/**
 * Venda fechada fora do site (revisao do cliente, item 11).
 *
 * Herda os campos do comprador do `criarSchema` porque a venda externa e o
 * mesmo pedido — o comprador de WhatsApp precisa de identificacao igual ao do
 * checkout, senao o comprovante e o repasse ficam sem contraparte.
 *
 * Tres diferencas, todas deliberadas:
 *
 *  - `channel` e OBRIGATORIO e nao aceita `site`. E o campo que distingue esta
 *    venda do checkout; aceitar `site` aqui tornaria a coluna inutil.
 *  - `items[].unitPrice` e opcional. Quando vem, e o valor negociado no
 *    atendimento; quando nao vem, usa-se o preco do catalogo. Sem esta abertura
 *    o operador teria de EDITAR o ativo para registrar uma venda negociada, o
 *    que mudaria o catalogo publico por causa de um caso pontual.
 *  - pagamento e retirada podem vir na mesma chamada. A venda de telefone chega
 *    ao sistema quase sempre ja paga e ja retirada; obrigar a repetir os passos
 *    noutra tela produziria venda registada e nunca concluida — logo, repasse
 *    que nunca e liberado ao fornecedor.
 */
const vendaExternaSchema = criarSchema.extend({
  channel: z.enum(
    Object.values(CANAIS_VENDA).filter((c) => c !== CANAIS_VENDA.SITE),
    { errorMap: () => ({ message: "Informe o canal em que a venda foi fechada." }) }
  ),
  items: z
    .array(
      z.object({
        assetId: z.string().uuid(),
        quantity: z.coerce.number().int().min(1),
        unitPrice: z.coerce.number().positive().optional(),
      })
    )
    .min(1, "A venda precisa de pelo menos um item."),
  paymentStatus: z.nativeEnum(PAYMENT_STATUS).optional(),
  paymentReference: z.string().max(160).optional(),
  pickupStatus: z.nativeEnum(PICKUP_STATUS).optional(),
  pickupLocation: z.string().max(160).optional(),
  pickupNotes: z.string().max(2000).optional(),
});

const statusSchema = z.object({
  status: z.nativeEnum(ORDER_STATUS),
  motivo: z.string().max(500).optional(),
});

const listarQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  perPage: z.coerce.number().int().min(1).max(100).optional(),
  status: z.nativeEnum(ORDER_STATUS).optional(),
  buyerId: z.string().uuid().optional(),
  // Filtro de procedencia: "quanto do faturamento veio do site" e uma pergunta
  // que a gestao faz, e sem este filtro a resposta era contar a mao.
  channel: z.nativeEnum(CANAIS_VENDA).optional(),
});

const idParamSchema = z.object({ id: z.string().uuid() });
const refParamSchema = z.object({ reference: z.string().min(4).max(24) });

const pagamentoSchema = z.object({
  status: z.nativeEnum(PAYMENT_STATUS),
  reference: z.string().max(160).optional(),
});

/**
 * Retirada.
 *
 * Os campos estruturados existem porque o Detalhe da Compra os renderiza em
 * linhas separadas — "Local", "Endereço", "Responsável". Um bloco de texto
 * livre nao da para exibir assim, e obrigaria o front a tentar interpretar
 * prosa.
 */
const retiradaSchema = z.object({
  status: z.nativeEnum(PICKUP_STATUS),
  local: z.string().max(160).optional(),
  endereco: z.string().max(300).optional(),
  responsavel: z.string().max(140).optional(),
  contato: z.string().max(40).optional(),
  agendamento: z.coerce.date().optional(),
  instrucoes: z.string().max(2000).optional(),
  notes: z.string().max(2000).optional(),
});

module.exports = {
  criarSchema,
  vendaExternaSchema,
  statusSchema,
  listarQuerySchema,
  idParamSchema,
  refParamSchema,
  pagamentoSchema,
  retiradaSchema,
};
