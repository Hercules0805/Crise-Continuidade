import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { AreaEntity } from './AreaEntity';
import { ProcessoEntity } from './ProcessoEntity';

@Entity('tokens')
export class TokenEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'area_id' })
  area_id!: string;

  @Column({ type: 'uuid', name: 'processo_id', nullable: true })
  processo_id!: string | null;

  @Column({ type: 'varchar' })
  email!: string;

  @Column({ type: 'varchar' })
  tipo!: 'processo' | 'area';

  @Column({ type: 'boolean', default: false })
  usado!: boolean;

  @Column({ type: 'timestamp', name: 'expires_at' })
  expires_at!: Date;

  @CreateDateColumn({ name: 'created_at' })
  created_at!: Date;

  @ManyToOne(() => AreaEntity, (area) => area.tokens)
  @JoinColumn({ name: 'area_id' })
  area?: AreaEntity;

  @ManyToOne(() => ProcessoEntity, (processo) => processo.tokens, { nullable: true })
  @JoinColumn({ name: 'processo_id' })
  processo?: ProcessoEntity | null;
}
