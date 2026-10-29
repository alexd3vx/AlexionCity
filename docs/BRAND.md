# AlexionCity brand

Direction A, **Skyline Sun**: an A built from a roof peak, with a rising sun and a three-building skyline inside it. Warm, optimistic, easy to read at small sizes. The design tokens live in `packages/shared/src/tokens.ts`.

## Files

| File                      | Use                                                   |
| ------------------------- | ----------------------------------------------------- |
| `brand/mark.svg`          | The mark on light backgrounds (navy buildings)        |
| `brand/mark-on-dark.svg`  | The mark on dark backgrounds (sand buildings)         |
| `brand/icon.svg`          | App icon: white A on a sunrise square                 |
| `brand/icon-maskable.svg` | Android maskable icon, mark kept inside the safe zone |

Regenerate the PNG icons and the copies in `apps/client/public` with `node tools/make-icons.mjs`.

## Colours

| Name    | Hex       | Use                                                           |
| ------- | --------- | ------------------------------------------------------------- |
| Sunrise | `#FF7A1A` | Primary colour: buttons, the logo, the "City" in the wordmark |
| Navy    | `#1B2340` | Text, dark panels, the "Alexion" in the wordmark              |
| Sky     | `#BFE3FF` | Sky, calm highlights, daytime backgrounds                     |
| Sand    | `#FFF3E0` | Warm light surfaces and cards                                 |
| Leaf    | `#2FBF71` | Good, healthy, success                                        |

Need meters keep one colour each so players learn them: hunger green, energy amber, mood blue, hygiene pink. Use Sunrise for one main action per screen; everything else is white, Sand or Navy.

## Type

- **Wordmark and big headings:** Baloo 2, weight 800, bundled with the app (no external font request).
- **Everything else:** the device's system font, for speed and a native feel.

Write the name as **AlexionCity**, one word, capital A and C. In the wordmark, "Alexion" is Navy and "City" is Sunrise; on dark backgrounds "Alexion" is white or Sand.

## Using the mark

- Leave clear space around it equal to the width of one leg of the A.
- Smallest size: 16 px for the mark alone, 96 px wide for the full wordmark.
- Do not recolour the sun, rotate or stretch the mark, add shadows, or place it on Sunrise-coloured backgrounds (use the white-A app icon there).

## Voice

Friendly and plain. Short sentences, active verbs, say what a button does ("Update now", not "OK"). The currency is **Alex**, written ₳ 1,200. Brands in the game are fictional unless a sponsor has a contract.
