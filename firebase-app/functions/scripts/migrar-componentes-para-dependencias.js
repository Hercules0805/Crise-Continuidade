/**
 * Funde o catalogo de Componentes do Servico em Dependencias.
 *
 * PROBLEMA QUE RESOLVE
 * Ate 23/09/2026 existiam duas colecoes paralelas: `dependencias` (Cadastros
 * > Dependencias -- Fornecedores/Pessoas/Processos Internos e as categorias
 * tecnicas) e `componentes` (Cadastros > Componentes, so pra "Componentes do
 * Servico" da aba DRP -- tipo livre, sem enum fixo). O codigo que lia/gravava
 * `componentes` foi removido; este script migra os documentos que ja
 * existiam la para virarem Dependencias de verdade, com uma das 7 categorias
 * tecnicas fixas (API, Banco de Dados, Infraestrutura, Seguranca, Servidor,
 * Sistema, Outros) no lugar do `tipo` livre de antes.
 *
 * RODA UMA VEZ, NA MAO, DEPOIS DO DEPLOY do codigo que fez essa fusao
 * (senao os itens migrados nao tem tela nenhuma pra aparecer ainda):
 *   cd firebase-app/functions
 *   node scripts/migrar-componentes-para-dependencias.js
 *
 * Mesma autenticacao dos outros scripts desta pasta (gcloud auth
 * application-default login, ou GOOGLE_APPLICATION_CREDENTIALS apontando pra
 * uma service account com acesso ao projeto).
 *
 * E IDEMPOTENTE: se ja existir uma dependencia com o mesmo nome+categoria
 * (por ja ter rodado antes, ou porque alguem cadastrou manualmente depois da
 * fusao), reaproveita o id em vez de criar duplicata. Processos que ja tem o
 * componente linkado em dependenciaItens (mesmo id) nao ganham entrada
 * repetida.
 *
 * MAPEAMENTO tipo (livre, de Componentes) -> categoria (fixa, de Dependencia):
 *   Servidor, Servidores                          -> Servidor
 *   Banco de Dados, Database                      -> Banco de Dados
 *   Segurança, Certificados                       -> Segurança
 *   Aplicação, Aplicações, Software                -> Sistema
 *   Rede, Network, Storage, Armazenamento,
 *     Cloud, Nuvem, Comunicação                    -> Infraestrutura
 *   API                                            -> API
 *   qualquer outro valor (ou vazio)                -> Outros
 *
 * DEPOIS DE RODAR ISTO: os componentes antigos continuam intocados na
 * colecao `componentes` (nada e apagado) -- so passam a existir TAMBEM como
 * Dependencia, e e essa copia nova que a aba BIA e o Cadastro de Dependencias
 * passam a mostrar.
 */

'use strict';

const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

const MAPA_TIPO_CATEGORIA = {
  servidor: 'Servidor',
  servidores: 'Servidor',
  'banco de dados': 'Banco de Dados',
  database: 'Banco de Dados',
  'segurança': 'Segurança',
  seguranca: 'Segurança',
  certificados: 'Segurança',
  sistema: 'Sistema',
  sistemas: 'Sistema',
  'aplicação': 'Sistema',
  aplicacao: 'Sistema',
  'aplicações': 'Sistema',
  aplicacoes: 'Sistema',
  software: 'Sistema',
  infraestrutura: 'Infraestrutura',
  rede: 'Infraestrutura',
  network: 'Infraestrutura',
  storage: 'Infraestrutura',
  armazenamento: 'Infraestrutura',
  cloud: 'Infraestrutura',
  nuvem: 'Infraestrutura',
  'comunicação': 'Infraestrutura',
  comunicacao: 'Infraestrutura',
  api: 'API',
  // "Servidor de Aplicação" e afins: tudo que comeca com "servidor" -- ver o
  // fallback abaixo, alem das chaves exatas ja cobertas por servidor/servidores.
};

function categoriaDoTipo(tipo) {
  const chave = String(tipo || '').trim().toLowerCase();
  if (MAPA_TIPO_CATEGORIA[chave]) return MAPA_TIPO_CATEGORIA[chave];
  // Variações compostas ("Servidor de Aplicação", "Servidor de Banco de
  // Dados" etc.) -- qualquer coisa comecando com "servidor" cai em Servidor.
  if (chave.startsWith('servidor')) return 'Servidor';
  return 'Outros';
}

async function main() {
  const [compsSnap, depsSnap, procsSnap] = await Promise.all([
    db.collection('componentes').get(),
    db.collection('dependencias').get(),
    db.collection('processos').get(),
  ]);

  if (compsSnap.empty) {
    console.log('Nenhum componente encontrado -- nada para migrar.');
    return;
  }

  const porNomeCategoria = new Map();
  depsSnap.docs.forEach((d) => {
    const dep = d.data() || {};
    porNomeCategoria.set(`${String(dep.nome || '').toLowerCase()}||${dep.categoria}`, d.id);
  });

  // id de componente antigo -> {id, categoria, nome} da Dependencia criada/reaproveitada.
  const mapaComponenteParaDependencia = new Map();
  let criadas = 0;
  let reaproveitadas = 0;

  for (const doc of compsSnap.docs) {
    const c = doc.data() || {};
    const nome = String(c.nome || '').trim();
    if (!nome) continue;
    const categoria = categoriaDoTipo(c.tipo);
    const chave = `${nome.toLowerCase()}||${categoria}`;

    let depId = porNomeCategoria.get(chave);
    if (depId) {
      reaproveitadas += 1;
    } else {
      const novaDep = await db.collection('dependencias').add({
        categoria,
        nome,
        detalhes: c.descricao || '',
        setor: '',
        empresa: '',
        telefone: '',
        email: '',
        endereco: '',
        rto: c.rto || '',
        rpo: c.rpo || '',
        estrategia: c.estrategia || '',
        responsavel: c.responsavel || '',
      });
      depId = novaDep.id;
      porNomeCategoria.set(chave, depId);
      criadas += 1;
      console.log(`Criada: "${nome}" (tipo "${c.tipo || '-'}" -> categoria "${categoria}")`);
    }
    mapaComponenteParaDependencia.set(doc.id, { id: depId, categoria, nome });
  }

  console.log(`\nDependencias: ${criadas} criada(s), ${reaproveitadas} reaproveitada(s) (ja existiam).`);

  // Agora liga os processos que tinham drpComponentes -- vira dependenciaItens.
  let processosAtualizados = 0;
  for (const doc of procsSnap.docs) {
    const p = doc.data() || {};
    const drpComponentes = Array.isArray(p.drpComponentes) ? p.drpComponentes : [];
    if (!drpComponentes.length) continue;

    const itensAtuais = Array.isArray(p.dependenciaItens) ? p.dependenciaItens.slice() : [];
    const idsJaLigados = new Set(itensAtuais.filter((it) => it && it.id).map((it) => it.id));
    let mudou = false;

    drpComponentes.forEach((compId) => {
      const dep = mapaComponenteParaDependencia.get(compId);
      if (!dep || idsJaLigados.has(dep.id)) return;
      itensAtuais.push({ categoria: dep.categoria, nome: dep.nome, id: dep.id });
      idsJaLigados.add(dep.id);
      mudou = true;
    });

    if (!mudou) continue;

    const nomesUnicos = [...new Set(itensAtuais.map((it) => it.nome))];
    await doc.ref.set({
      dependenciaItens: itensAtuais,
      dependencia: nomesUnicos.join(', '),
    }, { merge: true });
    processosAtualizados += 1;
    console.log(`Processo "${p.processo || doc.id}" (${p.area || '-'}): dependenciaItens atualizado.`);
  }

  console.log(`\nPronto -- ${processosAtualizados} processo(s) atualizado(s) com os componentes migrados.`);
  console.log('Os documentos antigos em "componentes" continuam intocados (nada foi apagado).');
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error('Migração de componentes falhou:', err); process.exit(1); });
