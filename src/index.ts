import type { Plugin } from "@opencode/plugin"

export default {
  id: "local.openai-cost-estimate",
  async setup(ctx) {
    await ctx.model.transform((editor) => {
      // Provider inputs retain catalog pricing, before the ChatGPT/Codex
      // model transforms clear it for subscription-backed usage.
      const source = editor.provider.get("openai")
      if (!source) return

      for (const model of editor.list("openai")) {
        // Preserve paid API pricing and overrides supplied by other plugins.
        if (model.cost.length > 0) continue
        const prices = source.models.get(model.id)?.cost
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
