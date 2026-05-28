import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1700000000000 implements MigrationInterface {
  name = 'InitialSchema1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enable UUID extension
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // ─── areas ───────────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "areas" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "nome" varchar NOT NULL,
        "responsavel" varchar NOT NULL,
        "email" varchar NOT NULL,
        "solucao" varchar NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_areas" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_areas_nome" UNIQUE ("nome")
      )
    `);

    // ─── processos ───────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "processos" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "area_id" uuid NOT NULL,
        "processo" varchar NOT NULL,
        "descricao" text NOT NULL DEFAULT '',
        "dependencia" varchar NOT NULL DEFAULT '',
        "rto" varchar NOT NULL DEFAULT '',
        "rpo" varchar NOT NULL DEFAULT '',
        "mtpd" varchar NOT NULL DEFAULT '',
        "biaHomologada" varchar NOT NULL DEFAULT '',
        "tier" varchar NOT NULL DEFAULT '',
        "bcpStatus" varchar NOT NULL DEFAULT '',
        "descricaoFuncional" text NOT NULL DEFAULT '',
        "impactoIndisponibilidade" jsonb NOT NULL DEFAULT '{}',
        "bcpObjetivo" text NOT NULL DEFAULT '',
        "bcpEscopo" text NOT NULL DEFAULT '',
        "bcpContatos" jsonb NOT NULL DEFAULT '[]',
        "bcpRiscos" jsonb NOT NULL DEFAULT '[]',
        "bcpPreventivas" jsonb NOT NULL DEFAULT '[]',
        "drpStatus" varchar NOT NULL DEFAULT '',
        "drpObjetivo" text NOT NULL DEFAULT '',
        "drpEscopo" text NOT NULL DEFAULT '',
        "drpProcedimentos" text NOT NULL DEFAULT '',
        "drpCriterios" text NOT NULL DEFAULT '',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_processos" PRIMARY KEY ("id"),
        CONSTRAINT "FK_processos_area" FOREIGN KEY ("area_id")
          REFERENCES "areas"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    // ─── perguntas ───────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "perguntas" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "categoria" varchar NOT NULL,
        "pergunta" varchar NOT NULL,
        "descricao" text NOT NULL DEFAULT '',
        "ativa" boolean NOT NULL DEFAULT true,
        "ordem" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_perguntas" PRIMARY KEY ("id")
      )
    `);

    // ─── respostas_bia ───────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "respostas_bia" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "processo_id" uuid NOT NULL,
        "respondente" varchar NOT NULL,
        "cargo" varchar NOT NULL,
        "scores" jsonb NOT NULL,
        "score_total" integer NOT NULL,
        "tier" varchar NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_respostas_bia" PRIMARY KEY ("id"),
        CONSTRAINT "FK_respostas_bia_processo" FOREIGN KEY ("processo_id")
          REFERENCES "processos"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    // ─── tokens ──────────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "tokens" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "area_id" uuid NOT NULL,
        "processo_id" uuid,
        "email" varchar NOT NULL,
        "tipo" varchar NOT NULL,
        "usado" boolean NOT NULL DEFAULT false,
        "expires_at" TIMESTAMP NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_tokens" PRIMARY KEY ("id"),
        CONSTRAINT "FK_tokens_area" FOREIGN KEY ("area_id")
          REFERENCES "areas"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_tokens_processo" FOREIGN KEY ("processo_id")
          REFERENCES "processos"("id") ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);

    // ─── dependencias ────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "dependencias" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "categoria" varchar NOT NULL,
        "nome" varchar NOT NULL,
        "detalhes" varchar NOT NULL DEFAULT '',
        "setor" varchar NOT NULL DEFAULT '',
        "empresa" varchar NOT NULL DEFAULT '',
        "telefone" varchar NOT NULL DEFAULT '',
        "email" varchar NOT NULL DEFAULT '',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_dependencias" PRIMARY KEY ("id")
      )
    `);

    // ─── config_respostas ────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "config_respostas" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "categoria" varchar NOT NULL,
        "valor" varchar NOT NULL,
        "label" varchar NOT NULL,
        "cor" varchar NOT NULL DEFAULT '',
        "background" varchar NOT NULL DEFAULT '',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_config_respostas" PRIMARY KEY ("id")
      )
    `);

    // ─── config_perfis ───────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "config_perfis" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "email" varchar NOT NULL,
        "nome" varchar NOT NULL,
        "area" varchar NOT NULL,
        "admin" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_config_perfis" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_config_perfis_email" UNIQUE ("email")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "config_perfis"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "config_respostas"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "dependencias"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tokens"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "respostas_bia"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "perguntas"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "processos"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "areas"`);
  }
}
