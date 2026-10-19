# Cloud Functions — endpoint público de tokens (Opção A)

`tokenApi` é uma função HTTPS que atende as páginas públicas (sem login) do BIA:
avaliação por link, mapeamento de dependências (BIA), mapeamento de componentes
(DRP) e levantamento de PCN.

Ela valida o token (existência, não usado, não expirado) e grava no Firestore
com o Admin SDK, mantendo as Security Rules fechadas para clientes anônimos.

## Ações

GET `?action=<ação>&token=<t>`:
- `validarToken`, `validarTokenArea`, `validarTokenBIA`, `validarTokenDRP`,
  `validarTokenLevantamento`, `getConfigRespostas`

POST (JSON, `Content-Type: text/plain`) `{ action, token, ... }`:
- `salvarRespostasToken`, `salvarRespostasArea`, `salvarDependenciasBIA`,
  `salvarComponentesDRP`, `salvarLevantamentoPCN`

Erros de negócio (token inválido/usado/expirado) voltam como `{ error }` com
HTTP 200 — mesmo contrato do Apps Script antigo, para o front não mudar.

## URL

`https://us-central1-bia-forte-2025.cloudfunctions.net/tokenApi`
(configurada em `firebase-app/public/config.js` como `TOKEN_API_URL`).

## Testes

```
cd firebase-app/functions
npm install
npm test        # node --test, usa mock de Firestore em memória (sem emulador)
```

## Deploy

```
cd firebase-app
firebase deploy --only functions
```

## Dependência da geração de token

As páginas públicas validam/gravam via esta função, mas o TOKEN precisa existir
no Firestore. A geração do token (e envio do e-mail do link) é feita pelo Apps
Script, que deve gravar o token no Firestore (ver Task 9). Enquanto isso não
estiver ativo, tokens gerados só na planilha não serão reconhecidos pela função.

## Alertas de contratos por e-mail (16/10/2026)


Os alertas de contrato saem por **SMTP do SendGrid** (escolha de 16/10/2026).
O Google Workspace ou outro servidor SMTP continuam como opção, escolhidos na
tela. Como funciona:

- `varreduraDiariaContratos` (05:00) decide os urgentes e grava cada e-mail na
  fila `notificacoes_email`:
  - vence em 30 dias;
  - vencido;
  - janela de aviso de cancelamento aberta;
  - últimos 7 dias para avisar;
  - prazo de aviso encerrado;
  - renovação automática executada.
- `resumoMensalContratos` (dia 1, 07:00) grava o resumo mensal de cada
  destinatário.
- `envioDeNotificacaoEmail` (gatilho da fila) envia pelo `transporteEmail.js` e
  grava o resultado no próprio documento (`enviado`, `simulado`, `erro`,
  `sem_destinatario`). E-mails com `erro` voltam para a fila na varredura
  seguinte, até 3 tentativas.
- As regras ficam em `notificacoes.js` e o transporte em `transporteEmail.js`
  (os dois com testes).
- O e-mail não leva valores do contrato, e só vai para endereços
  `@fortestecnologia.com.br`. O remetente também precisa ser do domínio.
- No SendGrid, o rastreamento de clique e de abertura vai **desligado** em
  cada e-mail (cabeçalho `X-SMTPAPI`). Assim o link "Abrir contrato" não é
  reescrito por um domínio do SendGrid.

Configuração e log: tela **Administração ▸ Notificações por e-mail** (só
Admin), no documento `config_notificacoes/contratos`:
- modo (padrão `desligado`);
- grupos de alerta;
- destinatários;
- provedor SMTP e **e-mail do remetente**.

Usuário e senha SMTP **nunca** ficam no Firestore: só nos segredos do Firebase.

### Preparar o SendGrid (uma vez)

1. **Remetente** (SendGrid ▸ Settings ▸ Sender Authentication). Escolha uma
   das opções:
   - **Recomendado: Authenticate Your Domain** para `fortestecnologia.com.br`.
     O SendGrid gera registros CNAME que a TI publica no DNS. Com SPF e DKIM
     alinhados, os e-mails não caem em spam e qualquer endereço do domínio pode
     ser remetente.
   - **Rápido: Single Sender Verification** de um endereço, por exemplo
     `alertas@fortestecnologia.com.br`. Ele precisa existir, porque recebe o
     link de confirmação.
2. **API Key** (SendGrid ▸ Settings ▸ API Keys ▸ Create API Key). Escolha
   *Restricted Access* e ligue só **Mail Send**. Copie a chave (`SG....`): ela
   aparece uma vez só.
3. **Segredos do Firebase**. Cada comando pede o valor no terminal:
   ```
   firebase functions:secrets:set SMTP_USUARIO --project bia-forte-2025   # digite: apikey
   firebase functions:secrets:set SMTP_SENHA --project bia-forte-2025     # cole a API Key (SG....)
   ```
   - No SendGrid, o usuário SMTP é a palavra literal `apikey`.
   - Os segredos precisam existir **antes** do deploy das functions. Se a API
     Key ainda não existe, grave `pendente` nos dois: os modos desligado e
     simulação não os usam.
4. **Deploy**:
   `firebase deploy --only firestore:rules,functions,hosting --project bia-forte-2025`.
5. **Tela Notificações por e-mail**:
   - Provedor: **SendGrid**;
   - **E-mail do remetente**: o endereço verificado no passo 1;
   - modo **Simulação**;
   - Salvar.

   Deixe alguns dias assim conferindo o log e as prévias: os e-mails ficam como
   "Simulado" e não saem.
6. **Enviar e-mail de teste** (vai para o Admin logado). Se chegar, mude o modo
   para **Ativo**.

Erros comuns, já traduzidos na tela e no log:
- "Credencial SMTP recusada": usuário diferente de `apikey`, ou API Key sem
  Mail Send.
- "Remetente não verificado no SendGrid": o e-mail do remetente não está em
  Sender Authentication.

O **Activity Feed** do SendGrid mostra entregas, bloqueios e devoluções e
complementa o log da tela.

LGPD: o conteúdo dos e-mails (contrato, fornecedor, datas, destinatário) passa
pelo SendGrid, que é um terceiro. Valores do contrato não vão.

Trocar de provedor é escolher outro na tela, ou reescrever `criarEnviador` em
`transporteEmail.js` para uma API própria. A fila, as regras e a tela não
mudam.
