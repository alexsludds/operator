/**
 * The raid simulation: a deterministic step function over plain state, with
 * no DOM or audio. Rendering and sound read the state and events it leaves.
 */

import { ENEMY_STATS, MAGAZINE, stepEnemy, stepPlayer } from './actors';
import { reapEnemies, stepBullets, stepGrenades } from './combat';
import { rand } from './types';
import type { Crate, LootKind, RaidInput, RaidMusic, RaidState } from './types';
import {
    CRATE_SPOTS,
    ENEMY_POSTS,
    EXTRACTS,
    PLAYER_SPAWNS,
    roomAt,
} from './world';

export const RAID_SECONDS = 600;
export const EXTRACT_SECONDS = 6;
/** Seconds after the last shot that the raid still counts as a firefight. */
const CONTACT_SECONDS = 3;

/** What a crate of each tier may hold, most likely first. */
const CRATE_ODDS: Record<number, [LootKind, number][]> = {
    1: [
        ['valuables', 0.35],
        ['ammo', 0.35],
        ['medkit', 0.3],
    ],
    2: [
        ['valuables', 0.45],
        ['ammo', 0.25],
        ['medkit', 0.15],
        ['grenade', 0.15],
    ],
    3: [
        ['valuables', 0.7],
        ['armor', 0.15],
        ['grenade', 0.15],
    ],
};

function fillCrate(s: RaidState, tier: number): Pick<Crate, 'kind' | 'value'> {
    let roll = rand(s);
    let kind: LootKind = 'valuables';
    for (const [candidate, odds] of CRATE_ODDS[tier]) {
        kind = candidate;
        roll -= odds;
        if (roll < 0) {
            break;
        }
    }
    const value = Math.round((3 + rand(s) * 11) * tier ** 1.5) * 1000;
    return { kind, value };
}

export function createRaid(seed: number): RaidState {
    const s: RaidState = {
        bullets: [],
        corpses: [],
        crates: [],
        enemies: [],
        events: [],
        extractProgress: 0,
        grenades: [],
        kills: 0,
        lastPlayerShotAt: -Infinity,
        lastShotAt: -Infinity,
        loot: 0,
        nextThunder: 60,
        noise: null,
        phase: 'raid',
        player: {
            ammo: MAGAZINE,
            armor: 0,
            facing: 0,
            fireCooldown: 0,
            grenades: 2,
            healLeft: 0,
            hp: 100,
            hurtAt: -Infinity,
            hurtFrom: 0,
            medkits: 2,
            reloadLeft: 0,
            reserve: MAGAZINE * 3,
            sprinting: false,
            stamina: 100,
            stepLeft: 0,
            x: 0,
            y: 0,
        },
        rng: seed >>> 0,
        time: 0,
    };
    const spawn = PLAYER_SPAWNS[Math.floor(rand(s) * PLAYER_SPAWNS.length)];
    s.player.x = spawn.x;
    s.player.y = spawn.y;
    s.crates = CRATE_SPOTS.map((spot) => ({
        ...fillCrate(s, spot.tier),
        progress: 0,
        search: 0.7 + 0.4 * spot.tier,
        taken: false,
        x: spot.x,
        y: spot.y,
    }));
    s.enemies = ENEMY_POSTS.map((post) => ({
        aimLeft: 0,
        awareness: 0,
        blind: 0,
        burst: 0,
        cooldown: rand(s) * 3,
        facing: rand(s) * Math.PI * 2,
        homeX: post.x,
        homeY: post.y,
        hp: ENEMY_STATS[post.kind].hp,
        kind: post.kind,
        mode: 'patrol',
        routeLeft: 0,
        strafe: 1,
        strafeLeft: 0,
        targetX: post.x,
        targetY: post.y,
        wayX: post.x,
        wayY: post.y,
        x: post.x,
        y: post.y,
    }));
    return s;
}

export function extractZoneAt(x: number, y: number): number {
    return EXTRACTS.findIndex((z) => Math.hypot(z.x - x, z.y - y) < z.r);
}

/** 0 at the start of a raid, 1 as its clock runs out. */
export function stormOf(s: RaidState): number {
    return Math.min(1, s.time / RAID_SECONDS);
}

/** Advance the raid by `dt` seconds. A finished raid no longer changes. */
export function stepRaid(s: RaidState, input: RaidInput, dt: number): void {
    s.events = [];
    if (s.phase !== 'raid') {
        return;
    }
    s.time += dt;
    stepPlayer(s, input, dt);
    for (const e of s.enemies) {
        stepEnemy(s, e, dt);
    }
    stepBullets(s, dt);
    stepGrenades(s, dt);
    reapEnemies(s);

    const p = s.player;
    if (s.time >= s.nextThunder) {
        // Thunder comes more often as the storm builds.
        s.nextThunder = s.time + 12 + rand(s) * 50 * (1.2 - stormOf(s));
        s.events.push({ type: 'thunder', x: p.x, y: p.y });
    }
    s.extractProgress =
        extractZoneAt(p.x, p.y) >= 0 ? s.extractProgress + dt : 0;

    if (p.hp <= 0) {
        p.hp = 0;
        s.phase = 'dead';
    } else if (s.extractProgress >= EXTRACT_SECONDS) {
        s.phase = 'extracted';
    } else if (s.time >= RAID_SECONDS) {
        s.phase = 'mia';
    }
}

export function raidMusic(s: RaidState): RaidMusic {
    const indoors = roomAt(s.player.x, s.player.y) !== undefined;
    if (s.phase === 'extracted') {
        return {
            contact: false,
            extract: true,
            indoors: false,
            storm: 1,
            stress: 0,
        };
    }
    if (s.phase !== 'raid') {
        return { contact: false, extract: false, indoors, storm: 5, stress: 5 };
    }
    const watched = s.enemies.reduce((m, e) => Math.max(m, e.awareness), 0);
    const storm = stormOf(s);
    const stress =
        0.4 +
        2.2 * (1 - s.player.hp / 100) +
        1.9 * watched +
        (storm > 0.85 ? 1.2 : 0);
    return {
        contact: s.time - s.lastShotAt < CONTACT_SECONDS,
        extract: s.extractProgress > 0,
        indoors,
        storm: 1 + 3.6 * storm,
        stress: Math.min(5, stress),
    };
}
