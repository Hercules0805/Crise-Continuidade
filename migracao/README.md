# Migração Google Sheets → Firestore

Ferramentas de ETL para migrar a persistência do sistema BIA/PCN da planilha
Google Sheets (fonte atual, acessada via `bia-app/Code.gs`) para o Firestore do
projeto `bia-forte-2025`.

## Fluxo

```
Sheets ──(export)──▶ migracao/export/*.json ──(import)──▶ Firestore
                              │
                              └──(backup-pcn)──▶ migracao/backup-pcn/*.html
```

1. `npm run export` — lê todas as abas da planilha e grava um JSON por coleção
   em `export/`, junto com `_manifest.json` (contagens para conferência).
2. `npm run backup-pcn` — extrai o HTML de PCN salvo inline em cada processo
   (`export/processos.json`) e grava um `.html` por processo em `backup-pcn/`.
3. `npm run import` — grava os JSON de `export/` no Firestore (docId preservado).
   Use `-- --dry-run` para simular sem gravar.
4. `npm run verify` — compara contagens do export com o Firestore e amostra
   campos-chave de processos.

## Pré-requisitos

- Node 18+.
- Uma service account (JSON) com:
  - acesso de leitura à planilha (compartilhe a planilha com o e-mail da SA);
  - papel de escrita no Firestore (`Cloud Datastore User` ou `Firebase Admin`).
- Copie `.env.example` para `.env` e preencha os valores.

## Testar contra o emulador (sem tocar produção)

```
# na pasta firebase-app
firebase emulators:start --only firestore

# na pasta migracao (outro terminal), com FIRESTORE_EMULATOR_HOST no .env
npm run import
npm run verify
```

## Coleções geradas

`perguntas`, `areas`, `processos`, `respostas_bia`, `tokens`,
`config_respostas`, `config_perfis` (docId = email), `dependencias`,
`componentes`.

IDs de documento são estáveis: `areas`/`processos` por chave natural
(area/processo), `config_perfis`/`tokens` pelo próprio identificador
(email/token), demais coleções por índice + slug.

## Observações

- `config_perfis`: além dos perfis explícitos da planilha, o export preenche o
  campo `area` de cada gestor (casando o e-mail do perfil com o e-mail do
  responsável da área) e cria um perfil `gestor` para responsáveis de área que
  ainda não têm perfil. Isso é necessário porque as Security Rules autorizam a
  escrita do gestor com base em `config_perfis.area`.
- Campos JSON da planilha (ex.: `bcpContatos`, `impactoIndisponibilidade`)
  viram objetos/arrays nativos do Firestore.
- Score/tier/avaliado do processo continuam derivados de `respostas_bia` no
  cliente; o export apenas copia o `tier` já gravado na planilha.
- Este diretório não deve ser publicado no hosting.
