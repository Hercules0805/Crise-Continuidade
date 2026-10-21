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
- **Item com várias colunas** (Plano de Ação/KRIs do drawer de Risco, "Contatos associados" do drawer de Fornecedor): mini-formulário com um campo por coluna + botão "+ Adicionar", que vira "Salvar alteração" ao clicar no ícone de editar de uma linha (mesmo array em `window._algumaCoisa`, adiciona ou sobrescreve por índice, hidratado do registro ao abrir e devolvido inteiro no payload de salvar).
  - **Variante "muitos campos num drawer estreito"** (Canais de suporte do Fornecedor, DECISÃO 09/10/2026 — tipo, contato, horário, nível, SLA, observação): o mini-formulário quebra em 3 linhas de grid, e a lista mostra cada item em **duas linhas** em vez de 6 colunas — 1ª linha "**Tipo · Nível**" + contato, 2ª linha cinza "Horário · SLA · Observação". Contato só vira link se começar com `http(s)://` (nunca `javascript:` etc.). Editar/remover só aparecem para quem pode mexer. Valor antigo fora da lista fechada vira opção extra ao editar, em vez de sumir. Ver `renderCanaisSuporteFornecedor`/`adicionarCanalFornecedor` em `app.js`.
  - **DECISÃO 04/10/2026 — Jobs do Backup, variante "grava a cada item adicionado":** nos Jobs (agenda/horário/tipo/duração/destino/retenção), "+ Adicionar" não fica só em memória esperando o "Salvar" do drawer inteiro — chama `_gravarBackupAtual()` (mesma gravação do botão Salvar, mas sem fechar o drawer nem trocar de aba) assim que o item entra no array local. Use essa variante quando os itens da lista forem relevantes o bastante pra não arriscar perdê-los se o usuário fechar o drawer sem clicar em "Salvar", ou quando outras telas forem referenciar o item individualmente no futuro (ver próximo ponto) — senão, a variante padrão (só em memória até o Salvar geral) é mais simples e continua sendo o default.
  - **Nome derivado dos metadados** (mesmo caso dos Jobs): quando um item da lista vai ser referenciado por nome em outras telas mas não tem um campo "Nome" digitável óbvio, gere o nome a partir dos próprios campos (`_nomearJob(dados)`: `Nome do Backup · Tipo · Agenda · Horário` — inclui o nome do registro dono quando a lista é só dele, pra identificar o item sozinho em outra tela sem precisar mostrar o dono junto) toda vez que o item for salvo — nunca deixe o usuário digitar um nome solto que pode divergir dos metadados reais. Itens salvos antes dessa decisão não têm o campo; exiba com fallback (`j.nome || _descreverAgendaJob(j.agenda)`) em vez de herdar/migrar.
- **Item de texto livre, um campo só** (as 4 listas da aba DRP de Dependência — Health Check, Runbook, Critérios de Retorno, Limitações): mesma ideia acima, simplificada — uma caixa de texto + "+ Adicionar", sem mini-formulário de várias colunas. Ganha também **chips de sugestão** clicáveis acima da caixa (exemplos prontos que preenchem o campo pra revisar antes de adicionar, em vez de adicionar direto) sempre que a tela tiver uma referência natural de "exemplos de bom preenchimento" pra oferecer — é o padrão pra "guiar com opções" em vez de caixa de texto em branco. Ver `renderDrpLista`/`adicionarDrpItem`/`editarDrpItem`/`removerDrpItem`/`moverDrpItem` em `app.js` como implementação de referência, incluindo os botões ▲/▼ de reordenar (só fazem sentido quando a ordem dos itens importa, como no Runbook — não é obrigatório em toda lista deste tipo).
- **Cartão único selecionável, com descrição** (Estratégia de Backup da Dependência): mesmo visual de cartão/chip acima (borda arredondada, fundo claro), mas pra um valor só, não uma lista — clicar destaca/desmarca o cartão (como um rádio-button), com uma frase curta abaixo do nome explicando o que aquela opção significa. Use quando as opções de um campo fechado (que hoje seria um `<select>`) se beneficiam de uma explicação visível, em vez de aparecer só como texto num dropdown. Ver `renderEstrategiaChips`/`selecionarEstrategiaDep` em `app.js`.
  - **Questionário de várias perguntas com o mesmo cartão** (aba Severidade da Vulnerabilidade, DECISÃO 13/10/2026): uma pergunta por linha (título em negrito 0.88em), opções lado a lado em cartões (`flex:1 1 150px`), subtítulo cinza em caixa alta separando grupos de perguntas, e uma linha de resultado ao vivo logo abaixo ("Faltam N critérios" enquanto incompleto). Ver `_cartaoCriterioVuln`/`_renderCriteriosCvssVuln` em `app.js`. **Regra da Severidade**: os critérios gravam nos MESMOS campos de sempre (`cvss`, `severidadeManual`) — faixas, risco automático e grade não mudam. CVSS 3.1 guiado (8 métricas oficiais em português, cálculo e vetor em `public/cvss31.js`, testado contra notas do NVD); com as 8 respondidas o campo CVSS fica só-leitura com a nota calculada; desmarcar limpa a nota; "Colar vetor" aceita CVSS 3.1/3.0 de relatório; avaliação pela metade é gravada como vetor parcial (`cvssVetor`) e volta marcada. Sem CVSS: matriz impacto × facilidade (`Cvss31.sugerirSeveridade`) **sugere** a severidade manual, que continua editável (`severidadeCriterios` guarda as respostas).
  - **Responsável de Vulnerabilidade = Pessoas; Equipe = área da pessoa, editável** (aba Correção, DECISÃO 13/10/2026): "Responsável" é `<select>` do cadastro de Pessoas (+ 🔄 e "👤 Gerenciar Pessoas", como o Gestor do Contrato do Fornecedor) e "Equipe responsável" é `<select>` das Áreas. Escolher a pessoa preenche a equipe com a área principal dela (`_areasDaPessoa(p)[0]`); pessoa com várias áreas mostra as outras na dica; pessoa sem área não apaga a equipe e avisa; trocar só a equipe não mexe na pessoa. Ao abrir um registro nada é recalculado. Valor antigo que não está no cadastro vira opção extra "(não cadastrado como pessoa)" / "(fora do cadastro de áreas)" — mesmo padrão do Risco, nada some. Continuam strings (`responsavel`, `equipeResponsavel`). Ver `_popularSelectResponsavelVuln`/`_equipePelaPessoaVuln` em `app.js`.
  - **Liderança em produtos na Pessoa + catálogo de Produtos de Software** (DECISÃO 14/10/2026): o drawer de Pessoa ganhou o bloco "Liderança em produtos" (entre Líder Imediato e Telefone) — checkboxes **Tech Lead** e **Team Lead**; ao marcar uma função aparecem chips selecionáveis (mesmo visual de `renderEstrategiaChips`) com os produtos **ativos**, multi-seleção, **cada função com os seus produtos**; marcar a função sem produto é permitido; desmarcar limpa os produtos dela; produto desativado/removido que a pessoa já tinha continua visível e marcado como "(inativo)" / "(removido)" (nada some em silêncio). Estado em `window._pessoaLideranca` (entra no `_coletarFormularioPessoa`, então o "Fechar só grava se mudou" enxerga). Campos no documento da Pessoa: `techLead`, `techLeadProdutos`, `teamLead`, `teamLeadProdutos` (ids de `produtos_software`, **vínculo por id**: renomear produto não orfaniza ninguém); `_salvarDependencia` só grava esses campos quando vierem no payload (mesma guarda de `canaisSuporte`), para Fornecedor/Dependência não zerarem a liderança. Grade de Pessoas: coluna "Liderança" + filtro de função. O catálogo mora em **Administração → Produtos de Software** (`produtosSoftware()` em `app.js`, molde de Categorias de Fornecedor: modal, Ativo/Inativo, **desativar em vez de excluir**, excluir avisa quantas pessoas estão associadas, nome duplicado recusado sem diferenciar acento/maiúscula), com colunas Tech Lead e Team Lead de cada produto. Acesso: Admin e Segurança escrevem (`Perfis.podeGerenciarProdutosSoftware`, regra `produtos_software`), qualquer usuário do domínio lê. Carga inicial: `functions/scripts/seed-produtos-software.js` (idempotente).
  - **Produto de Software + Ativo afetado na Vulnerabilidade** (DECISÃO 14/10/2026): a aba Identificação tem **"Produto de Software"** (`<select>` dos produtos **ativos** do catálogo Produtos de Software, + 🔄 e "🗂️ Gerenciar Produtos", vínculo por id em `produtoSoftwareId`; produto vinculado que foi desativado/removido continua visível como "(inativo)"/"(removido)") e **"Ativo afetado"** (o antigo campo de texto "Produto", que continua se chamando `produto` no banco — só o rótulo mudou; guarda servidor, estação, aplicação ou componente: ".NET", "Área Restrita"). **Basta um dos dois** ao salvar. Escolher o produto **sugere** o Responsável pelo Tech Lead dele (`_sugerirResponsavelPeloProdutoVuln`): exatamente 1 Tech Lead e Responsável vazio → preenche a pessoa (a Equipe vem da área dela); vários → só lista na dica; nenhum → avisa; **nunca sobrescreve** escolha já feita e nada é recalculado ao abrir. Grade: a coluna "Produto" mostra o nome do produto vinculado (acompanha renomeações do catálogo) e, em cinza, "Ativo: …" quando difere; sem vínculo mostra o texto antigo; filtro, busca e ordenação usam esse nome. O título do risco automático passa a trazer o produto: `em <Produto de Software> / <Ativo afetado>` (sem repetir nomes iguais). Registros antigos: `functions/scripts/vincular-produtos-vulnerabilidades.js` liga só o que bate exatamente com o catálogo — o resto é ligado à mão na tela, sem adivinhar por semelhança.
- **Seleção simples de um catálogo já existente, sem digitação** (Áreas da Pessoa): quando o item vem inteiro de outra coleção (nome já pronto, nada pra preencher), o `<select>` adiciona direto no `onchange`, sem um botão "+ Adicionar" ao lado — um passo a menos que o padrão de "item com várias colunas" acima, que existe justamente porque ali há campos de texto pra digitar antes de confirmar. Ver `adicionarPessoaArea`/`_popularSelectAreaPessoaAdd` em `app.js`. Use este padrão mais simples quando o valor adicionado é só um nome escolhido de uma lista pronta; use o `<select>` + botão quando há mais de um campo pra preencher antes de adicionar (ex.: Gestor do Contrato, que herda campos da Pessoa escolhida mas ainda pede confirmação).
- **Lista de documentos gerados por IA, versionados, EDITÁVEIS** (Roteiro de Teste, aba "Gestão de Testes" da Dependência): diferente das 4 famílias acima, aqui o usuário não digita nada pra CRIAR — um botão "🤖 Gerar X" (ghost verde, mesmo estilo de "🤖 Gerar DRP") dispara uma Cloud Function que usa outro artefato já gerado (o DRP) como contexto, grava numa coleção fechada própria (nunca a mesma do artefato-base) e versiona por uma chave extra quando o documento pode se repetir por "tipo" (aqui: categoria/tipo de teste) — gerar de novo a MESMA chave acrescenta versão, nunca sobrescreve. A tabela mostra só a versão mais recente de cada chave, com "🔗 Abrir" e "🗑️ Excluir" (apaga todas as versões daquela chave). Quando há mais de uma chave candidata, uma escolha pequena por modal (`_htmlModalEscolherTipoTeste`, molde de `_htmlModalImportarRiscosPCN`) pergunta qual, antes de gerar. **DECISÃO 07/10/2026**: o popup de "Abrir" (`window.open`+`document.write`) virou **editável**, mesmo mecanismo de `_buildDRPPage`/`_buildPCNPage` — `<div contenteditable="true">` + botão "💾 Salvar versão" que `fetch` direto na Cloud Function `appApi` com um ID token Firebase embutido no HTML (`_tokenParaPCN()`), porque o popup é um documento separado sem acesso ao SDK da janela principal; salvar uma edição acrescenta versão nova, igual ao "Gerar" — nunca sobrescreve, e trocar de versão no seletor não avisa sobre edição não salva (mesmo risco aceito do DRP/PCN). Referência: `gerarRoteiroTeste`/`salvarRoteiroTeste`/`obterRoteiroTeste`/`excluirRoteiroTeste` em `appLogic.js`; `window.gerarRoteiroTeste`/`_buildRoteiroTestePage`/`salvarVersaoRoteiroTeste` em `app.js`.
- **Cadeado por seção no DRP (DECISÃO 09/10/2026)**: gerar o DRP de novo não apaga mais o ajuste humano. Cada `<h2>` do popup ganha um botão à direita do título — "🔒 Ajustada manualmente" (borda/texto `#d60014`, fundo `#fce8ea`) quando travada, "🔓" discreto (cinza) quando livre; clique alterna, e **editar qualquer trecho de uma seção já a trava sozinha**. Seção travada volta byte a byte igual na próxima geração (garantido no servidor por `functions/drpSecoes.js`, não por instrução à IA); as livres a IA reescreve; o cabeçalho (antes do 1º `h2`) sempre vem da geração nova. As seções travadas também vão no prompt como contexto ("SEÇÕES JÁ REVISADAS POR UMA PESSOA"), para a IA escrever as demais coerentes com elas — e, se um parâmetro atual (RTO, responsável...) divergir de uma seção travada, as demais seções usam o parâmetro; a seção travada não muda sozinha. Chave da seção = número do título ("6. Runbook" → `6`), ou o título normalizado se o template não numerar. O cadeado mora na versão (`drp_conteudo.versoes[].bloqueadas`), o botão é removido do HTML antes de salvar e some na impressão. PCN e Roteiro de Teste ainda não têm — ao levar pra lá, reaproveitar `drpSecoes.js` e este mesmo visual.
- **Sessão e histórico dos documentos gerados (DECISÃO 09/10/2026)**: o popup (DRP/PCN/Roteiro) não depende mais só do token embutido na abertura (vale 1h): ao salvar, pede um token novo à janela do sistema que o abriu (`window.opener._tokenParaPopup`, trecho `_SCRIPT_TOKEN_POPUP` em `app.js`) e, se vier 401, tenta uma vez forçando a renovação. Só falha se a aba do sistema tiver sido fechada — aí a mensagem orienta copiar o conteúdo antes de reabrir. O DRP guarda **só as 5 últimas versões** (`MAX_VERSOES_DRP` em `appLogic.js`; todas moram num documento só, e o Firestore recusa documento acima de 1 MiB); a numeração continua (v16…v20), então o seletor usa a posição na lista, nunca `versao - 1`.
- **Linhas e colunas das tabelas nos documentos gerados (DECISÃO 09/10/2026)**: DRP, PCN e Roteiro de Teste carregam `public/tabela-editavel.js` (URL absoluta, igual `drp-live.js`). Com o cursor numa célula, aparece uma barra flutuante acima da tabela — "Linha: + acima / + abaixo / Excluir · Coluna: + esquerda / + direita / Excluir" (fundo branco, borda `#e0e0e0`, "Excluir" em `#c62828`). A barra fica fora da área editável (nunca vai pro HTML salvo) e some na impressão. Regras: não insere acima nem exclui o cabeçalho, não exclui a última linha de dados nem a última coluna, e tabela com célula mesclada (`colspan`/`rowspan`) só aceita edição de texto (botões desabilitados com o motivo no tooltip). Mudança de estrutura dispara `input` na área editável — no DRP isso trava a seção com o cadeado, como uma edição de texto. Documento gerado novo que tenha tabela: incluir o mesmo `<script>`.

### Gráficos do Monitor de Risco: dica ao passar o mouse (DECISÃO 14/10/2026)
Cada ponto dos gráficos "Carga ao longo do tempo" e "Impacto financeiro" abre uma **dica própria** (div flutuante `#dicaMonitor`, `pointer-events:none`, acima do ponto e invertida perto da borda; toque no celular também abre) no lugar do `<title>` nativo. Conteúdo: **Série · data**, o valor, a variação desde o dia anterior (▲ vermelho `#c62828` sobe, ▼ verde `#2e7d32` desce — para risco, descer é bom) e, abaixo, **os riscos que moveram a curva naquele dia**: variação, título e o motivo (`novo · score 9`, `reavaliado · score 2 → 6`, `encerrado`, `excluído`, `estimativa financeira alterada`); na linha da Empresa aparece também a área. No máximo 6 riscos + "+N outros"; área mostra só os dela; no gráfico financeiro a variação é em R$. Dia plano = "Sem mudança neste dia"; dia gravado antes dessa carga = "Detalhe por risco indisponível"; se a soma do detalhe não fecha com o ponto (os 2 dias gravados com pesos de Tier antigos) a dica avisa. Os dados vêm de `mudancas` em cada `historico_risco/{dia}`, calculado no servidor (`mudancasEntre`/`reconstruirComMudancas` em `functions/historicoRisco.js`: fim do dia anterior × fim do dia, mesmos insumos) — a tela só lê. A montagem do texto é a função pura `_conteudoDicaMonitor` (testada em `tests/monitor-dica.test.js`). Gráfico novo com pontos clicáveis: seguir a mesma receita (alvo de hover r=9 transparente + contexto em `window._monitorGraficos`).

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
**DECISÃO 06/10/2026**: todo drawer de edição de UM registro (tenha ou não abas internas — Vulnerabilidade, Dependência, Processo, Risco, Fornecedor, Serviço, Backup, Pessoa) usa rodapé **"Fechar"** (`.btn-ghost`) + **"Salvar"** (`.btn-primary`, grava **sem fechar** — dá pra clicar de novo depois de trocar de aba, sem perder o que já foi preenchido). Antes disso "Salvar" gravava E fechava num só clique; o precedente que já funcionava assim era o drawer de Risco (`salvarRisco`), generalizado pra todo o sistema nesta decisão.
- **Reconciliação de id**: ao CRIAR (sem id ainda), depois do `await` bem-sucedido, grava `result.id` de volta no campo oculto (`#xId`) e atualiza o título do drawer de "Novo X" pra "Editar X" — sem isso, um segundo clique em "Salvar" criaria um registro duplicado em vez de editar o mesmo. Receita idêntica em todos os 9 drawers (ver `salvarRisco`, `app.js:8022`, como referência mais simples; `salvarDep`/`salvarProcesso` são as versões mais elaboradas, por causa do padrão otimista).
- **Exceção — cadastro rápido aninhado** (ex.: "+ Novo Servidor" dentro do Backup, "+ Novo Serviço" dentro do Backup): um drawer aberto POR CIMA de outro (mecanismo `_esconderDrawerPaiTemporariamente()`/`window._drawerPaiEmpilhados`, `app.js:~5611`) **continua fechando e devolvendo pro pai** ao salvar — é um "escolha ou crie rapidinho e volte", não uma edição de registro pra ficar aberta. Detectado via `_temDrawerPaiEmpilhado()` (`app.js:~5679`) nos drawers que podem ser aninhados (Pessoa, Serviço, Backup); Dependência usa os flags mais específicos que já existiam pra isso (`veioDoBackup`/`veioDoServico`), com o mesmo efeito.
- **Fora deste padrão** (não são "um registro com abas pra continuar depois"): `#drawerProcessosLote` (edição em lote de N processos — já se chama "Aplicar", mas é uma ação em massa, não um registro único).

**[REVOGADA em 16/10/2026 — ver a decisão logo abaixo]** **DECISÃO 08/10/2026 (reversão parcial da de 06/10) — "Fechar" passa a salvar antes de fechar**: nos 9 drawers do padrão acima, o ícone `×` do cabeçalho, o clique fora (overlay) e o botão "Fechar" do rodapé — confirmado que os 3 já chamavam a mesma função em todo drawer — passam a **salvar antes de fechar**, não só descartar. Só fecha se o salvamento voltar `true` (gravação principal confirmada); se a validação falhar ou a gravação der erro, mostra o mesmo aviso de sempre e o drawer **continua aberto** (protege contra perder dado por engano).
- **Receita**: cada `salvarX()` passa a devolver `true`/falsy (as validações que já faziam `return showToast(...)` e os `catch` que já faziam só `showToast(...)` continuam servindo de "não salvou" sem precisar mudar — `showToast` não devolve nada, logo já resolvem pra `undefined`/falsy; só foi preciso acrescentar `return true;` depois da gravação principal confirmada, e trocar `await comBotaoCarregando(...)` por `return await comBotaoCarregando(...)`). O fechamento "de verdade" (só DOM) virou uma função privada `_fecharXSemSalvar()`, reaproveitada pelo novo `fecharX()` público e por qualquer chamada interna que precise só fechar sem salvar de novo.
- **A exceção do cadastro rápido aninhado (acima) não muda**: nos 4 drawers que a têm (Pessoa, Serviço, Backup, Dependência), quando aninhado, `fecharX()` continua só fechando (`_fecharXSemSalvar()` direto, sem tentar salvar de novo) — o próprio `salvarX()` já fecha e devolve pro pai sozinho nesse caso, então salvar de novo ali seria uma segunda gravação disparada por engano.
- **Achado incidental corrigido nesta rodada**: `fecharModal()` tinha o nome genérico mas o corpo fechava especificamente `#drawerProcesso` — usado também (por engano) pelo "Cancelar" do modal de Perguntas (BIA) e por `salvarPergunta()`, que deveriam fechar `#modal` (mesmo id compartilhado com Áreas, ver "Divergências conhecidas" abaixo). Nunca dava sintoma visível porque a troca de tela recria `app.innerHTML` inteiro. `fecharModal()` agora fecha `#modal` de verdade; o drawer de Processo ganhou nome próprio, `fecharDrawerProcesso()`.
- **Complemento 13/10/2026 — "Fechar" só grava se o formulário mudou**: cada gravação custa 350–670 ms de ida ao Firestore, e antes todo Fechar gravava (inclusive sem mudança, ou logo depois de um Salvar = 2 gravações). Agora cada drawer tem um coletor puro `_coletarFormularioX()` (um só lugar monta o payload, usado pelo `salvarX()` e pelo rastreador) e `criarRastreadorEdicao(coletor)` (`util.js`): `marcar()` no fim do `abrirX`, `marcar(payloadEnviado)` depois de gravar com sucesso, e `fecharX` faz `if (!_edX.sujo()) return _fecharXSemSalvar();` antes do `await salvarX()`. Regras que não podem ser quebradas: (1) **rascunho sem `id`** (cópia de Risco, Dependência com nome sugerido) chama `esquecer()` — nada existe no banco, então Fechar tem que gravar; (2) estado que **não vive em inputs** (listas em `window._x`, jobs, dependências, canais, respostas da Avaliação do Processo) tem de entrar no coletor, senão mudar só isso seria "sem mudança"; (3) campos que o salvar só **preserva** do registro (`drpSalvo`, `setor`...) ficam fora do coletor — gerar um DRP não é editar o formulário; (4) abas desenhadas sob demanda (BCP/Avaliação do Processo) re-marcam se o formulário estava limpo antes de abrir a aba — olhar a aba não suja; (5) coletor que falha conta como "sujo" (na dúvida, grava). Novo drawer deste padrão: seguir a mesma receita. Cobertura: `tests/fechar-drawers.test.js` (carrega o `app.js` real no jsdom e conta as gravações). Junto: a releitura do catálogo (Perguntas de Criticidade) e o espelho `config_perfis` (Pessoa) saíram do caminho de espera do Fechar e rodam em segundo plano.
- **Complemento 08/10/2026 — botão "Cancelar" volta a existir**: a mudança acima tirou do sistema qualquer jeito de abandonar uma edição sem gravar (os 3 jeitos de sair agora sempre tentam salvar). Corrigido acrescentando um 3º botão, **"Cancelar"** (`.btn-ghost`, primeiro item do rodapé, antes de "Fechar" — `.drawer-footer` é `justify-content:flex-end`, então o primeiro do HTML fica mais à esquerda), que chama `_fecharXSemSalvar()` direto pelo `onclick`, sem passar por `salvarX()` e sem `confirm()` — mesmo comportamento que "Fechar" tinha antes desta decisão, e mesmo padrão sem confirmação que todo outro "Cancelar" do sistema já usa. Não precisou de função nova: a própria extração de `_fecharXSemSalvar()` (acima) já serve.

**DECISÃO 16/10/2026 — "Fechar" pergunta quando há alteração (revoga a de 08/10/2026 e o complemento do "Cancelar")**: a regra "Fechar salva" deixava dois botões vizinhos, com o mesmo estilo, fazendo o oposto ("Cancelar" descartava sem perguntar, "Fechar" gravava), e gravava cópia/rascunho quando a pessoa fechava justamente para desistir. Agora:
- **Rodapé só "Fechar" + "Salvar"** nos drawers de edição de um registro (Processo, Pessoa, Dependência, Serviço, Backup, Vulnerabilidade, Risco, Pergunta de Criticidade, Fornecedor, Contrato, item de lista de Contrato). Não existe mais "Cancelar" neles.
- **Fechar, ×, clique fora e Esc fazem a mesma coisa**, via `_fecharComRastreador({ idDrawer, sujo, salvar, fecharSemSalvar })` (`app.js`): sem mudança desde que abriu/salvou (`criarRastreadorEdicao`, ver complemento de 13/10) fecha direto; com mudança abre o diálogo único `_perguntarAlteracoesNaoSalvas()` — **Continuar editando** (ghost) · **Descartar** (ghost vermelho) · **Salvar** (primary). "Salvar" fecha só se `salvarX()` devolver `true` (validação/erro mantém aberto, como antes).
- **Cópia/rascunho sem id** (`esquecer()`) conta como alterado: pergunta, e "Descartar" não cria o registro.
- **Cadastro rápido aninhado**: mesma pergunta; como o próprio `salvarX()` já fecha e devolve pro pai, o helper só chama `fecharSemSalvar` se o drawer ainda estiver aberto (senão a pilha de pais seria desempilhada duas vezes).
- **Fornecedor**: a avaliação (Criticidade/Conformidade) tem rastreador próprio (`_edAvalFornecedor`); "Salvar" no diálogo grava o que mudou — cadastro, avaliação ou os dois (antes a avaliação era descartada em silêncio).
- **Drawers de ação** (Organograma, seleção de dependências/áreas para relatório, edição em lote) continuam com "Cancelar" + verbo ("Gerar", "Aplicar"): não editam um registro.
- **Esc**: um `keydown` global fecha o que estiver por cima — o diálogo (= Continuar editando), um modal (pelo seu "Cancelar"/"Fechar") ou o drawer (pelo `×` do cabeçalho). Campos com `onkeydown` próprio (edição inline, busca do menu) ficam de fora.
- **Tab**: `.drawer:not(.open)` tem `visibility:hidden` (depois da animação de saída), para o Tab não entrar em campos de drawer fechado.
- **Testes**: cenários com resposta escolhida pelo teste em `tests/fixtures/fechar-drawers/*.js` (substituem `_perguntarAlteracoesNaoSalvas` no mesmo escopo do `app.js`); casos novos em `tests/ux-fase1.test.js`.

**DECISÃO 16/10/2026 — tela que não carregou e atalho para tela sem acesso**:
- Erro de carga **nunca** vira lista vazia ("Nenhum … cadastrado" parece que não há nada cadastrado): use `_htmlErroCarga(mensagem, 'nomeDaFuncaoDaTela')` ("Não foi possível carregar… Tentar de novo") e pare a renderização. Aplicado em Áreas, Dashboard de Continuidade, Dependências, Serviços, Catálogo do Backup e Vulnerabilidades.
- Link/atalho para outra tela só aparece para quem pode vê-la: `_seVeTela('pagina', html)` (mesmo critério do `route()`). Sem isso o clique caía em "Esta tela não é do seu perfil" (ex.: Gestor no drawer de Contrato, TI em Dependências).
- Hash que não é tela nenhuma mostra **"Página não encontrada"** (`_telaNaoEncontrada`), para todos os perfis.
- `confirm()` recebe **texto puro**: não use `esc()` dentro dele (mostrava `&quot;`/`&amp;`). `esc()` é para HTML.

### Máscaras de entrada (`formatarCNPJ(valor)` / `formatarTelefoneBR(valor)`)
Primeiras máscaras do sistema (`util.js`), usadas em Fornecedores (CNPJ e Telefone). Convenção: `oninput="this.value=formatarX(this.value)"` no próprio `<input>`, e formatar **também ao abrir o formulário** (não só ao digitar), pra dado antigo sem máscara mostrar formatado assim que a tela abre — ex. `document.getElementById('fornCadCnpj').value = formatarCNPJ(f ? (f.cnpj || '') : '');`. Sem preservação de cursor no meio do texto (aceitável pra campo curto digitado do início pro fim); se surgir uma nova máscara (CPF, moeda), siga o mesmo formato de função pura em `util.js`.

### Marca do sistema em documentos gerados (relatórios, dossiês, PCN, DRP)
Todo documento autônomo que o sistema gera (aberto via `window.open('', '_blank')` +
`document.write`/template literal — Organograma, "Processos por Dependência", "Processos por Área", Dossiê do
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
  impressão (ver `.org-header`/`.header` em Organograma e "Processos por Dependência"/"Processos por Área",
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
**DECISÃO 16/10/2026 — estrutura do menu (substitui a regra "subitens em ordem alfabética" abaixo)**: 7 grupos — Continuidade de Negócio, Riscos, Indicadores, Fornecedores, Contratos, Serviços, Administração. Dentro de cada dropdown:
- **Tela principal primeiro** (Dashboard de Continuidade, Registro de Riscos, Dashboard de Indicadores, Fornecedores, Contratos, Serviços); depois as demais telas de **operação**, em ordem alfabética.
- **Cadastros de configuração do módulo** (tabelas de domínio, usadas raramente) ficam por último, sob o separador `<div class="nav-secao">Configuração</div>`, também em ordem alfabética: Áreas, Perguntas do BIA e Pessoas (Continuidade); Cadastro de Indicadores; Categorias de Fornecedores, Critérios de Avaliação, Perguntas de Criticidade e Subcategorias de Fornecedores; Indexadores de Reajuste, Status de Contrato e Tipos de Contrato. O script de permissão do menu esconde o separador quando todos os itens dele somem.
- **Grupo que mistura duas famílias de tela pode ser dividido em seções temáticas** com `<div class="nav-secao">Nome</div>` (DECISÃO 19/10/2026, Riscos: "Vulnerabilidades" — Painel de Vulnerabilidades, Vulnerabilidades — e depois "Riscos" — Registro de Riscos, Risco no Tempo). Nesse caso o grupo não tem uma "tela principal" única: a regra "principal primeiro" e a ordem alfabética valem dentro de cada seção, e só a seção "Configuração" é de configuração. O separador que abre o dropdown não leva linha em cima (`.nav-dropdown > .nav-secao:first-child`).
- **Relatório de um domínio fica no menu do próprio domínio** (DECISÃO 20/10/2026, pedido do usuário): a tela Relatórios do menu Continuidade de Negócio é só de continuidade. Os relatórios executivos de Vulnerabilidades e de Riscos são telas próprias no menu Riscos — "Relatório de Vulnerabilidades" (`#vulnerabilidades-relatorio`) na seção Vulnerabilidades e "Relatório de Riscos" (`#riscos-relatorio`) na seção Riscos —, com as opções na própria tela (card "Gerar relatório", sem drawer) e as próprias "Edições salvas". Telas do domínio podem ter atalho "📄 Relatório" no cabeçalho (via `_seVeTela`). Relatório novo de outro domínio segue a mesma regra.
- **Rótulo do menu = título (`<h2>`) da tela**, completo e sem ambiguidade fora do grupo ("Dashboard de Indicadores", não "Dashboard"; "Perguntas do BIA", não "Perguntas"); sem emoji no título. A aba do navegador mostra `Rótulo · GRC360` (`document.title`, definido no `route()` lendo o próprio `.nav-link` — não há outra lista de nomes).
- **Hashes não mudam** quando um rótulo muda (`#admin`, `#monitor`…): preserva favoritos e links já enviados.
- **Tela inicial por perfil** é explícita: `Perfis.paginaInicial()` (`perfis.js`, `PAGINA_INICIAL`) — Admin, SI e Gestor no Dashboard de Continuidade (Gestor sem área cai em Processos), TI no DRP, Operador em Processos (DECISÃO 14/10/2026). Nunca "a 1ª tela da lista".
- **Permissão no menu** usa a união dos perfis (`USER_PERFIS`), igual ao `route()`.
- **Telas estreitas**: até 1440px o nav compacta (menos padding, busca 160px, só o avatar do usuário); os dropdowns de Serviços e Administração abrem para a esquerda; itens do dropdown não quebram linha. `aria-expanded` acompanha o abrir/fechar dos grupos.
- Testes: `tests/ux-fase2.test.js` (ordem, seções, rótulo = título, rotas × menu, tela inicial, título da aba).

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
**DECISÃO 02/10/2026:** quando um campo referencia outra entidade (select de Serviço/Pessoa, multi-seletor por categoria de Dependências, etc.) e o registro que falta ainda não existe, o padrão é abrir o **cadastro completo de verdade** dessa entidade (o mesmo drawer que a tela própria usa — nunca um mini-formulário paralelo, que divergiria com o tempo), empilhado por cima do formulário atual. O drawer de origem fica **oculto, não destruído** (`classList.remove('open')`, sem apagar nada do que já foi preenchido) e reaparece assim que o cadastro empilhado fecha — salvando ou cancelando — com o registro novo já selecionado/adicionado. Referência de implementação: `firebase-app/public/app.js`, helper genérico `_esconderDrawerPaiTemporariamente(idDrawer, idOverlay)`/`_reabrirDrawerPaiSeEscondido()` (guarda uma **pilha** de drawers escondidos, não um slot só — necessário porque dá pra empilhar mais de um nível, ex.: Serviço escondido → Backup aberto → Pessoa aberta por cima do Backup; um slot único perderia o registro do Serviço) usado pelo drawer de Backup (Serviço/Dependência: `abrirDrawerServicoDeBackup`/`abrirDrawerDependenciaDeBackup`; a Pessoa saiu do Backup em 21/10/2026) e pelo de Serviço (Dependência: `abrirDrawerDependenciaDeServico`). Dois cuidados que valem para qualquer entidade nova:
- A função de salvar do drawer empilhado não pode assumir que está sempre na própria tela (ex.: recarregar uma grade que só existe lá) — qualquer `render*()`/refresh de tela precisa ser guardado com `if (document.getElementById('idDaGradeDaTelaPropria')) ...`.
- Se o cadastro empilhado usa um fluxo otimista (atualiza a UI com um id temporário antes da gravação real confirmar), o registro novo só deve ser vinculado ao formulário de origem com o **id real**, nunca o temporário — é o mesmo cuidado que evitou a "referência fantasma" corrigida em 24/09/2026 (fusão de Componentes do Serviço em Dependências).

**DECISÃO 19/10/2026 — cadastro rápido em todo o sistema (fim dos links "Gerenciar X" em nova aba):** todo campo que referencia outra entidade tem um botão `+ Novo X` (classe `.link-acao`, visível só para quem pode cadastrar aquela entidade) que abre o cadastro completo por cima do formulário e devolve o item criado já selecionado. Helper genérico em `app.js`: `_abrirCadastroRapido({ pai, overlay, preparar, abrir, aoSalvar })`. `preparar` injeta o HTML do cadastro na tela atual quando ela não tem (`_garantirHtmlCadastro(id, gerador)`) e carrega o que ele precisa; `aoSalvar(registro)` repopula e seleciona o campo de origem. O cadastro filho, ao salvar estando empilhado, chama `_entregarCadastroRapido(registro, fecharSemSalvar)`; o fechar sem salvar dele chama `_reabrirDrawerPaiSeEscondido()`. A troca de tela zera a pilha. Geradores reutilizáveis: `_htmlDrawerPessoa`, `_htmlModalProdutoSoftware`, `_htmlDrawerDependencia`, `_htmlModalArea`, `_htmlDrawerFornecedorCadastro`, `_htmlDrawerListaContrato(chave)`. Origens hoje: Área (+ nova pessoa e o lápis do responsável), Pessoa (+ novo produto), Vulnerabilidade (+ novo produto, + nova dependência, + nova pessoa), Perfis (+ nova pessoa), Fornecedor (+ nova pessoa, lápis do gestor, + nova área), Contrato (+ novo fornecedor, tipo, status, indexador), além dos que já existiam no Backup e no Serviço. Testes: `tests/ux-cadastro-rapido.test.js`. Um cadastro novo que possa ser aberto por cima precisa: gerador de HTML, salvar que entregue o registro quando `_temDrawerPaiEmpilhado()`, fechar sem salvar que reabra o pai, e render de grade guardado pela própria tela.

**DECISÃO 03/10/2026, revertida 04/10/2026 — Backup volta a ser tela própria:** por 1 rodada, Backup não teve tela/menu próprio (só existia dentro da aba "Backups" do Serviço dono, sem campo "Serviço" no formulário). Pedido explícito: tela própria de novo, "Catálogo do Backup", seguindo o padrão da tela Fornecedores (busca, grade, ordenação, edição por clique na linha) — ver `catalogoBackup()`/`renderizarCatalogoBackup()` em `app.js`, rota `#catalogo-backup`. O campo "Serviço" voltou ao formulário de Backup (select + "+ Novo", igual Servidor/Stakeholder — `abrirDrawerServico` costuma vazar o id de contexto quando aberto a partir de um filtro já escolhido na grade). A aba "Backups" do drawer de Serviço não desapareceu, mas virou **só consulta** (`_renderServicoBackupsTab`, sem editar/excluir ali) — clicar leva pro Catálogo já filtrado por aquele serviço (`#catalogo-backup?servico=ID`, deep-link tratado em `route()`, mesmo padrão de retry do `#drp?abrir=ID`) — mesmo espírito do link "Gerenciar em Fornecedores" já usado em Dependências: um único lugar edita de verdade, a entidade dona só consulta.

**DECISÃO 04/10/2026 — campo Servidor do Backup: de multi-seletor por categoria pra 1 select só:** o campo "Servidor" tinha o mesmo componente de chips agrupados por categoria do seletor "Dependências do Serviço" (várias Dependências técnicas, 7 categorias). Pedido explícito: só **1** Dependência por backup, igual Stakeholder — virou `<select id="backupServidor">` + "+ Novo" (`_popularSelectBackupServidor`, mesmo molde de `_popularSelectBackupStakeholder`). Dado antigo (`servidorItens[]`, array) continua só **lido** (nunca mais gravado) pra migrar não-destrutivamente: ao abrir um backup legado sem `servidorId`, cai no primeiro item do array antigo em vez de aparecer vazio.

**DECISÃO 04/10/2026 (refinamento) — select de Servidor só lista a categoria técnica "Servidor":** o select acima listava as 7 categorias técnicas juntas (com a categoria como sufixo pra desambiguar). Pedido explícito: só itens da própria categoria "Servidor" (uma das 7 de `DEPENDENCIA_CATEGORIAS_TECNICAS`) ficam disponíveis — sufixo de categoria removido (ficaria sempre repetindo "— Servidor"). O "+ Novo" pré-preenche a Categoria do formulário de Dependência com "Servidor", já que é a única que faz sentido nesse contexto.

**DECISÃO 21/10/2026 — Backup: Ferramenta, Modo de Backup, vários Serviços; Stakeholder vai pro Serviço:**
- **Ferramenta** = `<select id="backupFerramenta">` + "+ Nova" (cadastro rápido no drawer de lista simples, `novaFerramentaDeBackup`), lendo a lista configurável `ferramentas_backup` (tela própria `#catalogo-backup-ferramentas`, "Ferramentas de Backup", menu Serviços e botão "Ferramentas" no cabeçalho do Catálogo). O item "Outra" (por nome) abre um texto "Qual ferramenta?" (`ferramentaOutra`); a grade mostra esse texto. Grava `ferramentaId` + cópia `ferramentaNome`.
- **Modo de Backup** = o QUE é copiado (Imagem Completa, Máquina Virtual, Snapshot, Volume / Disco, Diretório / Arquivos, Banco de Dados, Aplicação / SaaS — `BACKUP_MODOS` em `app.js`, lista fixa, não cadastrável). É **atributo do Backup, não do job**: o job só varia agenda, Tipo (Full/Diferencial/Incremental) e retenção; o mesmo ativo com dois modos vira dois backups. Cartões de valor único (molde de `renderEstrategiaChips`), clicar de novo desmarca; valor gravado fora da lista aparece marcado "(fora da lista)". O campo **Escopo** abaixo troca rótulo e placeholder conforme o modo (ex.: Diretório → "Caminhos"). Avisos laranja que **não bloqueiam**: Snapshot com job Diferencial, e Snapshot com job sem Destino (snapshot não substitui cópia fora do equipamento).
- **Serviços** (vários) = chips vermelhos com "×" + select "Adicionar serviço…" que adiciona no `onchange` e esconde os já escolhidos (molde de Áreas da Pessoa); "+ Novo" abre o drawer de Serviço por cima e o serviço criado **entra** na lista. Pelo menos 1 é obrigatório (`_avisarCampo`). Dado: `servicoIds[]`; backup antigo só com `servicoId` é lido como `[servicoId]`, sem regravar. Serviço excluído vira chip cinza "(removido)". Na grade, a coluna Serviço lista todos e ordena pelo primeiro.
- **Stakeholders** saíram do Backup e foram para o **Serviço** (várias Pessoas, chips + "Adicionar pessoa…" + `.link-acao` "+ Nova pessoa"). Serviço ainda sem lista própria abre com os stakeholders distintos dos backups dele já como chips e a nota azul "Trazidos dos backups deste serviço — salve para confirmar" — isso conta como estado inicial do rastreador (Fechar sem mexer não pergunta) e só grava ao Salvar; os campos antigos do backup não são apagados (`_stakeholdersDoServico`). O relatório de vínculos da Pessoa passou de "Backups (Stakeholder)" para "Serviços (Stakeholder)".

**DECISÃO 21/10/2026 — Duplicar job e Clonar backup:** na tabela de jobs, o ícone de cópia (entre Editar e Remover) chama `duplicarJob(i)`: o formulário vem preenchido com o job, aviso azul "⧉ Copiando job — ajuste e clique em + Adicionar", e "+ Adicionar" cria um job **novo** (id e nome próprios; o original não muda). Na grade do Catálogo, o ícone de cópia nas Ações (entre Editar e Excluir) chama `clonarBackup(id)`: abre o drawer como **backup novo** já preenchido (nome "… (cópia)", serviços, servidor, ferramenta, modo, escopo e jobs com ids novos e nomes recalculados) — nada grava sozinho: Salvar cria o documento, Fechar faz a pergunta padrão. O clonar fica na grade, não no drawer, porque o rodapé do drawer é só Fechar + Salvar. Stakeholder legado e datas de criação não são copiados.

### DECISÃO 16/10/2026 — componentes comuns (revisão de UX, Fases 3 e 4)

Tela nova usa estes componentes; tela antiga que for tocada migra para eles. Testes: `tests/ux-fase3.test.js` e `tests/ux-fase4.test.js`.

| Necessidade | Use | Não use |
|---|---|---|
| Barra de filtros | `.filters` > `.field` > `.field-label` (sem ":" nem "Filtrar por") + `.field-control`; busca `type="search"` com `.field-control--busca`, placeholder sem 🔍 | `<label style="font-size:0.9em...">`, select com borda inline |
| Paginação | `const xPaginacao = criarPaginacao(20)` (`util.js`) + `xPaginacao.aplicar(lista)` no render + `_htmlPaginacao(pag, 'irParaPaginaX')`; `filtrarX()`/`ordenarX()` chamam `xPaginacao.reiniciar()` | contador `xPaginaAtual` + rodapé copiado |
| Ações de linha | `${SVG_EDITAR}` / `${SVG_EXCLUIR}` dentro de `.btn-icon` com `title` (vira `aria-label` sozinho); quem só consulta vê o lápis com title "Visualizar" | emoji ✏️/🗑️, botão "Ver" |
| Cards de número | `_htmlMetricCard({ label, value, level, trend })` em `.painel-metricas` (ou `.painel-metricas--auto` para quantidade variável) | `<div style="border-top:3px solid #hex">` |
| Bloco de dashboard | `.painel-card` (+ `__titulo`, `__sub`), barras `.barra`/`.barra__valor`, KPIs `.painel-kpi`; tabela interna `.data-table` | cartão com `box-shadow`, degradê |
| Cabeçalho de grupo (listas agrupadas) | `.grupo-cab` (`--clicavel` se recolhe) | faixa em degradê vermelho com texto branco |
| Cor de Tier | `Criticidade.corDoTier(tier)` ou o chip `_htmlBadge(_nivelTierProcesso(tier), rotulo)`; contagem de Tier 3 por `Criticidade.ehTier(p, TIER.T3)` | hex `#c62828/#f57c00/#1565c0`, "score < 6" |
| Ativo/Inativo | `.badge.badge-green` / `.badge.badge-gray` | `<span style="background:#e8f5e9...">` |
| Abas de drawer | `trocarAbaX` chama `_marcarAba(botao, ativa)` (classe `.aba-drawer`/`--ativa` + `aria-selected`) | `btn.style.color = '#d60014'` |
| Validação de campo | `return _avisarCampo('idDoCampo', 'Informe X.')` (troca para a aba do campo, foca, marca `.campo-invalido`) + `<span class="req" aria-hidden="true">*</span>` no rótulo | `return showToast('Informe X.', '#e65100')` sozinho |
| Confirmação | `if (!await confirmarAcao('Excluir X?')) return;` (modal do sistema; botão com o verbo; Esc = Cancelar) | `confirm()` nativo, `esc()` dentro da mensagem |
| Erro de carga | `_htmlErroCarga('Não foi possível carregar X.', 'nomeDaTela')` | `catch → []` (vira "Nenhum X cadastrado") |
| Mensagem de erro (aviso) | `showToast('❌ ' + _mensagemErro(e, 'Não foi possível X. Tente de novo.'), '#c62828')` -- frase clara para permissão/rede/sessão/tempo; mensagem do servidor em português passa | `'Erro: ' + e.message` (texto técnico do SDK para o usuário) |
| Pedido de texto curto | `const v = await pedirTexto('Rótulo', { valor, tipo: 'email' })` (modal; `null` se cancelar) | `prompt()` nativo |
| Estado vazio | tela/lista: `_htmlVazio('Nenhum X cadastrado.')` (`.vazio`, caixa tracejada); linha de grade: `<td colspan="N" class="vazio">`; nota em formulário: `class="vazio-inline"` | `<p style="text-align:center;color:#999...">`, emoji gigante |
| Card que filtra a lista | `_htmlMetricCardFiltro({ label, value, cor, ativo, onclick, titulo })` (rótulo em cima; ativo por classe; `<button>`) | `<div class="bia-metric" style="outline...">` montado na tela |
| Atalho para outra tela | `_seVeTela('pagina', html)` | link sem checar perfil |
| Grade larga | `<colgroup>` em px + `min-width` inline; o `min-width:1400px` legado só vale para 9+ colunas | `width:%` somando ≠ 100 |

**Acessibilidade (Fase 4)** — feita num ponto só em `app.js` (bloco "ACESSIBILIDADE DE DRAWERS E MODAIS"), sem precisar marcar cada drawer: ao ganhar `.open`, todo `.drawer`/`.modal-overlay` recebe `role="dialog"`, `aria-modal` e o `<h3>` como `aria-labelledby`, foca o 1º campo e guarda quem abriu; ao fechar, o foco volta. Tab fica preso no diálogo aberto mais recente. Botão só de ícone ganha `aria-label` (do `title`; o `×` vira "Fechar"). `#toast` é `role="status" aria-live="polite"`. Por isso: **todo drawer/modal precisa de um `<h3>` de título** e **todo botão só de ícone precisa de `title`**.

**DECISÃO 19/10/2026 — questionário BIA numa interface só.** O questionário vive só na aba **Avaliação** do drawer de Processo (salva junto com o Processo). O drawer "Avaliar Processo" (`#drawerAvaliar`) foi removido; o ✔ da lista de Processos abre o processo já nessa aba. A aba tem a caixa de premissas (`.premissas-avaliacao`), o resumo Score/Tier e "🖨️ Exportar PDF" (o PDF usa as respostas marcadas na aba, salvas ou não).

**Ainda não unificado** (decisão pendente, não copiar como padrão): nas janelas de documento (PCN, DRP, Roteiro), que abrem separadas e não têm o modal do sistema, o `alert()` continua -- só com frase clara.

## 5. Divergências conhecidas (não corrigidas nesta rodada — cuidado ao copiar o "padrão errado")

Estas inconsistências existem hoje no código e são conhecidas; normalizar aos poucos, ao tocar em cada tela — não foram corrigidas de uma vez por exigirem mudança em muitos pontos sem verificação visual disponível neste ambiente:

- **5 tons de cinza quase idênticos** (`#888`, `#999`, `#666`, `#555`, mais `#757575`) usados de forma intercambiável para "texto secundário" dependendo de qual tela foi escrita quando. Ao criar algo novo, prefira `#888`.
- **3 estilos de label diferentes** em modais/drawers (uppercase 0.78em/700, `.modal label` simples 0.82em/600 sem uppercase, e a variante própria de `bia-dependencias.html`). Ao criar algo novo, use o uppercase (seção 3).
- **Páginas públicas standalone** (`bia-dependencias.html`, `drp-componentes.html`, `pcn-levantamento.html`, `cadastrar-areas.html`, `login.html`, `pcn-viewer.html`) **não carregam `styles.css`** — têm CSS 100% próprio, incluindo uma classe `.btn-primary` com valores diferentes da do app principal. Elas concordam no essencial (cores de marca, verde/vermelho de sucesso/erro), mas os componentes (botões, cards, chips) são implementações paralelas. Não migrar isso "de graça" — é um projeto à parte.
- **Badges/pills com padding/radius levemente diferentes entre telas** (ex. `padding:4px 10px` vs `4px 12px` para o mesmo tipo de badge de tier/status). Ao criar um badge novo, use o template da seção 4 (Badges/Pills).
- **Perguntas e Config. de Respostas** ainda usam emoji (✏️/🗑️) em vez de SVG para editar/excluir — telas mais antigas, pré-datam a convenção de ícone SVG. Não é para ser copiado em telas novas.
- **Colisão de `id="modal"`** entre Perguntas e Áreas — as duas telas usam literalmente o mesmo id pro modal (e `#modalTitulo`/`#fId`/`fecharModal()` em comum). Inofensivo hoje porque a navegação recria `app.innerHTML` inteiro a cada troca de tela (só uma delas fica montada no DOM por vez), mas frágil pra qualquer mudança futura que monte mais de um painel ao mesmo tempo. Não copiar esse padrão em tela nova — dê um id próprio ao modal.

### Telas de consulta: sem controles de edição para quem só lê
**DECISÃO 14/10/2026 (perfil Operador Administrativo):** quem tem acesso só de leitura a uma grade (Pessoas, Áreas, Processos) **não vê** os controles de edição — botão "+ Novo", ícones de editar/avaliar/enviar/excluir, checkbox de edição em lote — e o clique da linha não abre o formulário. Nada de botão desabilitado nem erro de permissão depois do clique: a regra do banco continua sendo a barreira, a tela só não oferece o que vai falhar. A pergunta de permissão vem sempre de `Perfis` (`podeEditarPessoas`, `podeMexerNaArea`, `podeEditarProcessos`), nunca de comparação de texto. Em Processos a linha abre `verDetalhesProcesso` (modal só de leitura, 👁️ na coluna Ações); `editarProcesso` (inclusive pelo deep link `?editar=`) cai nesse detalhe para quem não edita. Parâmetro que vive em coleção só do Admin (ex.: limiar de risco do fornecedor, `config_regua`) aparece travado para os demais perfis, mesmo que gerenciem o resto do módulo.

### Seleção em grade, edição em lote e clonar (Vulnerabilidades)
**DECISÃO 15/10/2026:** Vulnerabilidades ganhou o mesmo padrão de Processos de Negócio — 1ª coluna com checkbox por linha + "marcar todos" no cabeçalho, e dois botões no cabeçalho da página que só aparecem com seleção: "✏️ Editar selecionadas (N)" (drawer `drawerVulnerabilidadeLote`, cada select em "— Não alterar —", texto/data em branco = não altera; só o que mudou vai no payload) e "📋 Clonar selecionadas (N)" (cria as cópias direto, com `confirm`). Regras do padrão: (1) a seleção é um `Set` de ids que **sobrevive a filtro, ordenação e troca de página**; "marcar todos" cobre só as linhas da **página visível** (a grade é paginada); (2) o checkbox usa `stopPropagation` para não abrir o drawer; (3) excluir um registro o tira da seleção; (4) o lote grava um a um e, se um falhar, reporta "X de N atualizadas. Erro em: …" sem abortar o resto; (5) **clonar**: ícone 📋 na linha (ao lado de Editar/Excluir) abre o drawer **já preenchido e sem id** para revisar — rascunho, então o rastreador usa `esquecer()` e Fechar grava; a cópia leva o nome com " (cópia)", código novo, status Pendente, detecção = hoje e **zera** tudo da correção (`_copiaDeVulnerabilidade`, única fonte para o ícone e para o clonar em lote). Terceira ação em lote (DECISÃO 15/10/2026): **"📤 Exportar para Riscos (N)"** (verde, `#2e7d32`) — chama a mesma ação de servidor da exportação individual, uma por vez; quem já tem risco aberto é pulado **antes** de chamar o servidor e entra no resumo como "já existiam"; o `confirm` avisa quantas estão Corrigida/Aceita (são exportadas mesmo assim, como na individual); se todas já têm risco, só um aviso, sem confirmar. Tela nova com grade editável: seguir esta receita.

### Select dependente com dica (Tipo → Subtipo de Vulnerabilidade)
**DECISÃO 15/10/2026:** classificação em dois níveis de lista **fixa no código** (`VULNERABILIDADE_TIPOS` em `app.js`). Padrão visual: dois selects lado a lado (Tipo à esquerda, Subtipo à direita); o Subtipo fica **travado** ("Escolha o tipo primeiro") até haver Tipo, e **trocar o Tipo limpa o Subtipo**. Logo abaixo, uma linha cinza (`font-size:0.74em;color:#888`, mesma das dicas de Equipe/Responsável) explica o tipo escolhido e o caminho usual de tratativa — **só texto, não muda nenhum outro campo**. Campo obrigatório leva `*` vermelho (`color:#d60014`) no rótulo, e o salvar que esbarra nele volta para a aba onde o campo está. Valor gravado que saiu da lista continua visível, marcado "(fora da lista)" (`_optionsListaFixaVuln`). Registro sem classificação aparece na grade como pill neutra "Não classificada" (cinza, mesmo formato das pills de status) e tem opção própria no filtro. Na edição em lote, o Subtipo só abre depois de escolher um Tipo no próprio lote, e trocar o Tipo sem escolher Subtipo grava subtipo vazio. "Origem da Detecção" passou a se chamar **"Reportado por"** (quem reportou — o campo no banco continua `origemDeteccao`); o **método** é o novo select "Método de Detecção".

### Método principal + alternativa recolhida (aba Severidade da Vulnerabilidade)
**DECISÃO 15/10/2026:** quando um formulário oferece mais de um método para chegar ao mesmo resultado e o método certo depende de outro campo (aqui: o Tipo da vulnerabilidade decide entre CVSS 3.1 e a Matriz de impacto — mapa em `VULNERABILIDADE_CONFIG_POR_TIPO`, `app.js`), o padrão é: (1) uma faixa no topo (`border-left:3px solid #d60014`, fundo `#f7f7fb`) dizendo "Método para <tipo>: <método>" + uma linha do porquê; (2) a seção principal logo abaixo; (3) a alternativa dentro de um `<details>` recolhido com um título que é uma pergunta ("O CVSS não se aplica a este caso? Use a matriz de impacto"), que **abre sozinho quando já tem dado gravado** — nada fica escondido; (4) o que não se aplica ao tipo (CVSS em Não Conformidade) sai da tela, mas os campos continuam no DOM (só mudam de lugar, valores intactos). Trocar o campo que decide realinha a tela **sem apagar nada**. Os cartões da matriz trocam **só o texto** por tipo (pergunta, rótulo, explicação); o código gravado continua o canônico de `cvss31.js`, pela posição. **Divergência** (dado gravado que não combina com o tipo) vira aviso laranja (`#e65100` sobre `#fff3e0`) com botão de ação explícita ("Limpar CVSS"), repetido em uma linha curta junto do campo que decide — nunca limpeza automática.

### Campo que não se aplica ao tipo some — exceto se tiver dado
**DECISÃO 15/10/2026 (CWE/CVE da Vulnerabilidade):** campo que o tipo escolhido não usa **sai da tela** (config `cwe`/`cve` em `VULNERABILIDADE_CONFIG_POR_TIPO`); se todos os campos de uma linha somem, a linha inteira sai do layout, e se sobra um, ele ocupa a linha (sem buraco). **Exceção:** se o campo já tem valor gravado, ele continua visível com uma linha laranja curta ("⚠️ CVE não se aplica a <tipo> — limpe se foi engano.") e um link "Limpar". Nunca apaga sozinho; trocar o tipo só muda visibilidade e aviso. A visibilidade é reavaliada ao abrir, ao trocar tipo/subtipo e ao limpar — **não a cada tecla**, para o campo não sumir enquanto a pessoa apaga o texto.

### Seletor em duas etapas com chips (Dependências afetadas da Vulnerabilidade)
**DECISÃO 15/10/2026:** para vincular **vários** itens de um catálogo grande e categorizado, o padrão é uma linha com **select de Categoria** (com o ícone de `DEPENDENCIA_CAT_ICONES`) → **select do Item** (travado com "Escolha a categoria primeiro" até haver categoria; itens em ordem alfabética, **sem os já escolhidos**) → botão **Adicionar** → 🔄 recarregar o catálogo. Os escolhidos viram chips "ícone Categoria: Nome ×" (mesmo visual vermelho dos chips de dependência de Processos/Serviços); vínculo cujo item sumiu do catálogo continua como chip **cinza** marcado "(removida)". Vínculo sempre por id (`{id, categoria, nome}`). O estado vive em `window._vulnDependencias` e entra no coletor do formulário (adicionar/remover conta como edição para o "Fechar só grava se mudou"). Campo de texto livre substituído por catálogo: o texto antigo fica numa caixa cinza "… (texto antigo): **valor**" só leitura com "Limpar", só quando houver texto, e ainda conta na validação para não travar a edição de registros antigos.

### Vulnerabilidades ↔ Registro de Riscos e governança NIST (DECISÃO 15/10/2026)
O **NIST** (RMF SP 800-37, avaliação SP 800-30, CSF 2.0, vulnerabilidades SP 800-40) é o norteador da gestão de riscos do sistema. Padrões de tela que saíram disso:
- **Risco que a automação mantém**: o drawer do risco mostra, no topo da aba Identificação, um **cartão de origem** (borda esquerda `#d60014`, fundo `#fffafa`) com os dados vivos da vulnerabilidade e o link "Abrir vulnerabilidade →" (`#vulnerabilidades?vuln=<id>`), mais a frase "o que você mudar aqui à mão deixa de ser sincronizado". Aviso da automação para revisão humana (`alertaAutomacao`) aparece acima dele em roxo (`#6a1b9a` sobre `#f3e5f5`) e vira o selo "⚠️ Revisar" na grade.
- **Deep links do vínculo**: `#riscos?risco=<id>` e `#vulnerabilidades?vuln=<id>` (parâmetros próprios — `editar` é o deep link de Processos). Selo "⚠️ Risco aberto/aceito" e botão "Ver Risco aberto" apontam para o risco certo, nunca só para a lista.
- **Risco ativo = tudo menos Encerrado**: "Aceito" continua contando (é resposta ao risco, não fim).
- **Selos de governança na coluna Status** (empilhados, `font-size:0.72em`): "Acima do apetite" (vermelho `#c62828`/`#fdecea`), "Reavaliação vencida" (laranja `#e65100`/`#fff3e0`), "⚠️ Revisar" (roxo). Filtro "Situação" com as mesmas três opções.
- **Apetite de risco** em uma linha acima do painel consolidado (select só para Admin; os demais leem o valor) com a contagem "N risco(s) acima do apetite".
- **Exigências por etapa** (SP 800-37) validadas **só na mudança de status** — toast "Para o status "X" falta: …". Aceite fica num bloco próprio na aba Reavaliação & Encerramento (justificativa + aprovador, Pessoas); aceitar acima do apetite exige aprovador.
- **Reavaliação automática**: mudar status ou score grava a data, acrescenta uma linha datada com o autor no histórico e sugere a próxima reavaliação pelo nível (Crítico 30, Alto 90, Moderado 180, Baixo 365 dias) quando vazia ou vencida.
- **Risco residual** num bloco cinza opcional na aba Tratamento; coluna "Residual" na grade (vazio = "–" com dica "ainda não informado", não o aviso de "fora da escala").
- **Área "Corporativo (sem área)"** é opção explícita no drawer — risco corporativo é legítimo e não exige inventar área.
- **Vulnerabilidades**: painel de exposição acima dos filtros (em aberto por severidade, ⏰ atrasadas, ⚠️ "acima do limiar sem risco" com "Selecionar para exportar") e o limiar de CVSS editável só pelo Admin; selo "Atrasada" na coluna de status + filtro "Atrasadas".

### Drawer de Risco nas etapas do NIST (DECISÃO 15/10/2026)
- **4 abas = processo do NIST SP 800-39**: Identificação (① Enquadrar) · Avaliação (② Avaliar) · Resposta (③ Responder) · Monitoramento (④ Monitorar). Cada aba tem o rótulo e, abaixo em fonte menor, a etapa. Acima das abas, a **trilha de etapas** (`#rEtapasNist`): chip verde "✓" para etapa concluída, cinza "•" para pendente (`RiscoConsolidado.etapasNist`).
- **Escala NIST SP 800-30 5×5**: Probabilidade Muito baixa…Muito alta, Impacto Muito baixo…Muito alto, score 1–25, **nível pela matriz da Tabela I-2** (não pelo produto) em 5 níveis (Muito baixo…Muito alto; "Crítico" virou "Muito alto"). Rótulos antigos (Média, Crítico) são normalizados em toda leitura.
- **Matriz clicável** no lugar de dois selects: linhas = probabilidade (Muito alta no topo), colunas = impacto; cada célula mostra o score com o fundo/cor do nível; célula escolhida com borda 3px `#222` e "●"; dicas com a definição do SP 800-30 nos rótulos. Os selects continuam no DOM, ocultos, como fonte do valor. Mesma matriz (menor, dentro de um `<details>`) para o risco residual. Quem só visualiza vê as células desabilitadas.
- **Campo calculado é só leitura**, com fundo `#f5f6fa` e uma linha explicando a regra (Score, Prioridade). Prioridade não é mais escolhida: vem do nível e sobe um degrau acima do apetite.
- **Declaração de risco estruturada** (fonte da ameaça, evento, vulnerabilidade/condição, consequência) num bloco cinza no topo da Identificação; monta a frase "Se…, então…" como **sugestão** com links "Usar como título/descrição" — nunca sobrescreve sem confirmar.
- **Resposta com blocos condicionais**: Aceitar → bloco de aceite (sem a descrição genérica); Mitigar → Plano 5W2H; Transferir/Evitar → descrição com rótulo próprio. Status de ação "Atrasado" é automático (sem opção manual).
- **KRI ligado ao cadastro de Indicadores** (🔗): grava só o vínculo; meta, último resultado e status vêm do lançamento mensal. KRI livre continua possível.
- **Histórico = trilha só de acréscimo**: lista (mais recente primeiro) + "+ Nota"; o texto bruto fica oculto e nunca é editável.
- **Estimativa financeira** em `<details>` recolhido (abre sozinho se houver dado).
- **Avanço automático de status** só para frente e só quando a pessoa não mexeu no status na edição; o toast diz para onde avançou e a linha do histórico marca "(automático)".

### Contratos: prazos, linha do tempo e listas configuráveis (DECISÃO 15/10/2026)
- **Chips de alerta de prazo** (`_chipAlertaContrato`, regra em `contrato-ciclo.js`): pílula `2px 9px`, raio 10, `0.74em` 700, nas cores de status por nível — perigo `#c62828`/`#ffebee`, aviso `#f57c00`/`#fff3e0`, info `#1565c0`/`#e3f2fd`. Aparecem na coluna "Alertas" da grade e no cabeçalho do drawer, recalculados ao vivo enquanto se edita. Não são Badge de severidade.
- **Status configurável com situação**: o pill de status do contrato tem a cor da **situação** do status (`pre` info, `vigente` sucesso, `encerrado` neutro), nunca do nome. Status sem situação aparece em laranja "Sem situação" na tela de lista.
- **Linha do tempo de eventos** (aba Eventos): borda esquerda `2px #fce8ea`, ponto de 10px `#d60014` (manual) ou `#1565c0` (🤖 automático, que não tem lixeira); data e autor em `0.8em #888`, tipo em negrito, detalhes de valor como "R$ A → R$ B (+x,xx%)". Mini-form acima, com **botões rápidos que pré-preenchem** o evento ("🔄 Renovar", "📈 Aplicar reajuste", "⛔ Encerrar" em ghost vermelho) e uma caixa "Atualizar o contrato com estes dados" marcada por padrão. O evento e a mudança no contrato são gravados no mesmo lote.
- **Campo informado primeiro; o resultado calculado por último e em destaque** (aba Vigência e valores, DECISÃO 16/10/2026): o **Valor mensal** é o campo digitado, comum, no começo do bloco Valores; o **Valor global** é derivado (mensal × vigência, `_valorGlobalContrato`), fica por último num quadro com `border:1.5px solid #d60014`, fundo `#fffafa`, rótulo em `#d60014` e input a `1.3em`/700. Como é calculado, é `readonly` (fundo `#f5f5f5`, `cursor:not-allowed`, texto escuro) e é gravado a partir da fórmula, nunca do campo. A aba é dividida em blocos com subtítulo (`0.78em`, 700, uppercase, `border-bottom:1px solid #eee`): Prazos · Reajuste · Renovação e cancelamento · Valores. A data-limite do aviso segue como linha de dica. Datas e vigência se completam (datas → vigência; vigência sem fim → fim sugerido), sem sobrescrever o fim já informado.
- **Máscara de moeda** (`mascararMoedaBR` no `oninput`, `formatarMoedaBR` ao abrir, `lerMoedaBR` ao gravar — `util.js`): todo campo em reais é `type="text" inputmode="numeric"`, alinhado à direita, com o prefixo "R$" fixo dentro da caixa (helper `moeda()` do drawer de contrato). Os dígitos viram centavos (`4215676` → `42.156,76`). O banco guarda **número**, nunca o texto mascarado. Não usar `type="number"` para dinheiro.
- **Sim/Não como select** (não checkbox) para os atributos booleanos de negócio do contrato (renovação automática, cancelamento a qualquer momento, rateado): o valor fica legível também para quem só lê.
- **Fábrica de lista simples** (`_telaListaSimples`): Tipos, Indexadores e Status de contrato usam a mesma tela — tabela com Nome · (Situação) · Contratos (em uso) · Ativo · Ações, e um **drawer de 480px** (`#drawerListaContrato`) com o rodapé padrão Cancelar/Fechar/Salvar. Item em uso não é excluído (toast de validação orientando desativar). Lista vazia oferece "Cadastrar valores padrão (N)" com os nomes à vista. Nova lista desse formato deve reaproveitar a fábrica, não copiar o molde de Categorias de Fornecedor (que ainda usa modal). **21/10/2026:** a fábrica também serve listas de fora de Contratos — a entrada em `LISTAS_CONTRATO` pode trazer `podeEditar`, `voltar` (link "←"), `usados` (onde contar o uso) e `rotuloUso`/`noUso` (ex.: Ferramentas de Backup conta em Backups); sem eles vale o comportamento de Contratos (`_LISTA_PADRAO_CONTRATO`).
- **Card de painel que leva a outra tela**: "fornecedores TIC sem contrato vigente" navega para Fornecedores já filtrada (`window._fornFiltroInicial`). Card que só informa (custo mensal) não tem `cursor:pointer` nem onclick.
- **Aba de vínculos somente leitura** (aba Vínculos do contrato, aba Contratos do fornecedor): o cadastro do outro lado não é editado ali; o clique sai do drawer atual (salvando se mudou) e abre a tela dona do registro por deep link (`#contratos?contrato=<id>`, `#contratos?novo=1&fornecedor=<id>`).
- **Navegação**: grupo próprio "Contratos" no menu (o Gestor vê só "Contratos", sem as listas de configuração).

### SLAs do contrato e seção do sistema no DRP (DECISÃO 15/10/2026)
- **Seção "SLAs do contrato" na aba Dados**, com subtítulo de seção e subtítulos internos em `0.82em` 700 `#d60014` (Atendimento · Disponibilidade · Recuperação em desastre), sem cores novas.
- **Tempo = número + unidade** (helper `duracao()` do drawer): `input type="number"` + select `min / h / dias` lado a lado; grava em **minutos** e, ao abrir, mostra a maior unidade exata (2880 → 2 dias). Não usar texto livre para tempo de SLA (é o que permite comparar com o RTO).
- **Atendimento por severidade** em tabela fixa de 4 linhas (Crítica, Alta, Média, Baixa) × Primeira resposta (uma coluna só: tempo de solução de chamado não é medido, porque o que importa na recuperação é o RTO garantido); cobertura em select (24x7, 24x5, 12x5, 8x5, Outra → campo "Qual cobertura?").
- **"O que este contrato cobre"**: o mesmo seletor em duas etapas com chips vermelhos de "Dependências afetadas" da Vulnerabilidade; para quem só lê, o seletor some e os chips ficam sem o "×".
- **Alerta SLA × RTO** reaproveita os chips de prazo (`_chipAlertaContrato`), um chip por tipo com a contagem e o detalhe no `title`. Só alerta contrato vigente **com SLA cadastrado** (sem SLA não acusa "sem RTO"). RTO exigido ilegível ou "> 24 horas" não compara.
- **Bloco somente leitura com borda esquerda vermelha** (`border-left:3px solid #d60014`, fundo `#fffafa`) na aba DRP da dependência ("SLAs contratados"), dizendo de onde vem o dado e que ele entra no DRP. Mesmo tratamento do cartão de origem do risco.
- **Seção do sistema dentro do documento gerado pela IA** (DRP "SLAs Contratados com Fornecedores"): montada pelo servidor, com a frase em itálico "Seção mantida pelo sistema…", sempre regravada (o cadeado não vale para ela) e posicionada após "Dependências". Dado que tem fonte da verdade no sistema não deve depender da IA para aparecer.

### Editar item de lista em linha — "no formulário de cima" (Documentos do Contrato, 15/10/2026)
Em listas de itens simples com formulário de adicionar logo acima (Documentos do Contrato, Plano de Ação e KRIs do Risco), **editar não abre modal**: o lápis laranja (`#ff6b35`, `title="Editar"`, antes da lixeira) **preenche o formulário de cima**, mostra a linha azul "✎ Editando … — cancelar edição" (`#1565c0`), destaca a linha em edição (borda `#1565c0`) e troca o botão para "Salvar alteração". O mesmo botão serve a adicionar e a editar (índice de edição em `window._…EditandoIndex`); salvar troca só aquele item. **Remover ou reabrir o drawer descarta a edição em andamento** (os índices mudam, e o estado não pode vazar para outro registro). Quem só visualiza não vê o lápis nem a lixeira.

### Topo compacto de tela de grade — faixa de indicadores + filtros em 1 linha (Contratos, 15/10/2026)
Quando cards e filtros empurram a grade para baixo da dobra, o padrão é:
- **Faixa de indicadores** (`.kpi-strip` > `.kpi-chip`, `styles.css`): uma barra só, com borda `--border`, fundo branco e raio 10; cada indicador é **número + rótulo lado a lado** (`.kpi-chip__valor` 1.25em bold na cor de status; `.kpi-chip__rotulo` 0.82em cinza), separados por divisor fino. Indicador clicável é `<button>` com `.kpi-chip--acao` (hover sutil); filtro ativo = `.kpi-chip--ativo` (fundo rosado + traço vermelho embaixo). Zero continua aparecendo, em cinza. Substitui os `bia-metric` altos nessas telas.
- **Filtros em 1 linha** (`.filtros-linha`): busca larga + os 2-3 filtros de uso diário, **sem rótulo acima** — a primeira opção do select nomeia o filtro ("Fornecedor: todos"), com `aria-label`/`title`. Os demais vão para **"⚙ Mais filtros"** (bloco `.filtros-linha--extra`, recolhido; o botão mostra "(n)" de filtros escondidos ativos e o bloco abre sozinho se houver algum). **"Limpar filtros"** só aparece quando há filtro ou indicador ativo e zera tudo. Contador "N itens" à direita da mesma linha. Os ids dos campos não mudam.

### Notificações por e-mail (DECISÃO 16/10/2026)
- **Tela de configuração + log** (Administração ▸ Notificações por e-mail, só Admin): a configuração fica num card na própria página, com o botão "Salvar configuração" no cabeçalho. Não usa drawer: é um formulário único da tela, como o limiar da régua em Critérios de Fornecedor. O log é uma `.data-table` paginada (20), com filtros v2.
- **Modo com estado visível**: select Desligado / Simulação / Ativo, com um pill ao lado nas cores de status (neutro / info / sucesso) e uma frase do que o modo faz. **Ligar o modo Ativo pede `confirm`**, com a recomendação de testar antes.
- **Status de envio** em pill: Enviado (sucesso), Simulado (info), Erro (perigo, com "N tentativa(s)" abaixo), Sem destinatário (aviso), Pendente e Ignorado (neutro).
- **Prévia de conteúdo gerado em `iframe` com `sandbox=""` + `srcdoc`**, dentro de um drawer somente leitura (só "Fechar", 720px). HTML gerado pelo sistema nunca vai direto no DOM da página.
- **E-mail gerado** (`functions/notificacoes.js`): HTML com estilos inline, largura de 640px, cabeçalho com a logo e a linha "GRC360 · Governança, Riscos e Conformidade" (mesmo padrão dos documentos gerados), botão vermelho `#d60014` "Abrir contrato", rodapé `#888` dizendo por que a pessoa recebe e versão em texto puro. Sem valores do contrato.

### Clonar contrato (DECISÃO 16/10/2026)
- A ação **Clonar fica só na coluna Ações da grade** (ícone de copiar em `stroke="#d60014"`, entre editar e excluir, como em Vulnerabilidades), nunca no rodapé do drawer. O rodapé do drawer de contrato é só Cancelar · Fechar · Salvar.
- Clonar **não grava**: abre um rascunho com os dados da linha. Não leva `id`, código (o novo é gerado ao salvar), número do contrato, alertas nem eventos; o objeto ganha "(cópia)". Fechar a cópia grava, porque ela ainda não existe no banco. Quem só lê não vê o ícone.

### Dado que vem de outra entidade, e pessoas com papel (DECISÃO 19/10/2026)
- **Dado derivado de outra entidade é bloco somente leitura com o link para a origem**, nunca campo desabilitado. Exemplo: no drawer do fornecedor, "Gestão pelos contratos vigentes" é uma tabela (Contrato · Gestor · Área responsável) sem nenhum input; clicar na linha abre o contrato (`abrirContratoDoFornecedor`). Sem dado, o bloco explica de onde ele vem ("Nenhum contrato vigente: o gestor e o setor vêm do contrato") e oferece a ação que o cria ("+ Novo contrato"). A fonte da verdade é uma só: o campo antigo some da tela (o dado antigo fica no banco até a migração, e a gravação não o zera).
- **Valor derivado na grade = 1º item + "+N", com a lista completa no `title`** (`_resumoLista`); vazio = "–". Coluna e filtro levam o nome da origem ("Área (contrato)", "Área do contrato").
- **Áreas relacionadas** = chips vermelhos com "×" (mesmo molde de Pessoa → Áreas) + select "Adicionar área…" que esconde as já escolhidas; "+ Nova área" abre o cadastro rápido e já devolve a área adicionada.
- **Pessoas relacionadas** = tabela Pessoa · Cargo · Área · Papel · ações. Cargo e área vêm sempre do cadastro de Pessoas (a cópia do nome só protege contra pessoa removida: "(removida)"; migrada sem cadastro: "(sem cadastro)"). Papel é select de lista fixa (`PAPEIS_RELACAO_FORNECEDOR`), obrigatório ao adicionar; a mesma pessoa não entra duas vezes (troca-se o papel). "+ Nova pessoa" abre o cadastro rápido e devolve a pessoa com o papel já escolhido, ou "Outro".
- **Quem só consulta não vê** a linha de adicionar, os selects nem os "×" (esconder, não desabilitar).

### Painel executivo — uma seção por pergunta (Painel de Vulnerabilidades, DECISÃO 19/10/2026)
- **Tela de visão executiva = seções numeradas, uma por pergunta da diretoria**, na ordem em que ela pergunta: `.painel-pergunta` (círculo vermelho com o número + a pergunta em texto corrido + referência NIST em `--ink-muted` à direita), seguida dos blocos que a respondem (`.painel-metricas`, `.painel-colunas`, `.painel-card`). O conteúdo vai dentro de `.painel-exec`: abaixo de 1100px as colunas viram uma só e os cards de métrica ficam 2 por linha (o resto do sistema não muda).
- **Card de métrica com tendência**: `trend` de `_htmlMetricCard` = variação contra o fechamento do mês anterior (`▲ +3 vs. set/26`, `▼ 2 vs. set/26`, `Igual a set/26`). Valor sem base = "–", nunca 0.
- **Índice de exposição** (um número só, comparável mês a mês): Crítica 10 · Alta 5 · Média 2 · Baixa 1; sem severidade pesa 0 e é contada à parte. Os pesos estão em `PESO` de `public/vulnerabilidade-painel.js` e na cópia do servidor `functions/painelVulnerabilidades.js` — o teste `tests/vulnerabilidade-painel.test.js` falha se divergirem.
- **Gráficos mensais** (SVG inline, 600×220): linha para estoque (backlog no fim do mês) e **barras agrupadas** para fluxo (novas × corrigidas). Cores do `CATEGORIA_CORES` (total `#37474f`, Críticas+Altas `#c62828`, novas `#e65100`, corrigidas `#558b2f`). Ponto **vazado** = mês reconstruído pelas datas; cheio = foto gravada ou hoje — a nota abaixo do gráfico explica. Alvo de hover = a coluna inteira do mês (`rect.ponto-monitor-hit`), mesma dica `#dicaMonitor` do Monitor, posicionada por `_posicionarDicaGrafico`; o texto vem de uma função pura testada (`linhasDicaMes`).
- **Tabela de "ação imediata"**: no máximo 10 linhas, ordem por prioridade, coluna **"Por quê" com os motivos em chips** (`_htmlBadge`: Crítica/Processo Tier 1 = l4, Alta com exploit/Atrasada Nd = l3, Acima do limiar sem risco = l2) e o critério escrito no subtítulo do card. A linha leva ao drawer (`#vulnerabilidades?vuln=ID`) só para quem vê a lista; para os demais a linha não tem `onclick` nem cursor de mão. Excedente = "E mais N…".
- **Percentual com cor** (no prazo, cobertura): ≥80% `#2e7d32`, ≥50% `#f57c00`, abaixo `#c62828` (mesma régua da Cobertura Tier 1 do Dashboard de Continuidade). Tempo de correção e saldo do backlog: subir é piorar (vermelho), cair é melhorar (verde).
- **Recorte de perfil**: o Gestor vê o painel (`vulnerabilidades-painel` em `perfis.js`), não lê o Registro de Riscos inteiro (a regra do banco exige filtro por área), então todo critério que depende de riscos some para ele, em vez de aparecer errado.

### Relatório executivo — documento gerado para a diretoria (DECISÃO 20/10/2026)
- **Onde:** telas "Relatório de Vulnerabilidades" e "Relatório de Riscos" no menu Riscos (ver Navegação), só para Admin e Segurança. Opções no card "Gerar relatório" da própria tela: período da tendência 6/12 meses, resumo por IA marcado por padrão, apêndice da lista completa no de Vulnerabilidades.
- **Abrir a aba no clique**, antes de qualquer `await` (senão o navegador bloqueia o popup): a aba mostra "Gerando…" e depois recebe o documento. Falha de carga = página de erro na mesma aba, nunca relatório vazio.
- **Casca comum `_htmlDocumentoExecutivo`** (app.js): cabeçalho das regras de documento gerado (logo absoluta com `onerror`, linha GRC360, `h1`, subtítulo com data e hora, selo "Classificação: Uso Interno", Imprimir / PDF), resumo por IA, **Destaques**, seções numeradas (uma por pergunta, ou por etapa do NIST SP 800-39 no de Riscos, com a referência à direita), notas metodológicas e rodapé "Gerado em … por {e-mail}". CSS próprio (`_CSS_DOCUMENTO_EXECUTIVO`): A4 com `@page`, `page-break-inside: avoid` nos blocos, `print-color-adjust: exact` em chips, barras e mapa. Chips do documento = `_chipDoc(texto, nivel)` (mesma escala l1–l4 em cores fixas, porque a aba não carrega os tokens).
- **Resumo por IA**: bloco com borda vermelha à esquerda, rotulado "Texto gerado por IA a partir dos números deste relatório — revise antes de distribuir". A IA recebe só `indicadoresParaIA` (agregados e até 10 itens de topo, sem texto livre como justificativas) e devolve **texto puro**, que a tela **escapa** — nunca HTML vindo da IA. Se falhar, o bloco diz "Resumo por IA indisponível (motivo)" e o relatório sai igual.
- **Destaques** (sempre presentes): frases montadas dos números (`destaques()` em `vulnerabilidade-painel.js` / `risco-relatorio.js`), que também servem de resumo quando a IA não é usada.
- **Mapa de calor da carteira** (Riscos): tabela 5×5, linhas = probabilidade (Muito alta em cima), colunas = impacto; número de riscos ativos na célula, fundo pela cor do nível da célula (Tabela I-2), célula vazia em "·" esmaecido; inerente e residual lado a lado.
- Gráfico do documento: o mesmo SVG do painel em modo `estatico` (sem alvos de hover).
- **Salvar no sistema (DECISÃO 20/10/2026):** o relatório gerado traz, abaixo do cabeçalho, o botão **"💾 Salvar no sistema"** (contorno vermelho, some na impressão). Ele chama `window.opener._salvarRelatorioExecutivoGerado(id)` — a aba do relatório não tem a API; sem a aba do sistema, o botão diz para voltar a ela. Depois de salvo: "✅ Salvo em …", desabilitado, e toast na aba do sistema. Salva-se **só quando a pessoa pede**.
- **Documento salvo = DADOS, nunca HTML do banco.** Grava-se o retrato JSON (`versao`, `tipo`, `opcoes`, `resumoIA`, `geradoEm`, `dados`) em `relatorios_executivos_conteudo`, com os metadados da lista em `relatorios_executivos`. Reabrir = `JSON.parse` + os mesmos geradores, que escapam tudo: HTML vindo do banco rodaria script na sessão de quem abrisse (a aba `about:blank` herda a origem do sistema). Edição imutável (sem update); só o Admin exclui. Valor que dependa do catálogo ou da data (nome do produto, "atrasada") é congelado no retrato ou calculado com a data da geração (`d.hoje`).
- **Edição reaberta**: faixa amarela clara "Edição salva — números e resumo de {data}, gerada por {e-mail}. Não reflete mudanças posteriores.", sem o botão de salvar; data do subtítulo e do rodapé = a da geração.
- **"Edições salvas"** em cada tela de relatório (só as edições daquele relatório), num `.painel-card` abaixo do card de gerar: tabela Edição (com a 1ª linha dos destaques) · Gerado em · Por · Período · Com IA · Ações (Abrir; lixeira só para Admin), paginação de 20.
- **Compartilhar com gestores (DECISÃO 20/10/2026):** ação "Compartilhar" em cada linha de "Edições salvas" (Admin e Segurança) → modal "Compartilhar com gestores": lista dos perfis de Gestor (e-mail · área), em ordem de e-mail, com caixa de seleção; quem já recebeu ou (no de Riscos) não tem área fica desabilitado com o motivo à direita; mensagem opcional; abaixo, "Já compartilhado" (gestor, enviado em/por, Aberto em… / Não aberto / Revogado, botão Revogar). Cada destinatário vira um documento em `relatorios_compartilhados` com o retrato **já pronto para ele**: no de **Riscos, recortado para a área do gestor** (`RiscoRelatorio.recortarPorArea`, retrato v2) e **sem o resumo da IA**; no de Vulnerabilidades, a edição inteira. A Segurança e o Admin continuam com a edição completa. Edição de Riscos v1 (sem a base do recorte): botão desabilitado com a dica para gerar de novo. Aviso por e-mail só com o link (sem números), pela mesma fila e modo das Notificações.
- **Lado do Gestor:** as telas "Relatório de Vulnerabilidades/Riscos" mostram só **"Compartilhados com você"** (edição, gerado em, compartilhado por, recorte, Abrir; chip "Novo" até a primeira abertura). O documento abre com a faixa "Compartilhado com você por … — recorte da área X"; no recorte, título "— área X", seção "Referência da empresa" só com agregados e sem a tabela "Carga por área". Abrir marca `abertoEm` uma vez; revogado some da lista.
- **Escopo do relatório — filtros antes de gerar (DECISÃO 20/10/2026):** no card "Gerar relatório", bloco "Escopo do relatório" (`.filters`) com um select por filtro (valor ou "Todos"; "Sem …" para vazio). As opções saem dos próprios dados (o que existe), não de listas fixas, exceto Tipo, Categoria, Status e os níveis mínimos. Vulnerabilidades: Produto · Equipe responsável · Responsável · Tipo · Severidade mínima · Detectadas de/até. Riscos: Produto · Área · Responsável · Origem · Categoria · Nível mínimo · Status (só os ativos). Abaixo, a **contagem ao vivo** ("N … no escopo · frase do escopo"); com zero, "Gerar relatório" fica desabilitado com o motivo. No documento: bloco "Escopo do relatório: …" logo após o cabeçalho (sem filtro, "empresa inteira (sem filtros)"), "Escopo filtrado" no subtítulo e rótulos "do escopo" no lugar de "da empresa". Tendência: Vulnerabilidades com filtro = reconstruída pelas datas; Riscos só com Área = série da área; outro filtro = seção explica que o retrato diário guarda só empresa e áreas. A IA recebe `escopo` e avisa o recorte na primeira frase. Edição salva guarda o escopo (aparece sob o título em "Edições salvas"); no compartilhar, gestor de área sem risco no escopo fica bloqueado ("sem riscos da área neste escopo").
- **Produto de Software no risco (DECISÃO 20/10/2026):** select "Produto de Software (opcional)" na aba Identificação do drawer de Risco, depois de Fornecedor: produtos ativos + o valor gravado mesmo inativo ("(inativo)") ou removido ("(produto removido)"). No risco de Vulnerabilidade, a dica diz "Herdado da vulnerabilidade {código}. Alterar aqui faz este campo deixar de acompanhar a vulnerabilidade." (a sincronização respeita a edição humana). Registro de Riscos: colunas na ordem Data · Área · Responsável · Produto · Origem · Processo · Categoria · Título · Reportado por, depois as de avaliação (DECISÃO 20/10/2026); coluna "Produto" ordenável ( sem produto = "–", sempre no fim da ordenação), filtro "Produto" (produtos que aparecem nos riscos + "Sem produto") e busca também pelo nome do produto.
- **Página executiva do Relatório de Riscos (DECISÃO 20/10/2026):** a primeira página é só a visão para a diretoria, nesta ordem:
  1. Faixa **"Situação geral"**: selo Piorando / Estável / Melhorando, com regra fixa explicada nas notas.
  2. **Cartões** Carga · Riscos ativos · Acima do apetite · Impacto R$, com ▲ vermelho / ▼ verde contra o mês anterior e o início do período.
  3. **Linha do tempo** em destaque: SVG da carga no fim de cada mês, linha vermelha; com filtro, a empresa em cinza tracejado no eixo da direita. Abaixo, barras de novos (laranja) × saídos (verde) e cartões **"O que mais mudou no período"**.
  4. **"Decisões que dependem da diretoria"** (no máximo 6 itens, cada um com número, exemplos e próximo passo).

  O resumo por IA e os Destaques abrem a página 2 (`.quebra-antes`), e o detalhamento segue: mapa de calor com as células acima do apetite contornadas em vermelho; top 5 em cartões; nível em barra empilhada. A tabela dos 10 principais e a linha do tempo mês a mês ficam no Apêndice.

  A linha do tempo vem do servidor (`serieRiscoPorEscopo`, reconstruída do livro de medições), para qualquer filtro. O mês corrente é sempre o estado ao vivo. Na impressão, somem os botões e os blocos ficam mais compactos, para a página executiva caber em uma A4.
- **Risco no Tempo: período e trecho reconstruído (DECISÃO 21/10/2026):** card de filtro "Período" (Últimos 90 dias · Últimos 6 meses · **Este ano**, o padrão · Últimos 12 meses), lido com `getHistoricoRiscoDesde`. Antes do início real do livro de medições (`inicioLivro`, gravado em cada retrato), os gráficos mostram **fundo cinza claro**, a etiqueta "reconstruído pela data de identificação" e uma **linha tracejada** na fronteira. Abaixo deles, a nota: "Antes de DD/MM/AAAA, a curva é reconstruída pela data de identificação de cada risco, com a avaliação mais antiga registrada…". Com mais de 90 dias, os pontos visíveis ficam pequenos; o alvo de hover continua o mesmo.

### Composição de Serviços — RTO/RPO/MTTR (DECISÃO 21/10/2026)
- **Campo de duração = número + unidade** (`_htmlCampoDuracao` / `_lerCampoDuracao` / `_preencherCampoDuracao`, app.js): input numérico + select `min | horas | dias`, gravado em **minutos** (`rtoMin`, `rpoMin`, `mttrMin`). Ao abrir, mostra na maior unidade exata. Texto antigo convertido sozinho; o que não converte aparece em laranja (`#e65100`) abaixo do campo ("Valor anterior "…" não pôde ser convertido") e é preservado enquanto o campo ficar vazio. O texto de compatibilidade (`rto`/`rpo`, ex.: "4 horas") é regravado junto, porque DRP, PCN e o SLA de contratos ainda o leem.
- **Hierarquia**: seção "Componentes abaixo" (chips vermelhos + busca) na aba Dados Gerais da Dependência — só categorias técnicas, sem ela mesma, sem quem já está acima (fecharia ciclo). Logo abaixo, bloco somente leitura **"Está abaixo de"** (borda esquerda `#d60014`, fundo `#fffafa`) com os Serviços e dependências de cima; o vínculo é editado no item de cima.
- **Alerta de composição** (calculado na leitura, nunca gravado — `ServicoComposicao.avaliarServico`): faixa no topo do drawer do Serviço, `#e65100` sobre `#fff3e0` com borda esquerda, uma linha por atributo ("RTO das dependências (caminho crítico) = 9 h > RTO do serviço = 4 h") e "Ver composição →". Recalcula enquanto se edita.
- **Selo de status de composição** (grade de Serviços, coluna e filtro "Composição"): pílula `2px 9px`, raio 10, `0.74em` 700 — Alerta `#c62828/#ffebee` (com ⚠️) · Incompleto `#f57c00/#fff3e0` · Sem parâmetros / Sem dependências `#757575/#f5f5f5` · OK `#2e7d32/#e8f5e9`. O `title` diz o motivo.
- **Aba Composição** do Serviço: tabela Atributo · Limite · Caminho crítico · Situação · Cadeia (soma com dependência sem valor = "(mín.)"); depois a árvore indentada, nó em caminho crítico com borda esquerda vermelha e fundo `#fffafa`, valor ausente "—" em laranja, ciclo "↻ ciclo".
- **Relatórios de Serviços** (`#servicos-relatorio`, menu Serviços, Admin/SI): mesmo padrão dos executivos (card "Gerar relatório" com **Tipo de relatório** + Escopo e contagem ao vivo, aba nova, Imprimir/PDF, "Salvar no sistema", Edições salvas da tela com os dois tipos), **sem IA e sem Compartilhar**.
- **Mapa de conexões** (documento): um serviço por página, **A4 paisagem** (`@page` só nesse documento); camadas Processos suportados → Serviço → dependências pelo nível; cartão com ícone, nome, categoria e RTO/RPO/MTTR; **tracejado** = falta valor; **borda e linha vermelhas `#d60014`** = caminho crítico, com a sigla do atributo na linha; ciclo = linha tracejada `#c62828`. O retrato salvo guarda o layout calculado.

### Mapa de Continuidade (DECISÃO 21/10/2026)
- **Onde:** `#mapa`, menu Continuidade de Negócio; Admin, Segurança e TI. Duas visões, alternadas pelos botões colados "Mapa centrado | Visão completa" (ativo = `btn-primary`): mapa mental **centrado num item** (padrão) e **visão completa**. Índice puro em `public/mapa-continuidade.js` — nenhum vínculo novo, só os campos existentes.
- **Cores fixas por tipo** (legenda sempre visível): Processo `#1565c0` · Serviço `#6a1b9a` · Dependência `#00838f` · Fornecedor `#ef6c00` · Contrato `#5d4037` · Backup `#455a64` · Pessoa `#2e7d32` · Instalação `#ad1457` · Área `#9e9d24`. O centro é um cartão cheio na cor do tipo; vizinhos são cartões com **fundo claro da cor do tipo** (`_corClaraMapa`, ~88% de branco), barra lateral, borda e nome na cor do tipo (subtítulo `#666`); selecionado = borda `#222` 2,5; lacuna = borda `#c62828` 3 + "!"; o rótulo da relação vai na linha (até 14 itens; acima disso só no `title`).
- **Lacuna** = anel `#c62828` no cartão + bolinha "!" — Processo Tier 1/2 sem PCN, dependência usada por processo/serviço sem DRP, serviço com composição em alerta, Instalação de que depende um processo Tier 1/2 sem instalação alternativa. No painel, faixa `#c62828` sobre `#ffebee` "Lacuna: …".
- **Navegação:** 1º clique seleciona (painel lateral); clique no já selecionado, ou "Centralizar", traz para o centro. Trilha "Início › … ›" clicável. Mais de 8 por tipo vira um cartão tracejado "+N {tipo}" que expande. Chips de tipo ligam/desligam grupos. Busca sem acento com o tipo ao lado. Endereço `#mapa?no=<tipo>:<id>` atualizado sem recarregar (link compartilhável).
- **Painel** (300px à direita): tipo na cor do tipo, nome, subtítulo, selos (Tier com `_htmlBadge`, PCN/DRP Sim verde/Não vermelho, RTO/RPO/MTTR, Composição, Situação do contrato), contagem de vínculos por tipo, **Centralizar** (primário) e **Abrir cadastro** (ghost) — só quando o perfil vê a tela de destino; o roteador abre o registro quando a tela termina de carregar (`window._abrirAposCarregar`).
- **"🗺️ Ver no mapa"** (ghost, depois de Fechar) nos drawers de Processo, Serviço e Dependência, só para quem vê o mapa: fecha pelo fluxo normal (pergunta se houver alteração) e abre o mapa centrado; registro não salvo → aviso "Salve o cadastro antes".
- Perfil sem acesso a Contratos (TI): o mapa abre sem eles, com a linha cinza "Contratos não aparecem no mapa: o seu perfil não tem acesso a eles."
- **Visão completa** (`#mapa?modo=completo`): todos os itens dos tipos ligados, em grafo de força com zoom (roda) e arrasto. Biblioteca **cytoscape.js 3.34.3 (MIT) servida do próprio domínio** (`public/vendor/cytoscape-3.34.3.min.js`, como o DOMPurify) e carregada **só ao abrir esta visão** — nunca CDN, nunca no `index.html`. Nó na cor do tipo, tamanho pelo número de ligações, rótulo abaixo (some quando afastado); lacuna = borda `#c62828`. Clique destaca o item e as ligações (o resto esmaece, as relações aparecem nas linhas) e abre o painel; duplo clique ou "Centralizar" volta ao mapa centrado nele. Acima, "N itens · M ligações · K com lacuna" e "Ajustar à tela"; com mais de 800 itens, aviso para usar os filtros. Falha ao baixar a biblioteca = `_htmlErroCarga`, nunca grafo vazio. O grafo é destruído ao trocar de visão ou de tela.

### Instalações — o "P" de Premises dos 4 Ps do BIA (DECISÃO 21/10/2026)
- **Onde:** categoria **"Instalações"** no catálogo e na tela **Dependências** (não tem tela própria). `DEPENDENCIA_CATEGORIAS_CATALOGO` = técnicas + Instalações (select do drawer, Componentes abaixo, relatórios, mapa); `DEPENDENCIA_CATEGORIAS_TECNICAS` não muda — Serviços escolhe só itens técnicos, e a instalação chega a eles pelos componentes. Ícone 📍.
- **Bloco "Dados da instalação"** na aba Dados Gerais do drawer, visível só quando a categoria é Instalações (troca ao mudar a categoria, sem apagar valores): Tipo (Sede · Filial · Escritório · Data center · Site alternativo · Home office · Outro) · Endereço · **Instalação alternativa (contingência)** — select com as outras instalações, nunca ela mesma, e "Nenhuma". RTO/RPO/MTTR, Componentes abaixo e DRP são os mesmos das demais dependências. "Está abaixo de" mostra também quem a usa como contingência.
- **Lotação da Pessoa:** select "Instalação (lotação)" no drawer da Pessoa (`{id, nome}`); aparece no relatório de vínculos da Pessoa.
- **BIA:** linha "Instalações" sempre presente na aba de dependências do Processo e na edição em lote (depois de Pessoas); cartão "4. Instalações" no formulário do gestor (`bia-dependencias.html`).
- **Mapa:** tipo próprio (cor `#ad1457`); relações "depende de" (processo), "lotada em"/"pessoa lotada", "instalada em"/"hospeda" (dependência técnica com a instalação nos componentes), "contingência"/"contingência de". Painel: Tipo, Endereço, Contingência (ou "Sem alternativa" em vermelho), RTO/RPO/MTTR.
- **PCN:** prompt e `template-pcn.md` nos 4 Ps (Pessoas · Instalações · Processos e Tecnologia · Fornecedores); a contingência indica a instalação alternativa com tipo e endereço reais e dimensiona pelas pessoas lotadas; sem alternativa vira risco, sem inventar local. A tabela técnica do DRP não inclui Instalações.
