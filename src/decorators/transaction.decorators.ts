import 'reflect-metadata';
import type { TransactionOptions } from '../interfaces/database.interface';

export const TRANSACTIONAL_METADATA = 'database:transactional';

export function Transactional(options?: TransactionOptions): MethodDecorator {
  return (target, propertyKey, descriptor) => {
    Reflect.defineMetadata(TRANSACTIONAL_METADATA, options || {}, target.constructor, propertyKey);
    
    const originalMethod = descriptor.value as Function;
    
    (descriptor as any).value = async function (...args: any[]) {
      const dataSource = (this as any).dataSource || (this as any)._dataSource;
      
      if (!dataSource || typeof dataSource.transaction !== 'function') {
        return originalMethod.apply(this, args);
      }
      
      return dataSource.transaction(async (tx: any) => {
        const originalDs = (this as any).dataSource || (this as any)._dataSource;
        (this as any).dataSource = tx;
        (this as any)._dataSource = tx;
        
        try {
          return await originalMethod.apply(this, args);
        } finally {
          (this as any).dataSource = originalDs;
          (this as any)._dataSource = originalDs;
        }
      }, options);
    };
    
    return descriptor;
  };
}
