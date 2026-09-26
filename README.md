# @galaxy-stack/orbit-database

[![npm version](https://img.shields.io/npm/v/@galaxy-stack/orbit-database.svg)](https://www.npmjs.com/package/@galaxy-stack/orbit-database)
[![docs](https://img.shields.io/badge/docs-galaxy--orbit--framework.vercel.app-blue)](https://galaxy-orbit-framework.vercel.app)

Part of the [Orbit framework](https://github.com/galaxy-orbit/packages) — a NestJS-style backend framework for [Bun](https://bun.sh).

## Installation

```bash
bun add @galaxy-stack/orbit-database
```

# @galaxy-stack/orbit-database

## Mô tả
Module database cho Orbit với Repository pattern, Transaction decorators và tích hợp Drizzle ORM.

## Tính năng chính

### 1. Hỗ trợ nhiều database
- **PostgreSQL**: `pg` hoặc `postgres` driver
- **MySQL**: `mysql2` driver
- **SQLite**: Bun native SQLite
- **LibSQL**: Turso/LibSQL client
- **MongoDB**: Native MongoDB driver

### 2. Repository Pattern
```typescript
import { DrizzleRepository, Entity, Column, PrimaryGeneratedColumn } from '@galaxy-stack/orbit-database';

@Entity('users')
class User {
  @PrimaryGeneratedColumn('increment')
  id!: number;

  @Column()
  name!: string;

  @Column({ nullable: true })
  email?: string;
}
```

### 3. Transaction Support
```typescript
import { Transactional } from '@galaxy-stack/orbit-database';

class UserService {
  @Transactional()
  async transferMoney(from: number, to: number, amount: number) {
    await this.accountRepo.update(from, { balance: -amount });
    await this.accountRepo.update(to, { balance: +amount });
  }
}
```

## Cách cấu hình

### PostgreSQL
```typescript
import { DatabaseModule } from '@galaxy-stack/orbit-database';

@Module({
  imports: [
    DatabaseModule.forRoot({
      type: 'postgres',
      url: 'postgresql://user:pass@localhost:5432/mydb',
    }),
  ],
})
class AppModule {}
```

### MySQL
```typescript
DatabaseModule.forRoot({
  type: 'mysql',
  host: 'localhost',
  port: 3306,
  database: 'mydb',
  username: 'root',
  password: 'password',
})
```

### SQLite
```typescript
DatabaseModule.forRoot({
  type: 'sqlite',
  database: './data.db', // hoặc ':memory:'
})
```

### MongoDB
```typescript
DatabaseModule.forRoot({
  type: 'mongodb',
  url: 'mongodb://localhost:27017/mydb',
})
```

### Async Configuration
```typescript
DatabaseModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    type: 'postgres',
    url: config.get('DATABASE_URL'),
  }),
})
```

## Repository Methods

```typescript
const repo = dataSource.getRepository(User);

// CRUD operations
await repo.findAll();
await repo.findOne(1);
await repo.findBy({ name: 'John' });
await repo.create({ name: 'Jane' });
await repo.update(1, { name: 'Updated' });
await repo.delete(1);
await repo.count({ active: true });
```

## Luồng hoạt động

```
Controller → Service → Repository → Drizzle ORM → Database Driver → Database
                ↓
        @Transactional (nếu có)
                ↓
        Transaction wrapper
```
