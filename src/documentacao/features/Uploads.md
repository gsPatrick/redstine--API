# Uploads — imagens

Base: `/api/v1/uploads` · **`admin` ou `curador`** — upload é operação de curadoria

| Método | Rota | Descrição |
|---|---|---|
| POST | `/images` | Guarda ficheiros e devolve as URLs |
| POST | `/assets/:assetId/images` | Guarda **e anexa** ao ativo |
| PATCH | `/assets/:assetId/images/order` | Reordena (`{ imageIds: [...] }`) |
| DELETE | `/images/:imageId` | Remove registro e ficheiro |

`multipart/form-data`, campo `files`, até 20 por requisição.

```bash
curl -X POST http://localhost:4000/api/v1/uploads/assets/{id}/images \
  -H "Authorization: Bearer $TOKEN" \
  -F "files=@foto1.jpg" -F "files=@foto2.jpg"
```

Anexar continua a numeração existente — não reinicia em zero nem sobrescreve.

## Limites

| | Padrão | Variável |
|---|---|---|
| Tamanho | 8 MB | `UPLOAD_MAX_FILE_MB` |
| Tipos | jpeg, png, webp, avif | `UPLOAD_ALLOWED_MIME` |
| Por requisição | 20 | — |

## Decisões de segurança

**O nome do cliente nunca vira caminho no disco.** O ficheiro é gravado com nome
aleatório de 32 hex mais a extensão derivada do mimetype — nome original com
`../` ou `.php` não tem como escapar.

**Remoção não sai da raiz de uploads.** O caminho é resolvido e comparado com a
raiz antes de apagar.

**Recebe em memória e delega a escrita ao provider** (`src/providers/storage`).
Trocar disco local por S3 ou R2 é reescrever `guardar` e `remover` — nenhum
service muda.

## Limitação em produção

Disco local **não serve com mais de uma instância**: o ficheiro só existiria na
máquina que recebeu o upload. É a primeira coisa a trocar antes de escalar.

## Erros

| Código | HTTP | Quando |
|---|---|---|
| `NO_FILES` | 400 | Requisição sem ficheiro |
| `UNSUPPORTED_MEDIA_TYPE` | 422 | Tipo fora da lista |
| `FILE_TOO_LARGE` | 422 | Acima do limite |
| `TOO_MANY_FILES` | 422 | Mais de 20 |
| `IMAGE_MISMATCH` | 400 | Reordenar com id de outro ativo |
