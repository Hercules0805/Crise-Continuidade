# 📋 Questionário BIA - Business Impact Analysis

Aplicação web para gestores responderem questionários de análise de impacto nos negócios, construída 100% no ecossistema Google.

## Arquitetura

```
Google Apps Script (Web App)
├── Code.gs          → Backend (lógica, leitura/escrita no Sheets)
├── Index.html       → Questionário para gestores
├── Admin.html       → Painel administrativo
└── appsscript.json  → Manifesto do projeto
        │
        ▼
Google Sheets ("Cobertura BIA")
├── Tabela de Processos_2  → Processos e scores (sua planilha atual)
├── Config Gestores        → Mapeamento email → área (criada pelo setup)
└── Respostas BIA          → Log de todas as respostas (criada pelo setup)
```

## Deploy - Passo a Passo

### 1. Crie uma Planilha Vazia
- Acesse [Google Sheets](https://sheets.google.com) e crie uma nova planilha

### 2. Abra o Editor de Scripts
- Na planilha criada, vá em **Extensões → Apps Script**
- O script já estará vinculado à planilha automaticamente (container-bound)

### 3. Copie os Arquivos
- Substitua o conteúdo de `Code.gs` pelo conteúdo do arquivo `Code.gs` deste projeto
- Crie os arquivos HTML: **Arquivo → Novo → HTML** e crie `Index` e `Admin`
- Cole o conteúdo de cada arquivo HTML correspondente

### 4. Execute o Setup Inicial
- No editor, selecione a função `setupInicial` e clique em **▶ Executar**
- Autorize as permissões quando solicitado
- Isso criará automaticamente **3 abas** na planilha:
  - **Tabela de Processos_2** — com cabeçalhos, formatação, validação e 10 processos de exemplo
  - **Config Gestores** — com exemplos de gestores
  - **Respostas BIA** — vazia, pronta para receber respostas

### 5. Personalize os Dados
- Na aba **Tabela de Processos_2**: substitua os processos de exemplo pelos reais da sua empresa
- Na aba **Config Gestores**: substitua pelos emails e áreas reais dos gestores
  | Email | Nome | Área | Admin |
  |-------|------|------|-------|
  | joao@empresa.com | João Silva | Segurança da Informação | Não |
  | maria@empresa.com | Maria Admin | | Sim |

### 6. Publique como Web App
- No editor, vá em **Implantar → Nova implantação**
- Tipo: **App da Web**
- Executar como: **Usuário que acessa o app**
- Quem tem acesso: **Qualquer pessoa na organização** (ou conforme necessidade)
- Clique em **Implantar**

### 7. Acesse
- **Questionário**: URL da implantação
- **Painel Admin**: URL da implantação + `?page=admin`

## Critérios de Impacto (Escala 0-3)

| Score | Significado |
|-------|-------------|
| 0 | Sem impacto |
| 1 | Baixo |
| 2 | Médio |
| 3 | Alto |

## Classificação Tier (Score Total)

| Score | Tier |
|-------|------|
| 0-6 | Baixo |
| 7-11 | Médio |
| 12-16 | Alto |
| 17+ | Crítico |

## Ajustes Necessários

Antes de usar, verifique se os **nomes dos critérios** no `Code.gs` correspondem exatamente aos cabeçalhos das colunas M-V da sua planilha. Ajuste o array `CRITERIOS` se necessário.

Se as colunas de Score e Tier na sua planilha tiverem nomes diferentes de "Score" e "Tier", ajuste a lógica em `salvarRespostas()`.
