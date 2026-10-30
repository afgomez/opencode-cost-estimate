import { expect, test } from "bun:test"
import plugin from "../src/index"

const price = {
  input: 2,
  output: 10,
  cache: { read: 0.2, write: 0 },
}

type Model = {
  id: string
  providerID: string
  cost: (typeof price & { tier?: { type: "context"; size: number } })[]
}

async function setup(models: Model[], catalog?: Model[]) {
  const updates: string[] = []
  const ctx = {
    model: {
      async transform(apply: (editor: unknown) => void) {
        apply({
          provider: {
            get: () => catalog && { models: new Map(catalog.map((model) => [model.id, model])) },
          },
          list: (providerID: string) => models.filter((model) => model.providerID === providerID),
          update(providerID: string, id: string, update: (model: Model) => void) {
            const model = models.find((model) => model.providerID === providerID && model.id === id)!
            updates.push(id)
            update(model)
          },
        })
      },
    },
  }
  await plugin.setup(ctx as unknown as Parameters<typeof plugin.setup>[0])
  return updates
}

test("restores catalog prices to subscription models without changing the source", async () => {
  const models: Model[] = [{ id: "test", providerID: "openai", cost: [] }]
  const catalog: Model[] = [{ id: "test", providerID: "openai", cost: [structuredClone(price)] }]
  expect(await setup(models, catalog)).toEqual(["test"])
  expect(models[0]!.cost).toEqual(catalog[0]!.cost)
  models[0]!.cost[0]!.cache.read = 99
  expect(catalog[0]!.cost[0]!.cache.read).toBe(0.2)
})

test("preserves context pricing tiers", async () => {
  const models: Model[] = [{ id: "test", providerID: "openai", cost: [] }]
  const tier = { ...price, tier: { type: "context" as const, size: 200_000 } }
  const catalog: Model[] = [{ id: "test", providerID: "openai", cost: [price, tier] }]
  await setup(models, catalog)
  expect(models[0]!.cost).toEqual([price, tier])
  expect(models[0]!.cost[1]!.tier).not.toBe(tier.tier)
})

test("leaves paid API pricing and other providers alone", async () => {
  const models: Model[] = [
    { id: "paid", providerID: "openai", cost: [price] },
    { id: "other", providerID: "anthropic", cost: [] },
  ]
  const original = structuredClone(models)
  expect(await setup(models, models)).toEqual([])
  expect(models).toEqual(original)
})

test("does not invent rates for unknown or unpriced models", async () => {
  const models: Model[] = [
    { id: "unknown", providerID: "openai", cost: [] },
    { id: "unpriced", providerID: "openai", cost: [] },
  ]
  expect(await setup(models, [{ id: "unpriced", providerID: "openai", cost: [] }])).toEqual([])
  expect(models.every((model) => model.cost.length === 0)).toBe(true)
})

test("does nothing when OpenAI is unavailable", async () => {
  expect(await setup([])).toEqual([])
})
