import { expect, test } from "bun:test"
import serverPlugin from "../src/server.js"
import tuiPlugin from "../src/tui.js"

test("server module is inert and initializes", async () => {
  expect(await serverPlugin.server({} as never, undefined)).toEqual({})
})

test("TUI module registers commands, route, and sidebar", async () => {
  const layers: Array<{ commands?: Array<Record<string, unknown>> }> = []
  const routes: Array<{ name: string }> = []
  const slots: Array<Record<string, unknown>> = []
  const disposers: Array<() => void | Promise<void>> = []
  const api = {
    state: { path: { state: "/state" } },
    lifecycle: { onDispose: (fn: () => void | Promise<void>) => disposers.push(fn) },
    route: { current: { name: "home" }, register: (items: Array<{ name: string }>) => routes.push(...items), navigate: () => undefined },
    keymap: { registerLayer: (layer: { commands?: Array<Record<string, unknown>> }) => layers.push(layer) },
    slots: { register: (slot: Record<string, unknown>) => { slots.push(slot); return "later" } },
  }

  await tuiPlugin.tui(api as never, { database: ":memory:" }, {} as never)
  const commands = layers.flatMap((layer) => layer.commands ?? [])
  expect(routes.map((route) => route.name)).toContain("opencode-later.manage")
  expect(commands.some((command) => command.name === "opencode-later.open")).toBe(true)
  expect(commands.some((command) => command.slashName === "later")).toBe(true)
  expect(commands.some((command) => command.slashName === "end")).toBe(false)
  expect(slots).toHaveLength(1)
  expect((slots[0]?.slots as Record<string, unknown>).sidebar_content).toBeFunction()
  for (const dispose of disposers.reverse()) await dispose()
})
