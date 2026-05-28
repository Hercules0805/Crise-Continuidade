import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('dependencias')
export class DependenciaEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  categoria!: string;

  @Column({ type: 'varchar' })
  nome!: string;

  @Column({ type: 'varchar', default: '' })
  detalhes!: string;

  @Column({ type: 'varchar', default: '' })
  setor!: string;

  @Column({ type: 'varchar', default: '' })
  empresa!: string;

  @Column({ type: 'varchar', default: '' })
  telefone!: string;

  @Column({ type: 'varchar', default: '' })
  email!: string;

  @CreateDateColumn({ name: 'created_at' })
  created_at!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at!: Date;
}
