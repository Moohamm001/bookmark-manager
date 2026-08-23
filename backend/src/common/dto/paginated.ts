export interface Paginated<T> {
  data: T[];
  /** Rows matching the filter for this owner — never a global count. */
  total: number;
  limit: number;
  offset: number;
}
