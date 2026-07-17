import { z } from "zod";

/**
 * Coordinate contract (stated once here, enforced in validate.ts):
 * - All lengths in millimetres. Y is up.
 * - A part's `position` is its MINIMUM corner (left-front-bottom).
 * - The assembly origin is the left-front-bottom corner of the bounding box,
 *   so every coordinate is non-negative and
 *   position + size must fit inside bbox on every axis.
 * - No rotation: a box is fully described by size + position.
 *
 * Keep this schema free of z.refine()/z.transform() — it is converted to a
 * JSON schema for LLM structured outputs, which strips refinements. All
 * cross-field rules live in validate.ts.
 */

export const Size3Schema = z.object({
  w: z.number().describe("extent along X (width), mm"),
  h: z.number().describe("extent along Y (height, up), mm"),
  d: z.number().describe("extent along Z (depth), mm"),
});

export const Vec3Schema = z.object({
  x: z.number().describe("minimum-corner X, mm, >= 0"),
  y: z.number().describe("minimum-corner Y, mm, >= 0 (0 = floor)"),
  z: z.number().describe("minimum-corner Z, mm, >= 0 (0 = front)"),
});

export const MaterialSchema = z.object({
  id: z
    .string()
    .describe('short kebab-case id unique within the spec, e.g. "ply-18"'),
  name: z.string().describe('human name, e.g. "18mm birch plywood"'),
  kind: z.enum(["sheet", "solid", "rod"]),
  thickness: z
    .number()
    .optional()
    .describe(
      "sheet thickness in mm; required for kind=sheet. Every part made of a sheet material must have exactly this as its thinnest dimension."
    ),
});

export const PartSchema = z.object({
  id: z
    .string()
    .describe(
      'short kebab-case id unique within the spec, e.g. "side-left". Preserve ids when refining an existing spec.'
    ),
  name: z.string().describe('human name, e.g. "Left side panel"'),
  shape: z.literal("box"),
  size: Size3Schema,
  position: Vec3Schema,
  materialId: z.string().describe("id of an entry in materials[]"),
  grain: z
    .enum(["length", "width", "none"])
    .optional()
    .describe(
      "grain direction relative to the part's cut rectangle (length = along the longest face dimension)"
    ),
  joinery: z
    .string()
    .optional()
    .describe('free-text joinery note, e.g. "screwed + glued to sides"'),
});

export const FurnitureSpecSchema = z.object({
  version: z.literal(1),
  name: z.string().describe("short human name for the piece"),
  units: z.literal("mm"),
  bbox: Size3Schema.describe(
    "overall bounding box of the finished piece; every part must fit inside it"
  ),
  materials: z.array(MaterialSchema).min(1),
  parts: z.array(PartSchema).min(1).max(60),
  notes: z
    .string()
    .optional()
    .describe("assembly or construction notes for the builder"),
});

export type Size3 = z.infer<typeof Size3Schema>;
export type Vec3 = z.infer<typeof Vec3Schema>;
export type Material = z.infer<typeof MaterialSchema>;
export type Part = z.infer<typeof PartSchema>;
export type FurnitureSpec = z.infer<typeof FurnitureSpecSchema>;
