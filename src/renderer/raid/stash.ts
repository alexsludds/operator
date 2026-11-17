/** What a player keeps between raids, held in the renderer's localStorage. */

import type { RaidState } from './types';

export interface Stash {
    /** Total value banked by extracting. */
    stash: number;
    raids: number;
    survived: number;
    best: number;
}

const STORAGE_KEY = 'shoreline_raid_stash';
const EMPTY: Stash = { best: 0, raids: 0, stash: 0, survived: 0 };

export function readStash(): Stash {
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        return raw
            ? { ...EMPTY, ...(JSON.parse(raw) as Partial<Stash>) }
            : EMPTY;
    } catch {
        return EMPTY;
    }
}

/** The stash after a finished raid: only an extraction banks the haul. */
export function settleRaid(stash: Stash, raid: RaidState): Stash {
    const survived = raid.phase === 'extracted';
    return {
        best: survived ? Math.max(stash.best, raid.loot) : stash.best,
        raids: stash.raids + 1,
        stash: stash.stash + (survived ? raid.loot : 0),
        survived: stash.survived + (survived ? 1 : 0),
    };
}

export function writeStash(stash: Stash): void {
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stash));
    } catch {
        // A raid without storage still plays; it just is not remembered.
    }
}
