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
