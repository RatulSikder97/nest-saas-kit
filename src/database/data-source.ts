import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { loadDotEnv } from './cli/load-env';
import { buildDataSourceOptions } from './options';

/**
 * Entry point for the TypeORM CLI only (`pnpm migration:generate`). Connects as the schema owner.
 * The application builds its own DataSource in DatabaseModule.
 */
loadDotEnv();
const url = process.env.DATABASE_MIGRATION_URL;
if (!url) throw new Error('DATABASE_MIGRATION_URL is required');

export default new DataSource(buildDataSourceOptions(url));
