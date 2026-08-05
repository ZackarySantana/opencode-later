import { afterEach, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { databasePath, LaterStore } from "../src/store.js"

const directories: string[] = []
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function stores() {
  const directory = mkdtempSync(join(tmpdir(), "opencode-later-"))
  directories.push(directory)
  const path = join(directory, "later.sqlite")
  return [new LaterStore(path), new LaterStore(path)] as const
}

test("allows duplicate messages and preserves append order", () => {
  const store = new LaterStore(":memory:")
  store.add("same", 1)
  store.add("same", 2)
  expect(store.active().map((item) => item.message)).toEqual(["same", "same"])
  expect(new Set(store.active().map((item) => item.id)).size).toBe(2)
  store.close()
})

test("completes by active number and retains history", () => {
  const store = new LaterStore(":memory:")
  store.add("one", 1)
  store.add("two", 2)
  store.add("three", 3)
  expect(store.completeNumber(2, 10)).toBe(true)
  expect(store.active().map((item) => [item.position, item.message])).toEqual([[1, "one"], [2, "three"]])
  expect(store.completed().map((item) => item.message)).toEqual(["two"])
  expect(store.completeNumber(9)).toBe(false)
  store.close()
})

test("restores a completed item at the end of the active list", () => {
  const store = new LaterStore(":memory:")
  const one = store.add("one", 1)
  store.add("two", 2)
  store.complete(one.id, 3)
  expect(store.restore(one.id, 4)).toBe(true)
  expect(store.active().map((item) => [item.position, item.message])).toEqual([[1, "two"], [2, "one"]])
  expect(store.completed()).toEqual([])
  expect(store.restore(one.id, 5)).toBe(false)
  store.close()
})

test("edits, reorders, and permanently deletes items", () => {
  const store = new LaterStore(":memory:")
  const one = store.add("one", 1)
  const two = store.add("two", 2)
  store.edit(one.id, "first", 3)
  expect(store.move(two.id, -1)).toBe(true)
  expect(store.active().map((item) => item.message)).toEqual(["two", "first"])
  store.complete(two.id, 4)
  expect(store.delete(two.id)).toBe(true)
  expect(store.completed()).toEqual([])
  expect(store.active().map((item) => item.position)).toEqual([1])
  store.close()
})

test("rejects empty messages without changing the revision", () => {
  const store = new LaterStore(":memory:")
  const revision = store.revision()
  expect(() => store.add("   ")).toThrow("Message cannot be empty")
  expect(store.revision()).toBe(revision)
  store.close()
})

test("shares updates and revisions between processes", () => {
  const [first, second] = stores()
  const initial = second.revision()
  first.add("shared")
  expect(second.revision()).toBe(initial + 1)
  expect(second.active().map((item) => item.message)).toEqual(["shared"])
  first.close()
  second.close()
})

test("resolves default and custom database paths", () => {
  expect(databasePath("/state")).toBe("/state/opencode-later/later.sqlite")
  expect(databasePath("/state", "custom.sqlite")).toBe("/state/custom.sqlite")
  expect(databasePath("/state", "/tmp/custom.sqlite")).toBe("/tmp/custom.sqlite")
  expect(databasePath("/state", ":memory:")).toBe(":memory:")
})
