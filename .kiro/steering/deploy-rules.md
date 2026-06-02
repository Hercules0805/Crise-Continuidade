# Regras de Deploy

## Deploy Automático

Sempre que modificar arquivos em `bia-app/Code.gs`, executar automaticamente:

```
cd bia-app
clasp push --force
```

Sempre que modificar arquivos em `firebase-app/public/`, executar automaticamente:

```
cd firebase-app
firebase deploy --only hosting
```

## Fluxo após clasp push

Após o `clasp push --force`, informar ao usuário que é necessário publicar uma nova versão no script.google.com (Implantar → Gerenciar implantações → editar → Nova versão → Implantar).

Se o usuário fornecer uma nova URL da API, atualizar `firebase-app/public/config.js` (constante `API_URL`) e executar o deploy do Firebase automaticamente.

## Git

Commit e push para o Git devem ser feitos **somente quando explicitamente solicitado** pelo usuário. Nunca fazer commit/push automaticamente.
