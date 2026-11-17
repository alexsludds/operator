/**
 * Kelp Point: the map a raid is played on. Distances are world units, with
 * the origin at the north-west corner and the sea along the south edge.
 * Everything here is fixed at load, so every raid shares one map.
 */

export interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}

export interface Point {
    x: number;
    y: number;
}

export interface Circle extends Point {
    r: number;
}

export type Side = 'n' | 's' | 'e' | 'w';
export type SiteKind = 'hotel' | 'house' | 'works' | 'post';

/** A door: the wall it is in, where the gap starts along it, and its width. */
type Door = [side: Side, offset: number, width?: number];

export interface Room extends Rect {
    kind: SiteKind;
    /** How good the loot is: 1 scraps … 3 the best on the map. */
    tier: number;
}

interface RoomSpec extends Room {
    doors: Door[];
    /** Sides left without a wall, where a neighbour already has one. */
    open?: string;
}

export interface ExtractZone extends Circle {
    name: string;
}

export interface EnemyPost extends Point {
    kind: 'drifter' | 'guard' | 'marksman';
}

export const WORLD = { height: 2200, width: 3200 };
export const WALL = 8;
const DOOR = 46;

export const PLAYER_SPAWNS: Point[] = [
    { x: 150, y: 1690 },
    { x: 170, y: 420 },
    { x: 960, y: 1740 },
];

/** The only walkable ground south of the waterline. */
export const PIER: Rect = { h: 400, w: 64, x: 2600, y: 1690 };

export const EXTRACTS: ExtractZone[] = [
    { name: 'Pier boat', r: 58, x: 2632, y: 2030 },
    { name: 'Hill path', r: 64, x: 3090, y: 130 },
];

export const ROADS: Point[][] = [
    [
        { x: 0, y: 940 },
        { x: 700, y: 900 },
        { x: 1500, y: 860 },
        { x: 2300, y: 930 },
        { x: 3200, y: 880 },
    ],
    [
        { x: 1540, y: 860 },
        { x: 1540, y: 500 },
    ],
    [
        { x: 2632, y: 915 },
        { x: 2632, y: 1700 },
    ],
    [
        { x: 2900, y: 890 },
        { x: 3090, y: 130 },
    ],
];

function hotelWing(x: number): RoomSpec[] {
    const rooms: RoomSpec[] = [
        {
            doors: [[x < 1300 ? 'w' : 'e', 12]],
            h: 70,
            kind: 'hotel',
            open: x < 1300 ? 'nse' : 'nsw',
            tier: 2,
            w: 480,
            x,
            y: 330,
        },
    ];
    for (let i = 0; i < 3; i++) {
        rooms.push(
            {
                doors: [['s', 57]],
                h: 130,
                kind: 'hotel',
                tier: 3,
                w: 160,
                x: x + i * 160,
                y: 200,
            },
            {
                doors: [['n', 57]],
                h: 130,
                kind: 'hotel',
                tier: 3,
                w: 160,
                x: x + i * 160,
                y: 400,
            },
        );
    }
    return rooms;
}

const ROOM_SPECS: RoomSpec[] = [
    // The Grand Marea hotel: a hall between two wings of guest rooms.
    {
        doors: [
            ['s', 210, 60],
            ['w', 82],
            ['e', 82],
        ],
        h: 240,
        kind: 'hotel',
        tier: 2,
        w: 480,
        x: 1300,
        y: 260,
    },
    ...hotelWing(820),
    ...hotelWing(1780),
    // The village.
    {
        doors: [['s', 50]],
        h: 110,
        kind: 'house',
        tier: 1,
        w: 150,
        x: 1180,
        y: 1160,
    },
    {
        doors: [
            ['w', 50],
            ['e', 60],
        ],
        h: 150,
        kind: 'house',
        tier: 1,
        w: 120,
        x: 1400,
        y: 1100,
    },
    {
        doors: [['n', 60]],
        h: 110,
        kind: 'house',
        tier: 1,
        w: 160,
        x: 1600,
        y: 1200,
    },
    {
        doors: [
            ['n', 40],
            ['e', 30],
        ],
        h: 100,
        kind: 'house',
        tier: 1,
        w: 140,
        x: 1260,
        y: 1350,
    },
    {
        doors: [['n', 70]],
        h: 100,
        kind: 'house',
        tier: 1,
        w: 180,
        x: 1500,
        y: 1400,
    },
    {
        doors: [['w', 40]],
        h: 130,
        kind: 'house',
        tier: 1,
        w: 110,
        x: 1750,
        y: 1380,
    },
    // Fuel depot and cannery in the west.
    {
        doors: [
            ['e', 40],
            ['s', 90],
        ],
        h: 130,
        kind: 'works',
        tier: 2,
        w: 220,
        x: 360,
        y: 1180,
    },
    {
        doors: [['n', 40]],
        h: 80,
        kind: 'works',
        tier: 1,
        w: 120,
        x: 400,
        y: 1380,
    },
    {
        doors: [
            ['n', 120, 70],
            ['e', 60],
        ],
        h: 180,
        kind: 'works',
        tier: 2,
        w: 300,
        x: 760,
        y: 1420,
    },
    // Checkpoint, radio station, bunker and boathouse in the east.
    {
        doors: [['s', 30]],
        h: 70,
        kind: 'post',
        tier: 1,
        w: 110,
        x: 1900,
        y: 740,
    },
    {
        doors: [
            ['s', 80],
            ['w', 50],
        ],
        h: 140,
        kind: 'post',
        tier: 3,
        w: 200,
        x: 2460,
        y: 330,
    },
    {
        doors: [['w', 30]],
        h: 100,
        kind: 'post',
        tier: 2,
        w: 140,
        x: 2900,
        y: 1100,
    },
    {
        doors: [
            ['e', 30],
            ['n', 60],
        ],
        h: 110,
        kind: 'works',
        tier: 2,
        w: 170,
        x: 2360,
        y: 1540,
    },
];

export const ROOMS: Room[] = ROOM_SPECS.map(({ h, kind, tier, w, x, y }) => ({
    h,
    kind,
    tier,
    w,
    x,
    y,
}));

function roomWalls(room: RoomSpec): Rect[] {
    const walls: Rect[] = [];
    for (const side of ['n', 's', 'e', 'w'] as const) {
        if (room.open?.includes(side)) {
            continue;
        }
        const along = side === 'n' || side === 's';
        const length = along ? room.w : room.h;
        const gaps = room.doors
            .filter((d) => d[0] === side)
            .map((d) => [d[1], d[1] + (d[2] ?? DOOR)])
            .toSorted((a, b) => a[0] - b[0]);
        let from = 0;
        for (const [start, end] of [...gaps, [length, length]]) {
            if (start > from) {
                walls.push(
                    along
                        ? {
                              h: WALL,
                              w: start - from,
                              x: room.x + from,
                              y: side === 'n' ? room.y : room.y + room.h - WALL,
                          }
                        : {
                              h: start - from,
                              w: WALL,
                              x: side === 'w' ? room.x : room.x + room.w - WALL,
                              y: room.y + from,
                          },
                );
            }
            from = end;
        }
    }
    return walls;
}

export const WALLS: Rect[] = ROOM_SPECS.flatMap(roomWalls);

export const ROCKS: Rect[] = [
    { h: 44, w: 70, x: 520, y: 1700 },
    { h: 40, w: 50, x: 1340, y: 1720 },
    { h: 50, w: 80, x: 2040, y: 1690 },
    { h: 46, w: 60, x: 2820, y: 1720 },
    { h: 56, w: 56, x: 2140, y: 1180 },
    { h: 44, w: 90, x: 640, y: 720 },
    { h: 50, w: 50, x: 2260, y: 620 },
    { h: 44, w: 70, x: 1080, y: 640 },
    { h: 60, w: 60, x: 2960, y: 540 },
    { h: 40, w: 80, x: 300, y: 640 },
    { h: 46, w: 64, x: 2200, y: 1420 },
    { h: 40, w: 60, x: 1000, y: 1080 },
];

/** Where the land ends at a given `x`; the sea lies south of it. */
export function shorelineY(x: number): number {
    return 1830 + 55 * Math.sin(x / 300) + 24 * Math.sin(x / 110 + 1);
}

export function inRect(x: number, y: number, r: Rect, pad = 0): boolean {
    return (
        x >= r.x - pad &&
        x <= r.x + r.w + pad &&
        y >= r.y - pad &&
        y <= r.y + r.h + pad
    );
}

export function isWater(x: number, y: number): boolean {
    return y > shorelineY(x) && !inRect(x, y, PIER);
}

function nearRoad(x: number, y: number, reach: number): boolean {
    return ROADS.some((road) =>
        road.slice(1).some((b, i) => {
            const a = road[i];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const t = Math.max(
                0,
                Math.min(
                    1,
                    ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy),
                ),
            );
            return Math.hypot(x - a.x - t * dx, y - a.y - t * dy) < reach;
        }),
    );
}

/** Trees and bushes are scattered once, from a fixed seed. */
function scatter(
    count: number,
    seed: number,
    minR: number,
    maxR: number,
): Circle[] {
    const found: Circle[] = [];
    let state = seed;
    const next = () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 4294967296;
    };
    for (let tries = 0; found.length < count && tries < count * 20; tries++) {
        const x = 40 + next() * (WORLD.width - 80);
        const y = 40 + next() * (WORLD.height - 80);
        const r = minR + next() * (maxR - minR);
        const clear =
            y < shorelineY(x) - 110 &&
            !nearRoad(x, y, 50) &&
            !ROOMS.some((room) => inRect(x, y, room, 50)) &&
            !ROCKS.some((rock) => inRect(x, y, rock, 40)) &&
            !PLAYER_SPAWNS.some((p) => Math.hypot(p.x - x, p.y - y) < 90) &&
            !EXTRACTS.some((z) => Math.hypot(z.x - x, z.y - y) < z.r + 40) &&
            !found.some((c) => Math.hypot(c.x - x, c.y - y) < 46);
        if (clear) {
            found.push({ r, x, y });
        }
    }
    return found;
}

/** A tree's canopy; its trunk is a small solid at the centre. */
export const TREES: Circle[] = scatter(150, 7, 34, 56);

/** Cover that hides whoever stands still inside it. Not solid. */
export const BUSHES: Circle[] = scatter(60, 99, 28, 44).filter(
    (b) => !TREES.some((t) => Math.hypot(t.x - b.x, t.y - b.y) < 30),
);

const TRUNK = 14;

/** What sight stops at: walls and rocks. A tree trunk is too thin to hide behind. */
export const SIGHT_SOLIDS: Rect[] = [...WALLS, ...ROCKS];

/** Everything solid to bodies and bullets. */
export const SOLIDS: Rect[] = [
    ...SIGHT_SOLIDS,
    ...TREES.map((t) => ({
        h: TRUNK,
        w: TRUNK,
        x: t.x - TRUNK / 2,
        y: t.y - TRUNK / 2,
    })),
];

/** One crate stands in every room, off-centre so it never blocks a door. */
export const CRATE_SPOTS: (Point & { tier: number })[] = ROOMS.filter(
    (room) => room.h > 80,
).map((room, i) => ({
    tier: room.tier,
    x: room.x + (i % 2 ? 34 : room.w - 34),
    y: room.y + (i % 3 ? 34 : room.h - 34),
}));

export const ENEMY_POSTS: EnemyPost[] = [
    { kind: 'guard', x: 1460, y: 380 },
    { kind: 'guard', x: 1640, y: 420 },
    { kind: 'guard', x: 1000, y: 365 },
    { kind: 'guard', x: 2080, y: 365 },
    { kind: 'guard', x: 1540, y: 600 },
    { kind: 'drifter', x: 1360, y: 1300 },
    { kind: 'drifter', x: 1560, y: 1330 },
    { kind: 'drifter', x: 1700, y: 1150 },
    { kind: 'drifter', x: 640, y: 1260 },
    { kind: 'drifter', x: 470, y: 1250 },
    { kind: 'drifter', x: 900, y: 1380 },
    { kind: 'drifter', x: 1960, y: 860 },
    { kind: 'drifter', x: 2440, y: 1500 },
    { kind: 'drifter', x: 2560, y: 1640 },
    { kind: 'drifter', x: 2840, y: 1150 },
    { kind: 'marksman', x: 2560, y: 520 },
];

export function roomAt(x: number, y: number): Room | undefined {
    return ROOMS.find((room) => inRect(x, y, room));
}

export function inBush(x: number, y: number): boolean {
    return BUSHES.some((b) => Math.hypot(b.x - x, b.y - y) < b.r);
}
