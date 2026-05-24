# Character portraits

The frontend supports three modes, auto-detected on page load:

1. **Sprite sheet mode (recommended)** - One horizontal image with all
   six characters in left-to-right order:
   `default, talent, seductress, schemer, noble, healer`
   Save it as `public/portraits/sheet.png`.
   The sheet should have six equal-width columns, no gaps.
   Suggested size: 1800 x 1020 (each column 300 x 1020, ratio ~1:3.4)
   or 1024 x 600 (each column ~170 x 600, ratio ~1:3.5).
   Configurable in `portraits.js`: SPRITE_COLS and SPRITE_RATIO.

2. **Per-class PNGs** - If `sheet.png` is absent but `default.png` exists,
   the frontend loads `<id>.png` for each character.

3. **Built-in SVG fallback** - If neither is present, the animated SVG
   shipped in `portraits.js` is used.

The sprite mode adds a soft breathing animation plus three sakura petals
drifting across each portrait, so a single static AI-generated sheet still
feels alive.

## image2 / Midjourney prompt for one sheet

```
Six traditional Chinese palace beauties, full body, standing pose, arranged
in a single horizontal row, each in a tall vertical panel, equal widths,
ornate Tang/Song dynasty hanfu, intricate hair ornaments, soft cel-shaded
anime art, watercolor highlights, transparent panel borders, name label
on top of each panel, two-line poetic description below each panel.
From left to right:
1. liangjia - peach-pink robe, simple silver hairpin with plum blossoms,
   gentle expression, holding her own sleeve, low-rank concubine.
2. caunv - indigo blue robe, jade hairstick, holding a bamboo scroll,
   intellectual and serene look.
3. yaoji - vivid scarlet robe with gold trim, butterfly gold hairpin,
   red lips, vermilion forehead mark, alluring half smile.
4. xinji - deep violet robe, silver dagger hairpin, holding a round
   palace fan painted with peonies, calculating side glance.
5. dinu - bright imperial yellow robe with red sash, full phoenix
   crown with hanging tassels, regal posture.
6. shenyi - jade green robe with white inner layer, wooden hairstick
   with herb leaf, holding a small medicine pouch, kind eyes.
--ar 16:9 --style raw
```

## image2 / Midjourney prompt for individual portraits

```
Traditional Chinese palace concubine half-body portrait, Tang/Ming dynasty
hanfu, front-facing, gentle stylized anime style, soft cel shading,
intricate embroidery, transparent background, centered composition,
full face visible, hands at chest level, --ar 5:7

<PER-CLASS LINE>

Lighting: soft warm key, slight rim light.
Mood: refined and elegant.
Palette: ivory, gold, vermilion accents.
```

Per-class line:

- **default (liangjia)**: soft peach-pink robe, silver hair pin with plum
  blossoms, naive smile, low-rank concubine
- **talent (caunv)**: indigo blue robe, jade hair stick, holding a bamboo
  scroll, intellectual look
- **seductress (yaoji)**: vivid scarlet robe with gold trim, butterfly
  gold hairpin, red lips, alluring half smile, vermilion forehead mark
- **schemer (xinji)**: deep violet robe, silver dagger hairpin, holds a
  round palace fan painted with peonies, calculating side glance
- **noble (dinu)**: bright imperial yellow robe with red sash, full
  phoenix crown with tassels, regal posture, looks straight ahead
- **healer (shenyi)**: jade green robe with white inner layer, wooden
  hair stick with herb leaf, holds a small medicine pouch, kind eyes