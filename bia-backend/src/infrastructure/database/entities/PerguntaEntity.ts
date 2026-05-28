import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('perguntas')
export class PerguntaEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  categoria!: string;

  @Column({ type: 'varchar' })
  pergunta!: string;

  @Column({ type: 'text', default: '' })
  descricao!: string;

  @Column({ type: 'boolean', default: true })
  ativa!: boolean;

  @Column({ type: 'integer', default: 0 })
  ordem!: number;

  @CreateDateColumn({ name: 'created_at' })
  created_at!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at!: Date;
}
