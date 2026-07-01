# Guia de Migração: Módulo BIA → Sistema GESI

## Visão Geral

Este documento descreve como adaptar o módulo **BIA (Business Impact Analysis)** para funcionar como módulo integrado ao sistema **GESI**, migrando de Google Sheets + Apps Script para **PostgreSQL** + a arquitetura do GESI.

**Repositório de origem:** https://github.com/Hercules0805/Crise-Continuidade

---

## 1. Arquitetura Atual (BIA standalone)

| Camada | Tecnologia | Onde |
|--------|-----------|------|
| Frontend | HTML/CSS/JS puro (SPA) | `firebase-app/public/` |
| Backend | Google Apps Script | `bia-app/Code.gs` |
| Banco de dados | Google Sheets (planilha) | Abas: Processos, Áreas, Dependências, etc. |
| Auth | Firebase Auth (Google login, domínio único) | `index.html` |
| AI | Gemini 2.5 Flash (geração de PCN) | Chamada REST no Code.gs |
| Hosting | Firebase Hosting | `bia-forte-2025.web.app` |

---

## 2. Modelo de Dados (para migração ao PostgreSQL)

### 2.1 Tabela: `areas`
```sql
CREATE TABLE areas (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(255) NOT NULL UNIQUE,
  responsavel VARCHAR(255),
  email VARCHAR(255),
  solucao VARCHAR(255)
);
```

### 2.2 Tabela: `perguntas`
```sql
CREATE TABLE perguntas (
  id SERIAL PRIMARY KEY,
  categoria VARCHAR(255) NOT NULL,
  pergunta TEXT NOT NULL,
  descricao TEXT,
  ativa BOOLEAN DEFAULT true
);
```

### 2.3 Tabela: `processos`
```sql
CREATE TABLE processos (
  id SERIAL PRIMARY KEY,
  area_id INTEGER REFERENCES areas(id),
  processo VARCHAR(500) NOT NULL,
  descricao TEXT, -- Descrição do impacto
  dependencia TEXT, -- Lista separada por vírgula (ou migrar para tabela M:N)
  rto VARCHAR(100),
  rpo VARCHAR(100),
  mtd VARCHAR(100),
  bia_homologada VARCHAR(100),
  tier VARCHAR(50),
  bcp_status VARCHAR(100),
  descricao_funcional TEXT,
  impacto_indisponibilidade JSONB,
  bcp_objetivo TEXT,
  bcp_escopo TEXT,
  bcp_contatos JSONB, -- Array de IDs de dependências
  bcp_riscos JSONB,
  bcp_preventivas JSONB,
  drp_status VARCHAR(100),
  drp_objetivo TEXT,
  drp_escopo TEXT,
  drp_procedimentos TEXT,
  drp_criterios TEXT,
  drp_componentes JSONB, -- Array de IDs de componentes
  workaround TEXT,
  impacto_janela JSONB,
  bcp_plano_b_provedores JSONB,
  bcp_slas JSONB,
  bcp_gatilhos TEXT,
  bcp_reconstituicao TEXT,
  bcp_papeis_crise JSONB,
  pcn_salvo JSONB, -- Última versão do PCN {versao, data, autor, html}
  tier_manual VARCHAR(50),
  levantamento_pcn JSONB, -- Respostas do formulário de levantamento
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(area_id, processo)
);
```

### 2.4 Tabela: `dependencias`
```sql
CREATE TABLE dependencias (
  id SERIAL PRIMARY KEY,
  categoria VARCHAR(100) NOT NULL, -- Fornecedores, Infraestrutura, Pessoas, Sistemas, Processos Internos
  nome VARCHAR(255) NOT NULL,
  detalhes TEXT, -- Papel/função
  setor VARCHAR(255),
  empresa VARCHAR(255),
  telefone VARCHAR(100),
  email VARCHAR(255),
  endereco TEXT
);
```

### 2.5 Tabela: `componentes`
```sql
CREATE TABLE componentes (
  id SERIAL PRIMARY KEY,
  tipo VARCHAR(100) NOT NULL, -- Servidor, Banco de Dados, Aplicação, Rede, etc.
  nome VARCHAR(255) NOT NULL,
  descricao TEXT,
  rto VARCHAR(100),
  rpo VARCHAR(100),
  estrategia VARCHAR(255), -- Backup & Restore, Cold Site, Warm Standby, etc.
  responsavel VARCHAR(255)
);
```

### 2.6 Tabela: `respostas_bia`
```sql
CREATE TABLE respostas_bia (
  id SERIAL PRIMARY KEY,
  processo_id INTEGER REFERENCES processos(id),
  respondente VARCHAR(255),
  cargo VARCHAR(255),
  scores JSONB NOT NULL, -- {"pergunta": valor, ...}
  score_total INTEGER,
  tier VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 2.7 Tabela: `config_respostas`
```sql
CREATE TABLE config_respostas (
  id SERIAL PRIMARY KEY,
  categoria VARCHAR(100) NOT NULL, -- '_default' para padrão global
  valor INTEGER NOT NULL,
  label VARCHAR(255) NOT NULL,
  cor VARCHAR(20),
  background VARCHAR(20)
);
```

### 2.8 Tabela: `tokens`
```sql
CREATE TABLE tokens (
  id SERIAL PRIMARY KEY,
  token UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  area_id INTEGER REFERENCES areas(id),
  tipo VARCHAR(50) NOT NULL, -- 'avaliacao', 'area', 'bia_deps', 'drp_comps', 'levantamento'
  processo VARCHAR(500),
  email VARCHAR(255),
  criado_em TIMESTAMP DEFAULT NOW(),
  expira_em TIMESTAMP NOT NULL,
  usado BOOLEAN DEFAULT false
);
```

### 2.9 Tabela: `perfis`
```sql
CREATE TABLE perfis (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  nome VARCHAR(255),
  perfil VARCHAR(50) DEFAULT 'gestor', -- 'admin' ou 'gestor'
  area_id INTEGER REFERENCES areas(id)
);
```

---

## 3. Lógica de Negócio Principal

### 3.1 Classificação de Tier (Score → Tier → RTO)
```
Score >= 12 → Tier 1 (Crítico) → RTO < 4 horas
Score >= 6  → Tier 2 (Essencial) → RTO 4h a 24 horas
Score < 6   → Tier 3 (Suporte) → RTO > 24 horas
Score = 0   → Pendente (não avaliado)
```

O score é a soma dos valores das respostas (8 perguntas × max 3 pontos = 24 max).

### 3.2 Controle de Acesso
- **Admin:** vê tudo, acessa todas as telas, gera PCNs
- **Gestor:** vê apenas processos da sua área, não vê Dependências/Componentes/Perguntas/Áreas, não gera PCN

### 3.3 Geração de PCN (via IA)
- Usa **Gemini 2.5 Flash** com `thinkingBudget: 0`
- Prompt montado com dados reais do processo (dependências, contatos, componentes, scores)
- Output: HTML formatado para impressão
- Auto-salva após geração
- Somente admins podem gerar

### 3.4 Formulários Externos (via Token)
- **Avaliação individual** — stakeholder responde questionário de impacto
- **Avaliação por área** — gestor responde todos os processos da área
- **Mapeamento BIA** — dono do processo informa dependências críticas
- **Mapeamento DRP** — dono do processo informa componentes do serviço
- **Levantamento PCN** — formulário completo para construção do PCN

Todos usam token UUID válido por 7-30 dias, uso único.

### 3.5 Categorias de Dependências (5Ps do BIA)
1. **Fornecedores** (Providers) — 🏢
2. **Infraestrutura** (Premises) — ⚡
3. **Pessoas** (People) — 👤
4. **Sistemas** (Profiles/Data) — 💻
5. **Processos Internos** (Processes) — 🔄

### 3.6 Tipos de Componentes DRP
- API, Banco de Dados, Infraestrutura, Segurança, Servidor de Aplicação, Sistemas
- Merge: "Certificados" → "Segurança"

---

## 4. Endpoints da API (para replicar no GESI)

### GET
| Action | Descrição | Retorno |
|--------|-----------|---------|
| `getProcessos` | Lista todos os processos com scores | Array de processos |
| `getAreas` | Lista áreas | Array |
| `getPerguntas` | Lista perguntas ativas | Array |
| `getDependencias` | Catálogo de dependências | Array |
| `getComponentes` | Catálogo de componentes | Array |
| `getConfigRespostas` | Opções de resposta por categoria | Object |
| `getPerfil` | Perfil do usuário (admin/gestor + área) | Object |
| `getResumoRespostas` | Resumo de avaliações | Array |
| `validarToken` | Valida token de avaliação individual | Object |
| `validarTokenArea` | Valida token de avaliação por área | Object |
| `validarTokenBIA` | Valida token de dependências | Object |
| `validarTokenDRP` | Valida token de componentes | Object |
| `validarTokenLevantamento` | Valida token de levantamento PCN | Object |
| `getLevantamentoPCN` | Busca levantamento preenchido | Object |
| `getProcessosPorArea` | Processos filtrados por área | Array |

### POST
| Action | Descrição |
|--------|-----------|
| `salvarProcesso` | Cria/atualiza processo |
| `excluirProcesso` | Exclui processo (busca por área+nome) |
| `salvarPergunta` | Cria/atualiza pergunta |
| `excluirPergunta` | Exclui pergunta |
| `salvarArea` | Cria/atualiza área |
| `excluirArea` | Exclui área |
| `salvarDependencia` | Cria/atualiza dependência |
| `excluirDependencia` | Exclui dependência |
| `salvarComponente` | Cria/atualiza componente |
| `excluirComponente` | Exclui componente |
| `salvarRespostas` | Salva avaliação (usuário logado) |
| `salvarRespostasToken` | Salva avaliação (via token individual) |
| `salvarRespostasArea` | Salva avaliação (via token de área) |
| `salvarConfigResposta` | Salva opção de resposta |
| `excluirConfigResposta` | Exclui opção de resposta |
| `gerarToken` | Gera token de avaliação individual + envia email |
| `gerarTokenArea` | Gera token de avaliação por área + envia email |
| `gerarTokenBIA` | Gera token de dependências + envia email |
| `gerarTokenDRP` | Gera token de componentes + envia email |
| `gerarTokenLevantamento` | Gera token de levantamento PCN + envia email |
| `gerarPCN` | Gera PCN via Gemini AI + auto-salva |
| `salvarPCN` | Salva versão editada do PCN |
| `excluirPCN` | Exclui PCN de um processo |
| `salvarDependenciasBIA` | Salva deps do formulário externo |
| `salvarComponentesDRP` | Salva componentes do formulário externo |
| `salvarLevantamentoPCN` | Salva formulário de levantamento |
| `enviarLinkBIA` | Envia deep link por email |
| `gerarRelatorioArea` | Envia relatório HTML por email |

---

## 5. Frontend — Telas e Comportamentos

### Telas principais (SPA com hash routing)
1. **#processos** — Tabela de processos com filtros (área, tier, PCN, busca)
2. **#pcns** — Biblioteca de PCNs agrupados por área
3. **#areas** — CRUD de áreas (admin)
4. **#dependencias** — CRUD de dependências (admin)
5. **#componentes** — CRUD de componentes (admin)
6. **#perguntas** — CRUD de perguntas + config de respostas (admin)
7. **#admin** — Painel/dashboard com resumo

### Drawer de Processo (5 abas)
1. **Identificação** — Nome, área, descrição funcional, tier manual, levantamento PCN
2. **Avaliação** — Questionário inline com score em tempo real
3. **BIA** — Impacto, RTO/RPO/MTD, dependências (5Ps com chips)
4. **BCP** — Contatos, fornecedores (plano B + SLA)
5. **DRP** — Componentes do serviço por tipo

### Páginas externas (via token)
- `avaliar.html` — Avaliação individual
- `avaliar-area.html` — Avaliação por área
- `bia-dependencias.html` — Formulário de dependências
- `drp-componentes.html` — Formulário de componentes
- `pcn-levantamento.html` — Formulário de levantamento PCN
- `pcn-viewer.html` — Loading page para geração de PCN

### UX Patterns
- **Optimistic save** — UI atualiza imediatamente, backend em background
- **Skeleton loading** — Shimmer durante carregamento
- **Chips clicáveis** — Seleção rápida de itens do catálogo
- **Tags selecionadas** — Fundo azul escuro, chips disponíveis em cinza
- **Criação apenas via botão** — Não cria automaticamente ao digitar
- **Búsca em todas as telas** — Filtro instantâneo por texto
- **PCN Live** — Botões ✏️ injetados no viewer para edição inline de seções

---

## 6. Integração com Gemini AI

### Configuração
- Modelo: `gemini-2.5-flash`
- `thinkingBudget: 0` (economia de tokens)
- `maxOutputTokens: 32768`
- `temperature: 0.7`
- API Key armazenada em variável de ambiente

### Prompt
O prompt está em `bia-app/Code.gs`, função `gerarPCN()` (~200 linhas). Ele:
1. Monta contexto com dados reais do processo
2. Define template obrigatório (4 partes: BIA, BCP, DRP, Anexos)
3. Instrui formatação HTML sem markdown
4. Define regras específicas (não inventar dados, cores na matriz de riscos, 3 tiers)

---

## 7. Passos para Migração

### Fase 1: Schema PostgreSQL
1. Criar as tabelas conforme seção 2
2. Migrar dados da planilha para PostgreSQL
3. Criar índices em `processos(area_id, processo)` e `tokens(token)`

### Fase 2: API REST
1. Implementar cada endpoint da seção 4 como controller/route no GESI
2. Manter mesmos nomes de action para compatibilidade
3. Substituir `appendRow`/`getRange` por queries SQL
4. Busca por área+processo deve usar comparação case-insensitive (`ILIKE` ou `LOWER()`)

### Fase 3: Frontend
1. Copiar os arquivos de `firebase-app/public/` para o frontend do GESI
2. Adaptar `config.js` para apontar para a API do GESI
3. Adaptar autenticação (substituir Firebase Auth pelo auth do GESI)
4. O `app.js` é standalone e pode ser integrado como módulo/iframe

### Fase 4: Funcionalidades AI
1. Configurar Gemini API key no backend do GESI
2. Replicar a lógica de `gerarPCN` como service no GESI
3. O HTML gerado pode ser armazenado em coluna `TEXT` ou em file storage

### Fase 5: Email
1. Substituir `GmailApp.sendEmail` pelo serviço de email do GESI
2. Manter templates HTML dos emails (estão inline no Code.gs)

---

## 8. Observações Importantes

- **IDs são números de linha** no sistema atual — no PostgreSQL serão `SERIAL`
- **Dependências são string CSV** no campo `dependencia` — considere tabela M:N
- **PCN salvo** como JSON na coluna — pode ser separado em tabela `pcn_versoes`
- **Tokens** expiram e são de uso único — implementar TTL no PostgreSQL
- **Cache** é em memória no frontend — no GESI pode usar Redis ou similar
- **Normalização** de busca: usar `LOWER(TRIM())` no SQL
- **5Ps sempre visíveis** — as categorias Fornecedores, Infraestrutura, Pessoas, Sistemas, Processos Internos devem aparecer mesmo sem dados
