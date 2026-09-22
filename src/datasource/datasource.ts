import type { DatabaseModuleOptions, DataSource, TransactionOptions, Repository } from '../interfaces/database.interface';
import { DrizzleRepository } from '../repository/base.repository';

export class BunDataSource implements DataSource {
  private _isInitialized = false;
  private db: any = null;
  private client: any = null;
  private readonly options: DatabaseModuleOptions;
  private readonly repositories: Map<any, Repository<any>> = new Map();
  private readonly tables: Map<any, any> = new Map();

  constructor(options: DatabaseModuleOptions) {
    this.options = options;
  }

  get isInitialized(): boolean {
    return this._isInitialized;
  }

  async initialize(): Promise<void> {
    if (this._isInitialized) return;

    const connectionUrl = this.options.url || this.buildConnectionUrl();
    
    switch (this.options.type) {
      case 'postgres':
        await this.initializePostgres(connectionUrl);
        break;
      case 'mysql':
        await this.initializeMysql(connectionUrl);
        break;
      case 'sqlite':
        await this.initializeSqlite(connectionUrl);
        break;
      case 'libsql':
        await this.initializeLibsql(connectionUrl);
        break;
      case 'mongodb':
        await this.initializeMongodb(connectionUrl);
        break;
      default:
        throw new Error(`Unsupported database type: ${this.options.type}`);
    }

    this._isInitialized = true;
  }

  private async initializePostgres(url: string): Promise<void> {
    try {
      const pg = await import('pg');
      const { drizzle } = await import('drizzle-orm/node-postgres');
      
      this.client = new pg.Pool({ connectionString: url });
      this.db = drizzle(this.client);
    } catch {
      try {
        const postgres = await import('postgres');
        const { drizzle } = await import('drizzle-orm/postgres-js');
        
        this.client = (postgres as any).default(url);
        this.db = drizzle(this.client);
      } catch {
        throw new Error('No PostgreSQL driver found. Install either "pg" or "postgres" package.');
      }
    }
  }

  private async initializeSqlite(url: string): Promise<void> {
    try {
      const Database = (await import('bun:sqlite')).default;
      const { drizzle } = await import('drizzle-orm/bun-sqlite');
      
      const dbPath = url.replace('file:', '').replace('sqlite:', '');
      this.client = new Database(dbPath || ':memory:');
      this.db = drizzle(this.client);
    } catch (e) {
      throw new Error('SQLite initialization failed: ' + (e as Error).message);
    }
  }

  private async initializeLibsql(url: string): Promise<void> {
    try {
      const { createClient } = await import('@libsql/client');
      const { drizzle } = await import('drizzle-orm/libsql');
      
      this.client = createClient({ url });
      this.db = drizzle(this.client);
    } catch {
      throw new Error('LibSQL initialization failed. Install "@libsql/client" package.');
    }
  }

  private async initializeMysql(url: string): Promise<void> {
    try {
      const mysql = await import('mysql2/promise');
      const { drizzle } = await import('drizzle-orm/mysql2');
      
      this.client = await mysql.createPool(url);
      this.db = drizzle(this.client);
    } catch {
      throw new Error('MySQL initialization failed. Install "mysql2" package.');
    }
  }

  private async initializeMongodb(url: string): Promise<void> {
    try {
      const { MongoClient } = await import('mongodb');
      
      this.client = new MongoClient(url);
      await this.client.connect();
      
      const dbName = this.options.database || url.split('/').pop()?.split('?')[0] || 'app';
      this.db = this.client.db(dbName);
    } catch {
      throw new Error('MongoDB initialization failed. Install "mongodb" package.');
    }
  }

  private buildConnectionUrl(): string {
    const { type, host, port, database, username, password } = this.options;
    
    if (type === 'sqlite') {
      return database || ':memory:';
    }
    
    const auth = username ? `${username}${password ? ':' + password : ''}@` : '';
    const defaultPort = type === 'postgres' ? 5432 : type === 'mysql' ? 3306 : 0;
    
    return `${type}://${auth}${host || 'localhost'}:${port || defaultPort}/${database || 'app'}`;
  }

  async destroy(): Promise<void> {
    if (!this._isInitialized) return;

    if (this.client) {
      if (typeof this.client.end === 'function') {
        await this.client.end();
      } else if (typeof this.client.close === 'function') {
        this.client.close();
      }
    }

    this.db = null;
    this.client = null;
    this._isInitialized = false;
    this.repositories.clear();
  }

  registerTable(entity: any, table: any): void {
    this.tables.set(entity, table);
    this.repositories.delete(entity);
  }

  getRepository<T>(entity: new () => T): Repository<T> {
    if (!this._isInitialized) {
      throw new Error('DataSource is not initialized');
    }

    if (!this.repositories.has(entity)) {
      const table = this.tables.get(entity);
      if (!table) {
        throw new Error(`No table registered for entity: ${entity.name}. Use DatabaseModule.forFeature() to register the entity with its Drizzle table.`);
      }
      this.repositories.set(entity, new DrizzleRepository<T>(this.db, table, entity));
    }

    return this.repositories.get(entity) as Repository<T>;
  }

  async transaction<R>(
    fn: (tx: BunDataSource) => Promise<R>,
    options?: TransactionOptions
  ): Promise<R> {
    if (!this._isInitialized || !this.db) {
      throw new Error('DataSource is not initialized');
    }

    if (typeof this.db.transaction === 'function') {
      return this.db.transaction(async (drizzleTx: any) => {
        const txDataSource = new BunDataSource(this.options);
        txDataSource._isInitialized = true;
        (txDataSource as any).db = drizzleTx;
        (txDataSource as any).client = this.client;
        
        for (const [entity, table] of this.tables) {
          txDataSource.registerTable(entity, table);
        }
        
        return fn(txDataSource);
      }, this.buildTransactionConfig(options));
    }

    return fn(this);
  }

  private buildTransactionConfig(options?: TransactionOptions): any {
    if (!options) return undefined;
    
    const config: any = {};
    
    if (options.isolationLevel) {
      const levelMap: Record<string, string> = {
        'read uncommitted': 'read uncommitted',
        'read committed': 'read committed',
        'repeatable read': 'repeatable read',
        'serializable': 'serializable',
      };
      config.isolationLevel = levelMap[options.isolationLevel];
    }
    
    if (options.readOnly) {
      config.accessMode = 'read only';
    }
    
    return Object.keys(config).length > 0 ? config : undefined;
  }

  async query<T = any>(sql: string, params?: any[]): Promise<T[]> {
    if (!this._isInitialized || !this.db) {
      throw new Error('DataSource is not initialized');
    }

    if (typeof this.db.execute === 'function') {
      const result = await this.db.execute(sql, params);
      return result.rows || result;
    }

    if (this.client && typeof this.client.query === 'function') {
      const result = await this.client.query(sql, params);
      return result.rows || result;
    }

    throw new Error('Raw query not supported for this database type');
  }

  getDrizzle(): any {
    return this.db;
  }

  getClient(): any {
    return this.client;
  }
}

export function createDataSource(options: DatabaseModuleOptions): BunDataSource {
  return new BunDataSource(options);
}
