# Contexto do Projeto BIA - Business Impact Analysis

## Arquitetura
- **Frontend**: Firebase Hosting → `firebase-app/public/` (HTML, CSS, JS puro)
- **Backend**: Google Apps Script (GAS) → `bia-app/Code.gs`
- **Banco de dados**: Google Sheets (abas: Perguntas, Áreas, Processos, Respostas BIA, Config Gestores)
- **URL do frontend**: https://bia-forte-2025.web.app

## Deploy

### Firebase (frontend)
```
cd firebase-app
firebase deploy --only hosting
```

### Google Apps Script (backend)
O projeto usa **clasp** para sincronizar o `Code.gs` local com o Apps Script na nuvem.

```
cd bia-app
clasp push
```

> ⚠️ IMPORTANTE: `clasp push` envia o código mas NÃO publica uma nova versão do deploy.
> Após o `clasp push`, é necessário acessar script.google.com → Implantar → Gerenciar implantações → editar → Nova versão → Implantar.
> A nova URL gerada deve ser atualizada em `firebase-app/public/config.js` e um novo deploy do Firebase deve ser feito.

## Configuração
- URL da API do GAS fica em: `firebase-app/public/config.js` → constante `API_URL`
- URL atual da API: `https://script.google.com/macros/s/AKfycbxYYIjN_b9QP5P5w_LESLNnbpkZVyprOX_6Qcg5cle08ytKaiGM-9yILXh18WqJoN3q/exec`
- Script ID do clasp: `1W74gvNEPO6ENL7OsiDEdgiI-sv775iho7JfSMmmOtt77ibQK_MShgLb8`

## Fluxo completo de atualização do backend
1. Editar `bia-app/Code.gs` localmente
2. `cd bia-app && clasp push`
3. No script.google.com: publicar nova versão
4. Atualizar `API_URL` em `config.js` com a nova URL
5. `cd firebase-app && firebase deploy --only hosting`
