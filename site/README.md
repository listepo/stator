# stator site (Astro)

Static landing for [listepo/stator](https://github.com/listepo/stator). Built with Astro (`output: 'static'`). Deployed to GitHub Pages at `/stator/`.

## Layout

| Path | Purpose |
|------|---------|
| `src/pages/` | Routes (`index.astro` = landing) |
| `src/layouts/` | Shared HTML shell |
| `src/components/` | Reusable UI pieces |
| `src/styles/` | Global CSS + brand tokens (`tokens.css`) |
| `public/` | Static assets (logos, favicon) served as-is |
| `dist/` | Build output (gitignored) |

Brand source of truth: `../docs/brand/` (`DESIGN.md`, `tokens.css`, SVGs). When brand tokens change, sync `src/styles/tokens.css` and re-copy logos into `public/`.

Landing screenshots for review: `../docs/assets/landing-v1/` (owned by design).

## Commands

Requires Node ≥ 22 (Node 24 via mise is fine) and pnpm.

```bash
cd site
pnpm install
pnpm dev      # http://localhost:4321/stator/
pnpm build    # writes dist/
pnpm preview  # serve dist/ with the same base path
```

## Base path (GitHub Pages)

`astro.config.mjs` sets `base: '/stator/'` for project Pages (`https://listepo.github.io/stator/`).

Local preview **without** the `/stator/` prefix:

```bash
ASTRO_BASE=/ pnpm build
ASTRO_BASE=/ pnpm preview
```

CI always builds with the default `/stator/` base.

## Deploy

`.github/workflows/pages.yml` builds this package on `main` (and checks PRs that touch `site/**`) and uploads `site/dist` to GitHub Pages.
