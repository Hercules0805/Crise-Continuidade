# Crise-Continuidade

Sistema de Gestão de Crise e Continuidade de Negócios (BIA/BCP/DRP) evoluído para um hub de riscos (Registro de Riscos, Riscos de Fornecedores, Indicadores de Segurança). Stack ativa: Firebase Hosting + Firestore + Cloud Functions, SPA vanilla JS sem framework/bundler em `firebase-app/public`, Apps Script residual em `bia-app/` (PCN via Gemini, e-mail, tokens). `bia-backend/` (Node/TS/PostgreSQL) e o plano `MIGRACAO-BIA-GESI.md` estão fora de uso — não seguir essa direção a menos que explicitamente pedido.

## Identidade visual e padronização

**Antes de criar ou alterar qualquer tela ou componente visual neste projeto, leia `.amazonq/rules/ui-referencias.md` e siga os padrões definidos lá** (paleta de cores, espaçamento, botões, badges, modal vs. drawer, abas, tabelas/paginação, filtros, toasts, ícones). Esse arquivo é a fonte única de verdade de UI — se uma decisão visual nova não se encaixar no que já existe, adicione-a lá também, não só no código.
