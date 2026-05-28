import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { env } from '../config/env';
import {
  AreaEntity,
  ProcessoEntity,
  PerguntaEntity,
  RespostaBiaEntity,
  TokenEntity,
  DependenciaEntity,
  ConfigRespostaEntity,
  ConfigPerfilEntity,
} from './entities';

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: env.databaseUrl,
  synchronize: false,
  logging: env.nodeEnv === 'development',
  entities: [
    AreaEntity,
    ProcessoEntity,
    PerguntaEntity,
    RespostaBiaEntity,
    TokenEntity,
    DependenciaEntity,
    ConfigRespostaEntity,
    ConfigPerfilEntity,
  ],
  migrations: [__dirname + '/migrations/*.{ts,js}'],
  subscribers: [],
});
