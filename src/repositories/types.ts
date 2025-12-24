// Repository response types for clean error handling
export interface RepositoryResult<T> {
  data: T | null;
  error: Error | null;
}

export interface PaginatedResult<T> extends RepositoryResult<T[]> {
  count: number;
}

// Query options
export interface QueryOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  ascending?: boolean;
}
