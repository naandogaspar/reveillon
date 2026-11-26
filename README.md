# Dashboard do Réveillon

Página somente leitura para os participantes acompanharem pagamentos e gastos.
**A planilha do Google é o banco de dados**: você continua preenchendo nela e o dashboard
mostra o que estiver lá (atualização em cerca de 15 a 45 segundos, veja o fim deste arquivo).

Abas: **Início** (endereço com botões, contagem regressiva ao vivo e totais de cerveja com piada),
**Casa** e **Comida** (pagamentos por pessoa), **Cerveja** (tabela ordenável), **Feed** (fotos com legenda)
e **Gastos** (saídas e saldo da alimentação). Tema escuro (azul-marinho com detalhes dourados).

Fluxo de trabalho: cada push para o GitHub publica sozinho na Vercel (`main` vai para produção;
as outras branches geram um endereço de preview).

## Publicar no Vercel

1. Suba esta pasta para um repositório no GitHub.
2. No Vercel: **Add New → Project**, escolha o repositório e clique em **Deploy**
   (não precisa de build; a pasta `public/` vira o site e `api/dados.js` vira a função).
3. Pronto. Sem GitHub, também funciona: `npx vercel` dentro desta pasta.

### Variáveis de ambiente (Settings → Environment Variables), todas opcionais

| Nome | Para que serve | Padrão |
|---|---|---|
| `DASHBOARD_PASSWORD` | Liga uma senha única para o grupo. Sem ela, o site mostra a tela "Entrar" e não entrega nenhum dado. O navegador guarda a senha depois do primeiro acesso. | sem senha |
| `SHEET_ID` | ID da planilha (trecho entre `/d/` e `/edit` na URL). | planilha "Reveillon 2027" |
| `TRIP_YEAR` | Ano de início da viagem; datas sem ano (30/12, 01/01) usam isto. | `2026` |
| `TRIP_TITLE` | Título no topo (por padrão vem do código). | `Réveillon 2027` |
| `TRIP_LOCATION` | Local mostrado ao lado das datas (ex.: `Maricá, RJ`). | vazio |
| `DATABASE_URL` | Banco do Feed: `mysql://USUARIO:SENHA@IP_DO_VPS:PORTA_EXTERNA/NOME_DO_BANCO`. Veja a seção Feed. | sem Feed |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Credenciais do Cloudflare R2 (token com permissão de leitura e escrita no bucket). | sem Feed |
| `R2_BUCKET` | Nome do bucket das fotos. | `reveillon` |
| `R2_PUBLIC_URL` | Endereço público do bucket (URL `r2.dev` ou domínio próprio), sem barra no fim. | sem Feed |
| `GID_PAGANTES`, `GID_SAIDAS`, `GID_CERVEJA` | Número `gid=` de cada aba (aparece na URL ao abrir a aba). Só mude se usar outra planilha. | abas da planilha padrão |

Depois de mudar uma variável, faça um novo deploy.

## Regras da planilha

- O **endereço** do Início (com os botões Copiar e Abrir no mapa) é fixo no código: `ADDRESS` em `public/app.js`.
- As **datas da viagem** (contagem regressiva do Início) são fixas no código: `TRIP_START` e `TRIP_END` em `lib/sheet.js`.
- A planilha precisa estar compartilhada como **"Qualquer pessoa com o link" (leitor)**.
  Se você restringir o acesso, o dashboard para de funcionar.
- **PAGANTES**: títulos de grupo em linhas próprias (`ADULTOS`, `CRIANÇAS 1`...) e colunas
  achadas pelo cabeçalho (`VALOR CASA`, `PAGO CASA`, `VALOR COMIDA`, `PAGO COMIDA`).
  Dá para inserir linhas e colunas. Os saldos "pendente" são recalculados (valor − pago);
  se a planilha divergir do cálculo, o aviso aparece em `/api/dados` no campo `avisos`.
  Linhas `Total`, `Endereço:` e linhas sem nome são ignoradas. `--` significa "não se aplica".
- **SAIDAS**: `DATA` (dd/mm), `SAIDA` (rótulo), `VALOR` e `OBS` (descrição completa). Todas as saídas
  são da comida: a aba **Gastos** mostra a lista e o saldo (*arrecadado da comida − gastos*), que pode
  ficar negativo. Uma coluna `TIPO` antiga, se existir, é ignorada.
- **CERVEJA**: cópia da aba no site, ordenável por qualquer coluna (começa por nome).
  A primeira linha é o cabeçalho (`ADULTOS`, `ENGR.`, `QTD.`, `ML.`, `LITROS`); `QTD.` aparece como `LATAS`
  e a grafia `LITOS` também é aceita. Linhas sem nome são descartadas. O rodapé soma as colunas numéricas
  (menos `ML.`). O card da Início mostra o total de `LITROS` e de `LATAS` e uma piada de cerveja, escolhida
  a cada carregamento (lista `JOKES` em `public/app.js`). Se a aba falhar, o resto do painel continua funcionando.
- Nomes e textos aparecem exatamente como estão na planilha.

## Feed (fotos)

Quem tem acesso ao site toca no **+**, escolhe a foto e depois informa a legenda e o nome (os dois opcionais; sem nome
a tela mostra "Convidado"). As fotos ficam no bucket do R2; os posts (nome, legenda, chave da foto, data, tamanho,
IP e navegador de quem enviou) ficam em uma tabela `feed_posts` no MySQL/MariaDB do VPS, que o próprio site cria no primeiro uso.
O IP e o navegador (`ip`, `user_agent`) são só **gravados**: a API e a tela nunca os devolvem. A foto é reduzida no aparelho (lado maior de 1600 px) e enviada à função `api/feed.js`, que a converte para
**WebP** (qualidade 78, rotação do celular corrigida, com a biblioteca `sharp`) antes de gravá-la no R2. Na tela, a foto
tem altura máxima (65% da tela, até 560 px), mantendo a proporção; tocar nela abre a imagem inteira.
Ao escolher a foto (câmera ou galeria) abre a tela de **corte**: moldura livre (arraste os cantos, as bordas ou mova a moldura) e atalhos de proporção — 1:1, 4:5 (retrato do Instagram), 9:16 (Stories/Reels), 16:9, 4:3 e 3:4. "Concluir" sem mexer mantém a foto inteira, e o botão "Cortar" na tela de publicação reabre o corte (código em `public/crop.js`). Como o envio passa pela Vercel, o bucket **não precisa de CORS**.

**O envio só funciona com `DASHBOARD_PASSWORD` definida** (sem senha, qualquer pessoa da internet poderia
publicar). Sem as variáveis abaixo, a aba mostra quais estão faltando.

Para ativar:

1. **Banco (Dokploy):** no banco, aba *General → External Credentials*, defina uma *External Port* e salve
   (libere essa porta no firewall do VPS). Monte a URL com o usuário, a senha, o IP do VPS, essa porta e o
   nome do banco, e coloque em `DATABASE_URL`. A URL "Internal" não serve: ela só funciona dentro do Dokploy.
2. **R2:** em *R2 → Manage R2 API Tokens*, crie um token com *Object Read & Write* só para o bucket e copie
   o *Access Key ID* e o *Secret Access Key*. O `R2_ACCOUNT_ID` é o trecho antes de `.r2.cloudflarestorage.com`
   na URL da API S3 do bucket. Em `R2_PUBLIC_URL` vai a *URL de desenvolvimento público* do bucket (precisa estar habilitada).
3. **Vercel:** cadastre as variáveis (`DATABASE_URL`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
   `R2_PUBLIC_URL`, `DASHBOARD_PASSWORD`) e faça um novo deploy.

Pontos de atenção:
- A porta externa do banco fica aberta na internet (a Vercel não tem IP fixo para liberar só ela). Use uma
  senha forte e o usuário do próprio banco do Feed, nunca o root. A conexão com o MySQL não é criptografada por padrão.
- A URL `r2.dev` tem limite de requisições e a Cloudflare não recomenda para produção; para o grupo do Réveillon basta.
  Para algo maior, conecte um domínio próprio ao bucket e troque `R2_PUBLIC_URL`.
- Não há exclusão pelo site. Para apagar um post, remova a linha em `feed_posts` (e, se quiser, o arquivo no bucket).
- A lista mostra 20 fotos por vez (botão "Ver fotos mais antigas") e se atualiza a cada 30 s com a aba aberta.

**Aba escondida até 24/12:** o item Feed só aparece no menu a partir de 24/12 (a data vem da planilha/servidor, no
fuso de São Paulo). Antes disso, abre quem entra com `?feed` na URL, por exemplo `https://seu-site.vercel.app/?feed`.
Isso só esconde o menu; quem protege o conteúdo continua sendo a senha. Para mudar a data, edite `FEED_LIBERA` em `public/app.js`.

## Rodar no computador

```
npm test            # testes do leitor da planilha
npm run dev         # http://localhost:3000, lê a planilha de verdade
npm run dev:mock    # usa uma cópia dos dados e um Feed em memória (sem internet)
PASSWORD=abc npm run dev   # testa a senha (com ela o envio de fotos é liberado no modo mock)
```

## Limites

- Somente leitura, exceto o Feed: ninguém altera a planilha pelo dashboard.
- Sem histórico: a planilha guarda só o total pago por pessoa, então não há gráfico por data.
- A senha protege os **dados**; a página em si é pública, e a planilha continua acessível a quem tiver o link dela.
- A senha é uma só para todo o grupo (não há conta por pessoa). Para trocar, mude `DASHBOARD_PASSWORD` e faça um novo deploy.

## Créditos

Ícones: [Font Awesome Free](https://fontawesome.com), licença [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Estão embutidos em `public/icons.js`.

## Tempo de atualização

Depois que você edita a planilha, a mudança aparece em cerca de 15 a 45 segundos:
o servidor guarda a leitura por 15 s (`MEMO_MS` em `api/dados.js`), o cache do Vercel vale 15 s
(mais 30 s de tolerância) e a página aberta se atualiza a cada 60 s e ao voltar para a aba.
