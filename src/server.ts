import type { Plugin, PluginModule } from "@opencode-ai/plugin"

const server: Plugin = async () => ({})

const plugin: PluginModule & { id: string } = {
  id: "opencode-later",
  server,
}

export default plugin
