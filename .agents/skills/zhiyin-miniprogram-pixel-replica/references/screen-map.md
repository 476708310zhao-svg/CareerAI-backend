# Approved screen map

The six PNG files in `assets/` are the user-approved visual baselines. They include a rendered phone shell, so automation must use the crop and mask settings in `screens.json` before comparison.

| Screen id | Route | Navigation | Approved asset |
|---|---|---|---|
| `home` | `/pages/index/index` | `switchTab` | `home-approved.png` |
| `jobs` | `/pages/jobs/jobs` | `switchTab` | `jobs-approved.png` |
| `applications` | `/pages/applications/applications` | `navigateTo` | `applications-approved.png` |
| `resources` | `/pages/resources/resources` | `switchTab` | `resources-approved.png` |
| `profile` | `/pages/profile/profile` | `switchTab` | `profile-approved.png` |
| `context-ai` | `/pages/ai-career/ai-career` | `switchTab` | `context-ai-approved.png` |

## Comparison contract

- Canonical viewport: 390×844.
- The baseline phone interior is cropped and normalized by the script. Keep the original PNG unchanged.
- The top native status/menu area and bottom system-indicator strip are masked because Developer Tools capture does not render them consistently.
- A mask may cover only native chrome or genuinely variable user data. It must never hide layout, spacing, typography, cards, navigation, or primary actions.
- `maxDiffRatio` is a pixel gate after normalization and masks. Do not raise it to make a failure pass.
- `maxGlobalShiftPx` is the geometry gate. A best-fit shift over 2 px is a failure even when the aggregate pixel ratio happens to pass.

If the approved artwork is replaced, obtain explicit user approval, update the matching asset, and recalibrate only that screen's crop. Never silently promote a current implementation screenshot to baseline.
