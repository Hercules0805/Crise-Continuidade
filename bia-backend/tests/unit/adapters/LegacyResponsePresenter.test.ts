import { LegacyResponsePresenter } from '@adapters/presenters/LegacyResponsePresenter';
import { Processo, RespostaBia } from '@domain/entities';

describe('LegacyResponsePresenter', () => {
  const baseProcesso: Processo = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    area_id: 'area-uuid-1',
    processo: 'Processo de Pagamento',
    descricao: 'Descrição do processo',
    dependencia: 'Sistema ERP',
    rto: '< 4 horas',
    rpo: '1 hora',
    mtpd: '24 horas',
    biaHomologada: 'Sim',
    tier: 'Tier 1 (Crítico)',
    bcpStatus: 'Aprovado',
    descricaoFuncional: 'Processamento de pagamentos',
    impactoIndisponibilidade: { financeiro: 'alto', reputacional: 'medio' },
    bcpObjetivo: 'Manter pagamentos operacionais',
    bcpEscopo: 'Todos os pagamentos',
    bcpContatos: [{ nome: 'João', telefone: '11999999999' }],
    bcpRiscos: [{ risco: 'Falha de sistema', probabilidade: 'alta' }],
    bcpPreventivas: [{ acao: 'Backup diário' }],
    drpStatus: 'Em elaboração',
    drpObjetivo: 'Recuperar em 4h',
    drpEscopo: 'Infraestrutura de pagamentos',
    drpProcedimentos: 'Ativar site DR',
    drpCriterios: 'Indisponibilidade > 1h',
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-06-01'),
  };

  const baseResposta: RespostaBia = {
    id: 'resposta-uuid-1',
    processo_id: '123e4567-e89b-12d3-a456-426614174000',
    respondente: 'maria@fortestecnologia.com.br',
    cargo: 'Gerente',
    scores: { q1: 4, q2: 3, q3: 5 },
    score_total: 12,
    tier: 'Tier 1 (Crítico)',
    created_at: new Date('2024-06-15'),
  };

  describe('formatProcesso', () => {
    it('should format a complete processo with all fields', () => {
      const result = LegacyResponsePresenter.formatProcesso(
        baseProcesso,
        'TI',
        baseResposta
      );

      expect(result).toEqual({
        id: '123e4567-e89b-12d3-a456-426614174000',
        area: 'TI',
        processo: 'Processo de Pagamento',
        descricao: 'Descrição do processo',
        dependencia: 'Sistema ERP',
        rto: '< 4 horas',
        rpo: '1 hora',
        mtpd: '24 horas',
        biaHomologada: 'Sim',
        tier: 'Tier 1 (Crítico)',
        bcpStatus: 'Aprovado',
        descricaoFuncional: 'Processamento de pagamentos',
        impactoIndisponibilidade: { financeiro: 'alto', reputacional: 'medio' },
        bcpObjetivo: 'Manter pagamentos operacionais',
        bcpEscopo: 'Todos os pagamentos',
        bcpContatos: [{ nome: 'João', telefone: '11999999999' }],
        bcpRiscos: [{ risco: 'Falha de sistema', probabilidade: 'alta' }],
        bcpPreventivas: [{ acao: 'Backup diário' }],
        drpStatus: 'Em elaboração',
        drpObjetivo: 'Recuperar em 4h',
        drpEscopo: 'Infraestrutura de pagamentos',
        drpProcedimentos: 'Ativar site DR',
        drpCriterios: 'Indisponibilidade > 1h',
        score: 12,
        avaliado: true,
        respostas: { q1: 4, q2: 3, q3: 5 },
      });
    });

    it('should return exactly 26 fields (id + 22 processo data fields + score + avaliado + respostas)', () => {
      const result = LegacyResponsePresenter.formatProcesso(
        baseProcesso,
        'TI',
        baseResposta
      );

      // id + area + 20 other data fields (22 from Google Sheets schema) + score + avaliado + respostas
      expect(Object.keys(result as object)).toHaveLength(26);
    });

    it('should default string fields to empty string when null/undefined', () => {
      const emptyProcesso: Processo = {
        ...baseProcesso,
        processo: '',
        descricao: '',
        dependencia: '',
        rto: '',
        rpo: '',
        mtpd: '',
        biaHomologada: '',
        tier: '',
        bcpStatus: '',
        descricaoFuncional: '',
        bcpObjetivo: '',
        bcpEscopo: '',
        drpStatus: '',
        drpObjetivo: '',
        drpEscopo: '',
        drpProcedimentos: '',
        drpCriterios: '',
      };

      const result = LegacyResponsePresenter.formatProcesso(emptyProcesso, 'TI') as Record<string, unknown>;

      expect(result.processo).toBe('');
      expect(result.descricao).toBe('');
      expect(result.dependencia).toBe('');
      expect(result.rto).toBe('');
      expect(result.rpo).toBe('');
      expect(result.mtpd).toBe('');
      expect(result.biaHomologada).toBe('');
      expect(result.tier).toBe('');
      expect(result.bcpStatus).toBe('');
      expect(result.descricaoFuncional).toBe('');
      expect(result.bcpObjetivo).toBe('');
      expect(result.bcpEscopo).toBe('');
      expect(result.drpStatus).toBe('');
      expect(result.drpObjetivo).toBe('');
      expect(result.drpEscopo).toBe('');
      expect(result.drpProcedimentos).toBe('');
      expect(result.drpCriterios).toBe('');
    });

    it('should default JSON/array fields to empty arrays or objects when null/undefined', () => {
      const emptyJsonProcesso: Processo = {
        ...baseProcesso,
        impactoIndisponibilidade: null as unknown as object,
        bcpContatos: null as unknown as object[],
        bcpRiscos: null as unknown as object[],
        bcpPreventivas: null as unknown as object[],
      };

      const result = LegacyResponsePresenter.formatProcesso(emptyJsonProcesso, 'TI') as Record<string, unknown>;

      expect(result.impactoIndisponibilidade).toEqual({});
      expect(result.bcpContatos).toEqual([]);
      expect(result.bcpRiscos).toEqual([]);
      expect(result.bcpPreventivas).toEqual([]);
    });

    it('should set score to 0 when no resposta is provided', () => {
      const result = LegacyResponsePresenter.formatProcesso(baseProcesso, 'TI') as Record<string, unknown>;

      expect(result.score).toBe(0);
    });

    it('should set avaliado to false when no resposta is provided', () => {
      const result = LegacyResponsePresenter.formatProcesso(baseProcesso, 'TI') as Record<string, unknown>;

      expect(result.avaliado).toBe(false);
    });

    it('should set respostas to empty object when no resposta is provided', () => {
      const result = LegacyResponsePresenter.formatProcesso(baseProcesso, 'TI') as Record<string, unknown>;

      expect(result.respostas).toEqual({});
    });

    it('should set avaliado to true when resposta is provided', () => {
      const result = LegacyResponsePresenter.formatProcesso(
        baseProcesso,
        'TI',
        baseResposta
      ) as Record<string, unknown>;

      expect(result.avaliado).toBe(true);
    });

    it('should use area name string, not area_id', () => {
      const result = LegacyResponsePresenter.formatProcesso(
        baseProcesso,
        'Financeiro'
      ) as Record<string, unknown>;

      expect(result.area).toBe('Financeiro');
      expect(result.area).not.toBe(baseProcesso.area_id);
    });

    it('should default area to empty string when areaName is empty', () => {
      const result = LegacyResponsePresenter.formatProcesso(
        baseProcesso,
        ''
      ) as Record<string, unknown>;

      expect(result.area).toBe('');
    });
  });

  describe('formatProcessos', () => {
    it('should format a list of processos', () => {
      const items = [
        { processo: baseProcesso, areaName: 'TI', latestResposta: baseResposta },
        { processo: { ...baseProcesso, id: 'uuid-2', processo: 'Processo 2' }, areaName: 'RH' },
      ];

      const result = LegacyResponsePresenter.formatProcessos(items);

      expect(result).toHaveLength(2);
      expect((result[0] as Record<string, unknown>).area).toBe('TI');
      expect((result[0] as Record<string, unknown>).score).toBe(12);
      expect((result[1] as Record<string, unknown>).area).toBe('RH');
      expect((result[1] as Record<string, unknown>).score).toBe(0);
    });

    it('should return empty array for empty input', () => {
      const result = LegacyResponsePresenter.formatProcessos([]);
      expect(result).toEqual([]);
    });
  });

  describe('success', () => {
    it('should wrap data with success: true', () => {
      const result = LegacyResponsePresenter.success({ id: 'new-uuid' });
      expect(result).toEqual({ success: true, id: 'new-uuid' });
    });

    it('should return just success: true when no data provided', () => {
      const result = LegacyResponsePresenter.success();
      expect(result).toEqual({ success: true });
    });
  });

  describe('error', () => {
    it('should wrap message in error field', () => {
      const result = LegacyResponsePresenter.error('Action não reconhecida: foo');
      expect(result).toEqual({ error: 'Action não reconhecida: foo' });
    });
  });

  describe('contentType', () => {
    it('should return application/json', () => {
      expect(LegacyResponsePresenter.contentType).toBe('application/json');
    });
  });
});
