# virtual-closet

[![Deploy](https://github.com/MattD365/virtual-closet/actions/workflows/deploy.yml/badge.svg)](https://github.com/MattD365/virtual-closet/actions/workflows/deploy.yml)

**Live: <https://closet.memattd.com>**

The closet program from *Clueless*, built for real: photograph your clothes, and try
outfits on a rotating 3D mannequin sized to your measurements.

- **A parametric mannequin** — set your height and weight and the figure is rebuilt from
  generated geometry (Three.js lathe and capsule primitives, no model files). Drag to
  rotate, scroll to zoom.
- **Your actual clothes** — add a photo of any top, bottom, or pair of shoes. A crop tool
  frames the garment, and it is texture-mapped onto garment meshes on the mannequin.
  Sleeve and sole colors are sampled from the photo.
- **A persistent wardrobe** — every garment and your current outfit are stored in
  IndexedDB. Close the tab, come back, your closet is still there.
- **Completely private** — there is no server. Photos never leave the browser. The
  network tab shows zero requests after load.

## Honest scope

The mannequin is deliberately stylized — a fitting-room dress form, not a photoreal
double. Reconstructing a specific human body and draping simulated cloth from a photo is
a GPU research problem; this project instead does the useful subset that can run entirely
in a browser tab, free, with nothing uploaded.

## Stack

React 19 + Vite + Three.js. State in IndexedDB. Deployed to GitHub Pages by Actions on
every push.

```bash
npm install
npm run dev      # local dev server
npm run build    # static build in dist/
```
