import { type DataSourceOptions } from 'typeorm';
import { entities } from './entities';
import { migrations } from './migrations';

/** Shared options. `synchronize` is never enabled: schema changes go through migrations. */
export function buildDataSourceOptions(url: string, poolSize = 10): DataSourceOptions {
  return {
    type: 'postgres',
    url,
    entities,
    migrations,
    migrationsTableName: 'typeorm_migrations',
    synchronize: false,
    migrationsRun: false,
    extra: { max: poolSize },
  };
}
