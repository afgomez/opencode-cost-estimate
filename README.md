# Subscription cost estimate

Restores catalog API prices for subscription-backed models that have no
pricing, such as OpenAI ChatGPT/Codex and the Claude Agent provider. It uses the
existing model-cost calculator and Context sidebar. It adds no TUI component and
makes no custom requests. Credentials and billing are unchanged.

The existing UI still says **spent**. For subscription usage this means an
**API-equivalent estimate**, not an actual bill. Estimates become part of the
stored session total for subsequent requests; past usage is not recalculated,
and disabling the plugin does not erase estimates already recorded.

Existing non-empty prices are preserved, including context pricing tiers and
cache rates. Models with no source prices remain unpriced. Provider-reported
dollar costs (including explicit zero) take precedence over catalog estimates.

## How prices are found

For every model without pricing, the plugin looks in order at:

1. The model's own provider catalog, before subscription transforms cleared
   it. This covers OpenAI ChatGPT/Codex.
2. A catalog provider: the model's or provider's `canonical` provider, or a
   built-in mapping (`claude-agent` → `anthropic`).

Models are matched by ID, then by API model ID. In a catalog provider, aliases
like `opus` are also matched by display name: "Opus 5.5" matches
"Claude Opus 5.5". A name match is used only if exactly one catalog model
matches.

To map other providers, pass `catalogs` in the plugin options:

```jsonc
{
  "plugins": [
    {
      "package": "/absolute/path/to/opencode-openai-cost-estimate",
      "options": { "catalogs": { "my-provider": "anthropic" } },
    },
  ],
}
```

## Requirements

- OpenCode V2 2.2.3 or later, with a subscription connection such as OpenAI
  ChatGPT/Codex or Claude Agent.
- Catalog pricing for the selected model.

## Install from source

Clone this repository and install its dependencies:

```sh
git clone https://github.com/afgomez/opencode-openai-cost-estimate.git
cd opencode-openai-cost-estimate
bun install --frozen-lockfile
```

Add the absolute checkout path to the `plugins` array in your global
`~/.config/opencode/opencode.jsonc`, preserving any existing entries:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["/absolute/path/to/opencode-openai-cost-estimate"],
}
```

OpenCode reloads configuration automatically. After subsequent model responses,
the existing Context widget displays the estimated total as **spent**. No new
widget is added and authentication, requests, and actual billing are unchanged.

Remove the plugin entry to disable it. Already-recorded estimates remain in
session history.

## Development

This is a TypeScript source plugin; OpenCode loads `src/index.ts` directly, so
no build step is needed.

```sh
bun install --frozen-lockfile
bun test
bun run typecheck
```

Tests cover catalog-price restoration, context tiers, variant prices, source
immutability, preservation of existing pricing, catalog providers (canonical,
built-in, and option mappings), alias name matching, and missing providers or
prices.
