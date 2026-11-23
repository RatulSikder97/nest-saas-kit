import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfig } from '../config/app-config.service';
import { buildDataSourceOptions } from './options';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        ...buildDataSourceOptions(config.get('DATABASE_URL'), config.get('DB_POOL_SIZE')),
        migrations: [],
      }),
    }),
  ],
})
export class DatabaseModule {}
