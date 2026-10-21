/** @jsxImportSource @opentui/solid */

import type { RGBA } from "@opentui/core"
import { Plugin } from "@opencode/plugin/tui"
import type { Context, Route } from "@opencode/plugin/tui/context"
import { useTerminalDimensions } from "@opentui/solid"
import { createMemo, createSignal, onCleanup, Show } from "solid-js"
import { databasePath, LaterStore, stateDirectory, type LaterItem } from "./store.js"

const ROUTE = "opencode-later.manage"
const MODE = "opencode-later.manage"

const commands = {
  open: "opencode-later.open",
  close: "opencode-later.close",
  up: "opencode-later.select.up",
  down: "opencode-later.select.down",
  moveUp: "opencode-later.move.up",
  moveDown: "opencode-later.move.down",
  add: "opencode-later.add",
  edit: "opencode-later.edit",
  complete: "opencode-later.complete",
  start: "opencode-later.start",
  remove: "opencode-later.delete",
  history: "opencode-later.history",
  refresh: "opencode-later.refresh",
}

type Color = RGBA | string
type RouteState = { selectedID?: string; history: boolean; back: Route }
type StateStore = { get: () => RouteState; set: (state: RouteState) => void }
type RevisionStore = { get: () => number; refresh: () => void }
type Skin = { background: Color; panel: Color; border: Color; text: Color; muted: Color; primary: Color; success: Color; warning: Color }

export function sidebarVisible(items: readonly LaterItem[]) {
  return items.length > 0
}

function skin(api: Context): Skin {
  const theme = api.theme
  return {
    background: theme.background.base,
    panel: theme.background.raised.base,
    border: theme.border.base,
    text: theme.text.base,
    muted: theme.text.muted,
    primary: theme.text.action.primary.base,
    success: theme.text.feedback.success.base,
    warning: theme.text.feedback.warning.base,
  }
}

function selectedItem(items: LaterItem[], id?: string) {
  return items.find((item) => item.id === id) ?? items[0]
}

function clampSelection(items: LaterItem[], state: RouteState): RouteState {
  if (!items.length) return { ...state, selectedID: undefined }
  if (items.some((item) => item.id === state.selectedID)) return state
  return { ...state, selectedID: items[0]!.id }
}

function ManageScreen(props: { api: Context; store: LaterStore; state: StateStore; revision: RevisionStore }) {
  const dimensions = useTerminalDimensions()
  const colors = skin(props.api)
  const active = createMemo(() => { props.revision.get(); return props.store.active() })
  const completed = createMemo(() => { props.revision.get(); return props.store.completed() })
  const visible = createMemo(() => props.state.get().history ? [...active(), ...completed()] : active())
  const popMode = props.api.keymap.mode.push(MODE)
  onCleanup(popMode)

  return (
    <box width={dimensions().width} height={dimensions().height} flexDirection="column" backgroundColor={colors.background} paddingTop={1} paddingBottom={1} paddingLeft={2} paddingRight={2}>
      <box flexDirection="row" justifyContent="space-between" paddingBottom={1}>
        <text fg={colors.text}><b>Later</b><span style={{ fg: colors.muted }}> global list</span></text>
        <box flexDirection="row" gap={2}>
          <Hint keyText="a" action="add" colors={colors} />
          <Hint keyText="e" action="edit" colors={colors} />
          <Hint keyText="space" action="complete" colors={colors} />
          <Hint keyText="enter" action="start" colors={colors} />
          <Hint keyText="d" action="delete" colors={colors} />
          <Hint keyText="esc" action="back" colors={colors} />
        </box>
      </box>

      <box flexDirection="row" gap={1} paddingBottom={1}>
        <text fg={colors.primary}>{active().length} active</text>
        <text fg={colors.muted}>/</text>
        <text fg={colors.muted}>{completed().length} completed</text>
        <text fg={colors.muted}>  h history  J/K reorder</text>
      </box>

      {visible().length === 0 ? (
        <box flexGrow={1} border borderColor={colors.border} alignItems="center" justifyContent="center">
          <box flexDirection="column" alignItems="center" gap={1}>
            <text fg={colors.text}><b>No items for later</b></text>
            <text fg={colors.muted}>Press a to add one.</text>
          </box>
        </box>
      ) : (
        <scrollbox flexGrow={1} border borderColor={colors.border} backgroundColor={colors.panel} paddingLeft={1} paddingRight={1}>
          <box flexDirection="column" paddingTop={1} paddingBottom={1}>
            {active().map((item, index) => <ItemRow item={item} label={`${index + 1}.`} selected={props.state.get().selectedID === item.id} colors={colors} />)}
            {props.state.get().history && completed().length ? (
              <box flexDirection="column" paddingTop={1}>
                <text fg={colors.muted}><b>COMPLETED HISTORY</b></text>
                {completed().map((item) => <ItemRow item={item} label="x" selected={props.state.get().selectedID === item.id} colors={colors} />)}
              </box>
            ) : null}
          </box>
        </scrollbox>
      )}

      <box paddingTop={1} flexDirection="row" justifyContent="space-between">
        <text fg={colors.muted}>Changes are shared across projects and OpenCode instances.</text>
        <text fg={colors.primary}>{props.state.get().history ? "history shown" : "active only"}</text>
      </box>
    </box>
  )
}

function ItemRow(props: { item: LaterItem; label: string; selected: boolean; colors: Skin }) {
  return (
    <box height={3} flexDirection="row" alignItems="center" paddingLeft={1} backgroundColor={props.selected ? props.colors.background : undefined}>
      <text width={2} fg={props.selected ? props.colors.primary : props.colors.muted}>{props.selected ? ">" : " "}</text>
      <text width={3} fg={props.selected ? props.colors.primary : props.colors.muted}>{props.label}</text>
      <text flexGrow={1} wrapMode="word" fg={props.item.completedAt ? props.colors.muted : props.colors.text}>{props.item.message}</text>
    </box>
  )
}

function Hint(props: { keyText: string; action: string; colors: Skin }) {
  return <text fg={props.colors.muted}><span style={{ fg: props.colors.text }}>{props.keyText}</span> {props.action}</text>
}

function openManager(api: Context, state: StateStore, store: LaterStore) {
  const current = api.ui.router.current()
  if (current.type === "plugin" && current.name === ROUTE) return
  const active = store.active()
  state.set({ selectedID: active[0]?.id, history: false, back: current })
  api.ui.router.navigate({ type: "plugin", name: ROUTE })
}

function registerCommands(api: Context, store: LaterStore, state: StateStore, revision: RevisionStore, disposed: () => boolean) {
  const toastError = (message: string) => api.ui.toast.show({ variant: "error", title: "Later", message })
  const refresh = () => revision.refresh()
  const rows = () => state.get().history ? [...store.active(), ...store.completed()] : store.active()
  const update = (next: RouteState) => state.set(clampSelection(state.get().history ? [...store.active(), ...store.completed()] : store.active(), next))
  api.keymap.layer(() => ({
    mode: "global",
    commands: [
      {
        id: commands.open,
        title: "Later",
        description: "Manage the global Later list",
        group: "Plugin",
        palette: true,
        slash: { name: "later" },
        run() { openManager(api, state, store) },
      },
    ],
  }))

  api.keymap.layer(() => ({
    mode: MODE,
    commands: [
      { id: commands.close, title: "Close", bind: "escape", run() { api.ui.router.navigate(state.get().back) } },
      { id: commands.refresh, title: "Refresh", bind: "r", run() { refresh(); update(state.get()) } },
      { id: commands.history, title: "Toggle history", bind: "h", run() { const value = state.get(); const next = { ...value, history: !value.history }; state.set(clampSelection(next.history ? [...store.active(), ...store.completed()] : store.active(), next)) } },
      { id: commands.up, title: "Previous", bind: "up,k", run() { select(-1) } },
      { id: commands.down, title: "Next", bind: "down,j", run() { select(1) } },
      { id: commands.moveUp, title: "Move up", bind: "shift+k", run() { move(-1) } },
      { id: commands.moveDown, title: "Move down", bind: "shift+j", run() { move(1) } },
      { id: commands.complete, title: "Toggle completion", bind: "space", run() { toggleComplete() } },
      { id: commands.start, title: "Start", bind: "return", run: start },
      { id: commands.remove, title: "Delete", bind: "d", run: remove },
      { id: commands.add, title: "Add", bind: "a", run: promptAdd },
      { id: commands.edit, title: "Edit", bind: "e", run: promptEdit },
    ],
  }))

  function select(offset: -1 | 1) {
    const items = rows()
    if (!items.length) return
    const current = Math.max(0, items.findIndex((item) => item.id === state.get().selectedID))
    const next = Math.max(0, Math.min(items.length - 1, current + offset))
    state.set({ ...state.get(), selectedID: items[next]!.id })
  }

  function move(offset: -1 | 1) {
    const item = selectedItem(rows(), state.get().selectedID)
    if (!item || item.completedAt) return
    if (store.move(item.id, offset)) refresh()
  }

  function toggleComplete() {
    const items = rows()
    const item = selectedItem(items, state.get().selectedID)
    if (!item) return
    const index = items.findIndex((entry) => entry.id === item.id)
    const previousID = items[index - 1]?.id
    const changed = item.completedAt ? store.restore(item.id) : store.complete(item.id)
    if (!changed) return
    refresh()
    const nextRows = state.get().history ? [...store.active(), ...store.completed()] : store.active()
    state.set(clampSelection(nextRows, { ...state.get(), selectedID: previousID }))
    api.ui.toast.show({
      variant: "success",
      title: "Later",
      message: item.completedAt ? "Item restored to the active list." : "Item moved to history.",
    })
  }

  async function start() {
    const item = selectedItem(rows(), state.get().selectedID)
    if (!item || item.completedAt) return
    const back = state.get().back
    if (back.type === "plugin") return
    api.ui.router.navigate(back)
    // V2 has no TUI publish endpoint. Deliver a local paste through OpenTUI
    // once the destination prompt has mounted, without submitting it.
    await api.renderer.idle()
    if (disposed()) return
    const current = api.ui.router.current()
    if (current.type !== back.type || (current.type === "session" && back.type === "session" && current.sessionID !== back.sessionID)) return
    if (!api.keymap.commands().some((command) => command.id === "prompt.paste")) {
      toastError("The prompt is not ready. The item is still active; try again.")
      return
    }
    api.renderer.keyInput.processPaste(new TextEncoder().encode(item.message))
    store.complete(item.id)
    refresh()
  }

  async function promptAdd() {
    const message = await api.ui.dialog.prompt({ title: "Add for later", placeholder: "What should you return to?" })
    if (message === undefined || disposed()) return
    try { store.add(message); refresh(); update(state.get()) } catch (error) { toastError(error instanceof Error ? error.message : "Could not add item.") }
  }

  async function promptEdit() {
    const item = selectedItem(rows(), state.get().selectedID)
    if (!item) return
    const message = await api.ui.dialog.prompt({ title: "Edit Later item", value: item.message })
    if (message === undefined || disposed()) return
    try { store.edit(item.id, message); refresh() } catch (error) { toastError(error instanceof Error ? error.message : "Could not edit item.") }
  }

  async function remove() {
    const items = rows()
    const item = selectedItem(items, state.get().selectedID)
    if (!item) return
    const index = items.findIndex((entry) => entry.id === item.id)
    const previousID = items[index - 1]?.id
    const confirmed = await api.ui.dialog.confirm({ title: "Delete permanently?", message: item.message })
    if (!confirmed || disposed() || !store.delete(item.id)) return
    refresh()
    const nextRows = state.get().history ? [...store.active(), ...store.completed()] : store.active()
    state.set(clampSelection(nextRows, { ...state.get(), selectedID: previousID }))
    api.ui.toast.show({ variant: "success", title: "Later", message: "Item deleted permanently." })
  }
}

export default Plugin.define({
  id: "opencode-later",
  setup(api) {
    const store = new LaterStore(databasePath(stateDirectory(), api.options.database))
    const [revisionValue, setRevision] = createSignal(store.revision())
    const revision: RevisionStore = { get: revisionValue, refresh: () => setRevision(store.revision()) }
    const [stateValue, setState] = createSignal<RouteState>({ history: false, back: { type: "home" } })
    const state: StateStore = { get: stateValue, set: setState }
    const timer = setInterval(() => {
      const next = store.revision()
      if (next !== revisionValue()) setRevision(next)
    }, 350)

    let disposed = false
    let unregisterRoute: (() => void) | undefined
    let unregisterSlot: (() => void) | undefined
    const cleanup = () => {
      if (disposed) return
      disposed = true
      clearInterval(timer)
      const current = api.ui.router.current()
      if (current.type === "plugin" && current.name === ROUTE) api.ui.router.navigate(state.get().back)
      unregisterSlot?.()
      unregisterRoute?.()
      store.close()
    }

    try {
      unregisterRoute = api.ui.router.register({ name: ROUTE, render: () => <ManageScreen api={api} store={store} state={state} revision={revision} /> })
      unregisterSlot = api.ui.slot({
        append: "sidebar.content",
        render() {
          const items = createMemo(() => { revision.get(); return store.active() })
          return (
            <Show when={sidebarVisible(items())}>
              <box flexDirection="column" paddingTop={1}>
                <text fg={api.theme.text.base}><b>Later</b></text>
                <box flexDirection="column" paddingTop={1}>
                  {items().map((item, index) => (
                    <box flexDirection="row">
                      <text width={4} fg={api.theme.text.muted}>{index + 1}.</text>
                      <text flexGrow={1} wrapMode="word" fg={api.theme.text.base}>{item.message}</text>
                    </box>
                  ))}
                </box>
              </box>
            </Show>
          )
        },
      })
      registerCommands(api, store, state, revision, () => disposed)
      return cleanup
    } catch (error) {
      cleanup()
      throw error
    }
  },
})
