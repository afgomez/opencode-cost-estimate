# OpenAI cost estimate

Restores OpenAI's source/catalog prices when a ChatGPT or Codex model transform
has cleared them. Uses the existing model-cost calculator and Context sidebar;
there is no TUI component, custom request, credential change, or billing change.

The existing UI still says **spent**. For subscription usage this means an
**API-equivalent estimate**, not an actual bill. Estimates become part of the
stored session total for subsequent requests; past usage is not recalculated,
and disabling the plugin does not erase estimates already recorded.

Existing non-empty prices are preserved, including context pricing tiers and
cache rates. Models with no source prices remain unpriced. Provider-reported
dollar costs (including explicit zero) take precedence over catalog estimates.

## Requirements

- OpenCode V2 2.2.3 or later, with an OpenAI ChatGPT or Codex connection.
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

Tests cover catalog-price restoration, context tiers, source immutability,
preservation of existing pricing, and missing providers or prices.
