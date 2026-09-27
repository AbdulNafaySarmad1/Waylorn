# Design language

The console is built for operators and engineers who keep it open for a 12-hour shift. It follows the principles of ISA-101 (high-performance HMI) adapted to an IT/OT control plane.

## Principles

1. **Normal is quiet.** Neutral surfaces; "normal" status is a muted check, not bright green. Colour is reserved for abnormal and consequential states.
2. **Never colour alone.** Every status has a text label and a distinct glyph (check, triangle, filled square, question mark, slashed circle, diamond, dot). This survives colour blindness, monochrome printing and forced-colours mode.
3. **Provenance travels with numbers.** Values show when they were observed and by what; analytics show method, version, interval and sample size; ML shows model, inference time, input freshness and uncertainty.
4. **Where am I, and what will this touch?** Organization, site, zone, line and an environment band (PRODUCTION, STAGING, LAB) are always visible on asset views and repeated inside every consequential dialog.
5. **Density over decoration.** Tables are the primary component. Sections have a thin border and a header strip; no cards-for-everything, gradients, glass, oversized headings or KPI tiles without context.
6. **Motion only for meaning.** No decorative animation; `prefers-reduced-motion` removes the little that exists.

## Tokens

`packages/design-tokens/src/tokens.css` defines surfaces, ink, status, safety-class, environment and data-visualisation colours for light (day shift), dark (control room) and high-contrast themes, plus a 4 px spacing scale and a 12–20 px type scale. The context bar stays dark in all themes. Tests enforce WCAG AA contrast for text and status tokens.

## Typography

System font stacks (no network font loading, so air-gapped builds work); tabular numerals everywhere; monospace for tags, identifiers, digests and correlation IDs. Body 14 px, dense tables 13 px, metadata 12 px minimum.

## Charts

Only where a chart carries information a table cannot: telemetry history (mean line with min–max band, labelled gaps, one y-axis, crosshair and keyboard inspection, data-table alternative). Data-series colours never reuse status colours.

## Safety classes

GREEN (observation), AMBER (controlled administration), RED (physical process impact) are shown as a text badge with a class-specific glyph. RED confirmation buttons are the only place the danger colour fills a control, and they are never default-focused.
