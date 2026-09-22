import 'reflect-metadata';

export const ENTITY_METADATA = 'database:entity';
export const COLUMN_METADATA = 'database:columns';
export const PRIMARY_KEY_METADATA = 'database:primaryKey';
export const REPOSITORY_METADATA = 'database:repository';

export interface EntityOptions {
  name?: string;
}

export interface ColumnOptions {
  name?: string;
  type?: string;
  nullable?: boolean;
  unique?: boolean;
  default?: any;
  primary?: boolean;
}

export function Entity(options?: EntityOptions | string): ClassDecorator {
  return (target) => {
    const tableName = typeof options === 'string' 
      ? options 
      : options?.name || target.name.toLowerCase() + 's';
    
    Reflect.defineMetadata(ENTITY_METADATA, { 
      name: target.name,
      tableName 
    }, target);
  };
}

export function Column(options?: ColumnOptions): PropertyDecorator {
  return (target, propertyKey) => {
    const columns: Map<string, ColumnOptions> = 
      Reflect.getMetadata(COLUMN_METADATA, target.constructor) || new Map();
    
    const type = Reflect.getMetadata('design:type', target, propertyKey);
    
    columns.set(String(propertyKey), {
      name: options?.name || String(propertyKey),
      type: options?.type || inferType(type),
      nullable: options?.nullable ?? false,
      unique: options?.unique ?? false,
      default: options?.default,
      primary: options?.primary ?? false,
    });
    
    Reflect.defineMetadata(COLUMN_METADATA, columns, target.constructor);
    
    if (options?.primary) {
      Reflect.defineMetadata(PRIMARY_KEY_METADATA, String(propertyKey), target.constructor);
    }
  };
}

export function PrimaryKey(): PropertyDecorator {
  return (target, propertyKey) => {
    Column({ primary: true })(target, propertyKey);
    Reflect.defineMetadata(PRIMARY_KEY_METADATA, String(propertyKey), target.constructor);
  };
}

export function PrimaryGeneratedColumn(type: 'increment' | 'uuid' = 'increment'): PropertyDecorator {
  return (target, propertyKey) => {
    Column({ 
      primary: true, 
      type: type === 'uuid' ? 'uuid' : 'serial',
      default: type === 'uuid' ? 'gen_random_uuid()' : undefined,
    })(target, propertyKey);
    Reflect.defineMetadata(PRIMARY_KEY_METADATA, String(propertyKey), target.constructor);
  };
}

export function InjectRepository(entity: any): ParameterDecorator {
  return (target, propertyKey, parameterIndex) => {
    const existingRepos: Map<number, any> = 
      Reflect.getMetadata(REPOSITORY_METADATA, target, propertyKey!) || new Map();
    existingRepos.set(parameterIndex, entity);
    Reflect.defineMetadata(REPOSITORY_METADATA, existingRepos, target, propertyKey!);
  };
}

function inferType(type: any): string {
  if (!type) return 'text';
  
  switch (type.name) {
    case 'String': return 'text';
    case 'Number': return 'integer';
    case 'Boolean': return 'boolean';
    case 'Date': return 'timestamp';
    case 'BigInt': return 'bigint';
    default: return 'text';
  }
}
