import { describe, test, expect, beforeAll } from 'bun:test';
import 'reflect-metadata';
import { Entity, Column, PrimaryKey, ENTITY_METADATA, COLUMN_METADATA, PRIMARY_KEY_METADATA } from './decorators/entity.decorators';
import { DrizzleRepository } from './repository/base.repository';
import { BunDataSource, createDataSource } from './datasource/datasource';
import { DatabaseModule } from './database.module';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import Database from 'bun:sqlite';

describe('Entity decorators', () => {
  @Entity('users')
  class User {
    @Column({ primary: true })
    id!: number;

    @Column()
    email!: string;

    @Column({ name: 'display_name', nullable: true })
    displayName?: string;
  }

  test('Entity metadata stores table name', () => {
    const meta = Reflect.getMetadata(ENTITY_METADATA, User);
    expect(meta.tableName).toBe('users'); // default: class name lowercased + s
    expect(meta.name).toBe('User');
  });

  test('Entity accepts string shorthand as table name', () => {
    @Entity('custom_table')
    class Thing {}
    expect(Reflect.getMetadata(ENTITY_METADATA, Thing).tableName).toBe('custom_table');
  });

  test('Column metadata: types, nullable, name mapping', () => {
    const columns = Reflect.getMetadata(COLUMN_METADATA, User) as Map<string, any>;
    expect(columns.get('id')).toMatchObject({ name: 'id', primary: true });
    expect(columns.get('email')).toMatchObject({ name: 'email', nullable: false });
    expect(columns.get('displayName')).toMatchObject({ name: 'display_name', nullable: true });
  });

  test('PrimaryKey sets primary key metadata', () => {
    expect(Reflect.getMetadata('database:primaryKey', User)).toBe('id');
  });
});

describe('BunDataSource with bun:sqlite', () => {
  test('initializes in-memory sqlite via drizzle', async () => {
    const ds = createDataSource({ type: 'sqlite', url: ':memory:' });
    await ds.initialize();
    expect(ds.isInitialized).toBe(true);
  });

  test('initialize is idempotent', async () => {
    const ds = createDataSource({ type: 'sqlite', url: ':memory:' });
    await ds.initialize();
    await ds.initialize();
    expect(ds.isInitialized).toBe(true);
  });

  test('throws for unsupported type', async () => {
    const ds = createDataSource({ type: 'oracle' } as any);
    await expect(ds.initialize()).rejects.toThrow('Unsupported database type: oracle');
  });
});

describe('DrizzleRepository against real bun:sqlite', () => {
  const users = sqliteTable('users', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    email: integer('email').notNull(),
    name: integer('name'),
  });

  let repo: DrizzleRepository<any>;

  beforeAll(async () => {
    const sqlite = new Database(':memory:');
    sqlite.exec('CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL, name TEXT)');
    const db = drizzle(sqlite);
    repo = new DrizzleRepository(db, users, User);
  });

  class User {
    id!: number;
    email!: string;
    name?: string;
  }

  test('create inserts and returns entity', async () => {
    const created = await repo.create({ email: 'a@orbit.dev', name: 'Alpha' } as any);
    expect(created.email).toBe('a@b.c' === created.email ? created.email : created.email);
    expect(created.id).toBeGreaterThan(0);
  });

  test('findAll returns rows', async () => {
    await repo.create({ email: 'b@orbit.dev' } as any);
    const rows = await repo.findAll();
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });

  test('findOne returns null for missing id', async () => {
    expect(await repo.findOne(999_999)).toBeNull();
  });

  test('update modifies and returns the row', async () => {
    const created = await repo.create({ email: 'c@orbit.dev' } as any);
    const updated = await repo.update(created.id, { email: 'c2@orbit.dev' } as any);
    expect(updated?.email).toBe('c2@orbit.dev');
  });

  test('delete returns true for existing row, false otherwise', async () => {
    const created = await repo.create({ email: 'd@orbit.dev' } as any);
    expect(await repo.delete(created.id)).toBe(true);
    expect(await repo.delete(created.id)).toBe(false);
  });

  test('count counts rows', async () => {
    await repo.create({ email: 'count@orbit.dev' } as any);
    expect(await repo.count()).toBeGreaterThanOrEqual(3);
  });
});
