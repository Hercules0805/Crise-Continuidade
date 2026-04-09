# Contexto do Projeto BIA - Business Impact Analysis

## Arquitetura
- **Frontend**: Firebase Hosting → `firebase-app/public/` (HTML, CSS, JS puro)
- **Backend**: Google Apps Script (GAS) → `bia-app/Code.gs`
- **Banco de dados**: Google Sheets (abas: Perguntas, Áreas, Processos, Respostas BIA, Config Gestores, Tokens, Config Respostas)
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
clasp push --force
```

> ⚠️ IMPORTANTE: `clasp push` envia o código mas NÃO publica uma nova versão do deploy.
> Após o `clasp push`, é necessário acessar script.google.com → Implantar → Gerenciar implantações → editar → Nova versão → Implantar.
> A nova URL gerada deve ser atualizada em `firebase-app/public/config.js` e um novo deploy do Firebase deve ser feito.
> A implantação deve ser configurada como: **Executar como: Eu** e **Quem pode acessar: Qualquer pessoa**.

## Configuração
- URL da API do GAS fica em: `firebase-app/public/config.js` → constante `API_URL`
- URL atual da API: `https://script.google.com/macros/s/AKfycbw8TTHtxo_xsRxkKUhtwbLjMDPK-34RofueliY40yvMPCpBsc0xr100mpGPavZlKZeH/exec`
- Script ID do clasp: `1W74gvNEPO6ENL7OsiDEdgiI-sv775iho7JfSMmmOtt77ibQK_MShgLb8`

## Fluxo completo de atualização do backend
1. Editar `bia-app/Code.gs` localmente
2. `cd bia-app && clasp push --force`
3. No script.google.com: publicar nova versão
4. Atualizar `API_URL` em `config.js` com a nova URL
5. `cd firebase-app && firebase deploy --only hosting`

## Estrutura das Abas da Planilha

### Perguntas
| Categoria | Pergunta | Descrição | Ativa |

### Áreas
| Área | Responsável | Email | Solução |

### Processos
| Área | Processo de Negócio | Descrição do Impacto | Dependência Crítica | RTO | RPO | MTPD | BIA Homologada | Tier | BCP Status |
- Col 9 (Tier) e Col 5 (RTO) são preenchidos automaticamente ao salvar uma avaliação

### Respostas BIA
| Timestamp | Respondente | Cargo | Área | Processo | ...perguntas... | Score | Tier |
- Respondente e Cargo são preenchidos via token (avaliação externa)
- Avaliações internas gravam o email do usuário no campo Respondente
- O backend usa os headers para localizar as colunas Área e Processo (agnóstico ao schema)

### Config Gestores
| Email | Nome | Área | Admin |

### Tokens
| Token | Área | Processo | Email | Criado em | Expira em | Usado |
- Token UUID gerado pelo Apps Script
- Válido por 7 dias, uso único
- Ao ser usado, coluna "Usado" é marcada como true

### Config Respostas
| Categoria | Valor | Label | Cor | Background |
- Categoria `_default` se aplica a todas as categorias sem configuração específica
- Criada automaticamente na primeira chamada de `getConfigRespostas()`

## Funcionalidades Implementadas

### Tela: Processos
- Tabela com colunas: Área, Processo, Responsável, BIA Status, Tier, Score, BCP Status, Solução, Ações
- Ações por processo: Avaliar (checklist), Enviar por e-mail (envelope), Editar, Excluir
- Clicar na linha abre modal de detalhes
- Filtro por área
- Ordenação por qualquer coluna (score/tier ordenam numericamente)
- Atualização local após salvar/excluir (sem reload)

### Modal de Avaliação
- Perguntas agrupadas por categoria com cabeçalho colorido
- Categoria "Geral" sempre primeiro
- Opções de resposta personalizadas por categoria (vindas do backend)
- Pré-carrega respostas anteriores ao reabrir
- Botão X para fechar no topo
- Seção de premissas no topo
- Score e Tier calculados em tempo real

### Envio por E-mail (Token)
- Botão envelope na tabela de processos
- Gera token UUID, salva na aba Tokens, envia e-mail via GmailApp
- Link: `https://bia-forte-2025.web.app/avaliar.html?token=XYZ`
- Válido 7 dias, uso único
- Página `avaliar.html` para o stakeholder responder
- Grava nome, cargo, data do respondente

### Tela: Perguntas
- Gerenciamento de perguntas por categoria
- Seção de Opções de Resposta por Categoria (abaixo das perguntas)
- Permite cadastrar rótulos e pontuações customizados por categoria

### Tela: Painel
- Cards de resumo: Total, Avaliados, Pendentes, Tier 1
- Barra de progresso geral
- Distribuição por Tier
- Matriz de calor (processos ordenados por score com barra proporcional)
- Resumo por área com contagem de tiers e progresso

## Lógica de Tier e Score
- Score máximo: 24 pontos (8 perguntas x 3)
- Tier 1 (Crítico): score >= 12 → RTO: < 4 horas
- Tier 2 (Essencial): score >= 6 → RTO: 4h a 24 horas
- Tier 3 (Suporte): score > 0 → RTO: > 24 horas
- Pendente: score = 0

## Cache de API
- `api.js` implementa cache em memória por sessão
- Invalidado após operações de escrita com `API.invalidate('action')`
- Torna transições entre telas instantâneas na segunda visita

## Escopos OAuth do Apps Script
- `https://www.googleapis.com/auth/spreadsheets`
- `https://www.googleapis.com/auth/userinfo.email`
- `https://www.googleapis.com/auth/script.external_request`
- `https://www.googleapis.com/auth/gmail.send`
- `https://mail.google.com/`
