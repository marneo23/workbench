export type DimensionDraft = {
  sourceValue: number;
  text: string;
  invalid: boolean;
};

export function dimensionDraftForValue(
  draft: DimensionDraft | null,
  value: number
): DimensionDraft | null {
  return draft?.sourceValue === value ? draft : null;
}

export function nextActiveDragCount(current: number, active: boolean): number {
  return Math.max(0, current + (active ? 1 : -1));
}

/**
 * Register one drag against a window-like EventTarget. Every terminal path uses
 * the same idempotent cleanup, including the function returned for unmount.
 */
export function bindWindowDrag(
  target: EventTarget,
  onMove: (event: Event) => void,
  onFinish: () => void
): () => void {
  let finished = false;

  const finish = () => {
    if (finished) return;
    finished = true;
    target.removeEventListener("pointermove", onMove);
    target.removeEventListener("pointerup", finish);
    target.removeEventListener("pointercancel", finish);
    target.removeEventListener("blur", finish);
    onFinish();
  };

  target.addEventListener("pointermove", onMove);
  target.addEventListener("pointerup", finish);
  target.addEventListener("pointercancel", finish);
  target.addEventListener("blur", finish);

  return finish;
}
