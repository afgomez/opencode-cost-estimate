import { expect, test } from "bun:test"
import plugin from "../src/index"

const price = {
  input: 2,
  output: 10,
  cache: { read: 0.2, write: 0 },
}

type Model = {
  id: string
  modelID?: string
  providerID: string
  canonical?: string
  name?: string
  cost: (typeof price & { tier?: { type: "context"; size: number } })[]
}

type Catalog = Record<string, { canonical?: string; models: Model[] }>

async function setup(models: Model[], catalog: Catalog = {}, options: Record<string, unknown> = {}) {
  const updates: string[] = []
  for (const model of models) model.modelID ??= model.id
  for (const model of models) model.name ??= model.id
  const ctx = {
    options,
    model: {
      async transform(apply: (editor: unknown) => void) {
        apply({
          provider: {
            get: (providerID: string) => {
              const record = catalog[providerID]
              if (!record) return
              return {
                provider: { id: providerID, canonical: record.canonical },
                models: new Map(record.models.map((model) => [model.id, { name: model.id, ...model }])),
              }
            },
          },
          list: (providerID?: string) => models.filter((model) => !providerID || model.providerID === providerID),
          update(providerID: string, id: string, update: (model: Model) => void) {
            const model = models.find((model) => model.providerID === providerID && model.id === id)!
            updates.push(`${providerID}/${id}`)
            update(model)
          },
        })
      },
    },
  }
  await plugin.setup(ctx as unknown as Parameters<typeof plugin.setup>[0])
  return updates
}

const openai = (models: Model[]): Catalog => ({ openai: { models } })

test("restores catalog prices to subscription models without changing the source", async () => {
  const models: Model[] = [{ id: "test", providerID: "openai", cost: [] }]
  const source: Model[] = [{ id: "test", providerID: "openai", cost: [structuredClone(price)] }]
  expect(await setup(models, openai(source))).toEqual(["openai/test"])
  expect(models[0]!.cost).toEqual(source[0]!.cost)
  models[0]!.cost[0]!.cache.read = 99
  expect(source[0]!.cost[0]!.cache.read).toBe(0.2)
})

test("preserves context pricing tiers", async () => {
  const models: Model[] = [{ id: "test", providerID: "openai", cost: [] }]
  const tier = { ...price, tier: { type: "context" as const, size: 200_000 } }
  await setup(models, openai([{ id: "test", providerID: "openai", cost: [price, tier] }]))
  expect(models[0]!.cost).toEqual([price, tier])
  expect(models[0]!.cost[1]!.tier).not.toBe(tier.tier)
})

test("prefers variant prices over the shared base modelID", async () => {
  const fast = { ...price, input: 4 }
  const models: Model[] = [{ id: "test-fast", modelID: "test", providerID: "openai", cost: [] }]
  const source: Model[] = [
    { id: "test", providerID: "openai", cost: [price] },
    { id: "test-fast", modelID: "test", providerID: "openai", cost: [fast] },
  ]
  await setup(models, openai(source))
  expect(models[0]!.cost).toEqual([fast])
})

test("leaves paid API pricing alone", async () => {
  const models: Model[] = [{ id: "paid", modelID: "paid", name: "paid", providerID: "openai", cost: [price] }]
  const original = structuredClone(models)
  expect(await setup(models, openai(models))).toEqual([])
  expect(models).toEqual(original)
})

test("does not invent rates for unknown or unpriced models", async () => {
  const models: Model[] = [
    { id: "unknown", providerID: "openai", cost: [] },
    { id: "unpriced", providerID: "openai", cost: [] },
  ]
  expect(await setup(models, openai([{ id: "unpriced", providerID: "openai", cost: [] }]))).toEqual([])
  expect(models.every((model) => model.cost.length === 0)).toBe(true)
})

test("does nothing when no catalog is available", async () => {
  const models: Model[] = [{ id: "test", providerID: "openai", cost: [] }]
  expect(await setup(models)).toEqual([])
})

test("prices Claude Agent models from the Anthropic catalog", async () => {
  const models: Model[] = [{ id: "claude-opus-4-8", providerID: "claude-agent", cost: [] }]
  const anthropic = { models: [{ id: "claude-opus-4-8", providerID: "anthropic", cost: [price] }] }
  expect(await setup(models, { anthropic })).toEqual(["claude-agent/claude-opus-4-8"])
  expect(models[0]!.cost).toEqual([price])
})

test("resolves aliases by an unambiguous display name", async () => {
  const opus = { ...price, input: 4 }
  const models: Model[] = [
    { id: "opus", name: "Opus 5.5", providerID: "claude-agent", cost: [] },
    { id: "haiku", name: "Haiku 4.5", providerID: "claude-agent", cost: [] },
    { id: "sonnet", name: "Sonnet 5", providerID: "claude-agent", cost: [] },
  ]
  const anthropic = {
    models: [
      { id: "claude-opus-5", name: "Claude Opus 5", providerID: "anthropic", cost: [price] },
      { id: "claude-opus-5-5", name: "Claude Opus 5.5", providerID: "anthropic", cost: [opus] },
      { id: "claude-haiku-4-5", name: "Claude Haiku 4.5", providerID: "anthropic", cost: [price] },
      { id: "claude-haiku-4-5-1001", name: "Claude Haiku 4.5", providerID: "anthropic", cost: [price] },
    ],
  }
  expect(await setup(models, { anthropic })).toEqual(["claude-agent/opus"])
  expect(models[0]!.cost).toEqual([opus])
  expect(models[1]!.cost).toEqual([])
  expect(models[2]!.cost).toEqual([])
})

test("follows model and provider canonical catalogs", async () => {
  const models: Model[] = [
    { id: "a", providerID: "proxy", canonical: "upstream", cost: [] },
    { id: "b", providerID: "relay", cost: [] },
  ]
  const upstream = {
    models: [
      { id: "a", providerID: "upstream", cost: [price] },
      { id: "b", providerID: "upstream", cost: [price] },
    ],
  }
  const relay = { canonical: "upstream", models: [] }
  expect(await setup(models, { upstream, relay })).toEqual(["proxy/a", "relay/b"])
})

test("accepts extra catalog mappings from plugin options", async () => {
  const models: Model[] = [{ id: "m", providerID: "custom", cost: [] }]
  const upstream = { models: [{ id: "m", providerID: "upstream", cost: [price] }] }
  expect(await setup(models, { upstream })).toEqual([])
  expect(await setup(models, { upstream }, { catalogs: { custom: "upstream" } })).toEqual(["custom/m"])
})
