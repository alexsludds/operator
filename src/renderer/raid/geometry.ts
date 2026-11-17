/** Sight, collision and pathfinding over the map's solids. */

import { SIGHT_SOLIDS, SOLIDS, WORLD, isWater } from './world';
import type { Point, Rect } from './world';

/**
 * How far along the ray from `(ox, oy)` towards `(ox + dx, oy + dy)` it
 * enters `r`, as a fraction of `(dx, dy)`; Infinity when it misses.
 */
function rayRect(
    ox: number,
    oy: number,
    dx: number,
    dy: number,
    r: Rect,
): number {
    let t0 = 0;
    let t1 = Infinity;
    if (dx === 0) {
        if (ox < r.x || ox > r.x + r.w) {
            return Infinity;
        }
    } else {
        const a = (r.x - ox) / dx;
        const b = (r.x + r.w - ox) / dx;
        t0 = Math.max(t0, Math.min(a, b));
        t1 = Math.min(t1, Math.max(a, b));
    }
    if (dy === 0) {
        if (oy < r.y || oy > r.y + r.h) {
            return Infinity;
        }
    } else {
        const a = (r.y - oy) / dy;
        const b = (r.y + r.h - oy) / dy;
        t0 = Math.max(t0, Math.min(a, b));
        t1 = Math.min(t1, Math.max(a, b));
    }
    return t0 <= t1 ? t0 : Infinity;
}

export function hasLineOfSight(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
): boolean {
    const dx = x1 - x0;
    const dy = y1 - y0;
    return !SIGHT_SOLIDS.some((r) => rayRect(x0, y0, dx, dy, r) <= 1);
}

export function inSolid(x: number, y: number, radius: number): boolean {
    return SOLIDS.some((r) => {
        const cx = Math.max(r.x, Math.min(x, r.x + r.w));
        const cy = Math.max(r.y, Math.min(y, r.y + r.h));
        return (x - cx) ** 2 + (y - cy) ** 2 < radius * radius;
    });
}

export function isBlocked(x: number, y: number, radius: number): boolean {
    return (
        x < radius ||
        y < radius ||
        x > WORLD.width - radius ||
        y > WORLD.height - radius ||
        isWater(x, y) ||
        inSolid(x, y, radius)
    );
}

/**
 * Move along each axis on its own, so a body slides along what it hits.
 * Returns whether it moved at all.
 */
export function moveBody(
    body: Point,
    dx: number,
    dy: number,
    radius: number,
): boolean {
    let moved = false;
    if (dx !== 0 && !isBlocked(body.x + dx, body.y, radius)) {
        body.x += dx;
        moved = true;
    }
    if (dy !== 0 && !isBlocked(body.x, body.y + dy, radius)) {
        body.y += dy;
        moved = true;
    }
    return moved;
}

/** How far a wall's face is lit past the point sight meets it. */
const WALL_GLOW = 10;

/**
 * The region visible from `(ox, oy)` out to `radius`, as a fan of points in
 * angle order: `[x0, y0, x1, y1, …]`.
 */
export function visibilityFan(
    ox: number,
    oy: number,
    radius: number,
): number[] {
    const near = SIGHT_SOLIDS.filter(
        (r) =>
            r.x < ox + radius &&
            r.x + r.w > ox - radius &&
            r.y < oy + radius &&
            r.y + r.h > oy - radius,
    );
    const angles: number[] = [];
    for (let i = 0; i < 48; i++) {
        angles.push((i / 48) * Math.PI * 2 - Math.PI);
    }
    for (const r of near) {
        for (const cx of [r.x, r.x + r.w]) {
            for (const cy of [r.y, r.y + r.h]) {
                const a = Math.atan2(cy - oy, cx - ox);
                angles.push(a - 0.0008, a, a + 0.0008);
            }
        }
    }
    angles.sort((a, b) => a - b);

    const fan: number[] = [];
    for (const angle of angles) {
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);
        let reach = radius;
        for (const r of near) {
            reach = Math.min(reach, rayRect(ox, oy, dx, dy, r) + WALL_GLOW);
        }
        fan.push(ox + dx * reach, oy + dy * reach);
    }
    return fan;
}

const CELL = 20;
const COLS = Math.ceil(WORLD.width / CELL);
const ROWS = Math.ceil(WORLD.height / CELL);
/** Clearance a walker needs around a cell's centre. */
const NAV_RADIUS = 12;

let walkable: Uint8Array | null = null;

function navGrid(): Uint8Array {
    if (!walkable) {
        walkable = new Uint8Array(COLS * ROWS);
        for (let row = 0; row < ROWS; row++) {
            for (let col = 0; col < COLS; col++) {
                const open = !isBlocked(
                    col * CELL + CELL / 2,
                    row * CELL + CELL / 2,
                    NAV_RADIUS,
                );
                walkable[row * COLS + col] = open ? 1 : 0;
            }
        }
    }
    return walkable;
}

const cellOf = (x: number, y: number) =>
    Math.max(0, Math.min(ROWS - 1, Math.floor(y / CELL))) * COLS +
    Math.max(0, Math.min(COLS - 1, Math.floor(x / CELL)));

const STEPS = [1, -1, COLS, -COLS];

/**
 * The next point to walk to on the shortest route from `from` to `to`
 * through doors and around walls, or null when no route is found.
 */
export function nextWaypoint(from: Point, to: Point): Point | null {
    const grid = navGrid();
    const start = cellOf(from.x, from.y);
    const goal = cellOf(to.x, to.y);
    if (start === goal) {
        return to;
    }
    // Searching back from the goal leaves each cell pointing one step nearer it.
    const toward = new Int32Array(COLS * ROWS).fill(-1);
    const queue = new Int32Array(COLS * ROWS);
    let head = 0;
    let tail = 0;
    queue[tail++] = goal;
    toward[goal] = goal;
    while (head < tail) {
        const cell = queue[head++];
        if (cell === start) {
            break;
        }
        const col = cell % COLS;
        for (const step of STEPS) {
            const next = cell + step;
            if (
                next < 0 ||
                next >= grid.length ||
                (step === 1 && col === COLS - 1) ||
                (step === -1 && col === 0) ||
                toward[next] !== -1 ||
                (!grid[next] && next !== start)
            ) {
                continue;
            }
            toward[next] = cell;
            queue[tail++] = next;
        }
    }
    if (toward[start] === -1) {
        return null;
    }
    // Two cells ahead smooths the walk without cutting a corner.
    const ahead = toward[toward[start]];
    return {
        x: (ahead % COLS) * CELL + CELL / 2,
        y: Math.floor(ahead / COLS) * CELL + CELL / 2,
    };
}
