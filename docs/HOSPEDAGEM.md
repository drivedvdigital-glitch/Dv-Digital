# Hospedar o D&VFly — sair do localhost

Hoje o app vive na sua máquina: quando você fecha a janela, ele cai e a Shopify perde o
endereço. Hospedado, ele fica de pé sozinho — e **só muda quando você mandar uma versão
nova**, com um duplo clique.

O que muda, em uma tabela:

| | Hoje (localhost + túnel) | Hospedado |
|---|---|---|
| Fica no ar com o PC desligado | não | **sim** |
| Endereço | muda a cada túnel | **fixo**, para sempre |
| Banco de dados | arquivo na sua máquina | **Postgres no servidor**, com backup do provedor |
| Atualiza quando | a cada `INICIAR-DVFLY` | **só quando você roda `PUBLICAR-DVFLY`** |
| Token das lojas | texto puro no arquivo local | **criptografado** (AES-256-GCM) |

Duas estradas. Escolha uma e siga só a seção dela.

- **[Vercel](#vercel)** — sem servidor para cuidar; publica com um comando.
- **[Minha VM](#minha-vm)** — controle total, Docker, banco na mesma máquina.

O fim é o mesmo: a seção **[Ligar na Shopify](#ligar-na-shopify)**, que vale para as duas.

---

## Antes de qualquer coisa: três valores

Anote estes três; as duas estradas pedem os mesmos.

1. **SHOPIFY_CLIENT_ID** e **SHOPIFY_CLIENT_SECRET** — no [Dev Dashboard](https://shopify.dev/dashboard)
   da Shopify, dentro do seu app, em *Client credentials*. O `client_id` também está em
   `shopify.app.toml`; o secret **nunca** fica em arquivo do projeto.
2. **DVFLY_TOKEN_KEY** — gere na sua máquina, na pasta do projeto:

   ```
   npm run gerar-chave
   ```

   É a chave que criptografa o acesso às suas lojas dentro do banco — a documentação da
   própria Shopify pede que o token de cada loja seja guardado criptografado, porque um
   vazamento do banco, sem isso, entrega a loja inteira. **Guarde a chave.** Trocá-la depois
   obriga cada loja a abrir o app de novo para renovar o acesso.
3. **DATABASE_URL** — o endereço do Postgres. Cada estrada cria o dela abaixo.

---

## Vercel

Não há servidor para cuidar: a Vercel compila e executa o app. O banco é um Postgres
gerenciado, pedido no painel dela.

### 1. Criar o projeto

1. Entre em [vercel.com](https://vercel.com) com a conta do GitHub.
2. **Add New → Project** e escolha o repositório `Dv-Digital`.
3. Em **Root Directory**, clique em *Edit* e escolha a pasta **`app`**. É onde mora o
   projeto React Router; sem isso a Vercel não reconhece o framework.
4. **Não clique em Deploy ainda** — falta o banco e as variáveis.

### 2. Criar o banco

No projeto, aba **Storage → Create Database → Postgres** (Neon é o padrão da Vercel e o
plano gratuito basta para começar). Ao criar, a Vercel já grava as variáveis de conexão no
projeto. Confira que existem, em **Settings → Environment Variables**:

- `DATABASE_URL` — a **pooled** (é a que o app usa a cada requisição)
- `DATABASE_URL_DIRECT` — a **unpooled/direct**. Se a Vercel tiver criado com outro nome
  (`POSTGRES_URL_NON_POOLING`, `DATABASE_URL_UNPOOLED`), crie `DATABASE_URL_DIRECT` com o
  mesmo valor. As migrations não passam pelo pooler; é só para isso que ela serve.

### 3. As variáveis do app

Ainda em **Settings → Environment Variables**, acrescente, marcando os três ambientes
(Production, Preview, Development):

| Nome | Valor |
|---|---|
| `SHOPIFY_CLIENT_ID` | do Dev Dashboard |
| `SHOPIFY_CLIENT_SECRET` | do Dev Dashboard |
| `DVFLY_TOKEN_KEY` | a que você gerou |
| `DVFLY_ALLOWED_SHOPS` | suas lojas, separadas por vírgula (ex.: `tf1vp1-fd.myshopify.com`) — vazio deixa qualquer loja que a Shopify autorizar |

`NODE_ENV=production` é definido pela própria Vercel; não crie.

### 4. Publicar

Clique em **Deploy**. O build roda, nesta ordem, sozinho:

```
npm run build      # gera o schema do Prisma para Postgres, gera o client, compila
npm run db:deploy  # aplica as migrations pendentes no banco
```

Terminado, o endereço aparece como `https://<seu-projeto>.vercel.app`. Confira a saúde:

```
https://<seu-projeto>.vercel.app/healthz
```

Tem que responder `"banco":"ok"`, `"credenciaisDaShopify":true` e
`"tokensCriptografados":true`. Se disser `"banco":"erro"`, a `DATABASE_URL` está errada ou o
banco não aceitou a conexão.

### 5. Daí em diante: publicar uma versão nova

Duplo clique em **`PUBLICAR-DVFLY.cmd`**. Na primeira vez ele liga a pasta ao projeto da
Vercel (responda `app` quando perguntar o diretório); depois é só duplo clique → sobe a
versão nova → o endereço continua o mesmo, então **não há nada para mexer na Shopify**.

Enquanto você não rodar esse arquivo, o que está no ar fica exatamente como está.

> **Custo.** O plano Hobby é gratuito e tecnicamente dá conta (300 s por requisição, muito
> mais do que qualquer publicação precisa), mas os termos da Vercel reservam o Hobby para
> uso não comercial. Usando o app nas suas lojas, o plano certo é o **Pro (US$ 20/mês)**.
> É a diferença entre as duas estradas: na VM você paga o servidor, aqui você paga a
> comodidade.

---

## Minha VM

Três containers: o app, o Postgres e o Caddy (que cuida do HTTPS sozinho). Serve qualquer
VM com Docker — Hostinger, Contabo, Oracle Cloud, uma máquina em casa com IP fixo.

### 1. Preparar a VM

Precisa de: Docker, um domínio apontando para o IP da VM, e as portas 80 e 443 abertas.

```bash
# uma vez, na VM (Ubuntu/Debian):
curl -fsSL https://get.docker.com | sh

# o código:
git clone https://github.com/drivedvdigital-glitch/Dv-Digital.git ~/dvfly
cd ~/dvfly
git checkout claude/dvfly-pagefly-research-skqx9r
```

No seu provedor de domínio, crie um registro **A** apontando (por exemplo)
`dvfly.seudominio.com.br` para o IP da VM. O certificado HTTPS é pedido e renovado pelo
Caddy sozinho — só precisa do DNS resolvendo antes de subir.

### 2. As variáveis

```bash
cp .env.deploy.example .env
nano .env     # preencha DVFLY_DOMAIN, POSTGRES_PASSWORD, as duas da Shopify e a DVFLY_TOKEN_KEY
```

### 3. Subir

```bash
docker compose up -d --build
docker compose ps        # os três "running"; o app diz "(healthy)" em até 1 min
curl -s https://dvfly.seudominio.com.br/healthz
```

O app aplica as migrations sozinho a cada start — não existe passo manual de banco.

O que esperar, medido nesta bancada com a pilha real subida (Docker + Postgres + Caddy):

| | |
|---|---|
| Primeiro `up` | o Postgres fica saudável, **só então** o app sobe, aplica a migration e serve |
| Imagem | ~730 MB (o que compila é podado; sobra o CLI do Prisma, que aplica as migrations) |
| HTTPS | o Caddy pega o certificado sozinho; `http://` responde 308 para `https://` |
| Publicar uma versão nova | **0 requisições perdidas** — quem chega durante a troca espera o app voltar |
| Banco | sobrevive a publicação e a reinício (vive num volume, não na imagem) |

### 4. Daí em diante: publicar uma versão nova

Na sua máquina Windows, crie o arquivo `publicar-vm.txt` na pasta do projeto com **uma
linha** — `usuario@ip-ou-dominio` — e dê duplo clique em **`PUBLICAR-DVFLY-VM.cmd`**. Ele
envia o código para o GitHub e manda a VM puxar e reconstruir. O banco fica intacto: ele
vive num volume do Docker, não dentro da imagem.

### O ícone do app

`docs/marca/app-icon-1200-escuro.png` (1200×1200, PNG) é o arquivo do campo **Ícone do app**
no Dev Dashboard. É a marca simplificada, que é a que continua legível nos ~40 px em que a
Shopify mostra o ícone — a marca cheia, de 25 losangos, vira poeira nesse tamanho. Há também
a versão de fundo claro e as duas com a marca cheia, na mesma pasta.

### Backup (faça)

```bash
docker compose exec -T postgres pg_dump -U dvfly dvfly | gzip > dvfly-$(date +%F).sql.gz
```

Guarde fora da VM. Na Vercel, o backup é do provedor do banco.

---

## Levar as páginas que já existem

O que você construiu até agora está no arquivo local `app/prisma/dev.db`. Para copiar tudo
(lojas, páginas, versões, publicações) para o servidor, **na sua máquina**, com a
`DATABASE_URL` do servidor:

```
DATABASE_URL="postgresql://..." DVFLY_TOKEN_KEY="..." npm run migrar-dados
```

Roda quantas vezes quiser: o que já foi copiado é pulado, nada é duplicado e **nada é
apagado da sua máquina**. Os segredos entram criptografados no servidor.

No Windows (PowerShell), as variáveis vão antes, assim:

```powershell
$env:DATABASE_URL="postgresql://..."; $env:DVFLY_TOKEN_KEY="..."; npm run migrar-dados
```

---

## Ligar na Shopify

O app agora tem endereço fixo. Falta a Shopify saber dele.

1. Abra `shopify.app.toml` na pasta do projeto e troque **os dois** lugares onde está
   `https://SEU-ENDERECO-PUBLICO`:

   ```toml
   application_url = "https://seu-endereco"

   [auth]
   redirect_urls = ["https://seu-endereco/app"]
   ```

2. Publique a configuração (os escopos e os webhooks só passam a existir de verdade com
   este comando):

   ```
   npx shopify app deploy
   ```

3. Abra o app dentro do admin de uma loja. Na primeira abertura ele se instala sozinho:
   pede a permissão, troca o ID token por um token de acesso e grava a loja no banco —
   **criptografada**.

Confira no fim: `https://seu-endereco/healthz` deve mostrar `"lojas"` maior que zero.

---

## Quando algo dá errado

| Sintoma | O que é | Conserto |
|---|---|---|
| `/healthz` diz `"banco":"erro"` | `DATABASE_URL` errada, ou o banco não aceita conexão | confira a variável; na Vercel use a *pooled* |
| O app não abre e o log fala em `DVFLY_TOKEN_KEY` | a chave não está no ambiente | ponha a mesma chave de sempre — **não gere outra** |
| "não é a mesma que criptografou este banco" | a chave foi trocada | volte a chave antiga; se perdeu, apague o `accessToken` das lojas no banco e abra o app em cada loja para renovar |
| Tudo dá 400 ao salvar/publicar | o proxy não está mandando `X-Forwarded-Proto` | na VM é o `Caddyfile` (já vem certo); atrás de outro proxy, configure isso |
| Vercel: `Query engine library not found` | o motor do Prisma não veio para a função | confirme que o build rodou `prisma generate` (está no `npm run build`) e refaça o deploy sem cache |
| A loja diz que o app não está instalado | o `application_url` da Shopify ainda aponta para o túnel antigo | refaça o passo **Ligar na Shopify** |
| VM: `docker compose ps` mostra o app reiniciando sem parar | o app recusou subir; quase sempre falta variável no `.env` | `docker compose logs app` — a primeira linha diz qual |
| VM: 502 por alguns segundos ao publicar | não deveria acontecer (o Caddy resolve o endereço do app a cada requisição e espera) | confira se o `Caddyfile` da VM é o do repositório, com o bloco `dynamic a` |

---

## O que ficou de fora, de propósito

- **Vários clientes com dados separados.** Hoje qualquer loja que abra o app enxerga todas
  as páginas — é o desenho de "publicar a mesma página em várias lojas suas". Para ceder o
  app a terceiros, as páginas precisam ganhar dono e as telas precisam filtrar por ele.
  Enquanto isso não existir, use `DVFLY_ALLOWED_SHOPS` para travar nas suas lojas.
- **Deploy automático a cada commit.** É de propósito: você publica quando quiser.
