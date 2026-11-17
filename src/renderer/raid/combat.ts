/** Bullets, grenades and the damage they do. */

import { hasLineOfSight, inSolid, isBlocked } from './geometry';
import { rand } from './types';
import type { Enemy, LootKind, RaidState } from './types';
import type { Point } from './world';

export const PLAYER_RADIUS = 11;
export const ENEMY_RADIUS = 12;
export const BLAST_RADIUS = 150;

const BULLET_SPEED = 1500;
const BLAST_DAMAGE = 150;
const GUNSHOT_EARSHOT = 800;
const BLAST_EARSHOT = 1000;
/** The share of a hit that armor takes while it lasts. */
const ARMOR_SHARE = 0.5;

export function fireBullet(
    s: RaidState,
    from: Point,
    angle: number,
    fromPlayer: boolean,
    damage: number,
): void {
    s.bullets.push({
        damage,
        fromPlayer,
        life: 0.8,
        vx: Math.cos(angle) * BULLET_SPEED,
        vy: Math.sin(angle) * BULLET_SPEED,
        x: from.x + Math.cos(angle) * 16,
        y: from.y + Math.sin(angle) * 16,
    });
    s.lastShotAt = s.time;
    s.events.push({
        angle,
        type: fromPlayer ? 'shot' : 'enemyShot',
        x: from.x,
        y: from.y,
    });
    if (fromPlayer) {
        s.lastPlayerShotAt = s.time;
        s.noise = { at: s.time, radius: GUNSHOT_EARSHOT, x: from.x, y: from.y };
    }
}

export function hurtPlayer(s: RaidState, damage: number, from: number): void {
    const p = s.player;
    const absorbed = Math.min(p.armor, damage * ARMOR_SHARE);
    p.armor -= absorbed;
    p.hp -= damage - absorbed;
    p.hurtAt = s.time;
    p.hurtFrom = from;
    s.events.push({ angle: from, type: 'hurt', x: p.x, y: p.y });
}

function hurtEnemy(
    s: RaidState,
    e: Enemy,
    damage: number,
    angle: number,
): void {
    e.hp -= damage;
    e.awareness = 1;
    e.mode = 'combat';
    e.blind = 0;
    e.targetX = s.player.x;
    e.targetY = s.player.y;
    s.events.push({ angle, type: 'enemyHit', x: e.x, y: e.y });
}

export function stepBullets(s: RaidState, dt: number): void {
    const p = s.player;
    const steps = 4;
    for (const b of s.bullets) {
        const angle = Math.atan2(b.vy, b.vx);
        for (let i = 0; i < steps && b.life > 0; i++) {
            b.x += (b.vx * dt) / steps;
            b.y += (b.vy * dt) / steps;
            if (inSolid(b.x, b.y, 0.5)) {
                b.life = 0;
                s.events.push({ angle, type: 'impact', x: b.x, y: b.y });
            } else if (b.fromPlayer) {
                const hit = s.enemies.find(
                    (e) =>
                        e.hp > 0 &&
                        Math.hypot(e.x - b.x, e.y - b.y) < ENEMY_RADIUS + 2,
                );
                if (hit) {
                    b.life = 0;
                    hurtEnemy(s, hit, b.damage, angle);
                }
            } else if (Math.hypot(p.x - b.x, p.y - b.y) < PLAYER_RADIUS + 2) {
                b.life = 0;
                hurtPlayer(s, b.damage, angle + Math.PI);
            }
        }
        b.life -= dt;
    }
    s.bullets = s.bullets.filter((b) => b.life > 0);
}

function blast(s: RaidState, at: Point): void {
    s.events.push({ type: 'blast', x: at.x, y: at.y });
    s.noise = { at: s.time, radius: BLAST_EARSHOT, x: at.x, y: at.y };
    s.lastShotAt = s.time;
    const damageAt = (target: Point) => {
        const distance = Math.hypot(target.x - at.x, target.y - at.y);
        return distance < BLAST_RADIUS &&
            hasLineOfSight(at.x, at.y, target.x, target.y)
            ? BLAST_DAMAGE * (1 - distance / BLAST_RADIUS)
            : 0;
    };
    for (const e of s.enemies) {
        const damage = damageAt(e);
        if (damage > 0) {
            hurtEnemy(s, e, damage, Math.atan2(e.y - at.y, e.x - at.x));
        }
    }
    const damage = damageAt(s.player);
    if (damage > 0) {
        hurtPlayer(s, damage, Math.atan2(at.y - s.player.y, at.x - s.player.x));
    }
}

export function stepGrenades(s: RaidState, dt: number): void {
    for (const g of s.grenades) {
        if (g.flight > 0) {
            g.flight -= dt;
            // A grenade drops where it meets a wall.
            if (isBlocked(g.x + g.vx * dt, g.y + g.vy * dt, 4)) {
                g.flight = 0;
            } else {
                g.x += g.vx * dt;
                g.y += g.vy * dt;
            }
        }
        g.fuse -= dt;
        if (g.fuse <= 0) {
            blast(s, g);
        }
    }
    s.grenades = s.grenades.filter((g) => g.fuse > 0);
}

const DROPS: LootKind[] = ['ammo', 'ammo', 'valuables', 'valuables', 'medkit'];

/** The dead leave a body and whatever they carried. */
export function reapEnemies(s: RaidState): void {
    for (const e of s.enemies) {
        if (e.hp > 0) {
            continue;
        }
        s.kills += 1;
        s.events.push({ type: 'kill', x: e.x, y: e.y });
        s.corpses.push({ facing: e.facing, kind: e.kind, x: e.x, y: e.y });
        const kind =
            e.kind === 'guard' && rand(s) < 0.3
                ? 'armor'
                : DROPS[Math.floor(rand(s) * DROPS.length)];
        s.crates.push({
            kind,
            progress: 0,
            search: 0.35,
            taken: false,
            value:
                (e.kind === 'drifter' ? 2 : 6) * 1000 +
                Math.floor(rand(s) * 8) * 1000,
            x: e.x,
            y: e.y,
        });
    }
    s.enemies = s.enemies.filter((e) => e.hp > 0);
}
