import manifest from './data/2026-10-07/manifest.json';
import lrt1 from './data/2026-10-07/lrt1.json';
import lrt2 from './data/2026-10-07/lrt2.json';
import mrt3 from './data/2026-10-07/mrt3.json';
import { validateRailBundle } from './validateRailBundle';
import type { RailBundle } from './types';

export const BUNDLED_RAIL_MANIFEST_SHA256 = '87528f9a13b9419e6004bf44f22f98a779152512f9bdd11a2148f99e1eed37a3';

/** Fresh validated projection per call, with no I/O or shared mutable state. */
export function loadBundledRailData(): RailBundle {
  return validateRailBundle(manifest, { lrt1, lrt2, mrt3 });
}
