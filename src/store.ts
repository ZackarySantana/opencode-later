import { Database } from "bun:sqlite"
import { mkdirSync } from "node:fs"
import { dirname, isAbsolute, join, resolve } from "node:path"

export type LaterItem = {
  id: string
  message: string
  position: number
  createdAt: number
  updatedAt: number
  completedAt?: number
}

const schema = `
  CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY,
    message TEXT NOT NULL,
    position INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    completed_at INTEGER
  );

  CREATE INDEX IF NOT EXISTS items_active_position
    ON items(completed_at, position);

  CREATE TABLE IF NOT EXISTS metadata (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    revision INTEGER NOT NULL
  );

  INSERT OR IGNORE INTO metadata (id, revision) VALUES (1, 0);
`

type ItemRow = {
  id: string
  message: string
  position: number
  createdAt: number
  updatedAt: number
  completedAt: number | null
}

export function databasePath(stateDirectory: string, configured?: unknown) {
  if (typeof configured === "string" && configured.trim()) {
    const value = configured.trim()
    if (value === ":memory:") return value
    return isAbsolute(value) ? value : resolve(stateDirectory, value)
  }
  return join(stateDirectory, "opencode-later", "later.sqlite")
}

export class LaterStore {
  readonly db: Database

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true })
    this.db = new Database(path, { create: true, readwrite: true, strict: true })
    this.db.run("PRAGMA journal_mode = WAL")
    this.db.run("PRAGMA busy_timeout = 5000")
    this.db.run(schema)
  }

  close() {
    this.db.close(false)
  }

  revision() {
    return this.db.query<{ revision: number }, []>("SELECT revision FROM metadata WHERE id = 1").get()?.revision ?? 0
  }

  active() {
    return this.rows("WHERE completed_at IS NULL ORDER BY position, created_at, id")
  }

  completed() {
    return this.rows("WHERE completed_at IS NOT NULL ORDER BY completed_at DESC, id")
  }

  add(message: string, now = Date.now()) {
    const value = requireMessage(message)
    const id = crypto.randomUUID()
    this.mutate(() => {
      const position = this.db.query<{ position: number }, []>(
        "SELECT COALESCE(MAX(position), 0) + 1 AS position FROM items WHERE completed_at IS NULL",
      ).get()?.position ?? 1
      this.db.query<unknown, { id: string; message: string; position: number; now: number }>(`
        INSERT INTO items (id, message, position, created_at, updated_at, completed_at)
        VALUES ($id, $message, $position, $now, $now, NULL)
      `).run({ id, message: value, position, now })
    })
    return this.get(id)!
  }

  edit(id: string, message: string, now = Date.now()) {
    const value = requireMessage(message)
    return this.mutate(() => this.db.query<unknown, { id: string; message: string; now: number }>(
      "UPDATE items SET message = $message, updated_at = $now WHERE id = $id",
    ).run({ id, message: value, now }).changes > 0)
  }

  complete(id: string, now = Date.now()) {
    return this.mutate(() => {
      const result = this.db.query<unknown, { id: string; now: number }>(`
        UPDATE items SET completed_at = $now, updated_at = $now
        WHERE id = $id AND completed_at IS NULL
      `).run({ id, now })
      if (!result.changes) return false
      this.compact()
      return true
    })
  }

  completeNumber(number: number, now = Date.now()) {
    const item = this.active()[number - 1]
    return item ? this.complete(item.id, now) : false
  }

  restore(id: string, now = Date.now()) {
    return this.mutate(() => {
      const position = this.db.query<{ position: number }, []>(
        "SELECT COALESCE(MAX(position), 0) + 1 AS position FROM items WHERE completed_at IS NULL",
      ).get()?.position ?? 1
      return this.db.query<unknown, { id: string; position: number; now: number }>(`
        UPDATE items SET completed_at = NULL, position = $position, updated_at = $now
        WHERE id = $id AND completed_at IS NOT NULL
      `).run({ id, position, now }).changes > 0
    })
  }

  delete(id: string) {
    return this.mutate(() => {
      const result = this.db.query<unknown, { id: string }>("DELETE FROM items WHERE id = $id").run({ id })
      if (!result.changes) return false
      this.compact()
      return true
    })
  }

  move(id: string, offset: -1 | 1) {
    return this.mutate(() => {
      const items = this.active()
      const from = items.findIndex((item) => item.id === id)
      const to = from + offset
      if (from < 0 || to < 0 || to >= items.length) return false
      const first = items[from]!
      const second = items[to]!
      const updatedAt = Date.now()
      this.db.query<unknown, { id: string; position: number; updatedAt: number }>(
        "UPDATE items SET position = $position, updated_at = $updatedAt WHERE id = $id",
      ).run({ id: first.id, position: second.position, updatedAt })
      this.db.query<unknown, { id: string; position: number; updatedAt: number }>(
        "UPDATE items SET position = $position, updated_at = $updatedAt WHERE id = $id",
      ).run({ id: second.id, position: first.position, updatedAt })
      return true
    })
  }

  private get(id: string) {
    const row = this.db.query<ItemRow, { id: string }>(`
      SELECT id, message, position, created_at AS createdAt, updated_at AS updatedAt, completed_at AS completedAt
      FROM items WHERE id = $id
    `).get({ id })
    return row ? item(row) : undefined
  }

  private rows(where: string) {
    return this.db.query<ItemRow, []>(`
      SELECT id, message, position, created_at AS createdAt, updated_at AS updatedAt, completed_at AS completedAt
      FROM items ${where}
    `).all().map(item)
  }

  private compact() {
    const update = this.db.query<unknown, { id: string; position: number }>(
      "UPDATE items SET position = $position WHERE id = $id",
    )
    this.active().forEach((entry, index) => update.run({ id: entry.id, position: index + 1 }))
  }

  private mutate<T>(operation: () => T) {
    let changed = false
    let value: T
    this.db.exec("BEGIN IMMEDIATE")
    try {
      value = operation()
      changed = typeof value === "boolean" ? value : true
      if (changed) this.db.run("UPDATE metadata SET revision = revision + 1 WHERE id = 1")
      this.db.exec("COMMIT")
    } catch (error) {
      this.db.exec("ROLLBACK")
      throw error
    }
    return value!
  }
}

function item(row: ItemRow): LaterItem {
  return { ...row, completedAt: row.completedAt ?? undefined }
}

function requireMessage(message: string) {
  const value = message.trim()
  if (!value) throw new Error("Message cannot be empty")
  return value
}
