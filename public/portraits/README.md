# Character portraits

Optional PNG/JPG overrides for the six character classes. Drop files named
exactly like the class id here and the frontend will use them instead of the
built-in animated SVG:

- `default.png`     -- liangjia    (peach robe, gentle)
- `talent.png`      -- caunv       (blue robe, holds a scroll)
- `seductress.png`  -- yaoji       (red robe, gold hairpin)
- `schemer.png`     -- xinji       (dark purple robe, round fan)
- `noble.png`       -- dinu        (yellow robe, phoenix crown)
- `healer.png`      -- shenyi      (green robe, herb pouch)

**Recommended:** 300 x 420 px PNG, transparent background, half-body front
view. SVG also works but rename the file to `<id>.png` (mime type is fine).

## image2 / Midjourney prompt template

Copy-paste, switch the per-class line for each portrait.

```
A traditional Chinese palace concubine half-body portrait, Tang/Ming dynasty
hanfu, front-facing, gentle stylized anime style, soft cel shading, intricate
embroidery, no background, transparent png, centered composition, full face
visible, hands at chest level, --ar 5:7

<PER CLASS LINE BELOW>

Lighting: soft warm key, slight rim light. Mood: refined and elegant.
Colors of palette: ivory, gold, vermilion accents.
```

Per-class line:

- **liangjia (default)**: soft peach-pink robe, simple silver hair pin with
  plum blossoms, naive smile, low rank concubine
- **caunv (talent)**: indigo blue robe, jade hair stick, holds a bamboo
  scroll, intellectual look
- **yaoji (seductress)**: vivid scarlet robe with gold trim, butterfly gold
  hairpin, red lips, alluring half-smile, vermilion forehead mark
- **xinji (schemer)**: deep violet robe, silver dagger hairpin, holds a
  round palace fan painted with peonies, calculating side glance
- **dinu (noble)**: bright yellow imperial robe with red sash, full phoenix
  crown with tassels, regal posture, eyes look straight ahead
- **shenyi (healer)**: jade green robe with white inner layer, wooden hair
  stick with herb leaf, holds a small medicine pouch, kind eyes