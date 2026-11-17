/** The map's ground, floors and walls, painted once onto its own canvas. */

import {
    BUSHES,
    PIER,
    ROADS,
    ROCKS,
    ROOMS,
    WALLS,
    WORLD,
    BOUNDS,
    CELLARS,
    shorelineY,
} from './world';
import type { SiteKind } from './world';

const FLOOR: Record<SiteKind, string> = {
    hotel: '#6d5f50',
    house: '#5d5245',
    post: '#4b5350',
    works: '#54575a',
};

function landPath(ctx: CanvasRenderingContext2D, inset: number): void {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(WORLD.width, 0);
    for (let x = WORLD.width; x >= 0; x -= 40) {
        ctx.lineTo(x, shorelineY(x) - inset);
    }
    ctx.closePath();
}

/** Flecks of `color` over the land, from a fixed sequence. */
function speckle(
    ctx: CanvasRenderingContext2D,
    count: number,
    color: string,
    minY: (x: number) => number,
    maxY: (x: number) => number,
): void {
    let state = 12345;
    const next = () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 4294967296;
    };
    ctx.fillStyle = color;
    for (let i = 0; i < count; i++) {
        const x = next() * WORLD.width;
        const y = minY(x) + next() * (maxY(x) - minY(x));
        ctx.fillRect(x, y, 2 + next() * 3, 2 + next() * 3);
    }
}

export function paintTerrain(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = BOUNDS.width;
    canvas.height = BOUNDS.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        return canvas;
    }

    const sea = ctx.createLinearGradient(0, 1700, 0, WORLD.height);
    sea.addColorStop(0, '#2a566a');
    sea.addColorStop(1, '#12303f');
    ctx.fillStyle = sea;
    ctx.fillRect(0, 0, WORLD.width, WORLD.height);

    landPath(ctx, 0);
    ctx.fillStyle = '#b5a577';
    ctx.fill();
    landPath(ctx, 70);
    ctx.fillStyle = '#8f8d5c';
    ctx.fill();
    landPath(ctx, 100);
    ctx.fillStyle = '#4a5a3a';
    ctx.fill();
    const grassEdge = (x: number) => shorelineY(x) - 100;
    speckle(ctx, 9000, 'rgba(98, 122, 70, 0.5)', () => 0, grassEdge);
    speckle(ctx, 6000, 'rgba(40, 52, 32, 0.45)', () => 0, grassEdge);
    speckle(
        ctx,
        2500,
        'rgba(120, 104, 70, 0.5)',
        (x) => shorelineY(x) - 70,
        shorelineY,
    );

    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const [width, color] of [
        [46, '#4f4b44'],
        [38, '#625d54'],
    ] as const) {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        for (const road of ROADS) {
            ctx.beginPath();
            for (const point of road) {
                ctx.lineTo(point.x, point.y);
            }
            ctx.stroke();
        }
    }

    ctx.fillStyle = '#7b6349';
    ctx.fillRect(PIER.x, PIER.y, PIER.w, PIER.h);
    ctx.strokeStyle = 'rgba(40, 28, 16, 0.5)';
    ctx.lineWidth = 2;
    for (let y = PIER.y; y < PIER.y + PIER.h; y += 14) {
        ctx.beginPath();
        ctx.moveTo(PIER.x, y);
        ctx.lineTo(PIER.x + PIER.w, y);
        ctx.stroke();
    }

    for (const room of ROOMS) {
        ctx.fillStyle = FLOOR[room.kind];
        ctx.fillRect(room.x, room.y, room.w, room.h);
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.12)';
        ctx.lineWidth = 1;
        for (let x = room.x + 20; x < room.x + room.w; x += 20) {
            ctx.beginPath();
            ctx.moveTo(x, room.y);
            ctx.lineTo(x, room.y + room.h);
            ctx.stroke();
        }
    }

    for (const bush of BUSHES) {
        ctx.fillStyle = 'rgba(46, 78, 42, 0.92)';
        for (const [dx, dy, scale] of [
            [0, 0, 1],
            [-0.4, 0.3, 0.7],
            [0.45, 0.2, 0.65],
            [0.1, -0.45, 0.6],
        ]) {
            ctx.beginPath();
            ctx.arc(
                bush.x + dx * bush.r,
                bush.y + dy * bush.r,
                bush.r * scale,
                0,
                Math.PI * 2,
            );
            ctx.fill();
        }
    }

    for (const rock of ROCKS) {
        ctx.fillStyle = '#5d6065';
        ctx.beginPath();
        ctx.roundRect(rock.x, rock.y, rock.w, rock.h, 14);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.beginPath();
        ctx.roundRect(rock.x + 6, rock.y + 5, rock.w * 0.5, rock.h * 0.4, 8);
        ctx.fill();
    }

    // Below ground: bare rock around the cellars' flagstones.
    ctx.fillStyle = '#0c0e10';
    ctx.fillRect(WORLD.width, 0, BOUNDS.width - WORLD.width, BOUNDS.height);
    ctx.fillStyle = '#3a393c';
    ctx.fillRect(CELLARS.x, CELLARS.y, CELLARS.w, CELLARS.h);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.lineWidth = 1;
    for (let offset = 0; offset < CELLARS.w; offset += 40) {
        ctx.beginPath();
        ctx.moveTo(CELLARS.x + offset, CELLARS.y);
        ctx.lineTo(CELLARS.x + offset, CELLARS.y + CELLARS.h);
        ctx.moveTo(CELLARS.x, CELLARS.y + offset);
        ctx.lineTo(CELLARS.x + CELLARS.w, CELLARS.y + offset);
        ctx.stroke();
    }

    ctx.fillStyle = '#211e1b';
    for (const wall of WALLS) {
        ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
    }
    return canvas;
}
