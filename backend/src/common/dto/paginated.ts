export interface Paginated<T> {
  data: T[];
  /** Total rows matching the filter **for this owner** — never a global count. */
  total: number;
  limit: number;
  offset: number;
}
