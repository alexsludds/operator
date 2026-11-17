/** Draws the world of a raid: the map, everyone in sight, fog and weather. */

import { ENEMY_STATS, INTERACT_RANGE } from './actors';
import { BLAST_RADIUS } from './combat';
import type { Fx } from './fx';
import { hasLineOfSight, visibilityFan } from './geometry';
import { extractZoneAt, stormOf } from './sim';
import { isSquad } from './types';
import type { Enemy, EnemyKind, RaidState } from './types';
import { EXTRACTS, STAIRS, TREES, WORLD, inCellars, shorelineY } from './world';

export interface RaidView {
    /** Canvas size in CSS pixels. */
    width: number;
    height: number;
}

export interface RaidLayers {
    terrain: HTMLCanvasElement;
    fog: HTMLCanvasElement;
}

const SURFACE_VIEW = 580;
const CELLAR_VIEW = 300;

/** How far the player sees, in world units: less by lamplight below ground. */
export function viewRange(s: RaidState): number {
    return inCellars(s.player.x, s.player.y) ? CELLAR_VIEW : SURFACE_VIEW;
}

export const LABEL_FONT = '600 12px ui-monospace, Menlo, monospace';

const ENEMY_COLOR: Record<EnemyKind, string> = {
    drifter: '#b48c5c',
    guard: '#5f7594',
    marksman: '#8a62a0',
    captain: '#c2473a',
    spotter: '#3f958e',
    sapper: '#cf8a2e',
};

/** CSS pixels per world unit, set by the smaller canvas side. */
export function raidZoom(view: RaidView): number {
    return Math.max(
        0.6,
        Math.min(1.7, Math.min(view.width, view.height) / 860),
    );
}

function drawGround(
    ctx: CanvasRenderingContext2D,
    s: RaidState,
    terrain: HTMLCanvasElement,
): void {
    ctx.drawImage(terrain, 0, 0);

    // The surf line creeps up and down the sand.
    ctx.beginPath();
    for (let x = 0; x <= WORLD.width; x += 40) {
        ctx.lineTo(x, shorelineY(x) - 6 - 9 * Math.sin(s.time * 0.5 + x / 300));
    }
    ctx.strokeStyle = 'rgba(235, 244, 247, 0.5)';
    ctx.lineWidth = 5;
    ctx.stroke();

    const zone = extractZoneAt(s.player.x, s.player.y);
    EXTRACTS.forEach((z, index) => {
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2);
        ctx.fillStyle =
            index === zone
                ? 'rgba(96, 220, 130, 0.3)'
                : 'rgba(96, 220, 130, 0.12)';
        ctx.fill();
        ctx.setLineDash([10, 8]);
        ctx.lineDashOffset = -s.time * 14;
        ctx.strokeStyle = '#60dc82';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#c9f5d4';
        ctx.font = LABEL_FONT;
        ctx.textAlign = 'center';
        ctx.fillText(`EXFIL · ${z.name}`, z.x, z.y - z.r - 8);
    });
}

function drawStairs(ctx: CanvasRenderingContext2D, s: RaidState): void {
    const p = s.player;
    for (const stairs of STAIRS) {
        ctx.fillStyle = '#1b1d20';
        ctx.fillRect(stairs.x - 20, stairs.y - 20, 40, 40);
        ctx.strokeStyle = '#d9c88a';
        ctx.lineWidth = 2;
        for (let step = -14; step <= 14; step += 7) {
            ctx.beginPath();
            ctx.moveTo(stairs.x - 16, stairs.y + step);
            ctx.lineTo(stairs.x + 16, stairs.y + step);
            ctx.stroke();
        }
        if (Math.hypot(stairs.x - p.x, stairs.y - p.y) < 60) {
            ctx.fillStyle = '#fff3c7';
            ctx.font = LABEL_FONT;
            ctx.textAlign = 'center';
            ctx.fillText(`hold E · ${stairs.label}`, stairs.x, stairs.y - 28);
        }
    }
}

function drawItems(ctx: CanvasRenderingContext2D, s: RaidState): void {
    const p = s.player;
    for (const corpse of s.corpses) {
        ctx.save();
        ctx.translate(corpse.x, corpse.y);
        ctx.rotate(corpse.facing);
        ctx.fillStyle = 'rgba(110, 20, 16, 0.55)';
        ctx.beginPath();
        ctx.ellipse(0, 0, 20, 14, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = ENEMY_COLOR[corpse.kind];
        ctx.globalAlpha = 0.6;
        ctx.fillRect(-14, -7, 28, 14);
        ctx.restore();
    }

    for (const crate of s.crates) {
        if (crate.taken) {
            continue;
        }
        const near = Math.hypot(crate.x - p.x, crate.y - p.y) < INTERACT_RANGE;
        ctx.fillStyle = near ? '#ffe08a' : '#c9a23f';
        ctx.fillRect(crate.x - 9, crate.y - 9, 18, 18);
        ctx.strokeStyle = '#3d2f0c';
        ctx.lineWidth = 2;
        ctx.strokeRect(crate.x - 9, crate.y - 9, 18, 18);
        ctx.beginPath();
        ctx.moveTo(crate.x - 9, crate.y);
        ctx.lineTo(crate.x + 9, crate.y);
        ctx.stroke();
        if (crate.progress > 0) {
            ctx.beginPath();
            ctx.arc(
                crate.x,
                crate.y,
                18,
                -Math.PI / 2,
                -Math.PI / 2 + (crate.progress / crate.search) * Math.PI * 2,
            );
            ctx.strokeStyle = '#fff3c7';
            ctx.lineWidth = 4;
            ctx.stroke();
        } else if (near) {
            ctx.fillStyle = '#fff3c7';
            ctx.font = LABEL_FONT;
            ctx.textAlign = 'center';
            ctx.fillText('hold E', crate.x, crate.y - 16);
        }
    }

    for (const g of s.grenades) {
        ctx.beginPath();
        ctx.arc(g.x, g.y, BLAST_RADIUS, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 120, 80, ${0.15 + 0.3 * (1 - g.fuse / 1.5)})`;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(g.x, g.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = Math.floor(g.fuse * 8) % 2 ? '#ff5a3c' : '#2f3a2c';
        ctx.fill();
    }
}

function drawBody(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    facing: number,
    radius: number,
    fill: string,
    ring: string | null,
): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(facing);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.arc(2, 3, radius + 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#15191c';
    ctx.fillRect(4, -2.5, radius + 12, 5);
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    if (ring) {
        ctx.strokeStyle = ring;
        ctx.lineWidth = 2.5;
        ctx.stroke();
    }
    ctx.restore();
}

function drawEnemy(
    ctx: CanvasRenderingContext2D,
    s: RaidState,
    e: Enemy,
): void {
    const p = s.player;
    const inSight =
        Math.hypot(e.x - p.x, e.y - p.y) < viewRange(s) &&
        hasLineOfSight(p.x, p.y, e.x, e.y);
    // A marksman's sights show wherever they come from.
    if (e.aimLeft > 0) {
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.lineTo(p.x, p.y);
        ctx.strokeStyle = `rgba(255, 60, 50, ${0.25 + 0.6 * (1 - e.aimLeft / ENEMY_STATS[e.kind].aim)})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }
    if (!inSight) {
        return;
    }
    drawBody(
        ctx,
        e.x,
        e.y,
        e.facing,
        isSquad(e.kind) ? 14 : 12,
        ENEMY_COLOR[e.kind],
        e.mode === 'combat'
            ? '#e2503f'
            : isSquad(e.kind)
              ? '#ffd54a'
              : e.kind === 'guard'
                ? '#c8d4e6'
                : null,
    );
    if (e.mode !== 'combat' && e.awareness > 0.05) {
        ctx.beginPath();
        ctx.arc(
            e.x,
            e.y,
            20,
            -Math.PI / 2,
            -Math.PI / 2 + e.awareness * Math.PI * 2,
        );
        ctx.strokeStyle = e.mode === 'suspicious' ? '#ffb347' : '#fff3c7';
        ctx.lineWidth = 3;
        ctx.stroke();
    }
}

function drawActors(ctx: CanvasRenderingContext2D, s: RaidState, fx: Fx): void {
    for (const e of s.enemies) {
        drawEnemy(ctx, s, e);
    }

    ctx.lineWidth = 2;
    for (const b of s.bullets) {
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x - b.vx * 0.014, b.y - b.vy * 0.014);
        ctx.strokeStyle = b.fromPlayer ? '#fff1b0' : '#ff9d8a';
        ctx.stroke();
    }
    for (const particle of fx.particles) {
        ctx.globalAlpha = Math.min(1, particle.life / particle.span);
        ctx.fillStyle = particle.color;
        ctx.fillRect(
            particle.x - particle.size / 2,
            particle.y - particle.size / 2,
            particle.size,
            particle.size,
        );
    }
    ctx.globalAlpha = 1;

    const p = s.player;
    drawBody(
        ctx,
        p.x,
        p.y,
        p.facing,
        11,
        '#dbe5ec',
        p.armor > 0 ? '#7fb2e6' : null,
    );

    for (const tree of TREES) {
        const under = Math.hypot(tree.x - p.x, tree.y - p.y) < tree.r;
        ctx.globalAlpha = under ? 0.3 : 0.88;
        ctx.fillStyle = '#2f4a2c';
        ctx.beginPath();
        ctx.arc(tree.x, tree.y, tree.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#3d5e37';
        ctx.beginPath();
        ctx.arc(
            tree.x - tree.r * 0.2,
            tree.y - tree.r * 0.2,
            tree.r * 0.62,
            0,
            Math.PI * 2,
        );
        ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.font = LABEL_FONT;
    ctx.textAlign = 'center';
    for (const floater of fx.floaters) {
        ctx.globalAlpha = Math.min(1, floater.life * 2);
        ctx.fillStyle = floater.color;
        ctx.fillText(floater.text, floater.x, floater.y - 18);
    }
    ctx.globalAlpha = 1;
}

/** Darkness over everything the player cannot see from where they stand. */
function drawFog(
    ctx: CanvasRenderingContext2D,
    s: RaidState,
    view: RaidView,
    fog: HTMLCanvasElement,
    camera: DOMMatrix,
): void {
    const fogCtx = fog.getContext('2d');
    if (!fogCtx) {
        return;
    }
    const p = s.player;
    fogCtx.setTransform(1, 0, 0, 1, 0, 0);
    fogCtx.globalCompositeOperation = 'source-over';
    const below = inCellars(p.x, p.y);
    const reach = viewRange(s);
    fogCtx.fillStyle = `rgba(6, 10, 14, ${below ? 0.96 : 0.62 + 0.2 * stormOf(s)})`;
    fogCtx.fillRect(0, 0, fog.width, fog.height);

    fogCtx.setTransform(camera);
    fogCtx.globalCompositeOperation = 'destination-out';
    const light = fogCtx.createRadialGradient(p.x, p.y, 40, p.x, p.y, reach);
    light.addColorStop(0, 'rgba(0, 0, 0, 1)');
    light.addColorStop(0.6, 'rgba(0, 0, 0, 0.9)');
    light.addColorStop(1, 'rgba(0, 0, 0, 0)');
    fogCtx.fillStyle = light;
    const fan = visibilityFan(p.x, p.y, reach);
    fogCtx.beginPath();
    for (let i = 0; i < fan.length; i += 2) {
        fogCtx.lineTo(fan[i], fan[i + 1]);
    }
    fogCtx.closePath();
    fogCtx.fill();

    ctx.drawImage(fog, 0, 0, view.width, view.height);
}

function drawWeather(
    ctx: CanvasRenderingContext2D,
    s: RaidState,
    view: RaidView,
    fx: Fx,
): void {
    const storm = stormOf(s);
    ctx.strokeStyle = 'rgba(190, 210, 225, 0.28)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    // No rain falls below ground.
    const drops = inCellars(s.player.x, s.player.y)
        ? 0
        : Math.floor(30 + storm * 190);
    for (let i = 0; i < drops; i++) {
        const x = ((i * 7919) % 997) / 997;
        const y = ((i * 6007) % 991) / 991;
        const fall = (y + s.time * (1.1 + (i % 5) * 0.12)) % 1;
        const px = ((x + fall * 0.12) % 1) * view.width;
        const py = fall * view.height;
        ctx.moveTo(px, py);
        ctx.lineTo(px - 3, py - 14);
    }
    ctx.stroke();

    if (fx.flash > 0) {
        ctx.fillStyle = `rgba(225, 235, 255, ${fx.flash * 0.5})`;
        ctx.fillRect(0, 0, view.width, view.height);
    }
    const sinceHurt = s.time - s.player.hurtAt;
    if (sinceHurt < 0.6) {
        // An arc on the side the hit came from.
        ctx.save();
        ctx.translate(view.width / 2, view.height / 2);
        ctx.rotate(s.player.hurtFrom);
        ctx.beginPath();
        ctx.arc(0, 0, 90, -0.5, 0.5);
        ctx.strokeStyle = `rgba(230, 60, 45, ${1 - sinceHurt / 0.6})`;
        ctx.lineWidth = 7;
        ctx.stroke();
        ctx.restore();
    }
    const low = 1 - s.player.hp / 45;
    if (low > 0) {
        const edge = ctx.createRadialGradient(
            view.width / 2,
            view.height / 2,
            Math.min(view.width, view.height) * 0.3,
            view.width / 2,
            view.height / 2,
            Math.max(view.width, view.height) * 0.7,
        );
        edge.addColorStop(0, 'rgba(150, 20, 15, 0)');
        edge.addColorStop(1, `rgba(150, 20, 15, ${0.6 * low})`);
        ctx.fillStyle = edge;
        ctx.fillRect(0, 0, view.width, view.height);
    }
}

export function drawScene(
    ctx: CanvasRenderingContext2D,
    s: RaidState,
    view: RaidView,
    fx: Fx,
    layers: RaidLayers,
): void {
    const zoom = raidZoom(view);
    const shake = fx.shake * 12;
    ctx.fillStyle = '#0b1318';
    ctx.fillRect(0, 0, view.width, view.height);

    const base = ctx.getTransform();
    ctx.save();
    ctx.translate(
        view.width / 2 + (Math.random() - 0.5) * shake,
        view.height / 2 + (Math.random() - 0.5) * shake,
    );
    ctx.scale(zoom, zoom);
    ctx.translate(-s.player.x, -s.player.y);
    // The fog canvas is drawn in CSS pixels, so its camera leaves out the
    // device-pixel scale the main canvas carries.
    const camera = base.inverse().multiply(ctx.getTransform());
    drawGround(ctx, s, layers.terrain);
    drawStairs(ctx, s);
    drawItems(ctx, s);
    drawActors(ctx, s, fx);
    ctx.restore();

    drawFog(ctx, s, view, layers.fog, camera);
    drawWeather(ctx, s, view, fx);
}
