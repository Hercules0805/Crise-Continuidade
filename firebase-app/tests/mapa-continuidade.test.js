// Mapa de Continuidade (21/10/2026): indice de vinculos do nucleo BIA/PCN/DRP (public/mapa-continuidade.js).
const { test } = require('node:test');
const assert = require('node:assert');
const MC = require('../public/mapa-continuidade.js');
const SC = require('../public/servico-composicao.js');
const Criticidade = require('../public/criticidade.js');

const DADOS = {
  areas: [{ id: 'a1', nome: 'Financeiro', responsavel: 'Ana Souza' }, { id: 'a2', nome: 'TI', responsavel: '' }],
  dependencias: [
    { id: 'pAna', categoria: 'Pessoas', nome: 'Ana Souza', areas: ['Financeiro'] },
    { id: 'pBeto', categoria: 'Pessoas', nome: 'Beto Lima', areas: ['TI'], liderImediato: 'pAna' },
    { id: 'fX', categoria: 'Fornecedores', nome: 'Nuvem SA', nomeFantasia: 'NuvemX', pessoasRelacionadas: [{ id: 'pBeto', nome: 'Beto Lima', papel: 'Ponto focal' }], areasRelacionadas: ['TI'] },
    { id: 'infra', categoria: 'Infraestrutura', nome: 'Cluster K8s', rtoMin: 120, componentes: [{ id: 'db', nome: 'Oracle', categoria: 'Banco de Dados' }], responsavel: 'TI', drpSalvo: '' },
    { id: 'db', categoria: 'Banco de Dados', nome: 'Oracle', rtoMin: 240, drpSalvo: '[{"versao":1}]', drpDependencias: [{ id: 'fX', nome: 'Nuvem SA', categoria: 'Fornecedores' }] },
    { id: 'pi', categoria: 'Processos Internos', nome: 'ignorado' },
  ],
  processos: [
    // Tier 1 por tierManual, sem PCN -> lacuna. Depende de infra (id), do fornecedor por NOME (legado) e do processo p2.
    { id: 'p1', area: 'Financeiro', processo: 'Faturamento', tierManual: 'Tier 1 (Crítico)', pcnSalvo: '',
      dependenciaItens: [{ id: 'infra', nome: 'Cluster K8s', categoria: 'Infraestrutura' }, { nome: 'Nuvem SA', categoria: 'Fornecedores' },
        { id: 'p2', nome: 'Cobrança', categoria: 'Processos Internos' }, { id: 'sumiu', nome: 'Velho', categoria: 'Servidor' }],
      bcpContatos: '["pBeto"]' },
    { id: 'p2', area: 'Financeiro', processo: 'Cobrança', tierManual: 'Tier 2 (Essencial)', pcnSalvo: '[{"versao":1,"html":"x"}]' },
    { id: 'p3', area: 'Jurídico', processo: 'Contencioso', tierManual: 'Tier 3 (Suporte)' },
  ],
  servicos: [{ id: 's1', nome: 'Portal', rtoMin: 60, rpoMin: 60, mttrMin: 60, processoIds: [{ id: 'p1' }],
    dependenciaItens: [{ id: 'infra', nome: 'Cluster K8s', categoria: 'Infraestrutura' }], stakeholders: [{ id: 'pAna', nome: 'Ana Souza' }] }],
  contratos: [{ id: 'c1', codigo: 'CT-0001', objeto: 'Nuvem', fornecedorId: 'fX', fornecedorNome: 'Nuvem SA', area: 'TI', statusId: 's',
    gestor: { id: null, nome: 'Beto Lima' }, dependenciasCobertas: [{ id: 'db', nome: 'Oracle', categoria: 'Banco de Dados' }] }],
  backups: [{ id: 'b1', nome: 'Backup Oracle', servicoIds: ['s1'], servidorId: 'db' }],
};

const TECNICAS = DADOS.dependencias.filter((d) => !['Pessoas', 'Fornecedores', 'Processos Internos'].includes(d.categoria));
const OPCOES = {
  tierDe: Criticidade.tierDoProcesso,
  avaliarServico: (s) => SC.avaliarServico(s, TECNICAS),
  situacaoContrato: () => 'Vigente',
  valorMin: SC.valorMin,
};
const idx = () => MC.montarIndice(DADOS, OPCOES);
const rels = (i, de, para) => (i.adj[de] || []).filter((x) => x.para === para).map((x) => x.rel).sort();

test('nos de todos os tipos, com ids tipados; Processos Internos de dependencias nao vira no', () => {
  const i = idx();
  ['processo:p1', 'processo:p2', 'area:financeiro', 'area:ti', 'pessoa:pAna', 'fornecedor:fX', 'dependencia:infra', 'dependencia:db',
    'servico:s1', 'contrato:c1', 'backup:b1'].forEach((id) => assert.ok(i.nos[id], id));
  assert.ok(!Object.keys(i.nos).some((k) => k.endsWith(':pi')));
  assert.strictEqual(i.nos['fornecedor:fX'].nome, 'NuvemX');
  assert.strictEqual(i.nos['area:juridico'].ausente, true, 'area citada mas nao cadastrada');
});

test('vinculos do processo: area, dependencia por id, fornecedor por nome (legado), processo interno e contato de crise', () => {
  const i = idx();
  assert.deepStrictEqual(rels(i, 'processo:p1', 'area:financeiro'), ['pertence à área']);
  assert.deepStrictEqual(rels(i, 'processo:p1', 'dependencia:infra'), ['depende de (direto, legado)'], 'tecnico direto no processo e legado');
  assert.deepStrictEqual(rels(i, 'processo:p1', 'fornecedor:fX'), ['depende de']);
  assert.deepStrictEqual(rels(i, 'processo:p1', 'processo:p2'), ['depende do processo']);
  assert.deepStrictEqual(rels(i, 'processo:p2', 'processo:p1'), ['processo dependente']);
  assert.deepStrictEqual(rels(i, 'processo:p1', 'pessoa:pBeto'), ['contato de crise']);
  assert.ok(!i.adj['processo:p1'].some((x) => x.para.endsWith(':sumiu')), 'id que nao existe mais e ignorado');
});

test('vinculos de area, pessoa, fornecedor, dependencia, servico, contrato e backup', () => {
  const i = idx();
  assert.deepStrictEqual(rels(i, 'area:financeiro', 'pessoa:pAna'), ['membro', 'responsável'].sort());
  assert.deepStrictEqual(rels(i, 'pessoa:pBeto', 'pessoa:pAna'), ['líder imediato']);
  assert.deepStrictEqual(rels(i, 'fornecedor:fX', 'pessoa:pBeto'), ['Ponto focal']);
  assert.deepStrictEqual(rels(i, 'fornecedor:fX', 'area:ti'), ['área relacionada']);
  assert.deepStrictEqual(rels(i, 'dependencia:infra', 'dependencia:db'), ['componente abaixo']);
  assert.deepStrictEqual(rels(i, 'dependencia:db', 'fornecedor:fX'), ['precisa para recuperar']);
  assert.deepStrictEqual(rels(i, 'dependencia:infra', 'area:ti'), ['área responsável']);
  assert.deepStrictEqual(rels(i, 'servico:s1', 'processo:p1'), ['suporta']);
  assert.deepStrictEqual(rels(i, 'servico:s1', 'dependencia:infra'), ['usa']);
  assert.deepStrictEqual(rels(i, 'servico:s1', 'pessoa:pAna'), ['stakeholder']);
  assert.deepStrictEqual(rels(i, 'contrato:c1', 'fornecedor:fX'), ['fornecedor']);
  assert.deepStrictEqual(rels(i, 'contrato:c1', 'dependencia:db'), ['cobre']);
  assert.deepStrictEqual(rels(i, 'contrato:c1', 'pessoa:pBeto'), ['gestor'], 'gestor sem id casa pelo nome');
  assert.deepStrictEqual(rels(i, 'backup:b1', 'servico:s1'), ['protege o serviço']);
  assert.deepStrictEqual(rels(i, 'backup:b1', 'dependencia:db'), ['servidor']);
});

test('selos e lacunas: Tier 1 sem PCN, dependencia usada sem DRP, servico em alerta', () => {
  const i = idx();
  assert.deepStrictEqual(i.nos['processo:p1'].lacunas, ['Tier 1 sem PCN', '1 ligação técnica direta']);
  assert.deepStrictEqual(i.nos['processo:p2'].lacunas, [], 'Tier 2 com PCN');
  assert.deepStrictEqual(i.nos['processo:p3'].lacunas, [], 'Tier 3 sem PCN nao e lacuna');
  assert.strictEqual(i.nos['processo:p2'].selos.pcn, true);
  assert.deepStrictEqual(i.nos['dependencia:infra'].lacunas, ['Sem DRP']);
  assert.deepStrictEqual(i.nos['dependencia:db'].lacunas, [], 'tem DRP');
  assert.strictEqual(i.nos['dependencia:db'].selos.valores.rto, 240);
  assert.strictEqual(i.nos['servico:s1'].selos.composicao, 'alerta', 'infra 2h + db 4h > 1h');
  assert.deepStrictEqual(i.nos['servico:s1'].lacunas, ['Composição em alerta']);
  assert.strictEqual(i.nos['contrato:c1'].selos.situacao, 'Vigente');
});

test('vizinhos: agrupados por tipo na ordem fixa, relacoes juntas, lacunas primeiro, filtro por tipo', () => {
  const i = idx();
  const g = MC.vizinhos(i, 'processo:p1');
  assert.deepStrictEqual(g.map((x) => x.tipo), ['processo', 'servico', 'dependencia', 'fornecedor', 'pessoa', 'area']);
  const pessoaAna = MC.vizinhos(i, 'area:financeiro').find((x) => x.tipo === 'pessoa').itens.find((x) => x.id === 'pessoa:pAna');
  assert.deepStrictEqual(pessoaAna.rels.sort(), ['membro', 'responsável']);
  assert.deepStrictEqual(MC.vizinhos(i, 'processo:p1', ['area']).map((x) => x.tipo), ['area']);
  const procsDaArea = MC.vizinhos(i, 'area:financeiro').find((x) => x.tipo === 'processo').itens.map((x) => x.nome);
  assert.deepStrictEqual(procsDaArea, ['Faturamento', 'Cobrança'], 'com lacuna primeiro');
});

test('busca sem acento, pontos de partida e contagem de vinculos', () => {
  const i = idx();
  assert.deepStrictEqual(MC.buscar(i, 'cobranca').map((n) => n.id), ['processo:p2']);
  assert.ok(MC.buscar(i, 'financeiro').some((n) => n.id === 'processo:p1'), 'acha pela area (sub)');
  const pp = MC.pontosDePartida(i);
  assert.deepStrictEqual(pp.tier1.map((n) => n.id), ['processo:p1']);
  assert.deepStrictEqual(pp.lacunas.map((n) => n.id), ['processo:p1', 'servico:s1', 'dependencia:infra']);
  assert.deepStrictEqual(MC.contagemVinculos(i, 'servico:s1'), { processo: 1, dependencia: 1, pessoa: 1, backup: 1 });
});

test('sem contratos (perfil TI): indice monta, sem nos de contrato, e avisa', () => {
  const i = MC.montarIndice(Object.assign({}, DADOS, { contratos: null }), OPCOES);
  assert.strictEqual(i.semContratos, true);
  assert.ok(!Object.keys(i.nos).some((k) => k.startsWith('contrato:')));
  assert.strictEqual(idx().semContratos, false);
});

test('elementosGrafo (visao completa): um no por item, uma ligacao por par, filtro por tipo e grau', () => {
  const i = idx();
  const g = MC.elementosGrafo(i);
  assert.strictEqual(g.nos.length, Object.keys(i.nos).length);
  const ids = g.arestas.map((e) => e.de + '|' + e.para);
  assert.strictEqual(new Set(ids).size, ids.length, 'sem par duplicado');
  const par = g.arestas.find((e) => [e.de, e.para].sort().join() === ['area:financeiro', 'pessoa:pAna'].sort().join());
  assert.ok(par.rels.length >= 1);
  const p1 = g.nos.find((n) => n.id === 'processo:p1');
  assert.strictEqual(p1.lacuna, true);
  assert.strictEqual(p1.grau, MC.contagemVinculos(i, 'processo:p1') ? Object.values(MC.contagemVinculos(i, 'processo:p1')).reduce((s, n) => s + n, 0) : 0);
  const soProc = MC.elementosGrafo(i, ['processo', 'area']);
  assert.ok(soProc.nos.every((n) => ['processo', 'area'].includes(n.tipo)));
  assert.ok(soProc.arestas.every((e) => /^(processo|area):/.test(e.de) && /^(processo|area):/.test(e.para)));
});

// ---- Instalacoes (21/10/2026): o "P" de Premises ----
const DADOS_INST = {
  areas: [{ id: 'a1', nome: 'TI' }],
  dependencias: [
    { id: 'sede', categoria: 'Instalações', nome: 'Sede SP', tipoInstalacao: 'Sede', endereco: 'Av. Paulista', rtoMin: 1440, instalacaoAlternativa: { id: 'filial', nome: 'Filial RJ' } },
    { id: 'filial', categoria: 'Instalações', nome: 'Filial RJ', tipoInstalacao: 'Filial' },
    { id: 'dc', categoria: 'Instalações', nome: 'Data center', tipoInstalacao: 'Data center' },
    { id: 'srv', categoria: 'Servidor', nome: 'SRV-01', componentes: [{ id: 'dc', nome: 'Data center', categoria: 'Instalações' }, { id: 'db', nome: 'Oracle', categoria: 'Banco de Dados' }] },
    { id: 'db', categoria: 'Banco de Dados', nome: 'Oracle' },
    { id: 'pAna', categoria: 'Pessoas', nome: 'Ana', instalacao: { id: 'sede', nome: 'Sede SP' } },
  ],
  processos: [
    { id: 'p1', area: 'TI', processo: 'Faturamento', tierManual: 'Tier 1 (Crítico)', dependenciaItens: [{ id: 'sede', nome: 'Sede SP', categoria: 'Instalações' }, { id: 'dc', nome: 'Data center', categoria: 'Instalações' }] },
    { id: 'p3', area: 'TI', processo: 'Arquivo', tierManual: 'Tier 3 (Suporte)', dependenciaItens: [{ id: 'filial', nome: 'Filial RJ', categoria: 'Instalações' }] },
  ],
  servicos: [], contratos: [], backups: [],
};
const idxInst = () => MC.montarIndice(DADOS_INST, OPCOES);

test('instalacao: no proprio (tipo, endereco, contingencia, RTO) e os vinculos dos 4 Ps', () => {
  const i = idxInst();
  const sede = i.nos['instalacao:sede'];
  assert.strictEqual(sede.tipo, 'instalacao');
  assert.strictEqual(sede.sub, 'Sede');
  assert.deepStrictEqual([sede.selos.endereco, sede.selos.alternativa, sede.selos.valores.rto], ['Av. Paulista', 'Filial RJ', 1440]);
  assert.deepStrictEqual(rels(i, 'processo:p1', 'instalacao:sede'), ['depende de']);
  assert.deepStrictEqual(rels(i, 'pessoa:pAna', 'instalacao:sede'), ['lotada em']);
  assert.deepStrictEqual(rels(i, 'instalacao:sede', 'pessoa:pAna'), ['pessoa lotada']);
  assert.deepStrictEqual(rels(i, 'dependencia:srv', 'instalacao:dc'), ['instalada em']);
  assert.deepStrictEqual(rels(i, 'instalacao:dc', 'dependencia:srv'), ['hospeda']);
  assert.deepStrictEqual(rels(i, 'dependencia:srv', 'dependencia:db'), ['componente abaixo'], 'componente tecnico segue com o rotulo de sempre');
  assert.deepStrictEqual(rels(i, 'instalacao:sede', 'instalacao:filial'), ['contingência']);
  assert.deepStrictEqual(rels(i, 'instalacao:filial', 'instalacao:sede'), ['contingência de']);
});

test('instalacao: lacuna "Sem instalação alternativa" so quando um processo Tier 1/2 depende dela', () => {
  const i = idxInst();
  assert.deepStrictEqual(i.nos['instalacao:dc'].lacunas, ['Sem instalação alternativa'], 'Tier 1 depende e nao ha alternativa');
  assert.deepStrictEqual(i.nos['instalacao:sede'].lacunas, [], 'tem alternativa');
  assert.deepStrictEqual(i.nos['instalacao:filial'].lacunas, [], 'so Tier 3 depende');
  assert.ok(!i.nos['instalacao:dc'].lacunas.includes('Sem DRP'), 'DRP nao e cobrado de instalacao');
  assert.ok(MC.TIPOS.includes('instalacao'));
  assert.deepStrictEqual(MC.vizinhos(i, 'instalacao:sede').map((g) => g.tipo), ['processo', 'pessoa', 'instalacao']);
});

// ---- Revisao do Processo (21/10/2026) ----

test('fallback por nome (item legado sem id): exige a categoria e nao liga quando o nome e ambiguo', () => {
  const dados = {
    areas: [], servicos: [], contratos: [], backups: [],
    dependencias: [
      { id: 'a1', categoria: 'Sistemas', nome: 'ERP' },
      { id: 'a2', categoria: 'Sistemas', nome: 'ERP' },
      { id: 'b1', categoria: 'Servidor', nome: 'Linux' },
      { id: 'c1', categoria: 'API', nome: 'Gateway' },
      { id: 'c2', categoria: 'Fornecedores', nome: 'Gateway' },
    ],
    processos: [{ id: 'p', area: 'TI', processo: 'X', dependenciaItens: [
      { nome: 'ERP', categoria: 'Sistemas' }, // homonimos na mesma categoria
      { nome: 'Linux', categoria: 'API' }, // categoria diferente: nao liga ao Servidor
      { nome: 'Gateway' }, // sem categoria e o nome existe em duas
      { nome: 'Gateway', categoria: 'API' }, // com categoria desambigua
    ] }],
  };
  const i = MC.montarIndice(dados, OPCOES);
  const ligados = i.adj['processo:p'].map((x) => x.para).filter((id) => !id.startsWith('area:')).sort();
  assert.deepStrictEqual(ligados, ['dependencia:c1']);
});

test('instalacao: lacuna tambem quando o processo Tier 1/2 chega nela por servico -> dependencia -> instalada em', () => {
  const dados = JSON.parse(JSON.stringify(DADOS_INST));
  dados.processos = [{ id: 'p9', area: 'TI', processo: 'Pix', tierManual: 'Tier 2 (Essencial)', dependenciaItens: [] }];
  dados.servicos = [{ id: 's9', nome: 'Pix API', processoIds: [{ id: 'p9' }], dependenciaItens: [{ id: 'srv', nome: 'SRV-01', categoria: 'Servidor' }] }];
  const i = MC.montarIndice(dados, OPCOES);
  assert.deepStrictEqual(i.nos['instalacao:dc'].lacunas, ['Sem instalação alternativa']);
  assert.deepStrictEqual(i.nos['instalacao:filial'].lacunas, [], 'nao esta no caminho do processo');
});

test('processo aponta o Servico (item Serviços no processo): aresta sem repetir a do servico.processoIds legado', () => {
  const dados = JSON.parse(JSON.stringify(DADOS));
  dados.processos[1].dependenciaItens = [{ categoria: 'Serviços', id: 's1', nome: 'Portal' }];
  const i = MC.montarIndice(dados, OPCOES);
  assert.deepStrictEqual(rels(i, 'processo:p2', 'servico:s1'), ['suportado pelo serviço']);
  assert.deepStrictEqual(rels(i, 'servico:s1', 'processo:p2'), ['suporta']);
  // p1 e ligado pelos dois lados (item no processo + processoIds legado): uma aresta so.
  dados.processos[0].dependenciaItens.push({ categoria: 'Serviços', id: 's1', nome: 'Portal' });
  const j = MC.montarIndice(dados, OPCOES);
  assert.deepStrictEqual(rels(j, 'servico:s1', 'processo:p1'), ['suporta']);
  assert.deepStrictEqual(j.nos['processo:p2'].lacunas, [], 'sem tecnico direto, sem lacuna');
});

test('instalacao dentro de instalacao (gravado antes da restricao) nao vira "instalada em"', () => {
  const dados = JSON.parse(JSON.stringify(DADOS_INST));
  dados.dependencias.find((d) => d.id === 'filial').componentes = [{ id: 'dc', nome: 'Data center', categoria: 'Instalações' }];
  const i = MC.montarIndice(dados, OPCOES);
  assert.deepStrictEqual(rels(i, 'instalacao:filial', 'instalacao:dc'), ['componente abaixo']);
  assert.deepStrictEqual(rels(i, 'dependencia:srv', 'instalacao:dc'), ['instalada em'], 'tecnica continua instalada em');
});

// ---- Explorar (22/10/2026): mind map em arvore ----
test('arvore: abre a raiz com os vinculos agrupados por tipo; o caminho nao volta como filho; numero do botao', () => {
  const i = idx();
  const raiz = 'processo:p1';
  const a = MC.montarArvore(i, raiz, new Set([raiz]), MC.TIPOS);
  assert.strictEqual(a.raiz.chave, raiz);
  assert.ok(a.raiz.aberto);
  const tipos = a.raiz.grupos.map((g) => g.tipo);
  assert.deepStrictEqual(tipos, MC.TIPOS.filter((t) => tipos.includes(t)), 'ordem de TIPOS');
  const servico = a.raiz.grupos.find((g) => g.tipo === 'servico').nos[0];
  assert.strictEqual(servico.chave, 'processo:p1>servico:s1');
  assert.deepStrictEqual(servico.relComPai, ['suportado pelo serviço']);
  assert.ok(!servico.aberto);
  assert.ok(servico.nFilhos > 0);
  // Abrir o servico: o processo (no caminho) nao reaparece; infra aparece de novo (outro ramo).
  const b = MC.montarArvore(i, raiz, new Set([raiz, 'processo:p1>servico:s1']), MC.TIPOS);
  const s1 = b.raiz.grupos.find((g) => g.tipo === 'servico').nos[0];
  const ids = s1.grupos.flatMap((g) => g.nos.map((n) => n.id));
  assert.ok(!ids.includes('processo:p1'));
  assert.ok(ids.includes('dependencia:infra'), 'o mesmo item pode estar em dois ramos');
  assert.strictEqual(b.total, MC.nosDaArvore(b).length);
});

test('arvore: grupo grande mostra 8 (lacunas primeiro) e diz quantos faltam; aberto mostra todos', () => {
  const muitos = Array.from({ length: 11 }, (_, k) => ({ id: 'q' + k, area: 'Financeiro', processo: 'Proc ' + String(k).padStart(2, '0'), tierManual: k === 10 ? 'Tier 1 (Crítico)' : '' }));
  const dados = JSON.parse(JSON.stringify(DADOS));
  dados.processos = dados.processos.concat(muitos);
  const i = MC.montarIndice(dados, OPCOES);
  const g = MC.filhosNaArvore(i, ['area:financeiro'], MC.TIPOS).find((x) => x.tipo === 'processo');
  assert.strictEqual(g.itens.length, 8);
  assert.strictEqual(g.ocultos, g.total - 8);
  assert.ok(g.itens[0].lacunas.length > 0, 'lacuna primeiro');
  const aberto = MC.filhosNaArvore(i, ['area:financeiro'], MC.TIPOS, { gruposAbertos: new Set(['area:financeiro|processo']) }).find((x) => x.tipo === 'processo');
  assert.strictEqual(aberto.itens.length, aberto.total);
  assert.strictEqual(aberto.ocultos, 0);
});

test('arvore: filtro de tipo some com o grupo; ligacoes cruzadas so com outros ramos (fora pai e filhos)', () => {
  const i = idx();
  const raiz = 'processo:p1';
  const semPessoa = MC.montarArvore(i, raiz, new Set([raiz]), MC.TIPOS.filter((t) => t !== 'pessoa'));
  assert.ok(!semPessoa.raiz.grupos.some((g) => g.tipo === 'pessoa'));
  const a = MC.montarArvore(i, raiz, new Set([raiz]), MC.TIPOS);
  // servico s1 e infra sao irmaos (filhos do processo) e ligados entre si: cruzada.
  const cruz = MC.ligacoesCruzadas(i, a, 'processo:p1>servico:s1');
  const infra = cruz.find((c) => c.id === 'dependencia:infra');
  assert.ok(infra, 'infra esta em outro ramo e liga ao servico');
  assert.strictEqual(infra.chave, 'processo:p1>dependencia:infra');
  assert.deepStrictEqual(infra.rels, ['usa']);
  assert.ok(!cruz.some((c) => c.id === 'processo:p1'), 'o pai nao conta');
  assert.deepStrictEqual(MC.caminhoDaChave('processo:p1>servico:s1'), ['processo:p1', 'servico:s1']);
});
