window.__rodar = async () => {
  const res = [];
  const ok = (c, m) => res.push((c ? 'OK  ' : 'FALHA ') + m);
  const toasts = [];
  showToast = (m) => { toasts.push(m); };
  const calls = window.__calls;
  const n = (nome) => (calls[nome] || []).length;
  const nPost = (acao) => (calls.post || []).filter((a) => a[0] === acao).length;
  const aberto = () => document.getElementById('drawerProcesso').classList.contains('open');
  const set = (id, v) => { document.getElementById(id).value = v; };
  // Pergunta "Há alterações não salvas" (DECISÃO 16/10/2026): o teste escolhe a
  // resposta (padrão Salvar) e conta quantas vezes ela foi feita.
  let respostaFechar = 'salvar';
  let perguntas = 0;
  _perguntarAlteracoesNaoSalvas = async () => { perguntas++; return respostaFechar; };
  const zera = () => { Object.keys(calls).forEach((k) => delete calls[k]); toasts.length = 0; perguntas = 0; respostaFechar = 'salvar'; };

  window.__ret = {
    getProcessos: [{ id: 'pr1', area: 'TI', processo: 'Backup', descricao: 'd', dependenciaItens: [], dependencia: '', score: 0, respostas: {}, rto: '', rpo: '', mtd: '', biaHomologada: '', bcpStatus: '', descricaoFuncional: '', tierManual: '', bcpContatos: [], drpStatus: '' }],
    getAreas: [{ nome: 'TI', responsavel: 'R', solucao: '' }],
    getPerguntas: [{ id: 'q1', pergunta: 'P1', categoria: 'Geral', descricao: '', ativa: true }, { id: 'q2', pergunta: 'P2', categoria: 'Geral', descricao: '', ativa: true }],
    getConfigRespostas: (() => {
      const ops = [{ valor: '4', label: 'Alto', cor: '#c62828', background: '#ffebee' }, { valor: '2', label: 'Medio', cor: '#f57c00', background: '#fff3e0' }, { valor: '1', label: 'Baixo', cor: '#2e7d32', background: '#e8f5e9' }, { valor: '0', label: 'N/A', cor: '#757575', background: '#f5f5f5' }];
      return { Geral: ops, _default: ops };
    })(),
    getDependencias: [{ id: 'fo1', categoria: 'Fornecedores', nome: 'Forn' }],
  };
  await processos();
  const pr = () => window.processosData.find((p) => p.id === 'pr1');
  ok(!!pr(), 'processo: tela montou e carregou o processo de teste');

  zera(); abrirModalProcesso(pr()); await fecharDrawerProcesso();
  ok(n('salvarProcesso') === 0 && !aberto(), 'processo: sem mexer = 0 gravacoes');

  zera(); abrirModalProcesso(pr()); set('fProcesso', 'Backup 2'); await fecharDrawerProcesso();
  ok(n('salvarProcesso') === 1 && !aberto(), 'processo: mexeu na identificacao = 1 gravacao');
  pr().processo = 'Backup'; // desfaz o efeito otimista do teste anterior

  zera(); abrirModalProcesso(pr()); trocarAbaProcesso('avaliacao'); trocarAbaProcesso('bcp'); trocarAbaProcesso('identificacao');
  await fecharDrawerProcesso();
  ok(n('salvarProcesso') === 0 && !aberto(), 'processo: so VER as abas Avaliacao e BCP nao conta como edicao');

  zera(); abrirModalProcesso(pr()); trocarAbaProcesso('avaliacao');
  document.querySelector('input[name="avalInline0"][value="4"]').click();
  await fecharDrawerProcesso();
  ok(n('salvarProcesso') === 1 && nPost('salvarRespostas') === 1 && !aberto(), 'processo: mudar SO uma resposta da avaliacao conta como edicao (grava processo e respostas)');

  zera(); abrirModalProcesso(pr()); trocarAbaProcesso('avaliacao');
  document.querySelector('input[name="avalInline1"][value="2"]').click();
  await salvarProcesso(); await fecharDrawerProcesso();
  ok(n('salvarProcesso') === 1 && nPost('salvarRespostas') === 1, 'processo: Salvar e depois Fechar = 1 gravacao no total');

  zera(); abrirModalProcesso(); await fecharDrawerProcesso();
  ok(n('salvarProcesso') === 0 && !aberto() && toasts.length === 0, 'processo: novo em branco fecha sem criar e sem aviso');

  zera(); abrirModalProcesso(); set('fArea', 'TI'); set('fProcesso', 'Novo proc'); await fecharDrawerProcesso();
  ok(n('salvarProcesso') === 1 && !aberto(), 'processo: novo preenchido + Fechar = 1 gravacao');

  zera(); abrirModalProcesso(pr()); set('fProcesso', ''); await fecharDrawerProcesso();
  ok(n('salvarProcesso') === 0 && aberto() && toasts.length === 1, 'processo: apagou o nome + Fechar = aviso e continua aberto');
  return res;
};
