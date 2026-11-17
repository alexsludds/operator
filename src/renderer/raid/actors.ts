/** How the player and the enemies act on each step. */

import { ENEMY_RADIUS, PLAYER_RADIUS, fireBullet } from './combat';
import { hasLineOfSight, moveBody, nextWaypoint } from './geometry';
import { rand } from './types';
import type { Crate, Enemy, EnemyKind, RaidInput, RaidState } from './types';
import { inBush } from './world';

export const MAGAZINE = 30;
export const INTERACT_RANGE = 46;
export const HEAL_SECONDS = 2;

const WALK_SPEED = 150;
const SPRINT_SPEED = 240;
const FIRE_INTERVAL = 0.105;
const RELOAD_SECONDS = 1.7;
const PLAYER_DAMAGE = 34;
const HEAL_AMOUNT = 50;
const STAMINA_DRAIN = 24;
const STAMINA_REGEN = 15;
const SPRINT_EARSHOT = 230;
const GRENADE_FLIGHT = 0.6;
const GRENADE_FUSE = 1.5;
const GRENADE_REACH = 420;
const ALERT_RADIUS = 340;

interface EnemyStats {
    hp: number;
    sight: number;
    walk: number;
    run: number;
    damage: number;
    spread: number;
    burst: number;
    /** Distance it likes to fight from. */
    range: number;
    /** How fast awareness builds while it watches the player. */
    wits: number;
    /** Seconds its sights rest on the player before an aimed shot; 0 fires
     *  in bursts. */
    aim: number;
    grenadier: boolean;
}

export const ENEMY_STATS: Record<EnemyKind, EnemyStats> = {
    drifter: {
        burst: 3,
        damage: 8,
        hp: 60,
        range: 230,
        run: 105,
        sight: 430,
        spread: 0.24,
        walk: 55,
        wits: 0.9,
        aim: 0,
        grenadier: false,
    },
    guard: {
        burst: 4,
        damage: 11,
        hp: 115,
        range: 290,
        run: 125,
        sight: 520,
        spread: 0.13,
        walk: 65,
        wits: 1.4,
        aim: 0,
        grenadier: false,
    },
    marksman: {
        burst: 1,
        damage: 38,
        hp: 70,
        range: 0,
        run: 0,
        sight: 900,
        spread: 0.025,
        walk: 0,
        wits: 1.1,
        aim: 1.3,
        grenadier: false,
    },
    captain: {
        aim: 0,
        burst: 5,
        damage: 13,
        grenadier: false,
        hp: 190,
        range: 300,
        run: 135,
        sight: 560,
        spread: 0.09,
        walk: 75,
        wits: 1.8,
    },
    spotter: {
        aim: 0.9,
        burst: 1,
        damage: 30,
        grenadier: false,
        hp: 110,
        range: 470,
        run: 110,
        sight: 760,
        spread: 0.03,
        walk: 75,
        wits: 1.6,
    },
    sapper: {
        aim: 0,
        burst: 3,
        damage: 10,
        grenadier: true,
        hp: 150,
        range: 250,
        run: 125,
        sight: 520,
        spread: 0.16,
        walk: 75,
        wits: 1.5,
    },
};

const LOOT_TEXT: Record<Crate['kind'], (c: Crate) => string> = {
    ammo: () => '+60 rounds',
    armor: () => 'Armor plate',
    grenade: () => '+1 grenade',
    medkit: () => '+1 medkit',
    valuables: (c) => `+${c.value.toLocaleString('en-US')}`,
};

function takeCrate(s: RaidState, crate: Crate): void {
    const p = s.player;
    crate.taken = true;
    if (crate.kind === 'valuables') {
        s.loot += crate.value;
    } else if (crate.kind === 'ammo') {
        p.reserve += 60;
    } else if (crate.kind === 'medkit') {
        p.medkits += 1;
    } else if (crate.kind === 'grenade') {
        p.grenades += 1;
    } else {
        p.armor = 60;
    }
    s.events.push({
        text: LOOT_TEXT[crate.kind](crate),
        type: 'loot',
        x: crate.x,
        y: crate.y,
    });
}

function search(s: RaidState, searching: boolean, dt: number): void {
    const p = s.player;
    let nearest: Crate | null = null;
    let reach = INTERACT_RANGE;
    for (const crate of s.crates) {
        const distance = Math.hypot(crate.x - p.x, crate.y - p.y);
        if (!crate.taken && distance < reach) {
            nearest = crate;
            reach = distance;
        }
    }
    for (const crate of s.crates) {
        if (crate !== nearest || !searching) {
            crate.progress = 0;
        }
    }
    if (nearest && searching) {
        nearest.progress += dt;
        if (nearest.progress >= nearest.search) {
            takeCrate(s, nearest);
        }
    }
}

export function stepPlayer(s: RaidState, input: RaidInput, dt: number): void {
    const p = s.player;
    const healing = p.healLeft > 0;
    const length = Math.hypot(input.moveX, input.moveY);
    p.sprinting = input.sprint && length > 0 && p.stamina > 0 && !healing;
    p.stamina = Math.max(
        0,
        Math.min(
            100,
            p.stamina + (p.sprinting ? -STAMINA_DRAIN : STAMINA_REGEN) * dt,
        ),
    );
    if (length > 0) {
        const speed =
            (p.sprinting ? SPRINT_SPEED : WALK_SPEED) * (healing ? 0.5 : 1);
        const before = { x: p.x, y: p.y };
        moveBody(
            p,
            (input.moveX / length) * speed * dt,
            (input.moveY / length) * speed * dt,
            PLAYER_RADIUS,
        );
        p.stepLeft -= Math.hypot(p.x - before.x, p.y - before.y);
        if (p.stepLeft <= 0) {
            p.stepLeft = p.sprinting ? 64 : 48;
            s.events.push({ type: 'step', x: p.x, y: p.y });
            if (p.sprinting) {
                s.noise = {
                    at: s.time,
                    radius: SPRINT_EARSHOT,
                    x: p.x,
                    y: p.y,
                };
            }
        }
    }
    p.facing = Math.atan2(input.aimY - p.y, input.aimX - p.x);

    p.fireCooldown = Math.max(0, p.fireCooldown - dt);
    if (healing) {
        p.healLeft -= dt;
        if (p.healLeft <= 0) {
            p.hp = Math.min(100, p.hp + HEAL_AMOUNT);
        }
    } else if (p.reloadLeft > 0) {
        p.reloadLeft -= dt;
        if (p.reloadLeft <= 0) {
            const loaded = Math.min(MAGAZINE - p.ammo, p.reserve);
            p.ammo += loaded;
            p.reserve -= loaded;
        }
    } else if (input.heal && p.medkits > 0 && p.hp < 100) {
        p.medkits -= 1;
        p.healLeft = HEAL_SECONDS;
        s.events.push({ type: 'heal', x: p.x, y: p.y });
    } else if (
        (input.reload || p.ammo === 0) &&
        p.ammo < MAGAZINE &&
        p.reserve > 0
    ) {
        p.reloadLeft = RELOAD_SECONDS;
        s.events.push({ type: 'reload', x: p.x, y: p.y });
    } else if (input.fire && p.fireCooldown === 0) {
        if (p.ammo > 0) {
            p.ammo -= 1;
            p.fireCooldown = FIRE_INTERVAL;
            fireBullet(
                s,
                p,
                p.facing + (rand(s) - 0.5) * 0.045,
                true,
                PLAYER_DAMAGE,
            );
        } else {
            p.fireCooldown = 0.35;
            s.events.push({ type: 'dry', x: p.x, y: p.y });
        }
    }

    if (input.grenade && p.grenades > 0 && !healing) {
        p.grenades -= 1;
        const reach = Math.min(
            GRENADE_REACH,
            Math.hypot(input.aimX - p.x, input.aimY - p.y),
        );
        s.grenades.push({
            flight: GRENADE_FLIGHT,
            fuse: GRENADE_FUSE,
            vx: (Math.cos(p.facing) * reach) / GRENADE_FLIGHT,
            vy: (Math.sin(p.facing) * reach) / GRENADE_FLIGHT,
            x: p.x,
            y: p.y,
        });
        s.events.push({ type: 'throw', x: p.x, y: p.y });
    }

    search(s, input.interact && !healing, dt);
}

/** Standing still in a bush, the player is seen only from close by. */
function isHidden(s: RaidState): boolean {
    const p = s.player;
    return !p.sprinting && s.time - s.lastPlayerShotAt > 1 && inBush(p.x, p.y);
}

function alertNearby(s: RaidState, from: Enemy): void {
    for (const e of s.enemies) {
        if (
            e !== from &&
            e.mode === 'patrol' &&
            Math.hypot(e.x - from.x, e.y - from.y) < ALERT_RADIUS
        ) {
            e.mode = 'suspicious';
            e.awareness = Math.max(e.awareness, 0.6);
            e.targetX = s.player.x;
            e.targetY = s.player.y;
            e.routeLeft = 0;
        }
    }
}

function walkTo(s: RaidState, e: Enemy, speed: number, dt: number): void {
    e.routeLeft -= dt;
    if (e.routeLeft <= 0 || Math.hypot(e.wayX - e.x, e.wayY - e.y) < 6) {
        e.routeLeft = 0.45 + rand(s) * 0.2;
        const way = nextWaypoint(e, { x: e.targetX, y: e.targetY });
        if (way) {
            e.wayX = way.x;
            e.wayY = way.y;
        } else {
            // Nowhere it can reach: give up on the spot and head home.
            e.targetX = e.homeX;
            e.targetY = e.homeY;
        }
    }
    const dx = e.wayX - e.x;
    const dy = e.wayY - e.y;
    const distance = Math.hypot(dx, dy);
    if (distance > 2) {
        e.facing = Math.atan2(dy, dx);
        moveBody(
            e,
            (dx / distance) * speed * dt,
            (dy / distance) * speed * dt,
            ENEMY_RADIUS,
        );
    }
}

function fight(s: RaidState, e: Enemy, distance: number, dt: number): void {
    const p = s.player;
    const stats = ENEMY_STATS[e.kind];
    const toPlayer = Math.atan2(p.y - e.y, p.x - e.x);
    e.facing = toPlayer;

    if (stats.run > 0) {
        e.strafeLeft -= dt;
        if (e.strafeLeft <= 0) {
            e.strafeLeft = 0.7 + rand(s) * 0.9;
            e.strafe = rand(s) < 0.5 ? -1 : 1;
        }
        let heading = toPlayer + (e.strafe * Math.PI) / 2;
        if (distance > stats.range + 50) {
            heading = toPlayer + e.strafe * 0.5;
        } else if (distance < stats.range - 90) {
            heading = toPlayer + Math.PI - e.strafe * 0.5;
        }
        const speed = stats.run * 0.75;
        const moved = moveBody(
            e,
            Math.cos(heading) * speed * dt,
            Math.sin(heading) * speed * dt,
            ENEMY_RADIUS,
        );
        if (!moved) {
            e.strafe = -e.strafe;
        }
    }

    e.throwLeft -= dt;
    if (
        stats.grenadier &&
        e.throwLeft <= 0 &&
        distance > 140 &&
        distance < 440
    ) {
        e.throwLeft = 5 + rand(s) * 3;
        s.grenades.push({
            flight: GRENADE_FLIGHT,
            fuse: GRENADE_FUSE,
            vx: (p.x - e.x) / GRENADE_FLIGHT,
            vy: (p.y - e.y) / GRENADE_FLIGHT,
            x: e.x,
            y: e.y,
        });
        s.events.push({ type: 'throw', x: e.x, y: e.y });
    }

    e.cooldown -= dt;
    if (stats.aim > 0) {
        if (e.aimLeft > 0) {
            e.aimLeft -= dt;
            if (e.aimLeft <= 0) {
                e.aimLeft = 0;
                e.cooldown = 0.9 + stats.aim;
                fireBullet(
                    s,
                    e,
                    toPlayer + (rand(s) - 0.5) * stats.spread,
                    false,
                    stats.damage,
                );
            }
        } else if (e.cooldown <= 0) {
            e.aimLeft = stats.aim;
        }
    } else if (e.cooldown <= 0) {
        fireBullet(
            s,
            e,
            toPlayer + (rand(s) - 0.5) * stats.spread,
            false,
            stats.damage,
        );
        e.burst += 1;
        if (e.burst >= stats.burst) {
            e.burst = 0;
            e.cooldown = 0.8 + rand(s) * 0.9;
        } else {
            e.cooldown = 0.12;
        }
    }
}

export function stepEnemy(s: RaidState, e: Enemy, dt: number): void {
    const p = s.player;
    const stats = ENEMY_STATS[e.kind];
    const distance = Math.hypot(p.x - e.x, p.y - e.y);
    const sight = stats.sight * (isHidden(s) ? 0.3 : 1);
    const sees = distance < sight && hasLineOfSight(e.x, e.y, p.x, p.y);

    if (sees) {
        const toPlayer = Math.atan2(p.y - e.y, p.x - e.x);
        const off = Math.abs(
            Math.atan2(
                Math.sin(toPlayer - e.facing),
                Math.cos(toPlayer - e.facing),
            ),
        );
        // Someone on patrol barely notices what is behind them.
        const attention = e.mode === 'patrol' && off > 1.8 ? 0.2 : 1;
        e.awareness = Math.min(
            1,
            e.awareness +
                dt *
                    stats.wits *
                    attention *
                    (0.5 + 1.6 * (1 - distance / sight)),
        );
        e.blind = 0;
    } else {
        e.blind += dt;
        e.aimLeft = 0;
    }

    const noise = s.noise;
    if (
        noise &&
        e.mode !== 'combat' &&
        s.time - noise.at < 0.25 &&
        Math.hypot(noise.x - e.x, noise.y - e.y) < noise.radius
    ) {
        e.mode = 'suspicious';
        e.awareness = Math.max(e.awareness, 0.5);
        e.targetX = noise.x;
        e.targetY = noise.y;
        e.routeLeft = 0;
    }

    if (e.mode !== 'combat' && sees && e.awareness >= 1) {
        e.mode = 'combat';
        e.cooldown = 0.25 + rand(s) * 0.3;
        s.events.push({ type: 'spotted', x: e.x, y: e.y });
        alertNearby(s, e);
    }

    if (e.mode === 'combat') {
        if (sees) {
            e.targetX = p.x;
            e.targetY = p.y;
            fight(s, e, distance, dt);
        } else if (e.blind > 5) {
            e.mode = 'suspicious';
        } else {
            walkTo(s, e, stats.run, dt);
        }
    } else if (e.mode === 'suspicious') {
        const arrived = Math.hypot(e.targetX - e.x, e.targetY - e.y) < 34;
        if (arrived || stats.run === 0) {
            e.awareness = Math.max(0, e.awareness - dt * 0.2);
            e.facing += dt * 1.5;
            if (e.awareness < 0.15) {
                e.mode = 'patrol';
                e.targetX = e.homeX;
                e.targetY = e.homeY;
                e.routeLeft = 0;
            }
        } else {
            walkTo(s, e, stats.run * 0.85, dt);
        }
    } else {
        if (!sees) {
            e.awareness = Math.max(0, e.awareness - dt * 0.15);
        }
        if (stats.walk === 0) {
            e.facing += dt * 0.35;
        } else if (Math.hypot(e.targetX - e.x, e.targetY - e.y) < 24) {
            e.cooldown -= dt;
            if (e.cooldown <= 0) {
                e.cooldown = 1 + rand(s) * 3;
                e.targetX = e.homeX + (rand(s) - 0.5) * 280;
                e.targetY = e.homeY + (rand(s) - 0.5) * 280;
                e.routeLeft = 0;
            }
        } else {
            walkTo(s, e, stats.walk, dt);
        }
    }
}
