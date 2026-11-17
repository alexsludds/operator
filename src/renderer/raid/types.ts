/** The state of a raid, and what goes in and comes out of each step. */

import type { Point } from './world';

export type RaidPhase = 'raid' | 'extracted' | 'dead' | 'mia';

export interface RaidInput {
    /** Movement axes, each -1..1. */
    moveX: number;
    moveY: number;
    /** Aim point in world units. */
    aimX: number;
    aimY: number;
    fire: boolean;
    sprint: boolean;
    /** Held to search the crate in reach. */
    interact: boolean;
    /** `reload`, `heal` and `grenade` are true only on the step the key
     *  goes down. */
    reload: boolean;
    heal: boolean;
    grenade: boolean;
}

export type EnemyKind =
    | 'drifter'
    | 'guard'
    | 'marksman'
    | 'captain'
    | 'spotter'
    | 'sapper';
/** The roaming squad, in the order it walks abreast. */
export const SQUAD_KINDS: EnemyKind[] = ['captain', 'spotter', 'sapper'];

export const isSquad = (kind: EnemyKind) => SQUAD_KINDS.includes(kind);

export type EnemyMode = 'patrol' | 'suspicious' | 'combat';

export interface Enemy extends Point {
    kind: EnemyKind;
    mode: EnemyMode;
    hp: number;
    facing: number;
    /** 0 unaware … 1 certain. */
    awareness: number;
    /** Where it is heading: a patrol point, a noise, or the player. */
    targetX: number;
    targetY: number;
    homeX: number;
    homeY: number;
    /** The next step of its route to the target, refreshed every `routeLeft`. */
    wayX: number;
    wayY: number;
    routeLeft: number;
    cooldown: number;
    burst: number;
    /** An aimed shot's sights, counting down to the shot; 0 when not aiming. */
    aimLeft: number;
    /** Seconds until a grenadier's next throw. */
    throwLeft: number;
    strafe: number;
    strafeLeft: number;
    /** Seconds since it last saw the player. */
    blind: number;
}

export interface Bullet extends Point {
    vx: number;
    vy: number;
    life: number;
    fromPlayer: boolean;
    damage: number;
}

export interface Grenade extends Point {
    vx: number;
    vy: number;
    flight: number;
    fuse: number;
}

export type LootKind = 'valuables' | 'ammo' | 'medkit' | 'grenade' | 'armor';

export interface Crate extends Point {
    kind: LootKind;
    value: number;
    taken: boolean;
    /** Seconds of searching done, and needed. */
    progress: number;
    search: number;
}

export interface Corpse extends Point {
    kind: EnemyKind;
    facing: number;
}

export type RaidEventType =
    | 'shot'
    | 'dry'
    | 'reload'
    | 'step'
    | 'hurt'
    | 'heal'
    | 'loot'
    | 'throw'
    | 'blast'
    | 'thunder'
    | 'squad'
    | 'stairs'
    | 'enemyShot'
    | 'enemyHit'
    | 'kill'
    | 'spotted'
    | 'impact';

/** Something that happened this step, for effects and sound to answer. */
export interface RaidEvent extends Point {
    type: RaidEventType;
    /** The shot's or hit's direction, in radians. */
    angle?: number;
    text?: string;
}

export interface Player extends Point {
    hp: number;
    armor: number;
    stamina: number;
    facing: number;
    ammo: number;
    reserve: number;
    medkits: number;
    grenades: number;
    fireCooldown: number;
    reloadLeft: number;
    healLeft: number;
    hurtAt: number;
    /** Where the last hit came from, in radians. */
    hurtFrom: number;
    /** Distance left until the next footstep. */
    stepLeft: number;
    sprinting: boolean;
}

export interface RaidState {
    phase: RaidPhase;
    time: number;
    rng: number;
    player: Player;
    enemies: Enemy[];
    bullets: Bullet[];
    grenades: Grenade[];
    crates: Crate[];
    corpses: Corpse[];
    /** This step's events; replaced on every step. */
    events: RaidEvent[];
    loot: number;
    kills: number;
    /** Seconds spent standing in the current extract zone. */
    extractProgress: number;
    lastShotAt: number;
    lastPlayerShotAt: number;
    /** A loud noise enemies in earshot go to look at. */
    noise: (Point & { radius: number; at: number }) | null;
    nextThunder: number;
    /** Seconds held on a staircase; negative once used, until E is let go. */
    stairProgress: number;
    /** The roaming squad: whether it has landed, and its next move. */
    squadLanded: boolean;
    squadStop: number;
    squadMoveAt: number;
}

/** What the soundtrack follows: 0–5 levels and gates. */
export interface RaidMusic {
    stress: number;
    storm: number;
    contact: boolean;
    extract: boolean;
    indoors: boolean;
}

export function rand(s: RaidState): number {
    s.rng = (s.rng + 0x6d2b79f5) >>> 0;
    let t = s.rng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
