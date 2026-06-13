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


## Padrão de CRUD Inline (BIA Dependências e DRP Componentes)

Ambas as telas de seleção (BIA Dependências Críticas e DRP Componentes do Serviço) devem seguir o mesmo padrão de UX:

1. **Tags selecionadas** — fundo azul escuro (#1a237e) com texto branco
2. **Chips disponíveis** — fundo cinza claro (#f5f6fa) com texto azul, clicáveis para adicionar
3. **Input de busca/criação** — inline por categoria/tipo, com placeholder "Digite para buscar ou criar..."
4. **Dropdown** — aparece ao digitar, mostrando itens do catálogo que correspondem + opção "+ Criar" no final
5. **Criação** — SOMENTE acontece ao clicar no botão "+ Criar" no dropdown. NÃO criar automaticamente ao pressionar Enter ou blur.
6. **Enter** — seleciona o item se existir no catálogo, caso contrário apenas mostra o dropdown com a opção de criar
7. **Exemplos** — em itálico cinza abaixo do nome de cada categoria/tipo
8. **Ícones** — cada categoria/tipo tem um ícone representativo
9. **Botões de ação** — "+ Novo componente" (modal completo), "🔗 Copiar link", "📧 Enviar por e-mail"
