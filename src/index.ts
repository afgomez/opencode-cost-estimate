import type { Model, Plugin } from "@opencode/plugin"

type Editor = Parameters<Parameters<Plugin.Context["model"]["transform"]>[0]>[0]
type Source = { readonly models: ReadonlyMap<string, Model.Info> }

// Subscription providers that serve another provider's models without
// declaring a canonical provider. Extend with the `catalogs` plugin option.
const CATALOGS: Record<string, string> = {
  "claude-agent": "anthropic",
}

export default {
  id: "local.openai-cost-estimate",
  async setup(ctx) {
    const catalogs: Record<string, string> = { ...CATALOGS, ...ctx.options.catalogs }

    await ctx.model.transform((editor) => {
      for (const model of editor.list()) {
        // Preserve paid API pricing and overrides supplied by other plugins.
        if (model.cost.length > 0) continue
        const prices = lookup(editor, model, catalogs)
        if (!prices?.length) continue

        editor.update(model.providerID, model.id, (draft) => {
          draft.cost = prices.map((price) => ({
            ...price,
            cache: { ...price.cache },
            ...(price.tier ? { tier: { ...price.tier } } : {}),
          }))
        })
      }
    })
  },
} satisfies Parameters<typeof Plugin.define>[0]

function lookup(editor: Editor, model: Model.Info, catalogs: Record<string, string>) {
  // Provider inputs retain catalog pricing, before subscription model
  // transforms (such as ChatGPT/Codex) clear it.
  const own = editor.provider.get(model.providerID)
  const priced = byID(own, model)
  if (priced) return priced

  const foreign = [model.canonical, own?.provider.canonical, catalogs[model.providerID]]
  for (const providerID of new Set(foreign)) {
    if (!providerID || providerID === model.providerID) continue
    const source = editor.provider.get(providerID)
    const prices = byID(source, model) ?? byName(source, model)
    if (prices) return prices
  }
}

function byID(source: Source | undefined, model: Model.Info): readonly Model.Cost[] | undefined {
  // Prefer the exact entry: variants such as `-fast` share the base modelID
  // but carry their own prices.
  for (const id of [model.id, model.modelID]) {
    const cost = source?.models.get(id)?.cost
    if (cost?.length) return cost
  }
}

// Aliases such as `opus` carry only a display name ("Opus 5.5"); match it
// against the end of a catalog name ("Claude Opus 5.5") when unambiguous.
function byName(source: Source | undefined, model: Model.Info): readonly Model.Cost[] | undefined {
  if (!source) return
  const target = words(model.name)
  if (!target.length) return
  const matches = [...source.models.values()].filter((candidate) => {
    const name = words(candidate.name)
    const tail = name.slice(name.length - target.length)
    return tail.length === target.length && tail.every((word, i) => word === target[i])
  })
  if (matches.length === 1 && matches[0]!.cost.length) return matches[0]!.cost
}

function words(name: string) {
  return name.toLowerCase().match(/[a-z]+|\d+(?:\.\d+)*/g) ?? []
}
