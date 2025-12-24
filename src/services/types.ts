// Service response types for clean error handling
export interface ServiceResult<T> {
  data: T | null;
  error: string | null;
  success: boolean;
}

export function successResult<T>(data: T): ServiceResult<T> {
  return { data, error: null, success: true };
}

export function errorResult<T>(error: string): ServiceResult<T> {
  return { data: null, error, success: false };
}
