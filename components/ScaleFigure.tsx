"use client";

/**
 * Toggleable 1700mm human silhouette standing beside the model — the
 * dimensional-trust cue from the brief. Deliberately schematic (grey
 * primitives), so it reads as "for scale", not as part of the design.
 */

const FIGURE_HEIGHT = 1700;
const COLOR = "#6b7280";

interface ScaleFigureProps {
  /** x offset of the figure's center from the scene origin, mm */
  offsetX: number;
}

export function ScaleFigure({ offsetX }: ScaleFigureProps) {
  const headR = 110;
  const legH = 780;
  const torsoH = FIGURE_HEIGHT - legH - headR * 2 - 40; // 40mm neck gap

  return (
    <group position={[offsetX, 0, 0]}>
      {/* legs */}
      <mesh position={[-60, legH / 2, 0]}>
        <cylinderGeometry args={[45, 55, legH, 12]} />
        <meshStandardMaterial color={COLOR} roughness={0.9} />
      </mesh>
      <mesh position={[60, legH / 2, 0]}>
        <cylinderGeometry args={[45, 55, legH, 12]} />
        <meshStandardMaterial color={COLOR} roughness={0.9} />
      </mesh>
      {/* torso */}
      <mesh position={[0, legH + torsoH / 2, 0]}>
        <cylinderGeometry args={[130, 105, torsoH, 16]} />
        <meshStandardMaterial color={COLOR} roughness={0.9} />
      </mesh>
      {/* head — top of skull lands exactly at 1700mm */}
      <mesh position={[0, FIGURE_HEIGHT - headR, 0]}>
        <sphereGeometry args={[headR, 20, 16]} />
        <meshStandardMaterial color={COLOR} roughness={0.9} />
      </mesh>
    </group>
  );
}

export { FIGURE_HEIGHT };
