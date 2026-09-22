import { describe, test, expect } from 'bun:test';
import 'reflect-metadata';
import {
  Entity,
  Column,
  PrimaryKey,
  PrimaryGeneratedColumn,
  InjectRepository,
  ENTITY_METADATA,
  COLUMN_METADATA,
  PRIMARY_KEY_METADATA,
  REPOSITORY_METADATA,
} from './entity.decorators';
import { Transactional, TRANSACTIONAL_METADATA } from './transaction.decorators';

describe('Entity decorator', () => {
  test('derives table name from class name by default', () => {
    @Entity()
    class UserProfile {}
    const meta = Reflect.getMetadata(ENTITY_METADATA, UserProfile);
    expect(meta.tableName).toBe('userprofiles');
    expect(meta.name).toBe('UserProfile');
  });

  test('accepts options.name override', () => {
    @Entity({ name: 'custom_users' })
    class UserEntity {}
    expect(Reflect.getMetadata(ENTITY_METADATA, UserEntity).tableName).toBe('custom_users');
  });

  test('accepts string shorthand as table name', () => {
    @Entity('plain_table')
    class PlainEntity {}
    expect(Reflect.getMetadata(ENTITY_METADATA, PlainEntity).tableName).toBe('plain_table');
  });
});

describe('Column decorators', () => {
  test('infers types from design:type', () => {
    @Entity()
    class InferredEntity {
      @Column() name!: string;
      @Column() age!: number;
      @Column() active!: boolean;
      @Column() createdAt!: Date;
      @Column() tags!: unknown;
    }
    const columns: Map<string, any> = Reflect.getMetadata(COLUMN_METADATA, InferredEntity);
    expect(columns.get('name').type).toBe('text');
    expect(columns.get('age').type).toBe('integer');
    expect(columns.get('active').type).toBe('boolean');
    expect(columns.get('createdAt').type).toBe('timestamp');
    expect(columns.get('tags').type).toBe('text'); // unknown design:type falls back
  });

  test('explicit options win over inference', () => {
    @Entity()
    class OptionEntity {
      @Column({ name: 'user_email', type: 'varchar', nullable: true, unique: true })
      email!: string;

      @Column({ default: 'active' })
      status!: string;
    }
    const columns: Map<string, any> = Reflect.getMetadata(COLUMN_METADATA, OptionEntity);
    const email = columns.get('email');
    expect(email).toMatchObject({
      name: 'user_email', type: 'varchar', nullable: true, unique: true,
    });
    expect(columns.get('status').default).toBe('active');
    expect(columns.get('email').primary).toBe(false);
  });

  test('Column({ primary: true }) also registers the primary key', () => {
    @Entity()
    class PrimaryEntity {
      @Column({ primary: true })
      customId!: number;
    }
    expect(Reflect.getMetadata(PRIMARY_KEY_METADATA, PrimaryEntity)).toBe('customId');
  });

  test('PrimaryKey decorator registers column + primary key', () => {
    @Entity()
    class PkEntity {
      @PrimaryKey()
      id!: number;
    }
    const columns: Map<string, any> = Reflect.getMetadata(COLUMN_METADATA, PkEntity);
    expect(columns.get('id').primary).toBe(true);
    expect(Reflect.getMetadata(PRIMARY_KEY_METADATA, PkEntity)).toBe('id');
  });

  test('PrimaryGeneratedColumn serial and uuid variants', () => {
    @Entity()
    class GeneratedEntity {
      @PrimaryGeneratedColumn() serialId!: number;
      @PrimaryGeneratedColumn('uuid') uuidId!: string;
    }
    const columns: Map<string, any> = Reflect.getMetadata(COLUMN_METADATA, GeneratedEntity);
    expect(columns.get('serialId')).toMatchObject({ primary: true, type: 'serial' });
    expect(columns.get('uuidId')).toMatchObject({ primary: true, type: 'uuid', default: 'gen_random_uuid()' });
    // last primary wins the PK pointer
    expect(Reflect.getMetadata(PRIMARY_KEY_METADATA, GeneratedEntity)).toBe('uuidId');
  });
});

describe('InjectRepository decorator', () => {
  test('records entity per parameter index', () => {
    class UserRepo {}

    class UserService {
      constructor(
        @InjectRepository(UserRepo) repo1: UserRepo,
        plainArg: string,
        @InjectRepository(UserRepo) repo2: UserRepo,
      ) {}
    }

    // Constructor parameter decorators attach metadata to the class itself
    // (propertyKey is undefined for constructors in TS emit).
    const repos: Map<number, any> = Reflect.getMetadata(REPOSITORY_METADATA, UserService);
    expect(repos.get(0)).toBe(UserRepo);
    expect(repos.has(1)).toBe(false);
    expect(repos.get(2)).toBe(UserRepo);
  });
});

describe('Transactional decorator', () => {
  test('stores transaction options metadata', () => {
    class TxService {
      @Transactional({ isolationLevel: 'serializable' })
      method() {}
    }
    expect(Reflect.getMetadata(TRANSACTIONAL_METADATA, TxService, 'method'))
      .toEqual({ isolationLevel: 'serializable' });
  });

  test('wraps method in dataSource.transaction and swaps dataSource to tx', async () => {
    let txSeen: any = null;

    const fakeTx = { kind: 'tx' };
    const fakeDb = {
      kind: 'db',
      transaction: async (cb: (tx: any) => Promise<any>) => cb(fakeTx),
    };

    class OrderService {
      dataSource = fakeDb;

      @Transactional()
      async createOrder() {
        return { used: (this as any).dataSource.kind };
      }
    }

    const service = new OrderService();
    const result = await service.createOrder();

    expect(result.used).toBe('tx');
    // dataSource restored after the transaction completes
    expect((service as any).dataSource.kind).toBe('db');
  });

  test('propagates errors and still restores dataSource', async () => {
    const fakeDb = {
      kind: 'db',
      transaction: async (cb: (tx: any) => Promise<any>) => cb({ kind: 'tx' }),
    };

    class FailingService {
      dataSource = fakeDb;

      @Transactional()
      async fail() {
        throw new Error('tx exploded');
      }
    }

    const service = new FailingService();
    await expect(service.fail()).rejects.toThrow('tx exploded');
    expect((service as any).dataSource.kind).toBe('db');
  });

  test('passes through when no dataSource is present', async () => {
    class PlainService {
      @Transactional()
      async work(value: number) {
        return value * 2;
      }
    }
    const service = new PlainService();
    expect(await service.work(21)).toBe(42);
  });

  test('passes through when dataSource lacks transaction()', async () => {
    class WeirdService {
      _dataSource = { notTransactional: true };

      @Transactional()
      async work() {
        return 'passthrough';
      }
    }
    const service = new WeirdService();
    expect(await service.work()).toBe('passthrough');
    // _dataSource untouched (no transaction wrapper ran)
    expect((service as any)._dataSource).toEqual({ notTransactional: true } as any);
  });

  test('supports both dataSource and _dataSource property names', async () => {
    const calls: string[] = [];
    const fakeDb = {
      transaction: async (cb: (tx: any) => Promise<any>) => {
        calls.push('tx-start');
        const r = await cb({ kind: 'tx' });
        calls.push('tx-end');
        return r;
      },
    };

    class UnderscoreService {
      _dataSource = fakeDb;
      @Transactional()
      async work() {
        return (this as any)._dataSource.kind;
      }
    }
    const service = new UnderscoreService();
    expect(await service.work()).toBe('tx');
    expect(calls).toEqual(['tx-start', 'tx-end']);
  });
});
