import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ProcessoEntity } from './ProcessoEntity';

@Entity('respostas_bia')
export class RespostaBiaEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'processo_id' })
  processo_id!: string;

  @Column({ type: 'varchar' })
  respondente!: string;

  @Column({ type: 'varchar' })
  cargo!: string;

  @Column({ type: 'jsonb' })
  scores!: Record<string, number>;

  @Column({ type: 'integer', name: 'score_total' })
  score_total!: number;

  @Column({ type: 'varchar' })
  tier!: string;

  @CreateDateColumn({ name: 'created_at' })
  created_at!: Date;

  @ManyToOne(() => ProcessoEntity, (processo) => processo.respostas)
  @JoinColumn({ name: 'processo_id' })
  processo?: ProcessoEntity;
}
