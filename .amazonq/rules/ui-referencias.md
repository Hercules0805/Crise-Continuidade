# Guia de Identidade Visual e Padronização — Crise-Continuidade

> **Antes de criar ou alterar qualquer tela ou componente visual neste projeto, consulte este guia.**
> Qualquer decisão visual nova (cor, espaçamento, componente) que não se encaixe no que já existe aqui deve ser **adicionada a este arquivo**, não só ao código — para não voltarmos a divergir.
>
> Este documento reflete o que o código **realmente faz hoje** (levantado diretamente de `firebase-app/public/styles.css` e `app.js`), não uma aspiração. Onde o código diverge de si mesmo, isso está anotado na seção "Divergências conhecidas" no final — não escondido.

## 1. Paleta de cores

### Marca (indigo/navy)
| Token | Hex | Uso |
|---|---|---|
| Primária | `#1a237e` | Nav, `.btn-primary`, títulos de página/modal/drawer, cabeçalho de tabela, borda ativa de aba, texto da 1ª coluna de tabela |
| Primária (hover/gradiente) | `#283593` | Sempre em par com `#1a237e` num `linear-gradient(135deg, #1a237e, #283593)` ou como hover de `.btn-primary` |
| Primária clara (tint) | `#e8eaf6` | Fundo de badge de categoria/pilar, bordas de abas, caixas de destaque |

### Status / severidade (usar sempre estes 4 pares — não inventar variações)
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
- `#69f0ae` — usado **exclusivamente** para indicar item ativo no menu principal (`.nav-group.has-active`, `.nav-link.active`). Não é a mesma cor do "sucesso" (`#2e7d32`) e não deve ser usado fora da nav.

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
- `.btn-primary` — ação principal (Salvar, Novo Registro). `#1a237e` → hover `#283593`.
- `.btn-ghost` — ação secundária (Cancelar, filtros, exportar). Fundo `#f0f0f0`, texto `#555`.
- `.btn-ghost` com cor sobrescrita inline (`color:#c62828;border-color:#c62828;`) — convenção usada hoje para variações semânticas (excluir em lote, importar) já que não existe `.btn-danger`/`.btn-outline`. **Ao criar uma ação nova assim, reutilize exatamente essa convenção** (`.btn-ghost` + `color`/`border-color` inline na cor de status correspondente da seção 1) em vez de inventar uma cor nova.
- `.btn-icon` — ação em linha de tabela (editar/excluir), sempre com SVG inline (ver seção Ícones).

### Badges / Pills
Duas famílias coexistem, ambas válidas:
1. Classes fixas `.badge`/`.badge-green`/`.badge-gray` (styles.css) — usar para os 2 estados binários simples (ativo/inativo).
2. Pills inline geradas por função helper (`_badgeStatusRisco`, `_badgeProbImpactoRisco`, `_badgeDesvioIndicador`, badge de tier) — usar este padrão para qualquer status com **3 ou mais** estados ou cor dinâmica. Ao criar um badge novo desse tipo, siga o template:
   ```js
   `<span style="display:inline-block;padding:3px 10px;border-radius:12px;font-size:0.78em;font-weight:600;color:white;background:${cor};">${texto}</span>`
   ```
   usando as cores da seção 1 (nunca uma cor nova sem adicionar à paleta de status primeiro).

### Modal vs. Drawer
- **Modal** (`.modal-overlay`/`.modal`, centralizado, `max-width` 480-580px conforme o formulário): para entidades de **tela única** (Perguntas, Áreas, Config. de Respostas, Componentes, Indicadores).
- **Drawer** (`.drawer-overlay`/`.drawer`, painel lateral de `70vw`): para entidades com **abas internas** (Processo, Risco, Dependência — "Dados Gerais"/"DRP"), **ou** para um modal de formulário único que cresceu com uma sub-lista repetível embutida (mini-CRUD) — é o caso de Fornecedores (mini-CRUD de "Pessoas associadas"), que virou drawer mesmo sem abas, pelo espaço vertical extra que isso dá. Se uma tela nova precisar de mais de uma seção/aba de formulário, ou tiver um mini-CRUD embutido, use drawer; se for um formulário simples, use modal.

### Abas (tabs)
Um único padrão de aba, usado (e que deve continuar sendo usado) em `trocarAbaProcesso`, `trocarAbaRisco` e `trocarAbaIndicadores`:
- Ativa: `color:#1a237e; border-bottom:3px solid #1a237e; font-weight:700;`
- Inativa: `color:#999; border-bottom:3px solid transparent;`
- Padding `10px 20px`, `font-size:0.88em`, faixa com `border-bottom:2px solid #e8eaf6`.
- Largura: `flex:1` (abas dividem o espaço) quando há muitas abas dentro de um drawer estreito; largura fixa quando são poucas abas (2-3) numa tela cheia — escolha conforme o espaço disponível, não é uma regra rígida.

### Tabela + paginação
- `.data-table`: cabeçalho `#1a237e`/branco/uppercase, linha com hover `#f8f9fa`, 1ª coluna em negrito `#1a237e`.
- **Ordenação**: use `criarOrdenacao(colunaInicial, direcaoInicial)` (`util.js`) em vez de montar `{coluna, direcao}` + `ordenarX()` na mão — é a fábrica que toda tela de grade usa hoje (Áreas, Pessoas, Dependências, Processos, Riscos, Fornecedores, Perfis, Categorias/Critérios de Fornecedor). Cabeçalho: `<th onclick="ordenarX('campo')">Rótulo <span id="sort-prefixo-campo"></span></th>`; depois de montar a lista, chame `estado.atualizarSetas('sort-prefixo-', ['campo1', 'campo2', ...])`. Para ordenar por um valor calculado ou com "nulo sempre por último" (score de Risco, nota de Fornecedor), passe um comparador em `aplicar(lista, {campo: (a, b, dir) => ...})` — `dir` já vem em `+1`/`-1`, o comparador só precisa aplicá-lo.
- **Clique na linha para editar**: `<tr style="cursor:pointer;" onclick="editarX(id)">`, com a célula de Ações usando `onclick="event.stopPropagation();"` ao redor dos botões, pra clicar num ícone não também disparar o clique da linha. Padrão obrigatório em toda grade nova com uma tela de edição 1-para-1 (ver Riscos como referência). Exceções conhecidas, não copiar sem entender o motivo: **Indicadores-Cadastro** (célula de Meta Mínima é editável inline e a coluna de checkbox de seleção em massa não tem `stopPropagation` — adicionar clique-na-linha ali sem tratar essas duas células primeiro abriria o modal por engano), **Indicadores-Matriz** (somente leitura, sem função de editar) e **Perguntas** (não é uma `<table>`, filtra escondendo/mostrando cards agrupados por categoria).
- **Paginação**: obrigatória para qualquer lista que possa passar de ~20-30 registros (ver implementação em Indicadores: `INDICADORES_POR_PAGINA`, rodapé "Mostrando X–Y de Z" + botões `‹ Anterior`/`Próxima ›` com `.btn-ghost`). Ao criar uma tela nova com potencial de crescer, adicione paginação desde o início nesse mesmo padrão — não espere virar um problema.

### Barra de filtros
Padrão único (label + input/select), usado em Processos/Dependências/Componentes/Riscos/Indicadores:
```
label: font-size:0.9em; font-weight:600; color:#555; margin-bottom:6px; display:block;
select/input: padding:8px 12px; border:1px solid #ddd; border-radius:7px; font-size:0.9em; min-width:180-300px conforme o campo;
input de busca: padding:8px 14px; border-radius:8px;
```

### Formulários em modal/drawer
Convenção recomendada para telas novas (a mesma usada em Processo/Risco/Dependência/Componente): label uppercase (ver seção Tipografia) + input `border:1.5px solid #e0e0e0; border-radius:7px; padding:9px 12px; font-size:0.93em;`, foco com `border-color:#1a237e`.

### Listas editáveis dentro de modal/drawer
Duas famílias, conforme a forma do item:
- **Item com várias colunas** (Plano de Ação/KRIs do drawer de Risco, "Pessoas associadas" do drawer de Fornecedor): mini-formulário com um campo por coluna + botão "+ Adicionar", que vira "Salvar alteração" ao clicar no ícone de editar de uma linha (mesmo array em `window._algumaCoisa`, adiciona ou sobrescreve por índice, hidratado do registro ao abrir e devolvido inteiro no payload de salvar).
- **Item de texto livre, um campo só** (as 4 listas da aba DRP de Dependência — Health Check, Runbook, Critérios de Retorno, Limitações): mesma ideia acima, simplificada — uma caixa de texto + "+ Adicionar", sem mini-formulário de várias colunas. Ganha também **chips de sugestão** clicáveis acima da caixa (exemplos prontos que preenchem o campo pra revisar antes de adicionar, em vez de adicionar direto) sempre que a tela tiver uma referência natural de "exemplos de bom preenchimento" pra oferecer — é o padrão pra "guiar com opções" em vez de caixa de texto em branco. Ver `renderDrpLista`/`adicionarDrpItem`/`editarDrpItem`/`removerDrpItem`/`moverDrpItem` em `app.js` como implementação de referência, incluindo os botões ▲/▼ de reordenar (só fazem sentido quando a ordem dos itens importa, como no Runbook — não é obrigatório em toda lista deste tipo).

### Toasts (`showToast(mensagem, cor)`)
Não existe uma API por nome de severidade — a cor é passada como hex literal em cada chamada. Use sempre uma destas (não invente uma nova):
| Tipo de mensagem | Cor |
|---|---|
| Sucesso (salvo, excluído) | `#2e7d32` |
| Erro | `#c62828` |
| Validação (campo obrigatório faltando) | `#e65100` |
| Em andamento ("Salvando...", "Gerando...") | `#1a237e` ou `#1565c0` |
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
**Exceção conhecida, não copiar sem entender o motivo**: os saves de Processo e de Dependências (`salvarProcesso`/`salvarDep`) usam um padrão **otimista** (fecham o drawer/modal e atualizam a grade imediatamente, antes do `await` terminar, com toast "Salvando..." e reversão em caso de erro) — isso já resolve o problema de feedback de um jeito diferente e não deve ser forçado para `comBotaoCarregando`, que pressupõe manter o formulário aberto até o fim do save.

### Máscaras de entrada (`formatarCNPJ(valor)` / `formatarTelefoneBR(valor)`)
Primeiras máscaras do sistema (`util.js`), usadas em Fornecedores (CNPJ e Telefone). Convenção: `oninput="this.value=formatarX(this.value)"` no próprio `<input>`, e formatar **também ao abrir o formulário** (não só ao digitar), pra dado antigo sem máscara mostrar formatado assim que a tela abre — ex. `document.getElementById('fornCadCnpj').value = formatarCNPJ(f ? (f.cnpj || '') : '');`. Sem preservação de cursor no meio do texto (aceitável pra campo curto digitado do início pro fim); se surgir uma nova máscara (CPF, moeda), siga o mesmo formato de função pura em `util.js`.

### Skeleton loading
`.skeleton`/`.skeleton-row` (efeito shimmer) — usado hoje só em Perguntas e no carregamento de PCN. Para telas novas, o padrão mais simples e já dominante é o texto `<div class="loading">⏳ Carregando...</div>`; use skeleton só se a tela tiver uma tabela grande onde o "pulo" de conteúdo incomodaria.

### Navegação
`.nav`/`.nav-group`/`.nav-dropdown` (definidos em `styles.css`, markup em `index.html`). Uma tela nova entra como item dentro de um dos 5 grupos existentes (Continuidade de Negócio, Riscos, Indicadores, Fornecedores, Administração) — evite criar um 6º grupo sem necessidade clara. O grupo "Cadastros" foi extinto: Perguntas/Áreas/Pessoas/Dependências entraram em Continuidade de Negócio. Os subitens de cada grupo ficam em **ordem alfabética** (exceto quando uma ordem diferente for pedida explicitamente) — ao adicionar um item novo, insira na posição alfabética certa, não no fim da lista.

### Ícones
**Convenção para telas novas: SVG inline, não emoji**, para ações de linha de tabela (editar/excluir) — copie o par de ícones já usado em Áreas/Processos/Dependências/Componentes/Riscos/Indicadores (lápis laranja `#ff6b35` + lixeira cinza `#999`). Emoji continuam aceitáveis em: texto de botão/cabeçalho (📥 Importar, 📁 pasta, 🔍 placeholder de busca) e prefixo de toast (✅/❌/⏳) — isso já é consistente em toda a base.

## 5. Divergências conhecidas (não corrigidas nesta rodada — cuidado ao copiar o "padrão errado")

Estas inconsistências existem hoje no código e são conhecidas; normalizar aos poucos, ao tocar em cada tela — não foram corrigidas de uma vez por exigirem mudança em muitos pontos sem verificação visual disponível neste ambiente:

- **5 tons de cinza quase idênticos** (`#888`, `#999`, `#666`, `#555`, mais `#757575`) usados de forma intercambiável para "texto secundário" dependendo de qual tela foi escrita quando. Ao criar algo novo, prefira `#888`.
- **3 estilos de label diferentes** em modais/drawers (uppercase 0.78em/700, `.modal label` simples 0.82em/600 sem uppercase, e a variante própria de `bia-dependencias.html`). Ao criar algo novo, use o uppercase (seção 3).
- **Páginas públicas standalone** (`bia-dependencias.html`, `drp-componentes.html`, `pcn-levantamento.html`, `cadastrar-areas.html`, `login.html`, `pcn-viewer.html`) **não carregam `styles.css`** — têm CSS 100% próprio, incluindo uma classe `.btn-primary` com valores diferentes da do app principal. Elas concordam no essencial (cores de marca, verde/vermelho de sucesso/erro), mas os componentes (botões, cards, chips) são implementações paralelas. Não migrar isso "de graça" — é um projeto à parte.
- **Badges/pills com padding/radius levemente diferentes entre telas** (ex. `padding:4px 10px` vs `4px 12px` para o mesmo tipo de badge de tier/status). Ao criar um badge novo, use o template da seção 4 (Badges/Pills).
- **Perguntas e Config. de Respostas** ainda usam emoji (✏️/🗑️) em vez de SVG para editar/excluir — telas mais antigas, pré-datam a convenção de ícone SVG. Não é para ser copiado em telas novas.
- **Colisão de `id="modal"`** entre Perguntas e Áreas — as duas telas usam literalmente o mesmo id pro modal (e `#modalTitulo`/`#fId`/`fecharModal()` em comum). Inofensivo hoje porque a navegação recria `app.innerHTML` inteiro a cada troca de tela (só uma delas fica montada no DOM por vez), mas frágil pra qualquer mudança futura que monte mais de um painel ao mesmo tempo. Não copiar esse padrão em tela nova — dê um id próprio ao modal.
