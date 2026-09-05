# Crise & Continuidade (BIA / PCN)

Sistema de Business Impact Analysis (BIA) e Plano de Continuidade de Negócios
(PCN) da Fortes Tecnologia.

## Arquitetura (pós-migração para Firestore)

```
                         ┌───────────────────────────┐
   Navegador (login) ───▶│ firebase-app/public (SDK) │──▶ Firestore (bia-forte-2025)
                         └───────────────────────────┘        ▲   ▲
                                                              │   │
   Páginas públicas ───▶ Cloud Function tokenApi ─────────────┘   │ (Admin SDK)
   (link, sem login)     (firebase-app/functions)                 │
                                                                  │
   Apps Script (bia-app) ── PCN/Gemini, e-mail, geração de token ─┘ (REST + SA)
```

- **Dados**: Firestore (coleções `perguntas`, `areas`, `processos`,
  `respostas_bia`, `tokens`, `config_respostas`, `config_perfis`,
  `dependencias`, `componentes`).
- **Front autenticado** (`firebase-app/public`): lê/escreve direto no Firestore
  via `api.js` (SDK). Auth Google restrito ao domínio corporativo. Autorização
  por Security Rules (`firebase-app/firestore.rules`) com perfis admin/gestor.
- **Páginas públicas** (avaliação/BIA/DRP/levantamento por link, sem login):
  usam a Cloud Function `tokenApi` (`firebase-app/functions`), que valida o
  token e grava no Firestore com o Admin SDK.
- **Apps Script** (`bia-app`): apenas funções residuais — geração de PCN
  (Gemini), envio de e-mail e geração de token. Lê/escreve no Firestore via
  `Firestore.gs` (REST + service account).

## Estrutura

| Pasta | O que é |
|-------|---------|
| `firebase-app/public` | Front-end (SDK Firestore + Auth). `api.js` = camada de dados; `api-legacy.js` = cliente Apps Script para ações residuais. |
| `firebase-app/functions` | Cloud Function `tokenApi` (fluxos públicos de token). |
| `firebase-app/firestore.rules` | Security Rules. `firestore.indexes.json` = índices. |
| `firebase-app/tests` | Testes das rules (emulador; requer Java). |
| `bia-app` | Apps Script residual (`Code.gs`, `Firestore.gs`). |
| `migracao` | ETL Sheets → Firestore + backup de PCN + verificação. |
| `bia-backend` | Backend TypeScript/PostgreSQL — **fora de uso** nesta arquitetura (referência de regras de negócio). |

## Migração e deploy

O corte da planilha para o Firestore está documentado passo a passo em
**[MIGRACAO-FIRESTORE.md](./MIGRACAO-FIRESTORE.md)** (pré-requisitos, dry-run,
deploys, smoke test e rollback).

## Testes

```
cd migracao && npm test                 # ETL: transform + tier/RTO
cd firebase-app/functions && npm test   # lógica de token (mock Firestore)
cd firebase-app/tests && npm test       # Security Rules (requer Java)
```
