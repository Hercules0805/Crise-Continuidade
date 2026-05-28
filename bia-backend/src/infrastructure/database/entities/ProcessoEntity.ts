import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { AreaEntity } from './AreaEntity';
import { RespostaBiaEntity } from './RespostaBiaEntity';
import { TokenEntity } from './TokenEntity';

@Entity('processos')
export class ProcessoEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'area_id' })
  area_id!: string;

  @Column({ type: 'varchar' })
  processo!: string;

  @Column({ type: 'text', default: '' })
  descricao!: string;

  @Column({ type: 'varchar', default: '' })
  dependencia!: string;

  @Column({ type: 'varchar', default: '' })
  rto!: string;

  @Column({ type: 'varchar', default: '' })
  rpo!: string;

  @Column({ type: 'varchar', default: '' })
  mtpd!: string;

  @Column({ type: 'varchar', name: 'biaHomologada', default: '' })
  biaHomologada!: string;

  @Column({ type: 'varchar', default: '' })
  tier!: string;

  @Column({ type: 'varchar', name: 'bcpStatus', default: '' })
  bcpStatus!: string;

  @Column({ type: 'text', name: 'descricaoFuncional', default: '' })
  descricaoFuncional!: string;

  @Column({ type: 'jsonb', name: 'impactoIndisponibilidade', default: {} })
  impactoIndisponibilidade!: object;

  @Column({ type: 'text', name: 'bcpObjetivo', default: '' })
  bcpObjetivo!: string;

  @Column({ type: 'text', name: 'bcpEscopo', default: '' })
  bcpEscopo!: string;

  @Column({ type: 'jsonb', name: 'bcpContatos', default: [] })
  bcpContatos!: object[];

  @Column({ type: 'jsonb', name: 'bcpRiscos', default: [] })
  bcpRiscos!: object[];

  @Column({ type: 'jsonb', name: 'bcpPreventivas', default: [] })
  bcpPreventivas!: object[];

  @Column({ type: 'varchar', name: 'drpStatus', default: '' })
  drpStatus!: string;

  @Column({ type: 'text', name: 'drpObjetivo', default: '' })
  drpObjetivo!: string;

  @Column({ type: 'text', name: 'drpEscopo', default: '' })
  drpEscopo!: string;

  @Column({ type: 'text', name: 'drpProcedimentos', default: '' })
  drpProcedimentos!: string;

  @Column({ type: 'text', name: 'drpCriterios', default: '' })
  drpCriterios!: string;

  @CreateDateColumn({ name: 'created_at' })
  created_at!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at!: Date;

  @ManyToOne(() => AreaEntity, (area) => area.processos)
  @JoinColumn({ name: 'area_id' })
  area?: AreaEntity;

  @OneToMany(() => RespostaBiaEntity, (resposta) => resposta.processo)
  respostas?: RespostaBiaEntity[];

  @OneToMany(() => TokenEntity, (token) => token.processo)
  tokens?: TokenEntity[];
}
