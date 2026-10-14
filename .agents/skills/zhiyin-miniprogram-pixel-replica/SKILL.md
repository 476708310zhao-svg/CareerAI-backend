---
name: zhiyin-miniprogram-pixel-replica
description: Pixel-accurate replication and visual regression for the approved Zhiyin WeChat Mini Program tabs and contextual AI. Use when changing these screens, comparing Developer Tools screenshots, or deciding whether related UI is ready to commit; do not use to invent a new visual direction.
---

# Zhiyin Miniprogram Pixel Replica

Treat the approved prototype image as the sole visual source of truth. Preserve business logic and data contracts. Do not retain an old layout when it conflicts with the prototype, and do not improve, simplify, or reinterpret the approved composition without the user's approval.

Read [references/screen-map.md](references/screen-map.md) before changing or verifying a screen. It identifies the approved baseline, route, capture method, and unavoidable masks.

## Workflow

1. Select one requested screen and inspect its approved image before editing.
2. Measure visible geometry first: safe-area offset, gutters, component bounds, gaps, type sizes and line heights, radii, borders, shadows, and colors. Record page-specific decisions in `design-system/zhiyin-career/pages/` when they are not already documented.
3. Edit only the relevant WXML/WXSS and the smallest supporting code needed for layout. Keep interaction, API, login, analytics, and persistence behavior unchanged.
4. Compile in WeChat Developer Tools at exactly 390×844. The automation service must be available at `ws://127.0.0.1:9420`.
5. Run from the repository root:

   ```powershell
   node .agents/skills/zhiyin-miniprogram-pixel-replica/scripts/capture-and-compare.js --screen <screen-id>
   ```

6. Inspect all three outputs under `artifacts/visual-regression/<screen-id>/`: `actual.png`, `overlay.png`, and `diff.png`. Do not judge from the actual screenshot alone.
7. Fix the discrepancies in one bounded batch, then run one confirmation pass. Continue only when the remaining mismatch is caused by documented dynamic content or native chrome rather than page geometry.

Use `--screen all` only after individual pages have been stabilized. Use `--no-capture --actual <path>` when comparing an existing screenshot.

## Gate

A screen is not ready to commit unless all of these are true:

- viewport is exactly 390×844;
- estimated global horizontal and vertical shifts are each at most 2 px;
- the first-screen information order and major component bounds match the baseline;
- no conflicting old header, dark block, card, spacing, or typography remains;
- the generated report passes its configured pixel threshold, or every excluded region is documented in the screen map;
- business and regression tests still pass.

If Developer Tools automation, compilation, or screenshot capture is unavailable, report the visual gate as blocked. Never claim pixel parity from source inspection alone.

## Baseline safety

Never overwrite or regenerate files in `assets/*-approved.png` unless the user explicitly approves a new visual baseline. Dynamic data is handled through stable fixtures or narrowly documented masks, not by relaxing the whole threshold. Do not commit visual changes before the requested screens pass the gate.
