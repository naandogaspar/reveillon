# Dashboard do Réveillon

Página somente leitura para os participantes acompanharem pagamentos e gastos.
**A planilha do Google é o banco de dados**: você continua preenchendo nela e o dashboard
mostra o que estiver lá (atualização em até alguns minutos).

Abas: Início, Pagamento casa, Pagamento comida e Gastos.

## Publicar no Vercel

1. Suba esta pasta para um repositório no GitHub.
2. No Vercel: **Add New → Project**, escolha o repositório e clique em **Deploy**
   (não precisa de build; a pasta `public/` vira o site e `api/dados.js` vira a função).
3. Pronto. Sem GitHub, também funciona: `npx vercel` dentro desta pasta.

### Variáveis de ambiente (Settings → Environment Variables), todas opcionais

| Nome | Para que serve | Padrão |
|---|---|---|
| `DASHBOARD_PASSWORD` | Liga uma senha de acesso. Quem não souber a senha não vê nenhum dado. | sem senha |
| `SHEET_ID` | ID da planilha (trecho entre `/d/` e `/edit` na URL). | planilha "Reveillon 2027" |
| `TRIP_YEAR` | Ano de início da viagem; datas sem ano (30/12, 01/01) usam isto. | `2026` |
| `TRIP_TITLE` | Título no topo. | `Réveillon 2027` |
| `TRIP_LOCATION` | Local mostrado ao lado das datas (ex.: `Maricá, RJ`). | vazio |

Depois de mudar uma variável, faça um novo deploy.

## Regras da planilha

- A planilha precisa estar compartilhada como **"Qualquer pessoa com o link" (leitor)**.
  Se você restringir o acesso, o dashboard para de funcionar.
- **PAGANTES**: títulos de grupo em linhas próprias (`ADULTOS`, `CRIANÇAS 1`...) e colunas
  achadas pelo cabeçalho (`VALOR CASA`, `PAGO CASA`, `VALOR COMIDA`, `PAGO COMIDA`).
  Dá para inserir linhas e colunas. Os saldos "pendente" são recalculados (valor − pago);
  se a planilha divergir do cálculo, o aviso aparece em `/api/dados` no campo `avisos`.
  Linhas `Total`, `Endereço:` e linhas sem nome são ignoradas. `--` significa "não se aplica".
- **SAIDAS**: `DATA`, `SAIDA`, `VALOR`. Datas futuras aparecem como *previstas*.
  Para controlar na mão, adicione uma coluna `STATUS` com `previsto` ou `pago`.
- **MENU**: `DATA`, `ALMOÇO`, `JANTA`. O cardápio não tem aba no site, mas a primeira e a última data desta aba definem a contagem regressiva do Início. Mantenha as datas da viagem aqui.
- Nomes e textos aparecem exatamente como estão na planilha.

## Rodar no computador

```
npm test            # testes do leitor da planilha
npm run dev         # http://localhost:3000, lê a planilha de verdade
npm run dev:mock    # usa uma cópia dos dados (sem internet)
PASSWORD=abc npm run dev   # testa a senha
```

## Limites

- Somente leitura: ninguém altera dados pelo dashboard.
- Sem histórico: a planilha guarda só o total pago por pessoa, então não há gráfico por data.
- A senha protege os **dados**; a página em si é pública, e a planilha continua acessível a quem tiver o link dela.
