# Referências de UI - BIA

## Paleta de Cores
- Primária: `#1a237e` (azul escuro)
- Primária clara: `#3949ab`
- Destaque: `#ff6b35` (laranja)
- Sucesso: `#2e7d32`
- Erro: `#c62828`
- Alerta: `#f57c00`
- Info: `#1565c0`
- Fundo: `#f5f6fa`
- Superfície: `white`
- Borda: `#e0e0e0`
- Texto principal: `#1a1a2e`
- Texto secundário: `#555`
- Texto desabilitado: `#999`

## Tiers
- Tier 1 (Crítico): `#c62828` (vermelho)
- Tier 2 (Essencial): `#f57c00` (laranja)
- Tier 3 (Suporte): `#1565c0` (azul)
- Pendente: `#999` (cinza)

## Tipografia
- Font family: sistema (sans-serif)
- Título de página (h2): 1.6em, bold, `#1a237e`
- Subtítulo: 0.9em, `#666`
- Label de campo: 0.85em, font-weight 600, `#444`
- Texto de input: 0.95em
- Texto de apoio: 0.8em, `#888`

## Componentes

### Modal
- max-width: 600px (padrão), 700px (grande)
- border-radius: 12px
- padding: 28px 32px
- box-shadow: 0 8px 32px rgba(0,0,0,0.18)
- Título: 1.2em, bold, `#1a237e`, border-bottom 2px solid `#e8eaf6`, padding-bottom 12px, margin-bottom 20px

### Campos de formulário
- Layout: grid 2 colunas quando possível (campos curtos como RTO/RPO/MTPD)
- Label: display block, margin-bottom 5px, font-size 0.82em, font-weight 600, color `#444`, text-transform uppercase, letter-spacing 0.4px
- Input/Select/Textarea: width 100%, padding 9px 12px, border 1.5px solid `#e0e0e0`, border-radius 7px, font-size 0.93em, transition border-color 0.2s
- Input focus: border-color `#1a237e`, outline none, box-shadow 0 0 0 3px rgba(26,35,126,0.08)
- Textarea: min-height 90px, resize vertical

### Botões
- Primário: background `#1a237e`, color white, padding 10px 24px, border-radius 7px, font-weight 600, font-size 0.93em
- Ghost: background white, color `#555`, border 1.5px solid `#ddd`, padding 10px 20px, border-radius 7px
- Hover primário: background `#283593`
- Ícone: padding 6px, border-radius 6px, hover background `#f5f5f5`

### Badges / Status
- display inline-block, padding 4px 10px, border-radius 12px, font-size 0.78em, font-weight 600, color white

### Tabela
- header: background `#1a237e`, color white, font-size 0.82em, text-transform uppercase, letter-spacing 0.5px, padding 12px
- row: border-bottom 1px solid `#f0f0f0`, hover background `#f8f9ff`
- cell: padding 12px, font-size 0.9em

### Cards (Painel)
- background white, border-radius 10px, padding 20px, box-shadow 0 1px 4px rgba(0,0,0,0.08)
- border-top 4px solid (cor do tier/status)

## Padrões de Layout
- Espaçamento entre campos: 16px (gap no grid)
- Espaçamento entre seções: 24px
- Campos agrupados (RTO/RPO/MTPD): grid 3 colunas
- Campos de texto longo (Descrição, Dependência): largura total
- Campos curtos (Área, BIA Homologada): podem ser lado a lado em 2 colunas
