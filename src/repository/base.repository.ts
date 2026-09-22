import 'reflect-metadata';
import type { Repository } from '../interfaces/database.interface';
import { ENTITY_METADATA, COLUMN_METADATA, PRIMARY_KEY_METADATA } from '../decorators/entity.decorators';

export abstract class BaseRepository<T> implements Repository<T> {
  protected abstract readonly db: any;
  protected abstract readonly table: any;
  protected readonly entityClass: new () => T;

  constructor(entityClass: new () => T) {
    this.entityClass = entityClass;
  }

  protected getTableName(): string {
    const metadata = Reflect.getMetadata(ENTITY_METADATA, this.entityClass);
    return metadata?.tableName || this.entityClass.name.toLowerCase() + 's';
  }

  protected getPrimaryKey(): string {
    return Reflect.getMetadata(PRIMARY_KEY_METADATA, this.entityClass) || 'id';
  }

  protected getColumns(): Map<string, any> {
    return Reflect.getMetadata(COLUMN_METADATA, this.entityClass) || new Map();
  }

  abstract findAll(): Promise<T[]>;
  abstract findOne(id: string | number): Promise<T | null>;
  abstract findBy(where: Partial<T>): Promise<T[]>;
  abstract create(entity: Partial<T>): Promise<T>;
  abstract update(id: string | number, entity: Partial<T>): Promise<T | null>;
  abstract delete(id: string | number): Promise<boolean>;
  abstract count(where?: Partial<T>): Promise<number>;
}

export class DrizzleRepository<T> extends BaseRepository<T> {
  protected readonly db: any;
  protected readonly table: any;
  private eqFn: any = null;
  private andFn: any = null;
  private countFn: any = null;

  constructor(db: any, table: any, entityClass: new () => T) {
    super(entityClass);
    this.db = db;
    this.table = table;
  }

  private async loadDrizzleHelpers(): Promise<void> {
    if (!this.eqFn) {
      try {
        const drizzle = await import('drizzle-orm');
        this.eqFn = drizzle.eq;
        this.andFn = drizzle.and;
        this.countFn = drizzle.count;
      } catch {
        this.eqFn = (a: any, b: any) => ({ sql: `${a} = ${b}` });
        this.andFn = (...conditions: any[]) => conditions;
        this.countFn = () => ({ sql: 'COUNT(*)' });
      }
    }
  }

  async findAll(): Promise<T[]> {
    return this.db.select().from(this.table);
  }

  async findOne(id: string | number): Promise<T | null> {
    await this.loadDrizzleHelpers();
    const pk = this.getPrimaryKey();
    const pkColumn = this.table[pk];
    
    if (!pkColumn) {
      throw new Error(`Primary key column "${pk}" not found in table`);
    }
    
    const results = await this.db
      .select()
      .from(this.table)
      .where(this.eqFn(pkColumn, id))
      .limit(1);
    
    return results[0] || null;
  }

  async findBy(where: Partial<T>): Promise<T[]> {
    await this.loadDrizzleHelpers();
    
    const conditions: any[] = [];
    for (const [key, value] of Object.entries(where)) {
      if (value !== undefined && this.table[key]) {
        conditions.push(this.eqFn(this.table[key], value));
      }
    }
    
    if (conditions.length === 0) {
      return this.db.select().from(this.table);
    }
    
    return this.db
      .select()
      .from(this.table)
      .where(conditions.length === 1 ? conditions[0] : this.andFn(...conditions));
  }

  async create(entity: Partial<T>): Promise<T> {
    const result = await this.db.insert(this.table).values(entity).returning();
    return result[0];
  }

  async update(id: string | number, entity: Partial<T>): Promise<T | null> {
    await this.loadDrizzleHelpers();
    const pk = this.getPrimaryKey();
    const pkColumn = this.table[pk];
    
    if (!pkColumn) {
      throw new Error(`Primary key column "${pk}" not found in table`);
    }
    
    const result = await this.db
      .update(this.table)
      .set(entity)
      .where(this.eqFn(pkColumn, id))
      .returning();
    
    return result[0] || null;
  }

  async delete(id: string | number): Promise<boolean> {
    await this.loadDrizzleHelpers();
    const pk = this.getPrimaryKey();
    const pkColumn = this.table[pk];
    
    if (!pkColumn) {
      throw new Error(`Primary key column "${pk}" not found in table`);
    }
    
    const result = await this.db
      .delete(this.table)
      .where(this.eqFn(pkColumn, id))
      .returning();
    
    return result.length > 0;
  }

  async count(where?: Partial<T>): Promise<number> {
    await this.loadDrizzleHelpers();
    
    let query = this.db.select({ count: this.countFn() }).from(this.table);
    
    if (where) {
      const conditions: any[] = [];
      for (const [key, value] of Object.entries(where)) {
        if (value !== undefined && this.table[key]) {
          conditions.push(this.eqFn(this.table[key], value));
        }
      }
      
      if (conditions.length > 0) {
        query = query.where(
          conditions.length === 1 ? conditions[0] : this.andFn(...conditions)
        );
      }
    }
    
    const result = await query;
    return Number(result[0]?.count || 0);
  }

  getQueryBuilder() {
    return this.db.select().from(this.table);
  }

  getRawDb() {
    return this.db;
  }

  getTable() {
    return this.table;
  }
}
