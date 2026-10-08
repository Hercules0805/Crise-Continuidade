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
"Processos por Dependência", `#drawerSelecaoDependenciasRelatorio`). Modal fica reservado
pra confirmações realmente mínimas de campo único. **Não é retroativo**: os modais já
existentes (Perguntas, Áreas, Config. de Respostas, Componentes, Indicadores, Organograma)
continuam como estão — não precisam ser convertidos só por causa desta decisão, só ao
serem tocados por outro motivo.
- **Modal** (`.modal-overlay`/`.modal`, centralizado, `max-width` 480-580px conforme o formulário): reservado pra confirmação/formulário de campo único bem pequeno. Antes desta decisão era o padrão pra qualquer entidade de tela única (Perguntas, Áreas, Config. de Respostas, Componentes, Indicadores) — esses continuam modal (ver acima), mas uma tela nova parecida não deveria mais virar modal por padrão.
- **Drawer** (`.drawer-overlay`/`.drawer`, painel lateral, largura padrão `70vw` — mas veja a nota de largura abaixo): padrão pra qualquer tela/painel novo, tenha ou não **abas internas** (Processo, Risco, Dependência — "Dados Gerais"/"DRP") ou uma sub-lista repetível embutida (mini-CRUD) — o critério de "só some com abas/mini-CRUD" valia antes da decisão acima e explica por que Fornecedores (mini-CRUD de "Pessoas associadas") e Pessoas (mini-CRUD de "Áreas") já eram drawer; agora nem precisa desse critério pra decidir, drawer já é o ponto de partida.
- **Largura do drawer**: o padrão de `.drawer` é `70vw` (pensado pra formulário com abas/multi-coluna, como Fornecedor/Processo/Risco/Dependência/Serviço/Backup). Para um drawer de **formulário simples de coluna única** (poucos campos, sem abas), sobrescreva com um `.drawer#idDoDrawer { width: NNNpx; }` em `styles.css` — ver `#drawerAvaliar` (`680px`) e `#drawerPessoa` (`480px`) — em vez de deixar no `70vw` padrão, que fica com espaço vazio sobrando. **DECISÃO 03/10/2026:** `#drawerServico` tinha um override de `520px` de quando era só um formulário simples; ao ganhar abas (Dados/Backups) e uma tabela na aba Backups, passou a precisar do `70vw` padrão — o override foi removido. Lição: mudar a forma de um drawer (formulário simples → abas/tabela) exige revisitar o override de largura, não só o conteúdo.
- **Sem `.drawer input`/`.drawer label` no CSS** (só existe `.modal input`/`.modal label`): todo formulário dentro de um drawer precisa do estilo de campo inline (ver seção "Formulários em modal/drawer" abaixo) — Fornecedor, Risco, Processo e Pessoas já seguem isso.
- **DECISÃO 05/10/2026 — Modal aberto DE DENTRO de um drawer já aberto** (ex.: `#modalEscolherTipoTeste`, pergunta "qual tipo de teste?" antes de "Gerar Roteiro de Teste", na aba Gestão de Testes da Dependência): `.modal-overlay` tem `z-index:100`, igual `.drawer-overlay`, mas **menor** que `.drawer` (`z-index:101`) — até agora nunca importava, porque modal e drawer eram sempre alternativas de tela cheia, nunca um dentro do outro. Um modal assim abre **atrás** do drawer (presente no DOM, clicável só se você soubesse onde clicar às cegas, mas invisível) — sintoma reportado como "cliquei e não aconteceu nada". Acrescente a classe `modal-sobre-drawer` (`styles.css`, `z-index:110`) no `.modal-overlay` desse modal sempre que ele for aberto a partir de dentro de um drawer.

### Abas (tabs)
Um único padrão de aba, usado (e que deve continuar sendo usado) em `trocarAbaProcesso`, `trocarAbaRisco` e `trocarAbaIndicadores`:
- Ativa: `color:var(--brand); border-bottom:3px solid var(--brand); font-weight:700;`
- Inativa: `color:#999; border-bottom:3px solid transparent;`
- Padding `10px 20px`, `font-size:0.88em`, faixa com `border-bottom:2px solid var(--brand-tint)`.
- Largura: `flex:1` (abas dividem o espaço) quando há muitas abas dentro de um drawer estreito; largura fixa quando são poucas abas (2-3) numa tela cheia — escolha conforme o espaço disponível, não é uma regra rígida.

### Tabela + paginação
- `.data-table`: cabeçalho `var(--brand)`/branco/uppercase, linha com hover `#f8f9fa`, 1ª coluna em negrito `var(--brand)`.
- **Ordenação**: use `criarOrdenacao(colunaInicial, direcaoInicial)` (`util.js`) em vez de montar `{coluna, direcao}` + `ordenarX()` na mão — é a fábrica que toda tela de grade usa hoje (Áreas, Pessoas, Dependências, Processos, Riscos, Fornecedores, Perfis, Categorias/Critérios de Fornecedor). Cabeçalho: `<th onclick="ordenarX('campo')">Rótulo <span id="sort-prefixo-campo"></span></th>`; depois de montar a lista, chame `estado.atualizarSetas('sort-prefixo-', ['campo1', 'campo2', ...])`. Para ordenar por um valor calculado ou com "nulo sempre por último" (score de Risco, nota de Fornecedor), passe um comparador em `aplicar(lista, {campo: (a, b, dir) => ...})` — `dir` já vem em `+1`/`-1`, o comparador só precisa aplicá-lo.
- **Clique na linha para editar**: `<tr style="cursor:pointer;" onclick="editarX(id)">`, com a célula de Ações usando `onclick="event.stopPropagation();"` ao redor dos botões, pra clicar num ícone não também disparar o clique da linha. Padrão obrigatório em toda grade nova com uma tela de edição 1-para-1 (ver Riscos como referência). Exceções conhecidas, não copiar sem entender o motivo: **Indicadores-Cadastro** (célula de Meta Mínima é editável inline e a coluna de checkbox de seleção em massa não tem `stopPropagation` — adicionar clique-na-linha ali sem tratar essas duas células primeiro abriria o modal por engano), **Indicadores-Matriz** (somente leitura, sem função de editar) e **Perguntas** (não é uma `<table>`, filtra escondendo/mostrando cards agrupados por categoria).
- **Layout de colunas (DECISÃO 08/10/2026, após sobreposição/palavras cortadas no Registro de Riscos)**:
  - **Larguras em px com `<colgroup>`** + `min-width` inline na `<table>` (soma das colunas) quando a grade tem muitas colunas (≥8) — o contêiner `.data-table` rola na horizontal. **Nunca** `width:N%` por `th` com soma ≠ 100% (Riscos tinha 119% e o navegador espremia tudo; várias grades antigas ainda somam 87–96%, não copiar). Dimensione a coluna pelo **conteúdo mais largo não quebrável** (chip de "Tier 2 (Essencial)", "Desenvolvimento P&D", data `dd/mm/aaaa`), não por proporção.
  - **Alinhamento na mesma classe em `th` e `td`**: `.col-c` (centro), `.col-r` (direita), `.col-nw` (sem quebra: datas, números, ações). Não alinhe só o `td` com `style` inline — o cabeçalho fica desalinhado da célula.
  - **Coluna de Ações fixa à direita**: `.col-sticky` em `th` e `td` (feito em Riscos e Processos) para continuar visível na rolagem horizontal.
  - **Variante compacta**: `.data-table--compact` (`td` 12px 10px, 13px) para grades largas.
  - **Chips/pills** (`.chip`, `.chip-status`, `.chip-area`) têm `max-width:100%` + `overflow:hidden` — nunca invadem a célula vizinha, mas o **texto é cortado** se a coluna for estreita; por isso a regra de dimensionar pelo conteúdo acima, e `title="..."` com o texto completo nos chips que podem truncar.
  - **Cabeçalhos**: `white-space:nowrap` + ellipsis, `letter-spacing:.08em` (não `.14em` do modelo v2: só cabe com colunas folgadas). **Proibido `overflow-wrap:anywhere` em `th`/`td`** — quebra no meio da palavra ("PROBA/B.", "Operacio/nal"). Prefira rótulos curtos com `title` completo (`Data`, `Prob.`, `Impacto R$`).
- **Paginação**: obrigatória para qualquer lista que possa passar de ~20-30 registros (ver implementação em Indicadores: `INDICADORES_POR_PAGINA`, rodapé "Mostrando X–Y de Z" + botões `‹ Anterior`/`Próxima ›` com `.btn-ghost`). Ao criar uma tela nova com potencial de crescer, adicione paginação desde o início nesse mesmo padrão — não espere virar um problema.

### Barra de filtros
Padrão único (label + input/select), usado em Processos/Dependências/Componentes/Riscos/Indicadores:
```
label: font-size:0.9em; font-weight:600; color:#555; margin-bottom:6px; display:block;
select/input: padding:8px 12px; border:1px solid #ddd; border-radius:7px; font-size:0.9em; min-width:180-300px conforme o campo;
input de busca: padding:8px 14px; border-radius:8px;
```

### Formulários em modal/drawer
Convenção recomendada para telas novas (a mesma usada em Processo/Risco/Dependência/Componente): label uppercase (ver seção Tipografia) + input `border:1.5px solid #e0e0e0; border-radius:7px; padding:9px 12px; font-size:0.93em;`, foco com `border-color:var(--brand)`.

### Listas editáveis dentro de modal/drawer
Duas famílias, conforme a forma do item:
- **Item com várias colunas** (Plano de Ação/KRIs do drawer de Risco, "Pessoas associadas" do drawer de Fornecedor): mini-formulário com um campo por coluna + botão "+ Adicionar", que vira "Salvar alteração" ao clicar no ícone de editar de uma linha (mesmo array em `window._algumaCoisa`, adiciona ou sobrescreve por índice, hidratado do registro ao abrir e devolvido inteiro no payload de salvar).
  - **DECISÃO 04/10/2026 — Jobs do Backup, variante "grava a cada item adicionado":** nos Jobs (agenda/horário/tipo/duração/destino/retenção), "+ Adicionar" não fica só em memória esperando o "Salvar" do drawer inteiro — chama `_gravarBackupAtual()` (mesma gravação do botão Salvar, mas sem fechar o drawer nem trocar de aba) assim que o item entra no array local. Use essa variante quando os itens da lista forem relevantes o bastante pra não arriscar perdê-los se o usuário fechar o drawer sem clicar em "Salvar", ou quando outras telas forem referenciar o item individualmente no futuro (ver próximo ponto) — senão, a variante padrão (só em memória até o Salvar geral) é mais simples e continua sendo o default.
  - **Nome derivado dos metadados** (mesmo caso dos Jobs): quando um item da lista vai ser referenciado por nome em outras telas mas não tem um campo "Nome" digitável óbvio, gere o nome a partir dos próprios campos (`_nomearJob(dados)`: `Nome do Backup · Tipo · Agenda · Horário` — inclui o nome do registro dono quando a lista é só dele, pra identificar o item sozinho em outra tela sem precisar mostrar o dono junto) toda vez que o item for salvo — nunca deixe o usuário digitar um nome solto que pode divergir dos metadados reais. Itens salvos antes dessa decisão não têm o campo; exiba com fallback (`j.nome || _descreverAgendaJob(j.agenda)`) em vez de herdar/migrar.
- **Item de texto livre, um campo só** (as 4 listas da aba DRP de Dependência — Health Check, Runbook, Critérios de Retorno, Limitações): mesma ideia acima, simplificada — uma caixa de texto + "+ Adicionar", sem mini-formulário de várias colunas. Ganha também **chips de sugestão** clicáveis acima da caixa (exemplos prontos que preenchem o campo pra revisar antes de adicionar, em vez de adicionar direto) sempre que a tela tiver uma referência natural de "exemplos de bom preenchimento" pra oferecer — é o padrão pra "guiar com opções" em vez de caixa de texto em branco. Ver `renderDrpLista`/`adicionarDrpItem`/`editarDrpItem`/`removerDrpItem`/`moverDrpItem` em `app.js` como implementação de referência, incluindo os botões ▲/▼ de reordenar (só fazem sentido quando a ordem dos itens importa, como no Runbook — não é obrigatório em toda lista deste tipo).
- **Cartão único selecionável, com descrição** (Estratégia de Backup da Dependência): mesmo visual de cartão/chip acima (borda arredondada, fundo claro), mas pra um valor só, não uma lista — clicar destaca/desmarca o cartão (como um rádio-button), com uma frase curta abaixo do nome explicando o que aquela opção significa. Use quando as opções de um campo fechado (que hoje seria um `<select>`) se beneficiam de uma explicação visível, em vez de aparecer só como texto num dropdown. Ver `renderEstrategiaChips`/`selecionarEstrategiaDep` em `app.js`.
- **Seleção simples de um catálogo já existente, sem digitação** (Áreas da Pessoa): quando o item vem inteiro de outra coleção (nome já pronto, nada pra preencher), o `<select>` adiciona direto no `onchange`, sem um botão "+ Adicionar" ao lado — um passo a menos que o padrão de "item com várias colunas" acima, que existe justamente porque ali há campos de texto pra digitar antes de confirmar. Ver `adicionarPessoaArea`/`_popularSelectAreaPessoaAdd` em `app.js`. Use este padrão mais simples quando o valor adicionado é só um nome escolhido de uma lista pronta; use o `<select>` + botão quando há mais de um campo pra preencher antes de adicionar (ex.: Gestor do Contrato, que herda campos da Pessoa escolhida mas ainda pede confirmação).
- **Lista de documentos gerados por IA, versionados, EDITÁVEIS** (Roteiro de Teste, aba "Gestão de Testes" da Dependência): diferente das 4 famílias acima, aqui o usuário não digita nada pra CRIAR — um botão "🤖 Gerar X" (ghost verde, mesmo estilo de "🤖 Gerar DRP") dispara uma Cloud Function que usa outro artefato já gerado (o DRP) como contexto, grava numa coleção fechada própria (nunca a mesma do artefato-base) e versiona por uma chave extra quando o documento pode se repetir por "tipo" (aqui: categoria/tipo de teste) — gerar de novo a MESMA chave acrescenta versão, nunca sobrescreve. A tabela mostra só a versão mais recente de cada chave, com "🔗 Abrir" e "🗑️ Excluir" (apaga todas as versões daquela chave). Quando há mais de uma chave candidata, uma escolha pequena por modal (`_htmlModalEscolherTipoTeste`, molde de `_htmlModalImportarRiscosPCN`) pergunta qual, antes de gerar. **DECISÃO 07/10/2026**: o popup de "Abrir" (`window.open`+`document.write`) virou **editável**, mesmo mecanismo de `_buildDRPPage`/`_buildPCNPage` — `<div contenteditable="true">` + botão "💾 Salvar versão" que `fetch` direto na Cloud Function `appApi` com um ID token Firebase embutido no HTML (`_tokenParaPCN()`), porque o popup é um documento separado sem acesso ao SDK da janela principal; salvar uma edição acrescenta versão nova, igual ao "Gerar" — nunca sobrescreve, e trocar de versão no seletor não avisa sobre edição não salva (mesmo risco aceito do DRP/PCN). Referência: `gerarRoteiroTeste`/`salvarRoteiroTeste`/`obterRoteiroTeste`/`excluirRoteiroTeste` em `appLogic.js`; `window.gerarRoteiroTeste`/`_buildRoteiroTestePage`/`salvarVersaoRoteiroTeste` em `app.js`.

### Toasts (`showToast(mensagem, cor)`)
Não existe uma API por nome de severidade — a cor é passada como hex literal em cada chamada. Use sempre uma destas (não invente uma nova):
| Tipo de mensagem | Cor |
|---|---|
| Sucesso (salvo, excluído) | `#2e7d32` |
| Erro | `#c62828` |
| Validação (campo obrigatório faltando) | `#e65100` |
| Em andamento ("Salvando...", "Gerando...") | `#d60014` ou `#1565c0` |
| Confirmação neutra (ex. exclusão já efetivada) | `#555` |

### Botão com estado de carregando (`comBotaoCarregando(botao, fnAsync)`)
Toda ação "Salvar" assíncrona usa este helper (`util.js`) em vez de desabilitar o botão na mão: ele desabilita o botão, liga a classe `.btn-loading` (spinner via `::after`, já existe em `styles.css`), roda `fnAsync`, e SEMPRE restaura o botão no final — inclusive se `fnAsync` jogar erro. Quem chama continua dono do próprio try/catch e do toast de sucesso/erro:
```js
window.salvarX = async () => {
  // ...validação síncrona antes...
  await comBotaoCarregando('btnSalvarX', async () => {
    try {
      await API.salvarX(...);
      showToast('✅ Salvo!', '#2e7d32');
    } catch (e) {
      showToast('❌ ' + (e.message || 'Não foi possível salvar.'), '#c62828');
    }
  });
};
```
O botão precisa de um `id` estável (ou passe o próprio elemento em vez do id). Não usar mais o padrão antigo de trocar `innerHTML` para "⏳ Salvando..." — o spinner já é feedback suficiente, e o texto do botão não deveria mudar de largura no meio do fluxo.
**Exceção conhecida, não copiar sem entender o motivo**: os saves de Processo e de Dependências (`salvarProcesso`/`salvarDep`) usam um padrão **otimista** (atualizam a grade imediatamente, antes do `await` terminar, com toast "Salvando..." e reversão em caso de erro) — isso já resolve o problema de feedback de um jeito diferente e não deve ser forçado para `comBotaoCarregando`, que pressupõe manter o formulário aberto até o fim do save. Continuam **sem fechar o drawer** (ver seção abaixo), só o botão fica desabilitado até a gravação real terminar, em vez de reabilitar na hora (único jeito de não deixar um clique duplo criar dois registros, já que o drawer não desaparece mais pra impedir isso sozinho).

### Rodapé do drawer: "Fechar" + "Salvar" (aplicar sem fechar)
**DECISÃO 06/10/2026**: todo drawer de edição de UM registro (tenha ou não abas internas — Vulnerabilidade, Dependência, Processo, Risco, Fornecedor, Serviço, Backup, Pessoa) usa rodapé **"Fechar"** (`.btn-ghost`, só fecha, não grava nada) + **"Salvar"** (`.btn-primary`, grava **sem fechar** — dá pra clicar de novo depois de trocar de aba, sem perder o que já foi preenchido). Antes disso "Salvar" gravava E fechava num só clique; o precedente que já funcionava assim era o drawer de Risco (`salvarRisco`), generalizado pra todo o sistema nesta decisão.
- **Reconciliação de id**: ao CRIAR (sem id ainda), depois do `await` bem-sucedido, grava `result.id` de volta no campo oculto (`#xId`) e atualiza o título do drawer de "Novo X" pra "Editar X" — sem isso, um segundo clique em "Salvar" criaria um registro duplicado em vez de editar o mesmo. Receita idêntica em todos os 7 drawers (ver `salvarRisco`, `app.js:8022`, como referência mais simples; `salvarDep`/`salvarProcesso` são as versões mais elaboradas, por causa do padrão otimista).
- **Exceção — cadastro rápido aninhado** (ex.: "+ Novo Servidor" dentro do Backup, "+ Novo Serviço" dentro do Backup): um drawer aberto POR CIMA de outro (mecanismo `_esconderDrawerPaiTemporariamente()`/`window._drawerPaiEmpilhados`, `app.js:~5611`) **continua fechando e devolvendo pro pai** ao salvar — é um "escolha ou crie rapidinho e volte", não uma edição de registro pra ficar aberta. Detectado via `_temDrawerPaiEmpilhado()` (`app.js:~5679`) nos drawers que podem ser aninhados (Pessoa, Serviço, Backup); Dependência usa os flags mais específicos que já existiam pra isso (`veioDoBackup`/`veioDoServico`), com o mesmo efeito.
- **Fora deste padrão** (não são "um registro com abas pra continuar depois"): `#drawerProcessosLote` (edição em lote de N processos — já se chama "Aplicar", mas é uma ação em massa, não um registro único) e o modal "Avaliar Processo" (questionário BIA de 1 seção só, sem abas, que recarrega a grade de Processos ao salvar).

### Máscaras de entrada (`formatarCNPJ(valor)` / `formatarTelefoneBR(valor)`)
Primeiras máscaras do sistema (`util.js`), usadas em Fornecedores (CNPJ e Telefone). Convenção: `oninput="this.value=formatarX(this.value)"` no próprio `<input>`, e formatar **também ao abrir o formulário** (não só ao digitar), pra dado antigo sem máscara mostrar formatado assim que a tela abre — ex. `document.getElementById('fornCadCnpj').value = formatarCNPJ(f ? (f.cnpj || '') : '');`. Sem preservação de cursor no meio do texto (aceitável pra campo curto digitado do início pro fim); se surgir uma nova máscara (CPF, moeda), siga o mesmo formato de função pura em `util.js`.

### Marca do sistema em documentos gerados (relatórios, dossiês, PCN, DRP)
Todo documento autônomo que o sistema gera (aberto via `window.open('', '_blank')` +
`document.write`/template literal — Organograma, "Processos por Dependência", Dossiê do
Processo, visualizadores de PCN e DRP) leva a logo real da Fortes Tecnologia no
cabeçalho, não só o nome em texto:
```html
<img src="https://bia-forte-2025.web.app/logo_fortes.png" style="height:40px;margin-bottom:4px;display:block;" alt="Fortes Tecnologia" onerror="this.style.display='none'">
<div style="font-size:0.72em;color:#d60014;font-weight:700;letter-spacing:0.3px;margin-bottom:8px;">GRC360 · Governança, Riscos e Conformidade</div>
```
- **URL sempre absoluta** (`https://bia-forte-2025.web.app/...`), nunca relativa — esses
  documentos abrem com base `about:blank`, um caminho relativo dá 404. A URL continua
  com "bia" porque é o hosting/domínio do Firebase (infra, fora do escopo do rebrand
  visual — ver DECISÃO 04/10/2026 no topo da seção de cores).
- **Sempre com `onerror` escondendo a própria tag** — no ambiente sem acesso ao domínio
  (teste local/offline), o relatório continua funcionando, só sem a imagem.
- **A linha "GRC360 · Governança, Riscos e Conformidade" logo abaixo da logo é
  obrigatória** — o nome do sistema, não só a marca da Fortes Tecnologia (mesmo texto
  do `.nav-brand` em `index.html`, só que em linha única em vez de duas). Fica entre a
  logo e o `h1` do próprio documento (que é o título do relatório em si, ex.
  "Processos por Dependência" — não confundir os dois: um é "quem gerou", o outro é "o
  que é"). **DECISÃO 04/10/2026**: era "BIA · Business Impact Analysis"; renomeado
  junto com o rebrand GRC360, mas o padrão (logo + nome do sistema + título do
  relatório) continua o mesmo.
- Acompanha um cabeçalho com título (`h1`, `--brand`) + linha de subtítulo (contagem/
  data + "Fortes Tecnologia") + botão "🖨️ Imprimir / PDF" quando o documento for pra
  impressão (ver `.org-header`/`.header` em Organograma e "Processos por Dependência",
  `app.js`, e o mesmo padrão replicado no Dossiê do Processo).
- PCN/DRP (`_buildPCNPage`/`_buildDRPPage`) já seguiam isso desde antes, com um
  cabeçalho próprio em faixa (`.cover`, gradiente `--brand`→`--brand-vivid`) — não
  precisou mudar de estrutura, só a cor (ver DECISÃO 04/10/2026 acima).
- **Relatórios abertos em janela separada (`window.open`) não herdam `tokens.css`**:
  se o relatório usa uma cor que vem de um módulo que devolve `var(--risk-*)`
  (`Criticidade.corDoTier` etc.), o `<style>` embutido do próprio relatório precisa de
  um `:root{--risk-critical:...}` de fallback (ver Dossiê do Processo e "Processos por
  Dependência" em `app.js` como referência) — sem isso a variável não resolve nesse
  documento separado.

### Skeleton loading
`.skeleton`/`.skeleton-row` (efeito shimmer) — usado hoje só em Perguntas e no carregamento de PCN. Para telas novas, o padrão mais simples e já dominante é o texto `<div class="loading">⏳ Carregando...</div>`; use skeleton só se a tela tiver uma tabela grande onde o "pulo" de conteúdo incomodaria.

### Navegação
`.nav`/`.nav-group`/`.nav-dropdown` (definidos em `styles.css`, markup em `index.html`). Uma tela nova entra como item dentro de um dos grupos existentes (Continuidade de Negócio, Riscos, Indicadores, Fornecedores, Administração) — evite criar um grupo novo sem necessidade clara. O grupo "Cadastros" foi extinto: Perguntas/Áreas/Pessoas/Dependências entraram em Continuidade de Negócio. Os subitens de cada grupo ficam em **ordem alfabética** (exceto quando uma ordem diferente for pedida explicitamente) — ao adicionar um item novo, insira na posição alfabética certa, não no fim da lista.

**DECISÃO 02/10/2026, revista 03/10 e 04/10/2026 — grupo "Serviços":** pedido explícito do usuário ("quero que Serviços seja uma das opções principais do menu"). Já foi grupo-dropdown com `Backups`+`Serviços` → virou link solto quando Backup perdeu a tela própria (03/10) → voltou a ser grupo-dropdown com `Catálogo do Backup`+`Serviços` (ordem alfabética) quando Backup recuperou a tela própria (04/10, ver "Backup volta a ser tela própria" abaixo). Fica depois de "Fornecedores" e antes de "Administração". Posse RBAC restrita a Admin + Segurança da Informação (nem TI nem Gestor veem este grupo) — ver `firebase-app/public/perfis.js`.

**DECISÃO 07/10/2026 — Busca de telas no menu (`.nav-busca`):** campo de busca
no canto direito do nav (entre os grupos-dropdown e o avatar do usuário),
pedido explícito pra achar uma tela sem precisar saber em qual grupo ela
está. Implementação em `index.html` (HTML + JS no mesmo `<script>` inline
que já faz o hide-by-permissão do menu — não em `app.js`, que é conteúdo de
página, não chrome do nav). Ponto central do desenho: a busca **lê os
próprios `.nav-link[data-page]` já renderizados e já filtrados por
permissão** (`el.style.display !== 'none'`), em vez de manter uma lista
própria de telas — qualquer item novo no menu já entra na busca de graça,
sem precisar lembrar de atualizar dois lugares. Resultado: lista
`position:absolute` abaixo do input (fundo branco, `z-index:65` — acima do
`.nav-dropdown` normal (60) e do próprio `.nav` (50), mas abaixo de
`.modal-overlay`/`.drawer`/`.modal-sobre-drawer` (100+), que são overlays de
tela cheia e não competem com o cabeçalho). Navegar é só
`location.hash = '#' + page` — o `hashchange`/`route()` que já existe faz o
resto, inclusive reconfirmar permissão. Busca normaliza acento (NFD +
filtro de diacríticos por faixa de código, não por `\uXXXX` num regex
literal — essa sintaxe de escape é frágil de preservar passando por
camadas de ferramenta/edição; comparar `codePointAt` contra `0x0300`/`0x036f`
não tem essa ambiguidade). Use este mesmo padrão (ler o DOM já filtrado, não
duplicar lista) se outro campo de busca global for criado no futuro.

### Ícones
**Convenção para telas novas: SVG inline, não emoji**, para ações de linha de tabela (editar/excluir) — copie o par de ícones já usado em Áreas/Processos/Dependências/Componentes/Riscos/Indicadores (lápis laranja `#ff6b35` + lixeira cinza `#999`). Emoji continuam aceitáveis em: texto de botão/cabeçalho (📥 Importar, 📁 pasta, 🔍 placeholder de busca) e prefixo de toast (✅/❌/⏳) — isso já é consistente em toda a base.

### Cadastro rápido de uma entidade referenciada (select ou multi-seletor)
**DECISÃO 02/10/2026:** quando um campo referencia outra entidade (select de Serviço/Pessoa, multi-seletor por categoria de Dependências, etc.) e o registro que falta ainda não existe, o padrão é abrir o **cadastro completo de verdade** dessa entidade (o mesmo drawer que a tela própria usa — nunca um mini-formulário paralelo, que divergiria com o tempo), empilhado por cima do formulário atual. O drawer de origem fica **oculto, não destruído** (`classList.remove('open')`, sem apagar nada do que já foi preenchido) e reaparece assim que o cadastro empilhado fecha — salvando ou cancelando — com o registro novo já selecionado/adicionado. Referência de implementação: `firebase-app/public/app.js`, helper genérico `_esconderDrawerPaiTemporariamente(idDrawer, idOverlay)`/`_reabrirDrawerPaiSeEscondido()` (guarda uma **pilha** de drawers escondidos, não um slot só — necessário porque dá pra empilhar mais de um nível, ex.: Serviço escondido → Backup aberto → Pessoa aberta por cima do Backup; um slot único perderia o registro do Serviço) usado pelo drawer de Backup (Serviço/Pessoa/Dependência: `abrirDrawerServicoDeBackup`/`abrirModalPessoaDeBackup`/`abrirDrawerDependenciaDeBackup`) e pelo de Serviço (Dependência: `abrirDrawerDependenciaDeServico`). Dois cuidados que valem para qualquer entidade nova:
- A função de salvar do drawer empilhado não pode assumir que está sempre na própria tela (ex.: recarregar uma grade que só existe lá) — qualquer `render*()`/refresh de tela precisa ser guardado com `if (document.getElementById('idDaGradeDaTelaPropria')) ...`.
- Se o cadastro empilhado usa um fluxo otimista (atualiza a UI com um id temporário antes da gravação real confirmar), o registro novo só deve ser vinculado ao formulário de origem com o **id real**, nunca o temporário — é o mesmo cuidado que evitou a "referência fantasma" corrigida em 24/09/2026 (fusão de Componentes do Serviço em Dependências).

**DECISÃO 03/10/2026, revertida 04/10/2026 — Backup volta a ser tela própria:** por 1 rodada, Backup não teve tela/menu próprio (só existia dentro da aba "Backups" do Serviço dono, sem campo "Serviço" no formulário). Pedido explícito: tela própria de novo, "Catálogo do Backup", seguindo o padrão da tela Fornecedores (busca, grade, ordenação, edição por clique na linha) — ver `catalogoBackup()`/`renderizarCatalogoBackup()` em `app.js`, rota `#catalogo-backup`. O campo "Serviço" voltou ao formulário de Backup (select + "+ Novo", igual Servidor/Stakeholder — `abrirDrawerServico` costuma vazar o id de contexto quando aberto a partir de um filtro já escolhido na grade). A aba "Backups" do drawer de Serviço não desapareceu, mas virou **só consulta** (`_renderServicoBackupsTab`, sem editar/excluir ali) — clicar leva pro Catálogo já filtrado por aquele serviço (`#catalogo-backup?servico=ID`, deep-link tratado em `route()`, mesmo padrão de retry do `#drp?abrir=ID`) — mesmo espírito do link "Gerenciar em Fornecedores" já usado em Dependências: um único lugar edita de verdade, a entidade dona só consulta.

**DECISÃO 04/10/2026 — campo Servidor do Backup: de multi-seletor por categoria pra 1 select só:** o campo "Servidor" tinha o mesmo componente de chips agrupados por categoria do seletor "Dependências do Serviço" (várias Dependências técnicas, 7 categorias). Pedido explícito: só **1** Dependência por backup, igual Stakeholder — virou `<select id="backupServidor">` + "+ Novo" (`_popularSelectBackupServidor`, mesmo molde de `_popularSelectBackupStakeholder`). Dado antigo (`servidorItens[]`, array) continua só **lido** (nunca mais gravado) pra migrar não-destrutivamente: ao abrir um backup legado sem `servidorId`, cai no primeiro item do array antigo em vez de aparecer vazio.

**DECISÃO 04/10/2026 (refinamento) — select de Servidor só lista a categoria técnica "Servidor":** o select acima listava as 7 categorias técnicas juntas (com a categoria como sufixo pra desambiguar). Pedido explícito: só itens da própria categoria "Servidor" (uma das 7 de `DEPENDENCIA_CATEGORIAS_TECNICAS`) ficam disponíveis — sufixo de categoria removido (ficaria sempre repetindo "— Servidor"). O "+ Novo" pré-preenche a Categoria do formulário de Dependência com "Servidor", já que é a única que faz sentido nesse contexto.

## 5. Divergências conhecidas (não corrigidas nesta rodada — cuidado ao copiar o "padrão errado")

Estas inconsistências existem hoje no código e são conhecidas; normalizar aos poucos, ao tocar em cada tela — não foram corrigidas de uma vez por exigirem mudança em muitos pontos sem verificação visual disponível neste ambiente:

- **5 tons de cinza quase idênticos** (`#888`, `#999`, `#666`, `#555`, mais `#757575`) usados de forma intercambiável para "texto secundário" dependendo de qual tela foi escrita quando. Ao criar algo novo, prefira `#888`.
- **3 estilos de label diferentes** em modais/drawers (uppercase 0.78em/700, `.modal label` simples 0.82em/600 sem uppercase, e a variante própria de `bia-dependencias.html`). Ao criar algo novo, use o uppercase (seção 3).
- **Páginas públicas standalone** (`bia-dependencias.html`, `drp-componentes.html`, `pcn-levantamento.html`, `cadastrar-areas.html`, `login.html`, `pcn-viewer.html`) **não carregam `styles.css`** — têm CSS 100% próprio, incluindo uma classe `.btn-primary` com valores diferentes da do app principal. Elas concordam no essencial (cores de marca, verde/vermelho de sucesso/erro), mas os componentes (botões, cards, chips) são implementações paralelas. Não migrar isso "de graça" — é um projeto à parte.
- **Badges/pills com padding/radius levemente diferentes entre telas** (ex. `padding:4px 10px` vs `4px 12px` para o mesmo tipo de badge de tier/status). Ao criar um badge novo, use o template da seção 4 (Badges/Pills).
- **Perguntas e Config. de Respostas** ainda usam emoji (✏️/🗑️) em vez de SVG para editar/excluir — telas mais antigas, pré-datam a convenção de ícone SVG. Não é para ser copiado em telas novas.
- **Colisão de `id="modal"`** entre Perguntas e Áreas — as duas telas usam literalmente o mesmo id pro modal (e `#modalTitulo`/`#fId`/`fecharModal()` em comum). Inofensivo hoje porque a navegação recria `app.innerHTML` inteiro a cada troca de tela (só uma delas fica montada no DOM por vez), mas frágil pra qualquer mudança futura que monte mais de um painel ao mesmo tempo. Não copiar esse padrão em tela nova — dê um id próprio ao modal.
