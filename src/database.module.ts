import type { DynamicModule } from '@galaxy-stack/orbit-core';
import type { DatabaseModuleOptions } from './interfaces/database.interface';
import { BunDataSource, createDataSource } from './datasource/datasource';

export const DATABASE_OPTIONS = Symbol('DATABASE_OPTIONS');
export const DATA_SOURCE = Symbol('DATA_SOURCE');

export interface DatabaseModuleAsyncOptions {
  imports?: any[];
  useFactory: (...args: any[]) => Promise<DatabaseModuleOptions> | DatabaseModuleOptions;
  inject?: any[];
  isGlobal?: boolean;
}

export interface DatabaseFeatureOptions {
  entities: any[];
  tables: Map<any, any>;
}

export class DatabaseModule {
  static forRoot(options: DatabaseModuleOptions & { isGlobal?: boolean }): DynamicModule {
    return {
      module: DatabaseModule,
      global: options.isGlobal ?? true,
      providers: [
        {
          provide: DATABASE_OPTIONS,
          useValue: options,
        },
        {
          provide: DATA_SOURCE,
          useFactory: async (opts: DatabaseModuleOptions) => {
            const dataSource = createDataSource(opts);
            await dataSource.initialize();
            return dataSource;
          },
          inject: [DATABASE_OPTIONS],
        },
        {
          provide: BunDataSource,
          useExisting: DATA_SOURCE,
        },
      ],
      exports: [DATABASE_OPTIONS, DATA_SOURCE, BunDataSource],
    };
  }

  static forRootAsync(options: DatabaseModuleAsyncOptions): DynamicModule {
    return {
      module: DatabaseModule,
      global: options.isGlobal ?? true,
      imports: options.imports || [],
      providers: [
        {
          provide: DATABASE_OPTIONS,
          useFactory: options.useFactory,
          inject: options.inject || [],
        },
        {
          provide: DATA_SOURCE,
          useFactory: async (opts: DatabaseModuleOptions) => {
            const dataSource = createDataSource(opts);
            await dataSource.initialize();
            return dataSource;
          },
          inject: [DATABASE_OPTIONS],
        },
        {
          provide: BunDataSource,
          useExisting: DATA_SOURCE,
        },
      ],
      exports: [DATABASE_OPTIONS, DATA_SOURCE, BunDataSource],
    };
  }

  static forFeature(entities: any[], tableMapping: Map<any, any>): DynamicModule {
    const providers = entities.map(entity => ({
      provide: `REPOSITORY_${entity.name}`,
      useFactory: (dataSource: BunDataSource) => {
        const table = tableMapping.get(entity);
        if (table) {
          dataSource.registerTable(entity, table);
        }
        return dataSource.getRepository(entity);
      },
      inject: [DATA_SOURCE],
    }));

    return {
      module: DatabaseModule,
      providers,
      exports: providers.map(p => p.provide),
    };
  }
}
