import { describe, expect, test, vi } from 'vitest';
import { MAGAZINE } from '../actors';
import { PLAYER_RADIUS } from '../combat';
import {
    hasLineOfSight,
    isBlocked,
    nextWaypoint,
    visibilityFan,
} from '../geometry';
import {
    findRaidControls,
    playRaidEvents,
    sendRaidMusic,
} from '../raidControls';
import {
    EXTRACT_SECONDS,
    RAID_SECONDS,
    SQUAD_LANDS,
    createRaid,
    raidMusic,
    stepRaid,
} from '../sim';
import { settleRaid } from '../stash';
import { isSquad } from '../types';
import type { RaidInput, RaidState } from '../types';
import {
    BUSHES,
    CRATE_SPOTS,
    ENEMY_POSTS,
    EXTRACTS,
    PLAYER_SPAWNS,
    ROOMS,
    SQUAD_ROUTE,
    SQUAD_SPAWN,
    STAIRS,
    inCellars,
} from '../world';

const IDLE: RaidInput = {
    aimX: 0,
    aimY: 0,
    fire: false,
    grenade: false,
    heal: false,
    interact: false,
    moveX: 0,
    moveY: 0,
    reload: false,
    sprint: false,
};

const STEP = 1 / 60;

function run(s: RaidState, input: RaidInput, seconds: number): void {
    for (let t = 0; t < seconds; t += STEP) {
        stepRaid(s, input, STEP);
    }
}

/** A raid with nobody else in it, so only the player's actions matter. */
function emptyRaid(): RaidState {
    const s = createRaid(1);
    s.enemies = [];
    return s;
}

/** A raid holding one enemy of `kind`, with the player placed near it. */
function duel(kind: string, dx: number, dy: number): RaidState {
    const s = createRaid(5);
    const enemy = s.enemies.find((e) => e.kind === kind)!;
    s.enemies = [enemy];
    s.player.x = enemy.x + dx;
    s.player.y = enemy.y + dy;
    return s;
}

describe('the map', () => {
    test('every place someone starts or goes is open ground', () => {
        const spots = [
            ...PLAYER_SPAWNS,
            ...CRATE_SPOTS,
            ...ENEMY_POSTS,
            ...EXTRACTS,
            ...STAIRS,
            ...SQUAD_ROUTE,
            SQUAD_SPAWN,
        ];
        for (const spot of spots) {
            expect(
                isBlocked(spot.x, spot.y, PLAYER_RADIUS),
                JSON.stringify(spot),
            ).toBe(false);
        }
    });

    test('the sea is closed and the pier is open', () => {
        expect(isBlocked(600, 2100, PLAYER_RADIUS)).toBe(true);
        expect(isBlocked(2632, 2030, PLAYER_RADIUS)).toBe(false);
    });

    test('every room can be walked into from a spawn', () => {
        for (const room of ROOMS) {
            const inside = { x: room.x + room.w / 2, y: room.y + room.h / 2 };
            const outside = { x: room.x + room.w / 2, y: room.y - 60 };
            expect(
                nextWaypoint(outside, inside),
                `${room.kind} at ${room.x},${room.y}`,
            ).not.toBeNull();
        }
    });

    test('every extract can be walked to from every spawn', () => {
        for (const spawn of PLAYER_SPAWNS) {
            for (const zone of EXTRACTS) {
                const at = { ...spawn };
                let steps = 0;
                while (Math.hypot(zone.x - at.x, zone.y - at.y) > 40) {
                    const way = nextWaypoint(at, zone);
                    expect(
                        way,
                        `${spawn.x},${spawn.y} to ${zone.name}`,
                    ).not.toBeNull();
                    at.x = way!.x;
                    at.y = way!.y;
                    expect(steps++).toBeLessThan(2000);
                }
            }
        }
    });

    test('a wall blocks sight and a doorway does not', () => {
        const hall = ROOMS[0];
        const inside = { x: hall.x + hall.w / 2, y: hall.y + hall.h - 30 };
        // The hall's main door is in its south wall, 210 along, 60 wide.
        expect(
            hasLineOfSight(
                inside.x,
                inside.y,
                hall.x + 240,
                hall.y + hall.h + 80,
            ),
        ).toBe(true);
        expect(
            hasLineOfSight(
                inside.x,
                inside.y,
                hall.x + 60,
                hall.y + hall.h + 80,
            ),
        ).toBe(false);
    });

    test('the view from inside a room stays inside its walls', () => {
        const room = ROOMS.find((r) => r.kind === 'house')!;
        const fan = visibilityFan(
            room.x + room.w / 2,
            room.y + room.h / 2,
            640,
        );
        let outside = 0;
        for (let i = 0; i < fan.length; i += 2) {
            const far =
                fan[i] < room.x - 20 ||
                fan[i] > room.x + room.w + 20 ||
                fan[i + 1] < room.y - 20 ||
                fan[i + 1] > room.y + room.h + 20;
            outside += far ? 1 : 0;
        }
        expect(outside).toBeGreaterThan(0);
        expect(outside).toBeLessThan(fan.length / 4);
    });
});

describe('a raid', () => {
    test('plays out the same from the same seed and inputs', () => {
        const a = createRaid(42);
        const b = createRaid(42);
        const input = { ...IDLE, aimX: 900, aimY: 900, fire: true, moveX: 1 };
        run(a, input, 20);
        run(b, input, 20);
        expect(a).toEqual(b);
    });

    test('firing spends the magazine, is heard, and reads as contact', () => {
        const s = emptyRaid();
        expect(raidMusic(s).contact).toBe(false);
        stepRaid(
            s,
            { ...IDLE, aimX: 3000, aimY: s.player.y, fire: true },
            STEP,
        );
        expect(s.events.map((e) => e.type)).toContain('shot');
        expect(s.player.ammo).toBe(MAGAZINE - 1);
        expect(raidMusic(s).contact).toBe(true);
    });

    test('walking makes footsteps and sprinting drains stamina', () => {
        const s = emptyRaid();
        let steps = 0;
        for (let i = 0; i < 120; i++) {
            stepRaid(s, { ...IDLE, moveX: 1, sprint: true }, STEP);
            steps += s.events.filter((e) => e.type === 'step').length;
        }
        expect(steps).toBeGreaterThan(3);
        expect(s.player.stamina).toBeLessThan(60);
    });

    test('a crate must be searched, then gives its loot once', () => {
        const s = emptyRaid();
        const crate = s.crates.find((c) => c.kind === 'valuables')!;
        s.player.x = crate.x + 20;
        s.player.y = crate.y;
        run(s, { ...IDLE, interact: true }, crate.search / 2);
        expect(s.loot).toBe(0);
        run(s, { ...IDLE, interact: true }, crate.search);
        expect(s.loot).toBe(crate.value);
        run(s, { ...IDLE, interact: true }, crate.search * 2);
        expect(s.loot).toBe(crate.value);
    });

    test('a medkit takes time and then heals', () => {
        const s = emptyRaid();
        s.player.hp = 30;
        stepRaid(s, { ...IDLE, heal: true }, STEP);
        expect(s.player.hp).toBe(30);
        run(s, IDLE, 2.2);
        expect(s.player.hp).toBe(80);
        expect(s.player.medkits).toBe(1);
    });

    test('a grenade kills what stands near it and leaves loot', () => {
        const s = duel('drifter', -200, 0);
        const [enemy] = s.enemies;
        const crates = s.crates.length;
        stepRaid(
            s,
            { ...IDLE, aimX: enemy.x, aimY: enemy.y, grenade: true },
            STEP,
        );
        enemy.homeX = enemy.x;
        // Hold the drifter where it stands until the fuse runs out.
        for (let t = 0; t < 2; t += STEP) {
            enemy.x = enemy.homeX;
            stepRaid(s, IDLE, STEP);
        }
        expect(s.kills).toBe(1);
        expect(s.corpses.length).toBe(1);
        expect(s.crates.length).toBe(crates + 1);
    });

    test('an enemy in the open finds and kills a player who stands still', () => {
        const s = duel('drifter', 150, 40);
        const [enemy] = s.enemies;
        expect(hasLineOfSight(enemy.x, enemy.y, s.player.x, s.player.y)).toBe(
            true,
        );
        enemy.facing = Math.atan2(40, 150);
        let spotted = false;
        for (let t = 0; t < 90 && s.phase === 'raid'; t += STEP) {
            stepRaid(s, IDLE, STEP);
            spotted ||= s.events.some((e) => e.type === 'spotted');
        }
        expect(spotted).toBe(true);
        expect(s.phase).toBe('dead');
        expect(raidMusic(s).stress).toBe(5);
    });

    test('an enemy who loses the player comes round to the door after them', () => {
        const s = duel('drifter', 0, 0);
        const [enemy] = s.enemies;
        const house = ROOMS.find((r) => r.kind === 'house')!;
        // The player waits inside; the drifter starts behind a blank wall.
        s.player.x = house.x + house.w / 2;
        s.player.y = house.y + 30;
        enemy.x = house.x + house.w / 2;
        enemy.y = house.y - 60;
        enemy.mode = 'combat';
        enemy.awareness = 1;
        enemy.targetX = s.player.x;
        enemy.targetY = s.player.y;
        const sees = () =>
            hasLineOfSight(enemy.x, enemy.y, s.player.x, s.player.y);
        expect(sees()).toBe(false);
        let found = false;
        for (let t = 0; t < 12 && !found; t += STEP) {
            stepRaid(s, IDLE, STEP);
            enemy.blind = 0;
            found = sees();
        }
        expect(found).toBe(true);
    });

    test('a bush hides a player who keeps still', () => {
        const bush = BUSHES[0];
        const watch = (hidden: boolean) => {
            const s = duel('drifter', 0, 0);
            const [enemy] = s.enemies;
            s.player.x = bush.x + (hidden ? 0 : bush.r + 30);
            s.player.y = bush.y;
            enemy.x = s.player.x + 260;
            enemy.y = s.player.y;
            enemy.homeX = enemy.x;
            enemy.homeY = enemy.y;
            enemy.targetX = enemy.x;
            enemy.targetY = enemy.y;
            enemy.facing = Math.PI;
            enemy.cooldown = 99;
            stepRaid(s, IDLE, STEP);
            return enemy.awareness;
        };
        expect(watch(true)).toBe(0);
    });

    test('holding an extract zone ends the raid extracted and banks the haul', () => {
        const s = emptyRaid();
        s.loot = 12000;
        s.player.x = EXTRACTS[0].x;
        s.player.y = EXTRACTS[0].y;
        run(s, IDLE, EXTRACT_SECONDS - 1);
        expect(s.phase).toBe('raid');
        expect(raidMusic(s).extract).toBe(true);
        run(s, IDLE, 1.1);
        expect(s.phase).toBe('extracted');
        const stash = settleRaid(
            { best: 0, raids: 3, stash: 500, survived: 1 },
            s,
        );
        expect(stash).toEqual({
            best: 12000,
            raids: 4,
            stash: 12500,
            survived: 2,
        });
    });

    test('dying keeps nothing', () => {
        const s = emptyRaid();
        s.loot = 12000;
        s.player.hp = 0;
        stepRaid(s, IDLE, STEP);
        expect(s.phase).toBe('dead');
        expect(
            settleRaid({ best: 0, raids: 0, stash: 500, survived: 0 }, s).stash,
        ).toBe(500);
    });

    test('running out the clock ends the raid missing', () => {
        const s = emptyRaid();
        s.time = RAID_SECONDS - 0.5;
        run(s, IDLE, 1);
        expect(s.phase).toBe('mia');
    });

    test('stairs lead down to the cellars and back, one press each way', () => {
        const s = emptyRaid();
        const [down] = STAIRS;
        s.player.x = down.x;
        s.player.y = down.y;
        run(s, { ...IDLE, interact: true }, 0.4);
        expect(inCellars(s.player.x, s.player.y)).toBe(false);
        // Still holding E after arriving does not climb straight back up.
        run(s, { ...IDLE, interact: true }, 3);
        expect(inCellars(s.player.x, s.player.y)).toBe(true);
        expect(raidMusic(s).indoors).toBe(true);
        run(s, IDLE, 0.1);
        run(s, { ...IDLE, interact: true }, 1);
        expect(inCellars(s.player.x, s.player.y)).toBe(false);
    });

    test('every cellar crate and both stairs can be reached below ground', () => {
        const from = STAIRS[0].to;
        const cellarSpots = [
            STAIRS[2].to,
            ...CRATE_SPOTS.filter((c) => inCellars(c.x, c.y)),
        ];
        expect(cellarSpots.length).toBeGreaterThan(4);
        for (const spot of cellarSpots) {
            expect(
                nextWaypoint(from, spot),
                JSON.stringify(spot),
            ).not.toBeNull();
        }
        // Nothing walks between the cellars and the surface.
        expect(nextWaypoint(from, PLAYER_SPAWNS[0])).toBeNull();
    });

    test('the squad lands as three, then moves on from site to site', () => {
        const s = emptyRaid();
        s.player.x = 150;
        s.player.y = 1690;
        run(s, IDLE, SQUAD_LANDS - 1);
        expect(s.enemies.length).toBe(0);
        run(s, IDLE, 2);
        expect(s.enemies.map((e) => e.kind)).toEqual([
            'captain',
            'spotter',
            'sapper',
        ]);
        expect(s.enemies.every((e) => isSquad(e.kind))).toBe(true);
        const first = s.enemies[0].homeX;
        run(s, IDLE, 50);
        expect(s.enemies[0].homeX).not.toBe(first);
        // By then they have walked well away from where they landed.
        expect(
            Math.hypot(
                s.enemies[0].x - SQUAD_SPAWN.x,
                s.enemies[0].y - SQUAD_SPAWN.y,
            ),
        ).toBeGreaterThan(400);
    });

    test('a sapper in a fight throws grenades', () => {
        const s = emptyRaid();
        s.time = SQUAD_LANDS;
        stepRaid(s, IDLE, STEP);
        const sapper = s.enemies.find((e) => e.kind === 'sapper')!;
        s.enemies = [sapper];
        s.player.x = sapper.x - 260;
        s.player.y = sapper.y + 80;
        s.player.hp = 100000;
        sapper.mode = 'combat';
        sapper.awareness = 1;
        let thrown = false;
        for (let t = 0; t < 6 && !thrown; t += STEP) {
            stepRaid(s, IDLE, STEP);
            thrown = s.grenades.length > 0;
        }
        expect(thrown).toBe(true);
    });

    test('being indoors is reported to the music', () => {
        const s = emptyRaid();
        expect(raidMusic(s).indoors).toBe(false);
        s.player.x = ROOMS[0].x + 100;
        s.player.y = ROOMS[0].y + 100;
        expect(raidMusic(s).indoors).toBe(true);
    });
});

describe('raid controls', () => {
    const slider = (label: string, moduleId: string, min = 0) => ({
        group: ['Raid'],
        label,
        max: 5,
        min,
        moduleId,
        unit: 'number' as const,
        value: 0,
    });
    const button = (
        label: string,
        moduleId: string,
        group = ['Raid', 'Hits'],
    ) => ({
        group,
        label,
        mode: 'gate' as const,
        moduleId,
        value: false,
    });
    const controls = findRaidControls(
        [
            slider('Stress', 's1'),
            slider('Bearing', 's2', -5),
            slider('Range', 's3'),
            { ...slider('Stress', 'other'), group: [] },
        ],
        [
            button('Contact', 'b1', ['Raid']),
            button('Incoming', 'b2'),
            button('Shot', 'b3'),
        ],
    );
    const calm = {
        contact: false,
        extract: false,
        indoors: false,
        storm: 1,
        stress: 1,
    };

    test('binds by label inside the Raid group only', () => {
        expect(controls.sliders.get('Stress')?.moduleId).toBe('s1');
        expect(controls.buttons.get('Shot')?.moduleId).toBe('b3');
        expect(controls.sliders.has('Storm')).toBe(false);
    });

    test('sends everything first, then only what changed', () => {
        const send = vi.fn();
        sendRaidMusic(controls, calm, null, send);
        expect(send).toHaveBeenCalledTimes(2);
        expect(send).toHaveBeenCalledWith('s1', '$signal', {
            max: 5,
            min: 0,
            value: 1,
        });

        send.mockClear();
        sendRaidMusic(controls, { ...calm, stress: 1.01 }, calm, send);
        expect(send).not.toHaveBeenCalled();

        sendRaidMusic(controls, { ...calm, contact: true }, calm, send);
        expect(send).toHaveBeenCalledExactlyOnceWith('b1', '$signal', {
            max: 5,
            min: 0,
            value: 5,
        });
    });

    test('an enemy shot is placed, pressed, and released', () => {
        vi.useFakeTimers();
        const send = vi.fn();
        playRaidEvents(
            controls,
            [
                { type: 'enemyShot', x: 330, y: 0 },
                { type: 'impact', x: 0, y: 0 },
            ],
            { x: 0, y: 0 },
            send,
        );
        expect(send.mock.calls).toEqual([
            ['s2', '$signal', { max: 5, min: -5, value: 3 }],
            ['s3', '$signal', { max: 5, min: 0, value: 2.2 }],
            ['b2', '$signal', { max: 5, min: 0, value: 5 }],
        ]);
        vi.advanceTimersByTime(50);
        expect(send).toHaveBeenLastCalledWith('b2', '$signal', {
            max: 5,
            min: 0,
            value: 0,
        });
        vi.useRealTimers();
    });
});
