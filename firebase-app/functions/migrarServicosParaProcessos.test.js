// Migracao Processo -> Servico (21/10/2026): scripts/migrar-servicos-para-processos.js (planejar, puro).
const { test } = require('node:test');
const assert = require('node:assert');
const { planejar } = require('./scripts/migrar-servicos-para-processos');

const DB = { id: 'db', nome: 'Oracle', categoria: 'Banco de Dados' };
const SRV = { id: 'srv', nome: 'SRV-01', categoria: 'Servidor', componentes: [{ id: 'db', nome: 'Oracle', categoria: 'Banco de Dados' }] };

test('copia servico.processoIds para os processos (sem repetir), e lista o tecnico direto com a sugestao de servico', () => {
  const servicos = [
    { id: 's1', nome: 'Portal', processoIds: [{ id: 'p1' }, { id: 'p2' }, { id: 'nao-existe' }], dependenciaItens: [{ id: 'srv', nome: 'SRV-01', categoria: 'Servidor' }] },
    { id: 's2', nome: 'Intranet', processoIds: [{ id: 'p1' }], dependenciaItens: [] },
  ];
  const processos = [
    { id: 'p1', area: 'TI', processo: 'Folha', dependenciaItens: [{ id: 'db', nome: 'Oracle', categoria: 'Banco de Dados' }] },
    { id: 'p2', area: 'RH', processo: 'Ponto', dependenciaItens: [{ categoria: 'Serviços', id: 's1', nome: 'Portal' }] },
  ];
  const r = planejar(servicos, processos, [DB, SRV]);
  assert.deepStrictEqual(r.gravar, [{
    processoId: 'p1',
    dependenciaItens: [
      { id: 'db', nome: 'Oracle', categoria: 'Banco de Dados' },
      { categoria: 'Serviços', nome: 'Portal', id: 's1' },
      { categoria: 'Serviços', nome: 'Intranet', id: 's2' },
    ],
  }], 'p2 ja aponta o Portal; processo inexistente e ignorado');
  assert.deepStrictEqual(r.legados, [{ processo: 'TI · Folha', item: 'Banco de Dados: Oracle', sugeridos: ['Portal'] }]);
  assert.deepStrictEqual(planejar(servicos, r.gravar.map((g) => ({ ...processos[0], dependenciaItens: g.dependenciaItens })).concat([processos[1]]), [DB, SRV]).gravar, [], 'idempotente');
});
