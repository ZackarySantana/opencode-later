import { afterEach, expect, test } from "bun:test"
import type { Context, KeymapLayer, Page, Route, SlotClaim } from "@opencode/plugin/tui/context"
import { RGBA, TextareaRenderable } from "@opentui/core"
import { createTestRenderer } from "@opentui/core/testing"
import { testRender } from "@opentui/solid"
import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import serverPlugin from "../src/server.js"
import tuiPlugin from "../src/tui.js"
import { LaterStore } from "../src/store.js"

const cleanups: Array<() => void> = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup()
})

function harness(initial: Route = { type: "home" }) {
  const directory = mkdtempSync(join(tmpdir(), "opencode-later-plugin-"))
  cleanups.push(() => rmSync(directory, { recursive: true, force: true }))
  const database = join(directory, "later.sqlite")
  const store = new LaterStore(database)
  cleanups.push(() => store.close())
  const layers: KeymapLayer[] = []
  const routes: Page[] = []
  const slots: SlotClaim[] = []
  const toasts: Array<{ message: string; variant?: string }> = []
  const pastes: string[] = []
  let route = initial
  let prompt: string | undefined
  let confirm: boolean | undefined = true
  let ready = true
  let idle = async () => {}
  let stop: (() => void) | undefined
  const api = {
    options: { database },
    renderer: { idle: () => idle(), keyInput: { processPaste: (bytes: Uint8Array) => { pastes.push(new TextDecoder().decode(bytes)) } } },
    theme: {
      background: { base: RGBA.fromHex("#000000"), raised: { base: RGBA.fromHex("#111111") } },
      border: { base: RGBA.fromHex("#333333") },
      text: {
        base: RGBA.fromHex("#ffffff"), muted: RGBA.fromHex("#aaaaaa"),
        action: { primary: { base: RGBA.fromHex("#00aaff") } },
        feedback: { success: { base: RGBA.fromHex("#00ff00") }, warning: { base: RGBA.fromHex("#ffff00") } },
      },
    },
    ui: {
      router: {
        current: () => route,
        navigate: (next: Route) => { route = next },
        register: (page: Page) => { routes.push(page); return () => { routes.splice(routes.indexOf(page), 1) } },
      },
      slot: (slot: SlotClaim) => { slots.push(slot); return () => { slots.splice(slots.indexOf(slot), 1) } },
      toast: { show: (toast: { message: string; variant?: string }) => toasts.push(toast) },
      dialog: {
        prompt: async () => prompt,
        confirm: async () => confirm,
      },
    },
    keymap: {
      mode: { push: () => () => {} },
      layer: (factory: () => KeymapLayer) => layers.push(factory()),
      commands: () => ready ? [{ id: "prompt.paste" }] : [],
    },
  }
  const load = () => {
    const result = tuiPlugin.setup(api as unknown as Context)
    expect(result).toBeFunction()
    stop = result as () => void
  }
  load()
  cleanups.push(() => stop?.())
  return {
    api, layers, routes, slots, store, toasts, pastes,
    current: () => route,
    stop: () => stop?.(),
    prompt: (value: string | undefined) => { prompt = value },
    confirm: (value: boolean) => { confirm = value },
    ready: (value: boolean) => { ready = value },
    idle: (value: () => Promise<void>) => { idle = value },
    async run(name: string) {
      const command = layers.flatMap((layer) => layer.commands ?? []).find((command) => command.id === `opencode-later.${name}`)
      if (!command) throw new Error(`Unknown command: ${name}`)
      await command.run()
    },
  }
}

test("server has a V2 definition and remains inert", async () => {
  expect(serverPlugin.id).toBe("opencode-later")
  expect(await serverPlugin.setup({} as never)).toBeUndefined()
})

test("V2 setup registers /later, a route, a sidebar, and all keyboard actions", () => {
  const h = harness()
  expect(tuiPlugin.id).toBe("opencode-later")
  expect(h.routes.map((route) => route.name)).toEqual(["opencode-later.manage"])
  expect(h.slots[0]?.append).toBe("sidebar.content")
  const commands = h.layers.flatMap((layer) => layer.commands ?? [])
  expect(commands.find((command) => command.id === "opencode-later.open")?.slash?.name).toBe("later")
  expect(h.layers[0]?.mode).toBe("global")
  expect(commands.filter((command) => command.bind)).toHaveLength(12)
  expect(commands.find((command) => command.id === "opencode-later.start")?.bind).toBe("return")
})

test("add, edit, reorder, complete, restore, and delete preserve behavior", async () => {
  const h = harness()
  await h.run("open")
  h.prompt("first")
  await h.run("add")
  h.prompt("second")
  await h.run("add")
  h.prompt("edited")
  await h.run("edit")
  expect(h.store.active().map((item) => item.message)).toEqual(["edited", "second"])
  await h.run("move.down")
  expect(h.store.active().map((item) => item.message)).toEqual(["second", "edited"])
  await h.run("complete")
  expect(h.store.completed().map((item) => item.message)).toEqual(["edited"])
  await h.run("history")
  await h.run("select.down")
  await h.run("complete")
  expect(h.store.active().map((item) => item.message)).toEqual(["second", "edited"])
  expect(h.store.completed()).toEqual([])
  h.confirm(false)
  await h.run("delete")
  expect(h.store.active()).toHaveLength(2)
  h.confirm(true)
  await h.run("delete")
  expect(h.store.active().map((item) => item.message)).toEqual(["edited"])
})

test("cancelled and invalid input do not mutate the database", async () => {
  const h = harness()
  await h.run("add")
  h.prompt("   ")
  await h.run("add")
  expect(h.store.active()).toEqual([])
  expect(h.toasts.at(-1)?.variant).toBe("error")
  expect(h.store.revision()).toBe(0)
})

test.each([{ type: "home" }, { type: "session", sessionID: "session-1" }] as const)("start returns to %j and pastes without submitting", async (back) => {
  const h = harness(back)
  h.store.add("work on this")
  await h.run("open")
  await h.run("open") // Reopening the manager must not replace the return route.
  await h.run("start")
  expect(h.current()).toEqual(back)
  expect(h.pastes).toEqual(["work on this"])
  expect(h.store.active()).toEqual([])
  expect(h.store.completed().map((item) => item.message)).toEqual(["work on this"])
})

test("start keeps the item active when the prompt is not available", async () => {
  const h = harness()
  h.store.add("keep this")
  h.ready(false)
  await h.run("open")
  await h.run("start")
  expect(h.pastes).toEqual([])
  expect(h.store.active()).toHaveLength(1)
})

test("close and cleanup return to the originating session and unregister UI", async () => {
  const back: Route = { type: "session", sessionID: "session-2" }
  const h = harness(back)
  await h.run("open")
  await h.run("close")
  expect(h.current()).toEqual(back)
  await h.run("open")
  h.stop()
  h.stop()
  expect(h.current()).toEqual(back)
  expect(h.routes).toEqual([])
  expect(h.slots).toEqual([])
})

test("unloading during a pending start does not paste or access the closed store", async () => {
  const h = harness()
  h.store.add("keep this")
  await h.run("open")
  let resume!: () => void
  h.idle(() => new Promise<void>((resolve) => { resume = resolve }))
  const pending = h.run("start")
  h.stop()
  resume()
  await pending
  expect(h.pastes).toEqual([])
  expect(h.store.active()).toHaveLength(1)
})

test("sidebar renders reactively, including empty-to-active transitions and external updates", async () => {
  const h = harness()
  const slot = h.slots[0] as SlotClaim<"sidebar.content">
  const view = await testRender(() => slot.render({ sessionID: "session-1" }), { width: 40, height: 12 })
  try {
    await view.renderOnce()
    expect(view.captureCharFrame()).not.toContain("Later")
    h.prompt("rendered item")
    await h.run("add")
    await view.renderOnce()
    expect(view.captureCharFrame()).toContain("Later")
    expect(view.captureCharFrame()).toContain("1.  rendered item")
    const item = h.store.active()[0]!
    h.store.edit(item.id, "external edit")
    await Bun.sleep(400)
    await view.renderOnce()
    expect(view.captureCharFrame()).toContain("external edit")
    await h.run("complete")
    await view.renderOnce()
    expect(view.captureCharFrame()).not.toContain("Later")
  } finally {
    await view.dispose()
  }
})

test("management route renders the list and completed history with V2 OpenTUI", async () => {
  const h = harness()
  h.store.add("active item")
  const completed = h.store.add("completed item")
  h.store.complete(completed.id)
  await h.run("open")
  const view = await testRender(() => h.routes[0]!.render({}), { width: 120, height: 30 })
  try {
    await view.renderOnce()
    expect(view.captureCharFrame()).toContain("active item")
    expect(view.captureCharFrame()).not.toContain("completed item")
    await h.run("history")
    await view.renderOnce()
    expect(view.captureCharFrame()).toContain("COMPLETED HISTORY")
    expect(view.captureCharFrame()).toContain("completed item")
  } finally {
    await view.dispose()
  }
})

test("start delivers multiline Unicode text through the real OpenTUI paste pipeline", async () => {
  const h = harness()
  const view = await createTestRenderer({ width: 60, height: 10 })
  const input = new TextareaRenderable(view.renderer, { id: "prompt", width: 60, height: 5 })
  view.renderer.root.add(input)
  input.focus()
  Object.assign(h.api, { renderer: view.renderer })
  try {
    h.store.add("Fix café ☕\nand add tests")
    await h.run("open")
    await h.run("start")
    expect(input.plainText).toBe("Fix café ☕\nand add tests")
    expect(h.store.active()).toEqual([])
  } finally {
    await view.dispose()
  }
})
