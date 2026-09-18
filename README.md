# DV Confirma

Confirmação de pedidos por WhatsApp com agentes de IA, para operação de pagamento na entrega.

Pedido despachado sem confirmação é prejuízo duplo: frete de ida, frete de volta e produto
parado. Este sistema conversa com o cliente antes de a mercadoria sair — confirma o pedido,
responde dúvida técnica sobre o produto e conserta endereço — e mostra a operação inteira num
painel que se atualiza sozinho.

## Como funciona

Um pedido entra como `AGUARDANDO`. Quando a operação dispara o contato, um agente abre a
conversa no WhatsApp. A partir daí, cada mensagem do cliente aciona um turno de agente.

São três especialistas, e a conversa passa de um para o outro conforme o assunto:

| Agente | Entra quando | O que faz |
| --- | --- | --- |
| **Confirmador** | sempre, é quem abre e fecha | Confirma itens, valor e pagamento na entrega, e pede o "pode enviar" |
| **Quebra-objeções** | o cliente tem dúvida sobre o produto | Responde **só** com o que está na base de objeções; sem resposta na base, escala |
| **Endereço** | o endereço está incompleto ou não bate com o CEP | Confere no ViaCEP, pergunta o que falta e grava o endereço corrigido |

Os agentes não "dizem" que confirmaram — eles **chamam ferramentas** que mudam o estado no
banco. Toda ação vira um evento de auditoria visível no painel.

Ferramentas disponíveis: `consultar_pedido`, `buscar_resposta_produto`, `consultar_cep`,
`atualizar_endereco`, `confirmar_pedido`, `recusar_pedido`, `escalar_para_humano`,
`transferir_para`.

### Travas que o sistema tem de propósito

- **Não confirma sem endereço entregável.** Se o cliente disser "pode mandar" mas faltar
  número ou cidade, o pedido vai para `ENDERECO_PENDENTE` em vez de liberar o envio.
- **Não inventa informação de produto.** Fora da base de objeções, o agente escala.
- **Não mexe em pedido já decidido.** Confirmado, recusado ou escalado é estado final para o
  agente.
- **Não responde duas vezes à mesma mensagem.** O ID da mensagem no provedor é único no banco.
- **Não roda dois agentes no mesmo pedido ao mesmo tempo.** Há trava por pedido.
- **Nunca pede dado de pagamento.** A cobrança é na entrega.

## Começando

Requisitos: Node.js 20.9+.

```bash
npm install
cp .env.example .env     # preencha ANTHROPIC_API_KEY e WEBHOOK_SECRET
npm run db:push          # cria o banco SQLite
npm run db:seed          # carrega produtos, objeções e pedidos de exemplo
npm run dev
```

Abra <http://localhost:3000>. Com o seed carregado o painel já mostra uma operação em
andamento, incluindo uma conversa completa em `DV-10231`.

### Variáveis de ambiente

| Variável | Para quê |
| --- | --- |
| `DATABASE_URL` | Conexão do banco. Padrão: `file:./prisma/dev.db` |
| `ANTHROPIC_API_KEY` | Chave da API da Claude ([console](https://console.anthropic.com/settings/keys)) |
| `ANTHROPIC_MODEL` | Modelo usado. Padrão: `claude-opus-5` |
| `ANTHROPIC_EFFORT` | Esforço de raciocínio por turno. Padrão: `medium` |
| `WEBHOOK_SECRET` | Segredo das rotas de webhook e operação. **Troque o valor do exemplo** |
| `WHATSAPP_PROVIDER` | `mock`, `evolution` ou `meta` |
| `AGENTES_SIMULTANEOS` | Quantos pedidos são atendidos em paralelo. Padrão: `3` |

## Conectando o WhatsApp

### `mock` — desenvolvimento

Não fala com o WhatsApp de verdade: as mensagens "enviadas" saem no console do servidor. Dá
para rodar a operação inteira antes de conectar um número. Para simular o cliente respondendo:

```bash
curl -X POST localhost:3000/api/webhook/whatsapp \
  -H 'content-type: application/json' \
  -H "x-webhook-token: $WEBHOOK_SECRET" \
  -d '{"telefone":"11987654321","texto":"pode enviar sim"}'
```

### `evolution` — Evolution API

Gateway auto-hospedado, funciona com número comum de WhatsApp sem aprovação da Meta. Preencha
`EVOLUTION_API_URL`, `EVOLUTION_API_KEY` e `EVOLUTION_INSTANCE` e aponte o webhook da instância
para `/api/webhook/whatsapp`, mandando o header `x-webhook-token` com o seu `WEBHOOK_SECRET`.

### `meta` — WhatsApp Cloud API

Oficial, exige número aprovado e templates homologados para iniciar conversa fora da janela de
24 horas. Preencha `META_PHONE_NUMBER_ID`, `META_ACCESS_TOKEN`, `META_VERIFY_TOKEN` e
`META_APP_SECRET`. A verificação do webhook (GET) usa o verify token; os POSTs são conferidos
pela assinatura HMAC `x-hub-signature-256`.

## API

Todas as rotas de escrita exigem o header `x-webhook-token`.

### `POST /api/pedidos` — importar pedido

```bash
curl -X POST localhost:3000/api/pedidos \
  -H 'content-type: application/json' \
  -H "x-webhook-token: $WEBHOOK_SECRET" \
  -d '{
    "codigo": "DV-10240",
    "cliente": { "nome": "Maria Souza", "telefone": "(11) 98765-4321" },
    "itens": [{ "sku": "SMW-001", "quantidade": 1 }],
    "endereco": {
      "cep": "01310-100", "logradouro": "Avenida Paulista", "numero": "1578",
      "bairro": "Bela Vista", "cidade": "São Paulo", "uf": "SP"
    }
  }'
```

O telefone aceita qualquer formato brasileiro e é normalizado para E.164. O preço vem do SKU
cadastrado e fica congelado no pedido.

### `POST /api/operacao/disparar` — abrir os atendimentos

```bash
curl -X POST localhost:3000/api/operacao/disparar \
  -H 'content-type: application/json' \
  -H "x-webhook-token: $WEBHOOK_SECRET" \
  -d '{"limite": 20}'
```

Pega os pedidos `AGUARDANDO` e coloca os agentes para trabalhar, `AGENTES_SIMULTANEOS` por vez.
É esta rota que o cron deve chamar — a cada 10 minutos dá um ritmo confortável. Cada pedido é
tentado no máximo 3 vezes antes de virar `SEM_RESPOSTA`; se o cliente responder depois disso, o
atendimento reabre sozinho.

### `GET /api/pedidos?status=CONFIRMADO` — listar

Filtra por qualquer status. Sem filtro, traz os 100 mais recentes.

## Cadastrando produtos e objeções

A base de objeções é o que separa uma resposta certa de uma invenção. Cada produto tem suas
entradas de pergunta e resposta, e o agente só pode responder com o que está lá. Veja
`prisma/seed.ts` para o formato, ou use `npm run db:studio` para editar pela interface.

Vale investir nessa base: toda dúvida que aparece no painel como "escalado para humano" é uma
entrada faltando.

## Colocando em produção

1. **Troque o banco para PostgreSQL.** Mude o `provider` em `prisma/schema.prisma` para
   `postgresql`, troque o adapter em `src/lib/db.ts` por `@prisma/adapter-pg` e rode
   `npm run db:push`. Os status são strings justamente para essa troca não doer.
2. **Troque `WEBHOOK_SECRET`** por um valor aleatório longo. O app recusa as rotas enquanto o
   valor de exemplo estiver lá.
3. **Agende o disparo.** Um cron chamando `POST /api/operacao/disparar` a cada 10 minutos.
4. **Rode uma instância só**, ou troque a fila. As travas de concorrência vivem na memória do
   processo (`src/lib/queue.ts`); com várias instâncias, dois processos podem atender o mesmo
   pedido ao mesmo tempo. Nesse cenário, use fila externa e lock distribuído.

## Estrutura

```
src/
  app/
    page.tsx                        painel da operação
    pedidos/[id]/page.tsx           pedido, conversa e auditoria
    api/pedidos/                    importar e listar
    api/operacao/disparar/          abrir atendimentos
    api/webhook/whatsapp/           receber mensagens
  lib/
    agents/
      prompts.ts                    regras comuns + especialidade de cada agente
      tools.ts                      as ferramentas que mudam o pedido
      orchestrator.ts               roda o turno, envia a resposta, troca de agente
      client.ts                     cliente da API e parâmetros do modelo
    whatsapp/                       provedores plugáveis (mock, evolution, meta)
    db.ts  domain.ts  metrics.ts  queue.ts  auth.ts  cep.ts
prisma/
  schema.prisma  seed.ts
```

## Limitações conhecidas

- **Sem login.** O painel é aberto para quem alcança a URL. Antes de expor na internet, ponha
  autenticação na frente ou deixe atrás de VPN.
- **Concorrência em memória.** Explicado acima: uma instância só, por enquanto.
- **Só mensagem de texto.** Áudio, imagem e figurinha do cliente são ignorados pelos agentes.
- **Busca na base de objeções por palavra-chave.** Suficiente para dezenas de entradas por
  produto; catálogo muito grande pediria busca vetorial.
- **`npm audit` aponta falhas em `deepmerge-ts` e `mysql2`.** As duas entram pelo CLI do Prisma,
  que é dependência de desenvolvimento e não vai para o bundle da aplicação — e o `mysql2` nem é
  usado, já que o banco é SQLite/Postgres. Corrigir hoje exigiria voltar o Prisma para a série 6
  e quebrar a compatibilidade com o client 7.
