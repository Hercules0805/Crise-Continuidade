# Guia de Identidade Visual e Padronização — Crise-Continuidade

> **Antes de criar ou alterar qualquer tela ou componente visual neste projeto, consulte este guia.**
> Qualquer decisão visual nova (cor, espaçamento, componente) que não se encaixe no que já existe aqui deve ser **adicionada a este arquivo**, não só ao código — para não voltarmos a divergir.
>
> Este documento reflete o que o código **realmente faz hoje** (levantado diretamente de `firebase-app/public/styles.css` e `app.js`), não uma aspiração. Onde o código diverge de si mesmo, isso está anotado na seção "Divergências conhecidas" no final — não escondido.

## 1. Paleta de cores

### DECISÃO 04/10/2026 — Rebrand GRC360 (pacote `layout/lay-v1`)

O sistema mudou de nome e de cor de marca: **"BIA · Business Impact Analysis"**
(indigo `#1a237e`) virou **"GRC360"** (vermelho `#d60014`), a partir de um pacote de
design system pronto (`layout/lay-v1/` — tokens.css/bundle.css/bundle.js/wordmark.svg),
copiado pra `firebase-app/public/vendor/grc360/` e carregado em `index.html` **antes**
de `styles.css` (ordem documentada em `INTEGRACAO-GRC360.md`). Pontos que valem pra
qualquer tela nova a partir de agora:

- **`styles.css` consome variáveis do pacote** (`var(--brand)`, `var(--brand-vivid)`,
  `var(--accent-green)`, `var(--radius-md)` etc.), não hex solto — o `:root` do
  próprio `styles.css` só redeclara o que o pacote NÃO cobre (success/warning/danger/
  info/neutro, e o `--brand-tint` abaixo). Não redeclare `--radius-sm/md/lg` em
  `styles.css`: declarar nesse arquivo sobrescreveria o valor do pacote também pros
  componentes `bia-*` (a cascata de CSS var é por última declaração, não por arquivo).
- **Gap do pacote — `--brand-tint`**: não existe um token de "fundo claro de marca"
  pronto (o indigo tinha `#e8eaf6` pra isso). Extensão local, só em `styles.css`:
  `--brand-tint: #fce8ea` — nunca edite o `tokens.css` vendorizado pra isso.
- **app.js é majoritariamente inline, não CSS**: a troca de cor lá foi **literal**
  (`#1a237e`→`#d60014`, `#283593`→`#e6262b`, `#e8eaf6`→`#fce8ea`), não `var(...)`,
  porque vários relatórios (Organograma, Dossiê, "Processos por Dependência") abrem
  em `window.open()` + `document.write()` — documentos **separados** que não herdam
  o `<link>` de `tokens.css` do documento principal. Onde esses relatórios também leem
  cor de um módulo (`Criticidade.corDoTier` etc., ver abaixo) que agora devolve
  `var(--risk-*)`, cada um ganhou um `:root{--risk-critical:...}` de fallback no
  próprio `<style>` embutido do relatório — sem isso a var não resolveria lá.
- **Exceção que NUNCA deve ser trocada**: `CATEGORIA_CORES` (paleta categórica
  rotativa de 10 cores pra tags de categoria/gráficos) inclui `#1a237e` como 1 das 10
  cores — não é marca, é uma cor de gráfico categórico entre outras 9, e trocá-la
  mudaria o significado de gráficos já existentes. Fica igual mesmo com o resto do
  sistema em vermelho.
- **Fora de escopo**: o projeto/hosting Firebase continua se chamando
  `bia-forte-2025` (URL, project id) — é identificador de infraestrutura, não nome
  visível ao usuário; renomear isso é uma operação de infra completamente diferente
  (recriar projeto, migrar dados, trocar DNS), não um rebrand visual.

### DECISÃO 08/10/2026 — GRC360 v2 (modelo `layout/lay-v2/grc360-modelo_1.html`)

Segunda geração do design system: **superfície clara e neutra-quente, vermelho só como acento**. Onde esta seção contradiz o restante do guia (nav vermelha, verde da nav ativa, cabeçalho de tabela vermelho, sombra de card, badges coloridos), **vale esta seção** — o restante será reescrito aos poucos, ao tocar em cada tela. Escopo desta rodada: camada global + tela **Registro de Riscos** como piloto; **só tema claro**.
- **Tokens**: `vendor/grc360/tokens-v2.css`, carregado depois de `tokens.css`/`bundle.css` (v1) e antes de `styles.css`. Não edite o v1 vendorizado. `--surface #fff`, `--surface-sunken #f6f4f2`, `--ink #2a2623`, `--ink-muted #5c5550`, `--border #d8d2cd` (divisor), `--border-strong #8a817b` (controles), `--red #d50014`, `--red-tint #fde8ea`. **Aliases**: `--brand`→`--red`, `--brand-tint`→`--red-tint`, `--on-brand`→`--on-red`, então tudo que já usava `var(--brand)` acompanha. Raio e espaço do v2 usam nomes **novos** (`--r-sm 4px`, `--r-md 8px`, `--r-pill`, `--sp-*`) porque `--radius-*`/`--space-*` já existem no v1 com outros valores e os componentes `bia-*` os consomem. `--focus-ring-color` (outline) é distinto do `--focus-ring` (box-shadow) do v1.
- **Fonte**: Open Sans 400/600/700 (Google Fonts, `index.html`), base 14px/20px. Suposição do próprio modelo — **confirmar a fonte oficial**; só o token `--font-sans` muda.
- **Nav**: barra **branca** 64px, borda inferior `--border`, aba ativa = texto `--ink` + sublinhado 3px `--red`. O verde `--accent-green` **deixou** de ser usado na nav. Logo no tom normal (`Logo({height:28})`, sem `on-dark`).
- **Cabeçalho de página**: título 32/38 bold `--ink` (o markup segue `h2.page-header`, só estilizado) + `.page-sub` como lead (`--ink-muted`, `max-width:80ch`).
- **Tabela (`.data-table`)**: sem sombra, `border:1px solid --border`, raio 8; `th` fundo `--surface-sunken`, 12px uppercase `letter-spacing:.08em` (o modelo usa .14em, mas só cabe com colunas folgadas) `--ink-muted` (deixou de ser vermelho); `td` `16px 12px`, divisor `--border`; hover `--surface-sunken`. Título do registro: classe `.title` (600); texto de apoio: `.muted`; números/datas: `.num`.
- **Filtros**: `.filters` > `.field` > `.field-label` (13px 600 uppercase `.18em`, **sem** dois-pontos) + `.field-control` (40px, borda `--border-strong`, raio 4). Busca: `input type="search"` com `.field-control--busca`.
- **Chips de nível (`_htmlBadge`)**: o nível é codificado por **forma além de cor** — `low`→`.chip--l1` (anel vazado, borda), `medium`→`.chip--l2` (meio preenchido, fundo sunken), `high`→`.chip--l3` (cheio, `--red-tint`+`--red`), `critical`→`.chip--l4` (sólido `--red`). **Isso substitui as 4 cores verde/âmbar/laranja/vermelho** da seção "Severidade/criticidade" abaixo (os tradutores `_nivel*` não mudam; o rótulo real do módulo continua preservado). Auxiliares: `.chip-area` (área), `.chip-status` (status de workflow, neutro com borda), `.chip-score` (score numérico, neutro), `.load`/`.load.hi` (Carga; vermelho no score ≥ 9). Nível nulo continua `.badge.badge-gray`.
- **Botões**: `.btn` ≥32px com borda; `.btn-ghost` = superfície branca + borda `--border-strong` (era cinza chapado) — por isso a convenção `.btn-ghost` + `color`/`border-color` inline de status passa a funcionar também na borda. `.btn-primary` segue vermelho.
- **Foco**: `outline:2px solid var(--focus-ring-color); outline-offset:2px` global em `:focus-visible`.
- **Cards/modal/drawer**: borda `--border` no lugar de sombra; título de modal/drawer em `--ink` (não mais vermelho); cabeçalho/rodapé do drawer com divisor `--border`.
- **Ainda NÃO migrado (legado, não copiar em tela nova)**: abas internas dos drawers (inline `#d60014`/`#fce8ea`), inputs de drawer (inline `#e0e0e0`, raio 7), badges de workflow de outras telas, e todos os ~1.900 `style=""`/~1.200 hex do `app.js` fora do Registro de Riscos. **Tema escuro**: tokens escuros estão comentados em `tokens-v2.css`; ativar exige trocar esses hex/fundos brancos inline por variáveis.
- **Relatórios em `window.open`** (Dossiê, Organograma, PCN/DRP) não herdam nenhum desses tokens e **não mudaram**.

### Marca (vermelho GRC360)
| Token CSS | Hex | Uso |
|---|---|---|
| `--brand` | `#d60014` | Nav, `.btn-primary`, títulos de página/modal/drawer, cabeçalho de tabela, borda ativa de aba, texto da 1ª coluna de tabela |
| `--brand-vivid` | `#e6262b` | Sempre em par com `--brand` num `linear-gradient(135deg, var(--brand), var(--brand-vivid))` ou como hover de `.btn-primary` |
| `--brand-tint` | `#fce8ea` | Fundo de badge de categoria/pilar, bordas de abas, caixas de destaque — extensão local, ver acima |
| `--on-brand` | `#fff` | Texto sobre fundo `--brand` (nav, thead, botão primário) |

### Logo (`window.GRC360.Logo({height, tone, tagline})`, `vendor/grc360/bundle.js`)
**DECISÃO 23/10/2026 — o sistema volta a se chamar BIA** (pedido do usuário; protótipo em
`layout/marca-bia/prototipo.html`). Mesma tipografia escura e pesada do logo GRC360, **sem o anel**:
só o nome **"BIA"**, com a letra **B no vermelho da marca** (`#d50014`) e "IA" em `#2b2b2b`
(branco na versão `-branco`; o B continua vermelho). Tagline mantida: "GOVERNANÇA · RISCO ·
COMPLIANCE". Arquivos (PNG transparente, 2x, gerados num canvas com Open Sans 800):
`bia-logo.png` (com tagline, 841×225), `bia-logo-simbolo.png` (só o nome, 336×151), versões
`-branco` e `bia-favicon.png` (128×128, o B vermelho). `Logo()`: `height` = altura do nome "BIA";
largura = `height × 336/151` (só o nome) ou `height × 841/151` (com tagline); `alt="BIA"`.
- **Texto visível** diz "BIA" (aba do navegador `Tela · BIA`, cabeçalho de documento
  "BIA · Governança, Riscos e Conformidade", rodapé "Sistema BIA", e-mails `[BIA]`, "Abrir no BIA",
  remetentes "BIA · Contratos/Riscos/Continuidade"). **Nomes internos ficam GRC360 de propósito**
  (namespace `window.GRC360`, pasta `vendor/grc360/`, constantes `GRC360_*`, tokens): ninguém os
  vê, e renomear só traria risco. Guarda: `tests/marca-bia.test.js`.
- Os `grc360-logo*.png` e `grc360-favicon.png` antigos continuam na pasta (e-mails já enviados).
- Remetente salvo na configuração de Notificações antes da troca ("GRC360 · Contratos") continua
  até alguém editar o campo na tela Notificações por e-mail.

**Histórico (substituído acima):**
**DECISÃO 04/10/2026 (versão final)**: a logo é a **imagem oficial de referência** da marca
(texto `--ink` escuro + "0" como **anel vermelho** `--brand`, tagline "GOVERNANÇA · RISCO ·
COMPLIANCE" abaixo), não mais um SVG com fonte do sistema (a versão com disco cheio foi
descartada — a referência é um anel). Arquivos PNG com fundo transparente em `vendor/grc360/`:
`grc360-logo.png` (com tagline), `grc360-logo-simbolo.png` (só o símbolo), versões `-branco`
(para fundo `--brand`/escuro) e `grc360-favicon.png` (só o anel).
- `Logo()` devolve um `<img>`; `height` é a altura do **símbolo**; `tone:"on-dark"` usa a versão
  branca; `tagline:true` usa a versão com tagline.
- **Nav** (`index.html`): `Logo({height:22, tone:'on-dark'})` — só símbolo, sem tagline.
- **Login** (`login.html`): `Logo({height:56, tagline:true})` — tagline já vem na imagem.
- `grc360-wordmark.svg` (vetor antigo, fonte do sistema) ficou obsoleto; não usar.
- Para trocar a logo, substitua os PNGs mantendo as proporções (símbolo 428×92, completa 428×171).

### Severidade/criticidade — componente `Badge` (`bia-badge`/`bia-badge--nivel`)

**DECISÃO 04/10/2026**: as ~4 escalas de severidade que o sistema já tinha
(Processos: Tier 1/2/3/Pendente; Riscos: Crítico/Alto/Moderado/Baixo; Fornecedor
nota: Adequado/Aceitável/Insuficiente/Crítico, escala invertida; Fornecedor
criticidade: só 3 níveis; Probabilidade/Impacto: suas próprias 3-4 opções) — cada
uma com seu hex solto, sem classe compartilhada — convergiram pro **mesmo
componente Badge** do pacote GRC360, com 4 níveis fixos de cor:

| `level` | Token CSS | Hex aproximado |
|---|---|---|
| `low` | `--risk-low` | `#38bb0e` (verde) |
| `medium` | `--risk-medium` | `#9a6700` |
| `high` | `--risk-high` | `#b64a12` |
| `critical` | `--risk-critical` | `#d60014` (= `--brand`) |

O app inteiro renderiza por template string + `innerHTML`, nunca monta nó DOM por nó
DOM — por isso **não chamamos `window.GRC360.Badge(...)`** (devolve nó DOM, incompatível
com esse padrão sem reescrever a arquitetura de renderização inteira). Em vez disso,
`_htmlBadge(level, label)` em `app.js` monta a MESMA marcação/classes que o componente
usaria (`bia-badge bia-badge--${level}` + `bia-badge__dot`/`bia-badge__label`), como
string — visual idêntico, só a forma de montar muda (é a adaptação que o próprio
`INTEGRACAO-GRC360.md` já previa: "reescrever cada um... usando as MESMAS variáveis
CSS e as mesmas classes"). `level` escolhe só a COR; o **rótulo de texto real do
módulo** (Tier 1/2/3, Adequado/Aceitável...) é sempre preservado — nunca convertido
pro nome genérico Baixo/Médio/Alto/Crítico.

Cada módulo tem seu próprio tradutor rótulo→nível em `app.js`
(`_nivelTierProcesso`, `_nivelFaixaRisco`, `_nivelNotaFornecedor`,
`_nivelCriticidadeFornecedor`, `_nivelProbImpacto`, `_nivelSituacaoFornecedor`) — ao
adicionar uma 5ª escala de severidade nova, siga o mesmo molde: um tradutor pequeno
que devolve `'low'|'medium'|'high'|'critical'|null`, nunca force um valor numa das 4
cores quando o estado for "sem dado" (Pendente/Não avaliado/Sem nota) — esses
continuam neutros (`_htmlBadge` trata `level` null/falsy como `.badge.badge-gray`).
Os módulos de regra únicos que alimentam os badges (`criticidade.js`,
`risco-consolidado.js`, `fornecedor-score.js`, `fornecedor-criticidade.js`) hoje já
devolvem `cor`/`fundo` como `var(--risk-*)` direto (não mais hex), pra toda exibição
decorativa (borda de card, texto de número) ficar automaticamente consistente com a
cor do badge da mesma severidade, sem precisar editar os dois em paralelo.

### Métrica/estatística — componente `MetricCard` (`bia-metric`)
Mesma lógica do Badge: `_htmlMetricCard({label, value, level, trend})` em `app.js`
monta a marcação (`bia-metric`/`bia-metric__label`/`bia-metric__value`/
`bia-metric__trend`) como string. Usado nos cards de número dos dashboards (Admin,
Indicadores, resumo de Fornecedores). Quando o card precisa de comportamento que o
componente oficial não tem (clique pra filtrar, aro de "filtro ativo", borda
colorida por cartão), monte a `<div class="bia-metric">` diretamente com esse extra
por cima — mesma técnica usada nos 3 pontos acima — em vez de forçar tudo dentro do
helper genérico.

### Status / severidade antigo (texto/fundo em hex) — ainda usado fora do Badge
Workflow-status (não-severidade) como o status do Risco (Identificado/Em Análise/Em
Tratamento/...) **não** entra no Badge de 4 níveis — são 7 estágios de processo, não
uma escala low→critical, e forçá-los perderia informação. Essas continuam com hex
próprio (`_corStatusRisco` em `app.js`). Se precisar de um par texto/fundo solto pra
algo que não é nem severidade nem SUCESSO genérico:
| Semântica | Texto/forte | Fundo claro |
|---|---|---|
| Sucesso | `#2e7d32` | `#e8f5e9` |
| Alerta | `#f57c00` | `#fff3e0` |
| Perigo/Crítico | `#c62828` | `#ffebee` |
| Neutro/Pendente | `#757575` | `#f5f5f5` |
| Info | `#1565c0` | (sem par claro definido; usar `#e3f2fd` se precisar) |

**Exceção documentada**: `#e65100` (mais escuro que `#f57c00`) é usado especificamente como cor de **texto de validação de formulário** (`showToast('Informe X.', '#e65100')`) e como cor de texto de opções qualitativas "Alto/Média" em alguns badges de prob./impacto — é uma variação intencional de "alerta" para texto (mais legível que `#f57c00` em fonte pequena sobre fundo branco), não um erro. Não usar `#e65100` como cor de fundo; fundos de alerta são sempre `#fff3e0`.

### Texto e neutros
| Token | Hex | Uso |
|---|---|---|
| Texto principal | `#222` / `#333` | Texto forte em células, corpo da página |
| Texto secundário | `#555` | Labels de modal simples, texto secundário padrão |
| Texto muted | `#888` | `.page-sub`, texto de apoio — use este como padrão para "texto secundário/muted" em componentes novos |
| Borda padrão (modal simples) | `#ddd` | `.modal input`, filtros |
| Borda padrão (drawer/formulário) | `#e0e0e0` | Inputs de drawer, `.btn-ghost` |

### Cor de ação (ícones)
- Editar (lápis, SVG inline): `stroke="#ff6b35"` (laranja de destaque — **só para o ícone de editar**, não usar em outro contexto)
- Excluir (lixeira, SVG inline): `stroke="#999"`

### Verde de navegação ativa
- **Superado**: desde o v2 (08/10/2026) o item ativo é vermelho (`--red` / `--red-tint`), e no menu lateral (DECISÃO 23/10/2026) é `.nav-link.active` com fundo `--red-tint`, texto `--red` e barra vermelha à esquerda. Histórico abaixo.
- `var(--accent-green)` (`#38bb0e`) — usado **exclusivamente** para indicar item ativo no menu principal (`.nav-group.has-active`, `.nav-link.active`). Não é a mesma cor do "sucesso" (`#2e7d32`) e não deve ser usado fora da nav. **DECISÃO 04/10/2026**: era `#69f0ae` (verde órfão do indigo antigo, sem token); com o rebrand GRC360, passou a usar o `--accent-green` que o pacote já define, em vez de inventar outro valor.

### Paleta de categorias (rotativa, 10 cores)
Usada para colorir tags de categoria dinâmicas (ex.: categorias de dependências na BIA). Definida como **uma única constante** `CATEGORIA_CORES` no topo de `app.js` (ver `_categoriaCor()` / uso em `app.js`):
```
['#37474f','#1a237e','#c62828','#e65100','#00838f','#6a1b9a','#00695c','#1565c0','#4e342e','#558b2f']
```
`avaliar.html` mantém sua própria cópia porque é uma página pública standalone, sem acesso ao `app.js` da SPA — isso é aceitável, não uma duplicação a eliminar.

## 2. Espaçamento e raio de borda

Não há (nem deve haver, por enquanto) um grid rígido de 4/8px — os valores abaixo são o **padrão dominante observado**, use-os para manter consistência com o que já existe:

| Componente | Padding | Border-radius |
|---|---|---|
| `.btn` | `9px 20px` | `7px` |
| `.btn-icon` | `6px` | `4px` |
| Input/select de modal simples | `9px 12px` | `7px` |
| Input/select de drawer/filtro | `9px 12px` | `7px` |
| Input de busca (`buscaX`) | `8px 14px` | `8px` |
| Badge/pill (categoria, status, tier) | `3-4px 9-12px` | `10-12px` |
| `.modal` | `28px` | `12px` |
| `.drawer` | — | `0` (painel lateral, sem cantos arredondados) |
| `.toast` | `11px 22px` | `8px` |
| Card branco (`.group-card`, `.data-table`, tiles de resumo) | `20px` | `10px` |

**Sombra de card branco** (canônica, usar sempre esta): `box-shadow: 0 1px 4px rgba(0,0,0,0.08);`

## 3. Tipografia

- `font-family: 'Segoe UI', Roboto, sans-serif` (definido em `body`, `styles.css`).
- Escala de tamanho (aproximada, em `em`): `0.72` (hints/badges pequenos) · `0.8-0.85` (labels, texto secundário) · `0.88-0.9` (corpo/inputs/tabela) · `1-1.1` (títulos de modal/drawer) · `1.6` (título de página `h2`) · `1.8-2.5` (números de destaque, ex. score).
- **Labels de campo** (modal/drawer com formulário estruturado): uppercase, `letter-spacing:0.4px`, `font-weight:700`, `color:#444`, `font-size:0.78em`.
- **Peso**: label = sempre `700` (ou `600` em modais simples de campo único); valor/conteúdo = `500` ou `600`; títulos de página/seção = `700`.

## 4. Componentes

### Botões
- `.btn-primary` — ação principal (Salvar, Novo Registro). `var(--brand)` → hover `var(--brand-vivid)` (vem do pacote GRC360, ver seção 1).
- `.btn-ghost` — ação secundária (Cancelar, filtros, exportar). Fundo `#f0f0f0`, texto `#555` — fica neutro de propósito, não adota o vermelho de marca (ver nota em `styles.css` sobre por que `.btn-ghost` não virou `bia-btn--secondary`).
- `.btn-ghost` com cor sobrescrita inline (`color:#c62828;border-color:#c62828;`) — convenção usada hoje para variações semânticas (excluir em lote, importar) já que não existe `.btn-danger`/`.btn-outline`. **Ao criar uma ação nova assim, reutilize exatamente essa convenção** (`.btn-ghost` + `color`/`border-color` inline na cor de status correspondente da seção 1) em vez de inventar uma cor nova.
- `.btn-icon` — ação em linha de tabela (editar/excluir), sempre com SVG inline (ver seção Ícones).

### Badges / Pills
**DECISÃO 04/10/2026**: badge de severidade/criticidade (3+ estados, cor dinâmica por
gravidade) usa o helper `_htmlBadge(level, label)` (componente `Badge` do pacote
GRC360 — ver seção 1, "Severidade/criticidade"), não mais um `<span>` com `background`
cru. Continuam válidas, sem mudança:
1. Classes fixas `.badge`/`.badge-green`/`.badge-gray` (styles.css) — para os 2 estados binários simples (ativo/inativo).
2. Pills de **workflow-status** (não-severidade, ex. `_badgeStatusRisco` — Identificado/Em Análise/Em Tratamento/...) — continuam com `<span style="background:${cor};">`, hex próprio da seção 1 acima, porque não são uma escala low→critical e forçá-las no Badge de 4 níveis perderia informação (ver seção 1 pra critério completo de quando usar Badge vs. pill solta).

### Modal vs. Drawer
**DECISÃO 29/09/2026: painel lateral (drawer) passa a ser o padrão para qualquer
tela/painel secundário NOVO** — inclusive telas simples de escolha/configuração antes de
uma ação (ex.: o drawer "Escolher dependências" que aparece antes de gerar o relatório
"Processos por Dependência", `#drawerSelecaoDependenciasRelatorio`; idem "Escolher áreas" do "Processos por Área", `#drawerSelecaoAreasRelatorio`). Modal fica reservado
pra confirmações realmente mínimas de campo único. **Não é retroativo**: os modais já
existentes (Perguntas, Áreas, Config. de Respostas, Componentes, Indicadores, Organograma)
continuam como estão — não precisam ser convertidos só por causa desta decisão, só ao
serem tocados por outro motivo.
- **Modal** (`.modal-overlay`/`.modal`, centralizado, `max-width` 480-580px conforme o formulário): reservado pra confirmação/formulário de campo único bem pequeno. Antes desta decisão era o padrão pra qualquer entidade de tela única (Perguntas, Áreas, Config. de Respostas, Componentes, Indicadores) — esses continuam modal (ver acima), mas uma tela nova parecida não deveria mais virar modal por padrão.
- **Drawer** (`.drawer-overlay`/`.drawer`, painel lateral, largura padrão `70vw` — mas veja a nota de largura abaixo): padrão pra qualquer tela/painel novo, tenha ou não **abas internas** (Processo, Risco, Dependência — "Dados Gerais"/"DRP") ou uma sub-lista repetível embutida (mini-CRUD) — o critério de "só some com abas/mini-CRUD" valia antes da decisão acima e explica por que Fornecedores (mini-CRUD de "Contatos associados") e Pessoas (mini-CRUD de "Áreas") já eram drawer; agora nem precisa desse critério pra decidir, drawer já é o ponto de partida.
- **Largura do drawer**: o padrão de `.drawer` é `70vw` (pensado pra formulário com abas/multi-coluna, como Fornecedor/Processo/Risco/Dependência/Serviço/Backup). Para um drawer de **formulário simples de coluna única** (poucos campos, sem abas), sobrescreva com um `.drawer#idDoDrawer { width: NNNpx; }` em `styles.css` — ver `#drawerPessoa` (`480px`) — em vez de deixar no `70vw` padrão, que fica com espaço vazio sobrando. **DECISÃO 03/10/2026:** `#drawerServico` tinha um override de `520px` de quando era só um formulário simples; ao ganhar abas (Dados/Backups) e uma tabela na aba Backups, passou a precisar do `70vw` padrão — o override foi removido. Lição: mudar a forma de um drawer (formulário simples → abas/tabela) exige revisitar o override de largura, não só o conteúdo.
- **Sem `.drawer input`/`.drawer label` no CSS** (só existe `.modal input`/`.modal label`): todo formulário dentro de um drawer precisa do estilo de campo inline (ver seção "Formulários em modal/drawer" abaixo) — Fornecedor, Risco, Processo e Pessoas já seguem isso.
- **DECISÃO 05/10/2026 — Modal aberto DE DENTRO de um drawer já aberto** (ex.: `#modalEscolherTipoTeste`, pergunta "qual tipo de teste?" antes de "Gerar Roteiro de Teste", na aba Gestão de Testes da Dependência): `.modal-overlay` tem `z-index:100`, igual `.drawer-overlay`, mas **menor** que `.drawer` (`z-index:101`) — até agora nunca importava, porque modal e drawer eram sempre alternativas de tela cheia, nunca um dentro do outro. Um modal assim abre **atrás** do drawer (presente no DOM, clicável só se você soubesse onde clicar às cegas, mas invisível) — sintoma reportado como "cliquei e não aconteceu nada". Acrescente a classe `modal-sobre-drawer` (`styles.css`, `z-index:110`) no `.modal-overlay` desse modal sempre que ele for aberto a partir de dentro de um drawer.

### Abas (tabs)
Um único padrão de aba, usado (e que deve continuar sendo usado) em `trocarAbaProcesso`, `trocarAbaRisco` e `trocarAbaIndicadores`:
- Ativa: `color:var(--brand); border-bottom:3px solid var(--brand); font-weight:700;`
- Inativa: `color:#999; border-bottom:3px solid transparent;`
- Padding `10px 20px`, `font-size:0.88em`, faixa com `border-bottom:2px solid var(--brand-tint)`.
- Largura: `flex:1` (abas dividem o espaço) quando há muitas abas dentro de um drawer estreito; largura fixa quando são poucas abas (2-3) numa tela cheia — escolha conforme o espaço disponível, não é uma regra rígida.

### Telas de lista — padrão único (DECISÃO 23/10/2026, protótipo `layout/listas/opcao-a.html`, "opção A · barra única")
Pedido do usuário: cadastros como Áreas e Pessoas seguiam padrões diferentes; as listas devem ser **o mais enxutas possível** e o que é estratégico (cards, números, gráficos) sai da lista e vai para o **Dashboard da seção** do menu. Escolhida a opção A (entre A "barra única" e B "busca + painel de filtros", `layout/listas/opcao-b.html`). Helpers em `app.js` (bloco "TELAS DE LISTA"), CSS no fim de `styles.css`, guarda em `tests/listas-padrao.test.js`.
- **Cabeçalho** `_htmlCabecalhoLista({ titulo, sub, primario, maisAcoes })`: título + **uma frase** (com ponto final) e **um único botão primário** (sentence case: "+ Nova área", "+ Novo tipo"). Ações secundárias (Gerar organograma, Exportar, Configurar…, ir para outra tela) ficam no menu **"⋯ Mais ações"** (`.mais-acoes`), sem emoji. `primario.id` mantém o id antigo do botão quando outro código o mostra/esconde.
- **Barra única** `_htmlBarraLista({ busca, filtros, aoMudar, contadorId })`: busca (240px, 32px) + selects compactos de 168px **com o nome do filtro dentro** ("Área: Todas", "Área: TI" — `_opcoesFiltroLista`), filtro ativo marcado (`.lista-sel--ativo`), "Limpar" só com filtro ativo e contador à direita ("18 áreas", `_atualizarBarraLista`). Opções que só existem depois de carregar: `_preencherFiltroLista` (mantém a escolha). `aoMudar` é a função `filtrarX` que volta para a página 1 e redesenha. Substitui `.filters`/`.field` sem rótulo e a barra inline dos Indicadores (a migrar nos próximos lotes).
- **Grade** `.data-table--lista`: linha de 40px **em uma linha só** (`nowrap` + reticências; `_tdLista(texto, classe)` põe o texto inteiro no `title`), larguras em px no `<colgroup>`, 1ª coluna `.forte`, coluna **Ações** `.col-acoes` fixa à direita com `_htmlAcoesLinha([_acaoEditar(...), _acaoExcluir(...)])` (SVG_EDITAR/SVG_EXCLUIR, `aria-label`). Clique na linha abre o registro. Informação que não cabe em uma linha vira texto corrido (ex.: Liderança "Tech Lead: A, B · Team Lead: C"), nunca várias linhas na célula.
- **Paginação sempre** (`criarPaginacao(20)` + `_htmlPaginacao`), **vazio** em `td.vazio`/`_htmlVazio` (com frase diferente quando há filtro: "Nenhuma … encontrada com essa busca") e **erro de carga** sempre em `_htmlErroCarga` (aceita a chamada pronta: `_htmlErroCarga(msg, "_telaListaSimples('tipos')")`). Nada de `e.message` cru na tela.
- **Cadastro simples** (lista de nomes com status/uso): `_renderGradeLista({ alvoId, itens, buscaId, camposBusca, filtrar, ordenacao, comparadores, colunas, linha, paginacao, fnPagina, fnOrdenar, prefixoSeta, contadorId, contador, vazio, vazioDetalhe | vazioHtml, depois })` faz busca + ordenação + paginação + vazio. Usado nas 4 listas de Fornecedores e nas listas simples de Contratos/Backup.
- **Sem conteúdo de painel na lista**: ajuste que não é cadastro (limiar, apetite, configuração) vai para o drawer **"Configurar"** (`_htmlDrawerConfigLista(titulo, corpoId)` + `abrirConfigLista()`, aberto pelo "Mais ações"); texto de explicação vira **ajuda recolhível** `<details class="lista-ajuda">`; aviso que pede ação imediata cabe numa linha `.lista-alerta` (ex.: "único administrador").
- Lote 1 (23/10/2026): Áreas, Pessoas, Produtos de Software, Perfis de Acesso, Categorias/Subcategorias/Critérios/Perguntas de Criticidade de Fornecedores, Tipos/Status/Indexadores de Contrato, Ferramentas de Backup e o cabeçalho/barra de Perguntas do BIA (lista agrupada).
- Lote 2 (23/10/2026): Dependências, Serviços, Catálogo do Backup, Processos de Negócio e Cadastro de Indicadores; a barra dos Indicadores (`_renderBarraFiltrosIndicadores`) virou a barra única também em Lançamento Mensal e Matriz. Ação que depende de seleção ("Editar selecionados (n)", "Excluir selecionados (n)") fica no cabeçalho como botão ghost contextual (`extra` do `_htmlCabecalhoLista`), sem emoji. Ação que depende de um filtro (Processos: "Enviar questionário/relatório para a área") vai para "Mais ações" e, sem o filtro, avisa o que falta. Filtro travado pelo perfil (Gestor: área fixa) fica `disabled` e o "Limpar" o ignora. Ícones extras de linha em 16px: `SVG_VER`, `SVG_AVALIAR`, `SVG_EMAIL`, `SVG_DOCUMENTO`, `SVG_LEVANTAMENTO`, `SVG_CLONAR`.
- **Dashboard por seção** (23/10/2026): o que era painel em cima de lista mora no Dashboard da seção do menu, como primeiro item do grupo. **Dashboard de Terceiros** (`#terceiros-dashboard`, `terceirosDashboard`): os números de Fornecedores (os 7 cards de antes) e a faixa de Contratos (`_renderPainelContratos`, `.kpi-strip`) + "Contratos que vencem em até 90 dias"; seções pelo perfil (Gestor vê só Contratos). **Número do dashboard abre a lista já filtrada**: `_abrirListaFiltrada(tela, { idDoSelect: valor })` guarda o filtro e a lista aplica com `_aplicarFiltroInicialLista(tela)` depois de montar os selects — por isso todo filtro que um card fazia vira um select da barra (Fornecedores: "Situação" e "TIC"; Contratos: "Alerta: Vencidos ou vencem em 90 dias"). Na lista fica só o aviso que pede ação (`.lista-alerta`, ex.: "nenhum critério ativo"). Informação que só cabia em outra linha da célula vai para o `title` (contatos do fornecedor, quem avaliou e quando, número do contrato, renovação automática).
- **Dashboard de Riscos** (`#riscos-dashboard`, `riscosDashboard`, primeiro item do subnível Riscos): números de atenção (abertos, acima do apetite, reavaliação vencida, alerta da automação, KRI fora da meta → Registro filtrado pela "Situação") + a carga de risco consolidada (`_renderPainelRiscoConsolidado`, que saiu de cima do Registro). Apetite de risco: "Mais ações > Apetite de risco" (drawer "Configurar"). **Vulnerabilidades**: a exposição fica no Painel de Vulnerabilidades; na lista, só o aviso "acima do limiar sem risco" (com "Selecionar para exportar"); limiar de CVSS no drawer "Configurar". **Dashboard de Continuidade** ganhou a seção "Planos" (Processos com PCN, Tier 1 sem PCN, Dependências com/sem DRP), que eram os cards das listas de PCNs e DRP. **Conformidade de Continuidade** é ela mesma um painel de pendências: mantém os números, com cabeçalho, barra e grade no padrão. Lote 3 (23/10/2026): Fornecedores, Contratos, Registro de Riscos, Vulnerabilidades, PCNs, DRP, Conformidade.
- **Notificações por e-mail** (lote 4, 23/10/2026): a tela é o log dos e-mails (padrão de lista). A configuração de envio (modo, remetente, o que envia, para quem, servidor) saiu de cima do log para o drawer **"Configurar envio"** (primário da tela; `#drawerConfigLista`, 760px), com "Enviar e-mail de teste" e "Salvar configuração" no rodapé; "Atualizar log" e o teste também em "Mais ações". Os ids dos campos não mudaram.
- **Threat Intelligence** (`#threat-intel`, `threatIntel`, 26/10/2026, subnível Vulnerabilidades): tela de **triagem** no padrão de lista com **abas de tela** ("Ações para triagem" | "Notícias coletadas" | "Inventário de software", `_marcarAba`, faixa `border-bottom:2px solid var(--brand-tint)`); cada aba redesenha a barra única com os próprios filtros e a de ações abre já filtrada em **Status: Pendente**. Prioridade da ação recomendada usa `_htmlBadge` via `_nivelPrioridadeIntel` (Crítica/Alta/Média/Baixa); status da triagem (Pendente/Aprovada · código/Descartada) e situação da notícia são **pills de workflow**, não chips de nível. **"Explorada ativamente (CISA KEV)"** e "Usada em ransomware" são `_htmlBadge('critical', …)` no drawer; na grade a origem vira o texto "KEV · explorada". Ação da linha: `SVG_AVALIAR` ("Triar"). Drawer da ação (70vw) tem o formulário de aprovação no fim do corpo; **Descartar** pede o motivo num modal `modal-sobre-drawer` (campo único). "Registrar notícia" (`#drawerRegistrarIntel`, 560px) e "Importar inventário" (`#drawerInventarioIntel`, 640px) são drawers de coluna única — na importação, **cada coluna do CSV é uma linha** (checkbox "subir" + nome + exemplo + select "É o quê": campo fixo ou "Outra informação"), com checkbox no cabeçalho para marcar todas; fontes e limite de IA ficam no drawer "Configurar".
- **Grade cabe em ~960px, sem rolagem** (23/10/2026, depois do "SC" cortado em Processos): com mais largura que a tela, a grade rola e a coluna Ações, fixa, **cobre** as colunas de baixo — o usuário não vê que elas existem. Regra: a soma do `<colgroup>` fica em ~960px (área útil com o menu aberto numa tela de notebook). Quando não cabe, **juntar ou mover para o title**, não rolar: Processos (Score no selo do Tier; BIA/BCP/DRP em "Planos", `_htmlPlanosProcesso`), Registro de Riscos (de 17 para 8 colunas: Origem/Processo/Produto/Categoria no title do Título, Probabilidade × Impacto no title do Score; Impacto R$, Prioridade e Reportado por ficam no drawer), Contratos (Tipo no title do Objeto; Fim + Valor mensal em "Vigência"), Vulnerabilidades (Tipo depois do nome; detecção no title da Severidade). Nas grades de lista o respiro lateral é 10px e o título usa letter-spacing .04em.

### Fornecedores Ativos / Inativos e importação por planilha (DECISÃO 27/10/2026)
- **Abas de página com contador** (molde de Threat Intel: `role="tablist"` + `_marcarAba`): "Ativos (N)" · "Inativos (N)". A aba é um recorte anterior aos filtros: busca e filtros valem dentro dela, e trocar de aba volta para a 1ª página.
- **Inativo some de onde se escolhe e de onde se conta** (`_fornecedorAtivo`): listas de seleção (contrato, risco, processo BIA, DRP), catálogo de Dependências, lista de DRPs e métricas. O valor já gravado continua aparecendo no select, com "(inativo)".
- **Ativar/Inativar grava na hora**, com `confirmarAcao`, fora do Salvar do cadastro (`alterarSituacaoFornecedor` grava só a situação). Na aba Inativos é um ícone verde na coluna Ações; no drawer, uma barra no topo da aba Dados com o selo `_badgeAtivo` e o botão. Inativar com contrato vigente avisa quantos.
- **Importação por planilha = drawer de prévia agrupada**: escolher o CSV (UTF-8, com nova leitura em Windows-1252), mostrar chips de contagem (novos, já existem, a revisar), as colunas reconhecidas e uma tabela uma linha por item (Novo / Já existe + qual / ⚠ motivo), e só então "Importar N…". O que já existe não é importado nem alterado.
- **Dados de origem da planilha** ficam no registro como referência, num `<details>` "Dados importados" só leitura (aberto por padrão enquanto o item está inativo).

### Processo: status calculados, Homologar BIA e sugestão por IA (DECISÃO 27/10/2026)
- **Status de BIA, BCP e DRP são calculados**, nunca escolhidos: `ConformidadeContinuidade.statusDosPlanos(p, { tier, cadeia, ciclos, hoje })` (cópia idêntica em `functions/`). Os antigos selects `biaHomologada` / `bcpStatus` / `drpStatus` saíram da tela e deixaram de ser lidos e gravados (os dados ficam no Firestore). A mesma conta alimenta a faixa do drawer, a coluna "Planos" da grade, o detalhe só-leitura, o relatório por área, a "Cobertura Tier 1" do Dashboard e o Dossiê.
  - BIA: Não avaliado · Em avaliação (questionário parcial, "x de y") · Avaliado (falta homologar) · Homologado · Revisão vencida. Reavaliar depois de homologar volta a "Avaliado".
  - BCP: Sem PCN (falta no Tier 1/2; "não exigido" no Tier 3) · PCN vN · Revisão vencida.
  - DRP: Sem dependências · Sem DRP · Parcial x/y · Completo · Revisão vencida; detalhe com testes atrasados. Dependências removidas do catálogo não contam.
- **Selo de plano** (`.selo-plano`, `_htmlSeloPlano`): pílula "ícone SIGLA rótulo" com o detalhe no `title`; nível verde ok (●), laranja parcial/vencendo (◐), vermelho falta/vencido (○), cinza não exigido (–). No drawer do Processo os três ficam numa **faixa fixa entre o título e as abas** (`#processoSelosPlanos`), clicáveis (levam à aba) e atualizados ao vivo (questionário e dependências).
- **Homologar BIA**: único passo manual. Botão ghost verde "✔ Homologar BIA" no topo da aba BIA, só com o questionário completo e para `Perfis.podeHomologarBIA` (Admin, Segurança, Operador de Processos); grava `biaHomologacao = { em, por }`. O Gestor avalia, mas não homologa (regra do Firestore barra o gestor de mudar `biaHomologacao`). A Conformidade troca o antigo "Status divergente" por **"BIA a homologar"**.
- **Abas do Processo**: Identificação · BIA (ciclo + homologação, questionário com progresso "x de y respondidas", um único Score/Tier ao vivo, Descrição do Impacto, RTO/RPO/MTD, Dependências) · BCP (ciclo, PCN, equipe de crise, fornecedores, Levantamento PCN) · DRP. O link antigo `?aba=avaliacao` cai no BIA.
- **Sugestão por IA para revisar** (padrão novo): botão ghost verde "🤖 Sugerir com IA" ao lado do rótulo do campo, só para quem edita e com o registro salvo. A sugestão aparece numa **caixa tracejada verde** (`.sugestao-ia`) abaixo do campo — título "Sugestão da IA — revise antes de usar", o texto, "Usar este texto" (pede confirmação se o campo já tem texto diferente) e "Descartar", com a nota do que a IA usou. Nada é gravado até o Salvar. Componente: `_htmlBotaoSugerirIA` + `_sugerirTextoComIA` (app.js); servidor `sugerirTextoIA({ alvo, id, tipo })`, cada alvo confere o perfil de quem edita aquele campo, com regras anti-invenção no prompt. Onde existe (27/10/2026):
  - Processo → BIA → "Descrição do Impacto" (`sugerirImpactoProcesso`: questionário por dimensão, Serviços, cadeia técnica, fornecedores, instalações, levantamento do PCN, riscos abertos).
  - Processo → Identificação → "Descrição Funcional" (alvo `processo-funcional`: mesmos dados, sem notas nem riscos; quem edita o processo).
  - Serviço → "Descrição" (`servico-descricao`: composição, processos suportados + Tier, stakeholders; Admin/SI).
  - Registrar revisão → "Observação" (`revisao-observacao`: o que mudou desde a última revisão registrada — respostas do BIA, versões do PCN/DRP, testes; mesmo perfil de quem registra a revisão).
- **Sugestão por IA com checkboxes** (variante para listas): um botão "🤖 Sugerir parâmetros com IA" no topo da aba; a caixa `.sugestao-ia` agrupa os itens por lista (`.sugestao-ia__secao`, título em caixa alta) com um checkbox por item (`.sugestao-ia__item`), **todos marcados**; o que a lista já tem (gravado ou digitado na tela) não aparece. "Adicionar selecionados" só acrescenta nas listas da tela e mostra o toast "N itens adicionados — salve … para gravar"; "Descartar" fecha. Sem nada novo, a caixa diz "A IA não encontrou nada novo a sugerir" com só "Fechar". Hoje: Dependência → Parâmetros DRP (alvo `dependencia-drp`, as seis listas + Estratégias de teste; cenário só da lista fixa; Admin/SI/TI).
- **Salvar o Processo**: o questionário só vira resposta nova quando mudou; a atualização otimista mescla sobre o registro anterior; o RTO preenchido pela avaliação mostra "Sugerido pela avaliação do BIA — confirme ou ajuste" até alguém escolher outro (`rtoOrigem`).

### Cadastro sem duplicidade — Dependências, Fornecedores e Pessoas (DECISÃO 27/10/2026)
- Duplicado = **mesma categoria + mesmo nome normalizado** (sem acento, sem caixa, espaços colapsados). Pessoas só duplicam por **e-mail** igual (homônimos passam); Fornecedores também por **CNPJ**. Regra única em `public/dependencia-duplicidade.js` (`DependenciaDuplicidade.acharDuplicada`), usada pelos formulários e por `_salvarDependencia`.
- **No formulário**: aviso inline no campo (`_avisarCampo`, "Já existe "X" em <categoria>.") e **nada é gravado**. Na edição só vale se o nome/chave mudou — duplicata antiga não trava a edição de outros campos.
- **Na gravação** (`_salvarDependencia`): criar um igual **não grava e devolve o id existente** (`duplicado: true`), então os cadastros rápidos ("+ Novo X") vinculam o item que já existe; renomear para nome em uso retorna `{ success:false, duplicado:true }`.
