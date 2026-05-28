import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('config_respostas')
export class ConfigRespostaEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  categoria!: string;

  @Column({ type: 'varchar' })
  valor!: string;

  @Column({ type: 'varchar' })
  label!: string;

  @Column({ type: 'varchar', default: '' })
  cor!: string;

  @Column({ type: 'varchar', default: '' })
  background!: string;

  @CreateDateColumn({ name: 'created_at' })
  created_at!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at!: Date;
}
