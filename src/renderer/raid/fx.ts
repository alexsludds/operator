/** Short-lived visuals answering a raid's events: sparks, shake and text. */

import type { RaidEvent } from './types';

export interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    span: number;
    size: number;
    color: string;
}

export interface Floater {
    x: number;
    y: number;
    life: number;
    text: string;
    color: string;
}

export interface Fx {
    particles: Particle[];
    floaters: Floater[];
    /** Screen shake and full-screen flash, each decaying from 1 to 0. */
    shake: number;
    flash: number;
}

export function createFx(): Fx {
    return { flash: 0, floaters: [], particles: [], shake: 0 };
}

function burst(
    fx: Fx,
    event: RaidEvent,
    count: number,
    color: string,
    speed: number,
    span: number,
    cone = Math.PI,
): void {
    for (let i = 0; i < count; i++) {
        const angle = (event.angle ?? 0) + (Math.random() - 0.5) * 2 * cone;
        const v = speed * (0.3 + Math.random() * 0.7);
        fx.particles.push({
            color,
            life: span,
            size: 1.5 + Math.random() * 2.5,
            span: span * (0.5 + Math.random() * 0.5),
            vx: Math.cos(angle) * v,
            vy: Math.sin(angle) * v,
            x: event.x,
            y: event.y,
        });
    }
}

export function feedFx(fx: Fx, events: RaidEvent[]): void {
    for (const event of events) {
        switch (event.type) {
            case 'shot':
            case 'enemyShot':
                burst(fx, event, 5, '#ffe9a3', 420, 0.07, 0.35);
                break;
            case 'impact':
                burst(
                    fx,
                    { ...event, angle: (event.angle ?? 0) + Math.PI },
                    5,
                    '#d8d2c2',
                    190,
                    0.25,
                    0.9,
                );
                break;
            case 'enemyHit':
                burst(fx, event, 8, '#b3261e', 230, 0.4, 0.6);
                break;
            case 'hurt':
                burst(fx, event, 8, '#d0342c', 200, 0.35);
                fx.shake = Math.max(fx.shake, 0.55);
                break;
            case 'blast':
                burst(fx, event, 46, '#ffb347', 520, 0.5);
                burst(fx, event, 30, '#55504a', 260, 1.1);
                fx.shake = 1;
                fx.flash = Math.max(fx.flash, 0.35);
                break;
            case 'thunder':
                fx.flash = Math.max(fx.flash, 0.7);
                break;
            case 'loot':
                fx.floaters.push({
                    color: '#ffe08a',
                    life: 1.6,
                    text: event.text ?? '',
                    x: event.x,
                    y: event.y,
                });
                break;
            case 'spotted':
                fx.floaters.push({
                    color: '#ff8a78',
                    life: 1,
                    text: 'SPOTTED',
                    x: event.x,
                    y: event.y - 20,
                });
                break;
            default:
                break;
        }
    }
}

export function stepFx(fx: Fx, dt: number): void {
    for (const p of fx.particles) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 1 - 4 * dt;
        p.vy *= 1 - 4 * dt;
        p.life -= dt;
    }
    fx.particles = fx.particles.filter((p) => p.life > 0);
    for (const f of fx.floaters) {
        f.y -= 26 * dt;
        f.life -= dt;
    }
    fx.floaters = fx.floaters.filter((f) => f.life > 0);
    fx.shake = Math.max(0, fx.shake - dt * 2.4);
    fx.flash = Math.max(0, fx.flash - dt * 2);
}
