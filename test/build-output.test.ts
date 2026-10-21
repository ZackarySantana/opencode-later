import { expect, test } from "bun:test"

test("published TUI output uses the reactive OpenTUI Solid transform", async () => {
  const output = await Bun.file("dist/tui.js").text()
  expect(output).toContain('import { effect as _$effect } from "@opentui/solid"')
  expect(output).not.toContain('from "@opentui/solid/jsx-runtime"')
  expect(output).toContain('from "@opencode/plugin/tui"')
  expect(output).not.toContain("@opencode-ai/plugin")
})

test("package entrypoints expose V2 plugin definitions", async () => {
  const name = "opencode-later"
  const { default: server } = await import(name)
  const { default: tui } = await import(`${name}/tui`)
  expect(server.id).toBe("opencode-later")
  expect(server.setup).toBeFunction()
  expect(tui.id).toBe("opencode-later")
  expect(tui.setup).toBeFunction()
  expect(server.server).toBeUndefined()
  expect(tui.tui).toBeUndefined()
})
