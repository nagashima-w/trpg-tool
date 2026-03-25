// @cloudflare/workers-types が提供する D1Database の型シム。
// Cloudflare Workers 本番環境では wrangler が公式型を注入するため不要だが、
// vitest (Node.js) 環境では @cloudflare/workers-types のグローバル型が
// 利用できないため、このファイルでテスト用の最小定義を提供する。
//
// tsconfig.json の "types" に "@cloudflare/workers-types" を追加することで
// 本番環境では公式型が優先される。

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement
  first<T = unknown>(): Promise<T | null>
  run(): Promise<{ success: boolean; meta: unknown }>
  all<T = unknown>(): Promise<{ results: T[]; success: boolean; meta: unknown }>
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>
  exec(query: string): Promise<D1ExecResult>
  dump(): Promise<ArrayBuffer>
}

export interface D1Result<T = unknown> {
  results: T[]
  success: boolean
  meta: unknown
}

export interface D1ExecResult {
  count: number
  duration: number
}
