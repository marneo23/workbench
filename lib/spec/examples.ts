import type { FurnitureSpec } from "./schema";

/**
 * Hand-authored reference spec: a 800×1800×300mm bookshelf in 18mm plywood
 * with a 6mm overlaid back. Used to build and test the whole deterministic
 * pipeline (viewport, cut list, PDF) before any LLM is involved.
 *
 * Construction: the carcass is 294mm deep and the 6mm back overlays the rear
 * (294 + 6 = 300), so nothing overlaps. Interior width = 800 − 2×18 = 764.
 */
export const bookshelfSpec: FurnitureSpec = {
  version: 1,
  name: "Bookshelf",
  units: "mm",
  bbox: { w: 800, h: 1800, d: 300 },
  materials: [
    { id: "ply-18", name: "18mm birch plywood", kind: "sheet", thickness: 18 },
    { id: "ply-6", name: "6mm plywood", kind: "sheet", thickness: 6 },
  ],
  parts: [
    {
      id: "side-left",
      name: "Left side",
      shape: "box",
      size: { w: 18, h: 1800, d: 294 },
      position: { x: 0, y: 0, z: 0 },
      materialId: "ply-18",
      grain: "length",
    },
    {
      id: "side-right",
      name: "Right side",
      shape: "box",
      size: { w: 18, h: 1800, d: 294 },
      position: { x: 782, y: 0, z: 0 },
      materialId: "ply-18",
      grain: "length",
    },
    {
      id: "bottom",
      name: "Bottom",
      shape: "box",
      size: { w: 764, h: 18, d: 294 },
      position: { x: 18, y: 0, z: 0 },
      materialId: "ply-18",
      grain: "length",
    },
    {
      id: "top",
      name: "Top",
      shape: "box",
      size: { w: 764, h: 18, d: 294 },
      position: { x: 18, y: 1782, z: 0 },
      materialId: "ply-18",
      grain: "length",
    },
    {
      id: "shelf-1",
      name: "Shelf 1",
      shape: "box",
      size: { w: 764, h: 18, d: 294 },
      position: { x: 18, y: 350, z: 0 },
      materialId: "ply-18",
      grain: "length",
    },
    {
      id: "shelf-2",
      name: "Shelf 2",
      shape: "box",
      size: { w: 764, h: 18, d: 294 },
      position: { x: 18, y: 700, z: 0 },
      materialId: "ply-18",
      grain: "length",
    },
    {
      id: "shelf-3",
      name: "Shelf 3",
      shape: "box",
      size: { w: 764, h: 18, d: 294 },
      position: { x: 18, y: 1050, z: 0 },
      materialId: "ply-18",
      grain: "length",
    },
    {
      id: "shelf-4",
      name: "Shelf 4",
      shape: "box",
      size: { w: 764, h: 18, d: 294 },
      position: { x: 18, y: 1400, z: 0 },
      materialId: "ply-18",
      grain: "length",
    },
    {
      id: "back",
      name: "Back panel",
      shape: "box",
      size: { w: 800, h: 1800, d: 6 },
      position: { x: 0, y: 0, z: 294 },
      materialId: "ply-6",
      grain: "length",
      joinery: "pinned + glued to carcass rear edges",
    },
  ],
  notes:
    "Fixed shelves housed between the sides. Back panel overlays the rear of the carcass and squares the unit.",
};
