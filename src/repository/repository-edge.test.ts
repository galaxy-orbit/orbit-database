import { describe, test, expect, beforeAll } from 'bun:test';
import 'reflect-metadata';
import { Entity, Column } from '../decorators/entity.decorators';
import { BaseRepository, DrizzleRepository } from './base.repository';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { Database } from 'bun:sqlite';

@Entity('articles')
class Article {
  @Column({ primary: true })
  id!: number;

  @Column()
  title!: string;

  @Column({ nullable: true })
  tag?: string;
}

const articles = sqliteTable('articles', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  tag: text('tag'),
});

function makeDb(): Database {
  const sqlite = new Database(':memory:');
  sqlite.exec('CREATE TABLE articles (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, tag TEXT)');
  return sqlite;
}

describe('DrizzleRepository — edge cases', () => {
  let repo: DrizzleRepository<Article>;

  beforeAll(async () => {
    repo = new DrizzleRepository(drizzle(makeDb()), articles, Article);
    await repo.create({ title: 'alpha', tag: 'core' } as any);
    await repo.create({ title: 'beta', tag: 'cli' } as any);
    await repo.create({ title: 'gamma', tag: 'core' } as any);
  });

  test('findBy with a single condition filters rows', async () => {
    const rows = await repo.findBy({ tag: 'core' } as any);
    expect(rows).toHaveLength(2);
    expect(rows.every((r: any) => r.tag === 'core')).toBe(true);
  });

  test('findBy with multiple conditions ANDs them together', async () => {
    const rows = await repo.findBy({ tag: 'core', title: 'alpha' } as any);
    expect(rows).toHaveLength(1);
    expect((rows[0] as any).title).toBe('alpha');
  });

  test('findBy skips undefined values in the where clause', async () => {
    const rows = await repo.findBy({ tag: undefined, title: 'beta' } as any);
    expect(rows).toHaveLength(1);
    expect((rows[0] as any).title).toBe('beta');
  });

  test('findBy with no resolvable columns returns all rows', async () => {
    const rows = await repo.findBy({ nonexistentColumn: 'x' } as any);
    expect(rows).toHaveLength(3);
  });

  test('count with where applies the same filtering', async () => {
    expect(await repo.count({ tag: 'core' } as any)).toBe(2);
    expect(await repo.count({ tag: 'cli' } as any)).toBe(1);
    expect(await repo.count({ tag: 'missing' } as any)).toBe(0);
    expect(await repo.count()).toBe(3);
  });

  test('getQueryBuilder / getRawDb / getTable expose internals', () => {
    expect(repo.getTable()).toBe(articles);
    expect(repo.getRawDb()).toBeDefined();
    // query builder is a thenable drizzle query
    expect(typeof (repo.getQueryBuilder() as any).then).toBe('function');
  });
});

describe('DrizzleRepository — missing primary key column', () => {
  const wrongTable = sqliteTable('wrong', {
    title: text('title'),
  });

  const repo = new DrizzleRepository(drizzle(makeDb()), wrongTable, Article);

  test('findOne throws a descriptive error when the PK column is absent', async () => {
    await expect(repo.findOne(1)).rejects.toThrow('Primary key column "id" not found in table');
  });

  test('update throws when the PK column is absent', async () => {
    await expect(repo.update(1, { title: 'x' } as any)).rejects.toThrow('Primary key column "id" not found in table');
  });

  test('delete throws when the PK column is absent', async () => {
    await expect(repo.delete(1)).rejects.toThrow('Primary key column "id" not found in table');
  });
});

describe('BaseRepository — metadata fallbacks', () => {
  class UndecoratedEntity {
    id!: number;
  }

  class ConcreteRepo extends BaseRepository<UndecoratedEntity> {
    protected readonly db = {};
    protected readonly table = {};

    async findAll() { return []; }
    async findOne() { return null; }
    async findBy() { return []; }
    async create(e: any) { return e; }
    async update() { return null; }
    async delete() { return false; }
    async count() { return 0; }
  }

  test('getTableName falls back to lowercased class name + s', () => {
    const repo = new ConcreteRepo(UndecoratedEntity as any);
    expect(repo['getTableName']()).toBe('undecoratedentitys');
  });

  test('getTableName uses @Entity tableName when present', () => {
    const repo = new ConcreteRepo(Article as any);
    expect(repo['getTableName']()).toBe('articles');
  });

  test('getPrimaryKey falls back to "id" without explicit metadata', () => {
    const repo = new ConcreteRepo(UndecoratedEntity as any);
    expect(repo['getPrimaryKey']()).toBe('id');
  });

  test('getColumns returns an empty map without metadata', () => {
    const repo = new ConcreteRepo(UndecoratedEntity as any);
    expect(repo['getColumns']().size).toBe(0);
  });
});
