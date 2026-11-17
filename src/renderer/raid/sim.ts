/**
 * The raid simulation: a deterministic step function over plain state, with
 * no DOM or audio. Rendering and sound read the state and events it leaves.
 */

import { ENEMY_STATS, MAGAZINE, stepEnemy, stepPlayer } from './actors';
import { reapEnemies, stepBullets, stepGrenades } from './combat';
import { SQUAD_KINDS, rand } from './types';
import type {
    Crate,
    Enemy,
    EnemyKind,
    LootKind,
    RaidInput,
    RaidMusic,
    RaidState,
} from './types';
import {
    CRATE_SPOTS,
    ENEMY_POSTS,
    EXTRACTS,
    PLAYER_SPAWNS,
    SQUAD_ROUTE,
    SQUAD_SPAWN,
    STAIRS,
    isIndoors,
} from './world';
import type { Point } from './world';

export const RAID_SECONDS = 600;
export const EXTRACT_SECONDS = 6;
/** When the roaming squad lands, and how long it holds each site. */
export const SQUAD_LANDS = 90;
const SQUAD_HOLD = 45;
const STAIR_SECONDS = 0.6;
const STAIR_REACH = 30;
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

function spawnEnemy(s: RaidState, kind: EnemyKind, at: Point): Enemy {
    return {
        aimLeft: 0,
        awareness: 0,
        blind: 0,
        burst: 0,
        cooldown: rand(s) * 3,
        facing: rand(s) * Math.PI * 2,
        homeX: at.x,
        homeY: at.y,
        hp: ENEMY_STATS[kind].hp,
        kind,
        mode: 'patrol',
        routeLeft: 0,
        strafe: 1,
        strafeLeft: 0,
        targetX: at.x,
        targetY: at.y,
        throwLeft: 2,
        wayX: at.x,
        wayY: at.y,
        x: at.x,
        y: at.y,
    };
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
        squadLanded: false,
        squadMoveAt: SQUAD_LANDS,
        squadStop: -1,
        stairProgress: 0,
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
    s.enemies = ENEMY_POSTS.map((post) => spawnEnemy(s, post.kind, post));
    return s;
}

export function extractZoneAt(x: number, y: number): number {
    return EXTRACTS.findIndex((z) => Math.hypot(z.x - x, z.y - y) < z.r);
}

/** 0 at the start of a raid, 1 as its clock runs out. */
export function stormOf(s: RaidState): number {
    return Math.min(1, s.time / RAID_SECONDS);
}

/** Three abreast, so the squad never stacks on one spot. */
const squadOffset = (index: number) => (index - 1) * 44;

/** Land the squad when its time comes, then walk it from site to site. */
function stepSquad(s: RaidState): void {
    if (s.time < s.squadMoveAt) {
        return;
    }
    s.squadMoveAt = s.time + SQUAD_HOLD;
    if (!s.squadLanded) {
        s.squadLanded = true;
        SQUAD_KINDS.forEach((kind, index) => {
            s.enemies.push(
                spawnEnemy(s, kind, {
                    x: SQUAD_SPAWN.x + squadOffset(index),
                    y: SQUAD_SPAWN.y,
                }),
            );
        });
        s.events.push({
            text: 'THE WRECKERS HAVE COME ASHORE',
            type: 'squad',
            x: SQUAD_SPAWN.x,
            y: SQUAD_SPAWN.y,
        });
    }
    s.squadStop = (s.squadStop + 1) % SQUAD_ROUTE.length;
    const site = SQUAD_ROUTE[s.squadStop];
    for (const e of s.enemies) {
        const index = SQUAD_KINDS.indexOf(e.kind);
        if (index < 0) {
            continue;
        }
        e.homeX = site.x + squadOffset(index);
        e.homeY = site.y;
        if (e.mode === 'patrol') {
            e.targetX = e.homeX;
            e.targetY = e.homeY;
            e.routeLeft = 0;
        }
    }
}

/** Holding E on a staircase takes the player to its other end. */
function stepStairs(s: RaidState, held: boolean, dt: number): void {
    const p = s.player;
    const stairs = STAIRS.find(
        (st) => Math.hypot(st.x - p.x, st.y - p.y) < STAIR_REACH,
    );
    if (!held || !stairs) {
        s.stairProgress = 0;
    } else if (s.stairProgress >= 0) {
        s.stairProgress += dt;
        if (s.stairProgress >= STAIR_SECONDS) {
            p.x = stairs.to.x;
            p.y = stairs.to.y;
            s.stairProgress = -1;
            s.events.push({
                text: stairs.label.toUpperCase(),
                type: 'stairs',
                x: p.x,
                y: p.y,
            });
        }
    }
}

/** Advance the raid by `dt` seconds. A finished raid no longer changes. */
export function stepRaid(s: RaidState, input: RaidInput, dt: number): void {
    s.events = [];
    if (s.phase !== 'raid') {
        return;
    }
    s.time += dt;
    stepPlayer(s, input, dt);
    stepStairs(s, input.interact, dt);
    stepSquad(s);
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
    const indoors = isIndoors(s.player.x, s.player.y);
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
