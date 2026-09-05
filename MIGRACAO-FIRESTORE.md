# Migração da persistência: Google Sheets → Firestore

Runbook do corte big-bang. Executar na ordem. Nada de commit/push Git é feito
automaticamente.

## Visão geral

- **Dados** (perguntas, áreas, processos, respostas, tokens, config, catálogos)
  passam a viver no **Firestore** (`bia-forte-2025`).
- **Front** (`firebase-app/public`) lê/escreve direto no Firestore via SDK
  (`api.js`), com login Google e Security Rules.
- **Páginas públicas** (avaliação/BIA/DRP/levantamento por link) usam a
  **Cloud Function** `tokenApi` (Opção A) — valida token e grava com Admin SDK.
- **Apps Script** (`bia-app`) fica só para PCN (Gemini), e-mail e geração de
  token; agora lê/escreve no Firestore via `Firestore.gs`.

## Pré-requisitos (uma vez)

1. **Service account** com papel *Cloud Datastore User* (ou Firebase Admin) no
   projeto. Baixe o JSON.
2. `migracao/.env` (copie de `.env.example`):
   - `SPREADSHEET_ID`, `GOOGLE_CREDENTIALS_PATH` (aponta pro JSON),
     `FIREBASE_PROJECT_ID=bia-forte-2025`.
3. **Propriedades do Script** (script.google.com → Configurações):
   - `FIREBASE_SA_CLIENT_EMAIL`, `FIREBASE_SA_PRIVATE_KEY` (do mesmo JSON).

## Passo a passo do corte

### 1. Testar a lógica (sem tocar em nada externo)
```
cd migracao && npm install && npm test
cd firebase-app/functions && npm install && npm test
```

### 2. Ensaiar a migração (dry-run)
```
cd migracao
npm run migrar -- --dry-run
```
Confere `export/_manifest.json` (contagens por coleção batem com as abas?) e
`backup-pcn/` (um `.html` por processo com PCN + `_indice.json`).

### 3. Deploy das Security Rules e da Cloud Function
```
cd firebase-app
firebase deploy --only firestore:rules,firestore:indexes
firebase deploy --only functions
```
Anote a URL da função. Se diferente do padrão, ajuste `TOKEN_API_URL` em
`public/config.js`.

### 4. Migração real (grava no Firestore de produção)
```
cd migracao
npm run migrar
```
A etapa `verify` deve terminar com **"0 divergências"**. Se houver divergência,
não prossiga: investigue antes.

### 5. Apps Script (residual)
```
cd bia-app
clasp push --force
```
Depois: script.google.com → Implantar → Gerenciar implantações → editar →
**Nova versão** → Implantar. (O código já foi enviado; falta publicar a versão.)

### 6. Deploy do hosting (vira a chave)
```
cd firebase-app
firebase deploy --only hosting
```

### 7. Smoke test em produção
- Login (admin e um gestor).
- Processos: listar, criar, editar, avaliar (score/tier corretos).
- Áreas, Perguntas, Config Respostas: CRUD.
- Dependências e Componentes: CRUD inline (tags/chips/dropdown, "+ Criar").
- PCN: gerar (Gemini), abrir, excluir.
- Relatório de área por e-mail.
- Link externo: gerar (e-mail/link), abrir sem login, enviar — confirmar
  gravação no Firestore e token marcado como usado.

## Rollback

O corte é reversível enquanto a planilha existir:
- Reverter `public/config.js` (`API_URL`) e restaurar o `api.js` antigo
  (`api-legacy.js` tem o cliente Apps Script) e re-deploy do hosting.
- O Apps Script antigo pode ser republicado a partir do histórico de versões.
- Os dados no Firestore podem ser reimportados a qualquer momento com
  `npm run import` (idempotente: usa docIds estáveis + merge).

## Observações

- `backup-pcn/` guarda os HTML de PCN antes do corte (requisito do plano).
- A migração é idempotente: docIds estáveis (area/processo por slug, token pelo
  próprio valor, config_perfis por e-mail) + `set(merge)`. Reexecutar não
  duplica registros.
