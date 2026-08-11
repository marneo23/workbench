import { beforeEach, describe, expect, it } from "vitest";
import { bookshelfSpec } from "@/lib/spec/examples";
import { useSpecStore } from "@/store/useSpecStore";

const firstId = "550e8400-e29b-41d4-a716-446655440000";
const secondId = "550e8400-e29b-41d4-a716-446655440001";

beforeEach(() => {
  useSpecStore.temporal.getState().clear();
  useSpecStore.getState().setSpec(bookshelfSpec, null);
  useSpecStore.temporal.getState().clear();
});

describe("generation ancestry", () => {
  it("keeps the generating artifact through manual edits", () => {
    useSpecStore.getState().setSpec(bookshelfSpec, firstId);
    const part = bookshelfSpec.parts[0];
    useSpecStore.getState().updatePart(part.id, {
      position: { ...part.position, x: part.position.x + 1 },
    });

    expect(useSpecStore.getState().currentArtifactId).toBe(firstId);
  });

  it("undo restores the artifact id belonging to the restored spec", () => {
    useSpecStore.getState().setSpec(
      { ...bookshelfSpec, name: "First" },
      firstId
    );
    useSpecStore.getState().setSpec(
      { ...bookshelfSpec, name: "Second" },
      secondId
    );

    useSpecStore.temporal.getState().undo();

    expect(useSpecStore.getState().spec.name).toBe("First");
    expect(useSpecStore.getState().currentArtifactId).toBe(firstId);
  });

  it("adopts a failed generation artifact when its partial assembly is kept", () => {
    const part = bookshelfSpec.parts[0];
    useSpecStore.getState().setSpec(bookshelfSpec, firstId);
    useSpecStore.getState().beginGenerating();
    useSpecStore.getState().setPendingMeta({
      name: "Partial bookshelf",
      bbox: bookshelfSpec.bbox,
      materials: bookshelfSpec.materials,
    });
    useSpecStore.getState().addPendingPart(part);

    useSpecStore.getState().failGenerating("invalid", secondId);
    useSpecStore.getState().keepSalvage();

    expect(useSpecStore.getState().spec.parts).toEqual([part]);
    expect(useSpecStore.getState().currentArtifactId).toBe(secondId);
  });
});
