# Providers

Clientes de sistemas externos. Um diretório por serviço:

```
src/providers/
  <nome-do-sistema>/
    <nome>.client.js     # HTTP, timeout, retry
    index.js
```

Regra: **controller nunca chama sistema externo direto.** O service chama o
provider. Assim a integração pode ser trocada ou mockada sem tocar em regra de
negócio.

Credenciais vêm de `src/config/env.js` — nunca de `process.env` aqui dentro.

Candidatos previstos: envio de e-mail (confirmação de pedido, resposta de
cotação), gateway de pagamento (Pix e boleto — hoje o pedido só registra a
escolha) e armazenamento de imagens.
