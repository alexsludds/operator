/** A raid's HUD, minimap and the screens before and after it. */

import { HEAL_SECONDS, MAGAZINE } from './actors';
import { LABEL_FONT, raidZoom } from './draw';
import type { RaidView } from './draw';
import { EXTRACT_SECONDS, RAID_SECONDS } from './sim';
import type { Stash } from './stash';
import type { RaidPhase, RaidState } from './types';
import { EXTRACTS, PIER, ROOMS, WORLD, shorelineY } from './world';

const TITLE_FONT = '700 34px ui-monospace, Menlo, monospace';
const INK = '#e8e6df';
const DIM = 'rgba(232, 230, 223, 0.65)';

function formatClock(seconds: number): string {
    const whole = Math.max(0, Math.ceil(seconds));
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

const money = (value: number) => value.toLocaleString('en-US');

function bar(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    fill: number,
    color: string,
): void {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.fillRect(x, y, width, height);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, width * Math.max(0, Math.min(1, fill)), height);
}

function drawStatus(
    ctx: CanvasRenderingContext2D,
    s: RaidState,
    view: RaidView,
): void {
    const p = s.player;
    const top = view.height - 98;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(12, top, 236, 86);
    bar(
        ctx,
        22,
        top + 10,
        180,
        10,
        p.hp / 100,
        p.hp > 35 ? '#6fcf7f' : '#e0604f',
    );
    bar(ctx, 22, top + 22, 180, 4, p.armor / 60, '#7fb2e6');
    bar(ctx, 22, top + 28, 180, 4, p.stamina / 100, '#e6d27f');
    ctx.font = LABEL_FONT;
    ctx.textAlign = 'left';
    ctx.fillStyle = INK;
    const weapon =
        p.reloadLeft > 0
            ? 'RELOADING'
            : `${String(p.ammo).padStart(2, '0')}/${MAGAZINE} · ${p.reserve}`;
    ctx.fillText(weapon, 22, top + 50);
    ctx.fillText(`GRENADES ${p.grenades} · MEDKITS ${p.medkits}`, 22, top + 64);
    ctx.fillText(`HAUL ${money(s.loot)} · KILLS ${s.kills}`, 22, top + 78);

    ctx.textAlign = 'center';
    const left = RAID_SECONDS - s.time;
    ctx.fillStyle = left < 90 ? '#ff8a78' : INK;
    ctx.font = '700 16px ui-monospace, Menlo, monospace';
    ctx.fillText(formatClock(left), view.width / 2, 26);
    ctx.font = LABEL_FONT;

    const centre = view.width / 2;
    if (s.extractProgress > 0) {
        ctx.fillStyle = '#9cf0b4';
        ctx.fillText('EXTRACTING', centre, 48);
        bar(
            ctx,
            centre - 80,
            54,
            160,
            6,
            s.extractProgress / EXTRACT_SECONDS,
            '#60dc82',
        );
    } else if (p.healLeft > 0) {
        ctx.fillStyle = INK;
        ctx.fillText('PATCHING UP', centre, 48);
        bar(
            ctx,
            centre - 80,
            54,
            160,
            6,
            1 - p.healLeft / HEAL_SECONDS,
            '#6fcf7f',
        );
    }
}

/** An arrow at the screen's edge for each extract out of view. */
function drawExtractMarkers(
    ctx: CanvasRenderingContext2D,
    s: RaidState,
    view: RaidView,
): void {
    const zoom = raidZoom(view);
    const reach = Math.min(view.width, view.height) / 2 - 46;
    for (const zone of EXTRACTS) {
        const dx = zone.x - s.player.x;
        const dy = zone.y - s.player.y;
        const distance = Math.hypot(dx, dy);
        if (distance * zoom < reach) {
            continue;
        }
        const angle = Math.atan2(dy, dx);
        ctx.save();
        ctx.translate(
            view.width / 2 + Math.cos(angle) * reach,
            view.height / 2 + Math.sin(angle) * reach,
        );
        ctx.fillStyle = '#9cf0b4';
        ctx.font = LABEL_FONT;
        ctx.textAlign = 'center';
        ctx.fillText(`${zone.name} ${Math.round(distance / 10)}m`, 0, 24);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(12, 0);
        ctx.lineTo(-6, -7);
        ctx.lineTo(-6, 7);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }
}

function drawMinimap(
    ctx: CanvasRenderingContext2D,
    s: RaidState,
    view: RaidView,
): void {
    const scale = 0.055;
    const width = WORLD.width * scale;
    const height = WORLD.height * scale;
    ctx.save();
    ctx.translate(view.width - width - 14, 14);
    ctx.fillStyle = 'rgba(8, 14, 18, 0.72)';
    ctx.fillRect(-4, -4, width + 8, height + 8);
    ctx.scale(scale, scale);

    ctx.fillStyle = '#37503a';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(WORLD.width, 0);
    for (let x = WORLD.width; x >= 0; x -= 160) {
        ctx.lineTo(x, shorelineY(x));
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#8f7a5c';
    ctx.fillRect(PIER.x - 10, PIER.y, PIER.w + 20, PIER.h);
    ctx.fillStyle = '#9a9488';
    for (const room of ROOMS) {
        ctx.fillRect(room.x, room.y, room.w, room.h);
    }
    ctx.fillStyle = '#60dc82';
    for (const zone of EXTRACTS) {
        ctx.beginPath();
        ctx.arc(zone.x, zone.y, 70, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(s.player.x, s.player.y, 44, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

export function drawHud(
    ctx: CanvasRenderingContext2D,
    s: RaidState,
    view: RaidView,
    scored: boolean,
): void {
    drawExtractMarkers(ctx, s, view);
    drawStatus(ctx, s, view);
    drawMinimap(ctx, s, view);
    ctx.font = LABEL_FONT;
    ctx.textAlign = 'right';
    ctx.fillStyle = DIM;
    ctx.fillText(
        scored ? '' : 'Silent raid · M loads the soundtrack',
        view.width - 14,
        view.height - 14,
    );
}

const CONTROLS = [
    'WASD move · Shift sprint · Mouse aim · Click fire',
    'R reload · G grenade · Q medkit · hold E search',
    'Bushes hide you while you stand still. Sprinting and gunfire carry.',
    'Reach an EXFIL and hold it to keep what you carry.',
];

function shade(
    ctx: CanvasRenderingContext2D,
    view: RaidView,
    alpha: number,
): void {
    ctx.fillStyle = `rgba(4, 8, 11, ${alpha})`;
    ctx.fillRect(0, 0, view.width, view.height);
}

export function drawBriefing(
    ctx: CanvasRenderingContext2D,
    view: RaidView,
    stash: Stash,
    scored: boolean,
): void {
    shade(ctx, view, 0.78);
    const x = view.width / 2;
    let y = view.height / 2 - 130;
    ctx.textAlign = 'center';
    ctx.fillStyle = INK;
    ctx.font = TITLE_FONT;
    ctx.fillText('KELP POINT', x, y);
    ctx.font = LABEL_FONT;
    ctx.fillStyle = DIM;
    ctx.fillText(
        'A raid on the coast. Go in, take what you can, get out.',
        x,
        (y += 28),
    );

    ctx.fillStyle = '#ffe08a';
    ctx.fillText(
        `STASH ${money(stash.stash)} · ${stash.survived}/${stash.raids} raids survived · best haul ${money(stash.best)}`,
        x,
        (y += 40),
    );
    ctx.fillStyle = INK;
    y += 16;
    for (const line of CONTROLS) {
        ctx.fillText(line, x, (y += 20));
    }
    ctx.fillStyle = scored ? '#9cf0b4' : '#ffb347';
    ctx.fillText(
        scored
            ? 'Soundtrack running: the engine plays every shot and step'
            : 'No soundtrack running · press M to load and play it',
        x,
        (y += 40),
    );
    ctx.fillStyle = INK;
    ctx.font = '700 16px ui-monospace, Menlo, monospace';
    ctx.fillText('ENTER to deploy · ESC to leave', x, (y += 40));
}

const ENDINGS: Record<Exclude<RaidPhase, 'raid'>, string> = {
    dead: 'KILLED IN ACTION',
    extracted: 'EXTRACTED',
    mia: 'MISSING IN ACTION',
};

export function drawEnding(
    ctx: CanvasRenderingContext2D,
    s: RaidState,
    view: RaidView,
    stash: Stash,
): void {
    if (s.phase === 'raid') {
        return;
    }
    shade(ctx, view, 0.72);
    const x = view.width / 2;
    const y = view.height / 2;
    const survived = s.phase === 'extracted';
    ctx.textAlign = 'center';
    ctx.fillStyle = survived ? '#9cf0b4' : '#ff8a78';
    ctx.font = TITLE_FONT;
    ctx.fillText(ENDINGS[s.phase], x, y - 40);
    ctx.font = LABEL_FONT;
    ctx.fillStyle = INK;
    ctx.fillText(
        survived
            ? `Haul ${money(s.loot)} banked`
            : `Haul ${money(s.loot)} lost with you`,
        x,
        y - 6,
    );
    ctx.fillText(
        `Kills ${s.kills} · ${formatClock(s.time)} in raid`,
        x,
        y + 14,
    );
    ctx.fillStyle = '#ffe08a';
    ctx.fillText(`STASH ${money(stash.stash)}`, x, y + 40);
    ctx.fillStyle = INK;
    ctx.fillText('ENTER to redeploy · ESC to leave', x, y + 70);
}
