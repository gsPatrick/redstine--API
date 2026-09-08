# Queues

Processos assíncronos, quando existirem (BullMQ ou equivalente).

Regra: o worker **chama o service**, não reimplementa a regra. Duplicar lógica
entre rota e worker é como os dois divergem.

Candidatos: e-mail de confirmação de pedido, aviso ao fornecedor quando o ativo
é aprovado, geração de cobrança.
