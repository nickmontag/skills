# Silhouette cut-paper (Lotte Reiniger)

Arthouse animation techniques. Shared parts: `references/styles/shared.md`; index: `references/styles/README.md`.

- **Is:** black paper figures, hinged at the joints, shot on a lightbox.
- **Look for:**
  - Pure black silhouettes with lacy cut-out detail (hair, lace, foliage).
  - Glowing colored or graded backdrops.
  - Profiles only.
  - Visible hinge articulation.
- **In code:**
  - Characters as rigid SDF parts parented at pivots.
  - Detail by *subtracting* small shapes (holes) from the silhouette.
  - Backdrop is a soft gradient.
- **In motion:** jointed and slightly stiff, rotating about pivots. Never squash and stretch.
