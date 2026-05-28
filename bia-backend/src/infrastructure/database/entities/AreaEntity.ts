import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { ProcessoEntity } from './ProcessoEntity';
import { TokenEntity } from './TokenEntity';

@Entity('areas')
export class AreaEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', unique: true })
  nome!: string;

  @Column({ type: 'varchar' })
  responsavel!: string;

  @Column({ type: 'varchar' })
  email!: string;

  @Column({ type: 'varchar' })
  solucao!: string;

  @CreateDateColumn({ name: 'created_at' })
  created_at!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at!: Date;

  @OneToMany(() => ProcessoEntity, (processo) => processo.area)
  processos?: ProcessoEntity[];

  @OneToMany(() => TokenEntity, (token) => token.area)
  tokens?: TokenEntity[];
}
