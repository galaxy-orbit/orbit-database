export interface DatabaseModuleOptions {
  type: 'postgres' | 'mysql' | 'sqlite' | 'libsql' | 'mongodb';
  url?: string;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  ssl?: boolean | object;
  pool?: PoolOptions;
  logging?: boolean | ((query: string, params?: any[]) => void);
}

export interface PoolOptions {
  min?: number;
  max?: number;
  idleTimeoutMs?: number;
  acquireTimeoutMs?: number;
}

export interface TransactionOptions {
  isolationLevel?: 'read uncommitted' | 'read committed' | 'repeatable read' | 'serializable';
  readOnly?: boolean;
}

export interface Repository<T> {
  findAll(): Promise<T[]>;
  findOne(id: string | number): Promise<T | null>;
  findBy(where: Partial<T>): Promise<T[]>;
  create(entity: Partial<T>): Promise<T>;
  update(id: string | number, entity: Partial<T>): Promise<T | null>;
  delete(id: string | number): Promise<boolean>;
  count(where?: Partial<T>): Promise<number>;
}

export interface DataSource {
  isInitialized: boolean;
  initialize(): Promise<void>;
  destroy(): Promise<void>;
  getRepository<T>(entity: any): Repository<T>;
  transaction<R>(fn: (tx: any) => Promise<R>, options?: TransactionOptions): Promise<R>;
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
}

export interface EntityMetadata {
  name: string;
  tableName: string;
  columns: ColumnMetadata[];
  primaryKey?: string;
}

export interface ColumnMetadata {
  name: string;
  type: string;
  nullable?: boolean;
  primary?: boolean;
  unique?: boolean;
  default?: any;
}
