import { expect, test } from "bun:test"

test("published TUI output uses the reactive OpenTUI Solid transform", async () => {
  const output = await Bun.file("dist/tui.js").text()
  expect(output).toContain('import { effect as _$effect } from "@opentui/solid"')
  expect(output).not.toContain('from "@opentui/solid/jsx-runtime"')
})
