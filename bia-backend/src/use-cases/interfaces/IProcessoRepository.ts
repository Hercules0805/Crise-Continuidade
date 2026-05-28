import { Processo } from '../../domain/entities';

export interface IProcessoRepository {
  findAll(): Promise<Processo[]>;
  findByArea(areaName: string): Promise<Processo[]>;
  findById(id: string): Promise<Processo | null>;
  save(processo: Processo): Promise<Processo>;
  delete(id: string): Promise<void>;
  updateTierAndRto(id: string, tier: string, rto: string): Promise<void>;
}
