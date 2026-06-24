// Pure logic for the water-tank watcher, kept separate so it's easy to unit-test.
// A "warning" is on when the binary_sensor state is "on".

export type WarnMap = Record<string, boolean>;

/** Sensor ids that transitioned from not-warning to warning between two ticks.
 *  Staying on does not re-report; on→off resets so a later off→on fires again. */
export function roomsNewlyWarning(prev: WarnMap, current: WarnMap): string[] {
  return Object.keys(current).filter((id) => current[id] && !prev[id]);
}
