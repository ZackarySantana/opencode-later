/** @jsxImportSource @opentui/solid */

import type { RGBA } from "@opentui/core"
import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from "@opencode-ai/plugin/tui"
import { useTerminalDimensions } from "@opentui/solid"
import { createMemo, createSignal, onCleanup } from "solid-js"
import { databasePath, LaterStore, type LaterItem } from "./store.js"

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
type ReturnRoute = { name: string; params?: Record<string, unknown> }
type RouteState = { selectedID?: string; history: boolean; back: ReturnRoute }
type StateStore = { get: () => RouteState; set: (state: RouteState) => void }
type RevisionStore = { get: () => number; refresh: () => void }
type Skin = { background: Color; panel: Color; border: Color; text: Color; muted: Color; primary: Color; success: Color; warning: Color }

export function sidebarVisible(items: readonly LaterItem[]) {
  return items.length > 0
}

function skin(api: TuiPluginApi): Skin {
  const theme = api.theme.current
  return {
    background: theme.background,
    panel: theme.backgroundPanel,
    border: theme.border,
    text: theme.text,
    muted: theme.textMuted,
    primary: theme.primary,
    success: theme.success,
    warning: theme.warning,
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

function ManageScreen(props: { api: TuiPluginApi; store: LaterStore; state: StateStore; revision: RevisionStore }) {
  const dimensions = useTerminalDimensions()
  const colors = skin(props.api)
  const active = createMemo(() => { props.revision.get(); return props.store.active() })
  const completed = createMemo(() => { props.revision.get(); return props.store.completed() })
  const visible = createMemo(() => props.state.get().history ? [...active(), ...completed()] : active())
  const popMode = props.api.mode.push(MODE)
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

function openManager(api: TuiPluginApi, state: StateStore, store: LaterStore) {
  const current = api.route.current
  const active = store.active()
  state.set({ selectedID: active[0]?.id, history: false, back: { name: current.name, params: "params" in current ? current.params : undefined } })
  api.route.navigate(ROUTE)
}

function registerCommands(api: TuiPluginApi, store: LaterStore, state: StateStore, revision: RevisionStore) {
  const toastError = (message: string) => api.ui.toast({ variant: "error", title: "Later", message })
  const refresh = () => revision.refresh()
  const rows = () => state.get().history ? [...store.active(), ...store.completed()] : store.active()
  const update = (next: RouteState) => state.set(clampSelection(state.get().history ? [...store.active(), ...store.completed()] : store.active(), next))
  const mutate = (operation: () => boolean, success: string) => {
    if (!operation()) return false
    refresh()
    update(state.get())
    api.ui.toast({ variant: "success", title: "Later", message: success })
    return true
  }

  api.keymap.registerLayer({
    commands: [
      {
        name: commands.open,
        title: "Later",
        desc: "Manage the global Later list",
        category: "Plugin",
        namespace: "palette",
        slashName: "later",
        run() { openManager(api, state, store) },
      },
    ],
  })

  api.keymap.registerLayer({
    mode: MODE,
    commands: [
      { name: commands.close, title: "Close", hidden: true, run() { const value = state.get(); api.route.navigate(value.back.name, value.back.params) } },
      { name: commands.refresh, title: "Refresh", hidden: true, run() { refresh(); update(state.get()) } },
      { name: commands.history, title: "Toggle history", hidden: true, run() { const value = state.get(); const next = { ...value, history: !value.history }; state.set(clampSelection(next.history ? [...store.active(), ...store.completed()] : store.active(), next)) } },
      { name: commands.up, title: "Previous", hidden: true, run() { select(-1) } },
      { name: commands.down, title: "Next", hidden: true, run() { select(1) } },
      { name: commands.moveUp, title: "Move up", hidden: true, run() { move(-1) } },
      { name: commands.moveDown, title: "Move down", hidden: true, run() { move(1) } },
      { name: commands.complete, title: "Toggle completion", hidden: true, run() { toggleComplete() } },
      { name: commands.start, title: "Start", hidden: true, run() { void start() } },
      { name: commands.remove, title: "Delete", hidden: true, run() { remove() } },
      { name: commands.add, title: "Add", hidden: true, run() { promptAdd() } },
      { name: commands.edit, title: "Edit", hidden: true, run() { promptEdit() } },
    ],
    bindings: [
      { key: "escape", cmd: commands.close, desc: "Back" },
      { key: "up,k", cmd: commands.up, desc: "Previous" },
      { key: "down,j", cmd: commands.down, desc: "Next" },
      { key: "shift+k", cmd: commands.moveUp, desc: "Move up" },
      { key: "shift+j", cmd: commands.moveDown, desc: "Move down" },
      { key: "a", cmd: commands.add, desc: "Add" },
      { key: "e", cmd: commands.edit, desc: "Edit" },
      { key: "space", cmd: commands.complete, desc: "Complete" },
      { key: "enter,return", cmd: commands.start, desc: "Start" },
      { key: "d", cmd: commands.remove, desc: "Delete" },
      { key: "h", cmd: commands.history, desc: "History" },
      { key: "r", cmd: commands.refresh, desc: "Refresh" },
    ],
  })

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
    api.ui.toast({
      variant: "success",
      title: "Later",
      message: item.completedAt ? "Item restored to the active list." : "Item moved to history.",
    })
  }

  async function start() {
    const item = selectedItem(rows(), state.get().selectedID)
    if (!item || item.completedAt) return
    if (!store.complete(item.id)) return
    refresh()
    const back = state.get().back
    api.route.navigate(back.name, back.params)
    await api.client.tui.publish({
      directory: api.state.path.directory,
      body: { type: "tui.prompt.append", properties: { text: item.message } },
    })
  }

  function promptAdd() {
    api.ui.dialog.setSize("large")
    api.ui.dialog.replace(() => <api.ui.DialogPrompt title="Add for later" placeholder="What should you return to?" onConfirm={(message) => {
      try { store.add(message); refresh(); update(state.get()); api.ui.dialog.clear() } catch (error) { toastError(error instanceof Error ? error.message : "Could not add item.") }
    }} onCancel={() => api.ui.dialog.clear()} />)
  }

  function promptEdit() {
    const item = selectedItem(rows(), state.get().selectedID)
    if (!item) return
    api.ui.dialog.setSize("large")
    api.ui.dialog.replace(() => <api.ui.DialogPrompt title="Edit Later item" value={item.message} onConfirm={(message) => {
      try { store.edit(item.id, message); refresh(); api.ui.dialog.clear() } catch (error) { toastError(error instanceof Error ? error.message : "Could not edit item.") }
    }} onCancel={() => api.ui.dialog.clear()} />)
  }

  function remove() {
    const items = rows()
    const item = selectedItem(items, state.get().selectedID)
    if (!item) return
    const index = items.findIndex((entry) => entry.id === item.id)
    const previousID = items[index - 1]?.id
    api.ui.dialog.setSize("medium")
    api.ui.dialog.replace(() => <api.ui.DialogConfirm title="Delete permanently?" message={item.message} onConfirm={() => {
      api.ui.dialog.clear()
      if (!store.delete(item.id)) return
      refresh()
      const nextRows = state.get().history ? [...store.active(), ...store.completed()] : store.active()
      state.set(clampSelection(nextRows, { ...state.get(), selectedID: previousID }))
      api.ui.toast({ variant: "success", title: "Later", message: "Item deleted permanently." })
    }} onCancel={() => api.ui.dialog.clear()} />)
  }
}

const tui: TuiPlugin = async (api, options) => {
  const store = new LaterStore(databasePath(api.state.path.state, options?.database))
  const [revisionValue, setRevision] = createSignal(store.revision())
  const revision: RevisionStore = { get: revisionValue, refresh: () => setRevision(store.revision()) }
  const [stateValue, setState] = createSignal<RouteState>({ history: false, back: { name: "home" } })
  const state: StateStore = { get: stateValue, set: setState }
  const timer = setInterval(() => {
    const next = store.revision()
    if (next !== revisionValue()) setRevision(next)
  }, 350)

  api.lifecycle.onDispose(() => {
    clearInterval(timer)
    if (api.route.current.name === ROUTE) api.route.navigate("home")
    store.close()
  })

  api.route.register([{ name: ROUTE, render: () => <ManageScreen api={api} store={store} state={state} revision={revision} /> }])
  api.slots.register({
    order: 450,
    slots: {
      sidebar_content(ctx) {
        revision.get()
        const items = store.active()
        if (!sidebarVisible(items)) return null
        return (
          <box flexDirection="column" paddingTop={1}>
            <text fg={ctx.theme.current.text}><b>Later</b></text>
            <box flexDirection="column" paddingTop={1}>
              {items.map((item, index) => (
                <box flexDirection="row">
                  <text width={4} fg={ctx.theme.current.textMuted}>{index + 1}.</text>
                  <text flexGrow={1} wrapMode="word" fg={ctx.theme.current.text}>{item.message}</text>
                </box>
              ))}
            </box>
          </box>
        )
      },
    },
  })
  registerCommands(api, store, state, revision)
}

const plugin: TuiPluginModule & { id: string } = { id: "opencode-later", tui }
export default plugin
