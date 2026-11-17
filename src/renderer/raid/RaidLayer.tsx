import { useEffect, useRef } from 'react';
import type { ButtonDefinition } from '../../shared/dsl/buttonTypes';
import type { SliderDefinition } from '../../shared/dsl/sliderTypes';
import { drawScene, raidZoom } from './draw';
import type { RaidLayers } from './draw';
import { createFx, feedFx, stepFx } from './fx';
import { drawBriefing, drawEnding, drawHud } from './hud';
import {
    findRaidControls,
    hasRaidControls,
    playRaidEvents,
    sendRaidMusic,
} from './raidControls';
import type { SetModuleParam } from './raidControls';
import { createRaid, raidMusic, stepRaid } from './sim';
import { readStash, settleRaid, writeStash } from './stash';
import { paintTerrain } from './terrain';
import type { RaidMusic } from './types';
import './raid.css';

interface RaidLayerProps {
    sliders: SliderDefinition[];
    buttons: ButtonDefinition[];
    setModuleParam: SetModuleParam;
    /** Open the raid's soundtrack patch and run it. */
    onLoadSoundtrack: () => void;
    onClose: () => void;
}

/** The longest step the simulation takes, so a stalled frame cannot tunnel. */
const MAX_STEP = 0.05;
const MUSIC_INTERVAL_MS = 100;

const CALM: RaidMusic = {
    contact: false,
    extract: false,
    indoors: false,
    storm: 1,
    stress: 0,
};

/**
 * A playable raid over the editor. The game owns the keyboard while it is
 * focused, and plays the running patch's `Raid` controls as it goes.
 */
export function RaidLayer({
    sliders,
    buttons,
    setModuleParam,
    onLoadSoundtrack,
    onClose,
}: RaidLayerProps) {
    const rootRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const controlsRef = useRef(findRaidControls([], []));
    const sentRef = useRef<RaidMusic | null>(null);
    const propsRef = useRef({ onClose, onLoadSoundtrack, setModuleParam });

    useEffect(() => {
        controlsRef.current = findRaidControls(sliders, buttons);
        // A patch update makes new signal modules, which have heard nothing.
        sentRef.current = null;
    }, [sliders, buttons]);

    useEffect(() => {
        propsRef.current = { onClose, onLoadSoundtrack, setModuleParam };
    }, [onClose, onLoadSoundtrack, setModuleParam]);

    useEffect(() => {
        const root = rootRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!root || !canvas || !ctx) {
            return;
        }

        let raid = createRaid(Date.now());
        let fx = createFx();
        let stash = readStash();
        let briefing = true;
        let settled = false;
        const layers: RaidLayers = {
            fog: document.createElement('canvas'),
            terrain: paintTerrain(),
        };
        const held = new Set<string>();
        const pressed = new Set<string>();
        const mouse = { down: false, x: 0, y: 0 };
        const view = { height: 1, width: 1 };

        const resize = () => {
            const ratio = window.devicePixelRatio || 1;
            view.width = Math.max(1, root.clientWidth);
            view.height = Math.max(1, root.clientHeight);
            canvas.width = Math.round(view.width * ratio);
            canvas.height = Math.round(view.height * ratio);
            layers.fog.width = view.width;
            layers.fog.height = view.height;
            ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
            mouse.x = view.width / 2 + 60;
            mouse.y = view.height / 2;
        };
        const observer = new ResizeObserver(resize);
        observer.observe(root);
        resize();

        const deploy = () => {
            raid = createRaid(Date.now());
            fx = createFx();
            briefing = false;
            settled = false;
        };

        const onKeyDown = (event: KeyboardEvent) => {
            // The game keeps every key from the editor and its shortcuts.
            event.stopPropagation();
            event.preventDefault();
            const key = event.key.toLowerCase();
            if (key === 'escape') {
                propsRef.current.onClose();
            } else if (key === 'm') {
                propsRef.current.onLoadSoundtrack();
                // Opening the patch hands focus to the editor; take it back.
                for (const delay of [300, 1200]) {
                    setTimeout(() => root.focus(), delay);
                }
            } else if (key === 'enter' && (briefing || raid.phase !== 'raid')) {
                deploy();
            } else if (!event.repeat) {
                held.add(key);
                pressed.add(key);
            }
        };
        const onKeyUp = (event: KeyboardEvent) => {
            event.stopPropagation();
            held.delete(event.key.toLowerCase());
        };
        const onMouseMove = (event: MouseEvent) => {
            const bounds = canvas.getBoundingClientRect();
            mouse.x = event.clientX - bounds.left;
            mouse.y = event.clientY - bounds.top;
        };
        const onMouseDown = (event: MouseEvent) => {
            event.preventDefault();
            root.focus();
            mouse.down = true;
        };
        const onMouseUp = () => {
            mouse.down = false;
        };
        const onBlur = () => {
            held.clear();
            mouse.down = false;
        };
        root.addEventListener('keydown', onKeyDown);
        root.addEventListener('keyup', onKeyUp);
        root.addEventListener('mousemove', onMouseMove);
        root.addEventListener('mousedown', onMouseDown);
        root.addEventListener('blur', onBlur);
        window.addEventListener('mouseup', onMouseUp);
        root.focus();

        let frame = 0;
        let last = performance.now();
        let musicAt = 0;
        const tick = (now: number) => {
            frame = requestAnimationFrame(tick);
            const dt = Math.min(MAX_STEP, (now - last) / 1000);
            last = now;
            const controls = controlsRef.current;
            const { setModuleParam: send } = propsRef.current;

            if (!briefing) {
                const zoom = raidZoom(view);
                const axis = (negative: string, positive: string) =>
                    (held.has(positive) ? 1 : 0) - (held.has(negative) ? 1 : 0);
                stepRaid(
                    raid,
                    {
                        aimX: raid.player.x + (mouse.x - view.width / 2) / zoom,
                        aimY:
                            raid.player.y + (mouse.y - view.height / 2) / zoom,
                        fire: mouse.down,
                        grenade: pressed.has('g'),
                        heal: pressed.has('q'),
                        interact: held.has('e'),
                        moveX: axis('a', 'd'),
                        moveY: axis('w', 's'),
                        reload: pressed.has('r'),
                        sprint: held.has('shift'),
                    },
                    dt,
                );
                feedFx(fx, raid.events);
                playRaidEvents(controls, raid.events, raid.player, send);
                if (raid.phase !== 'raid' && !settled) {
                    settled = true;
                    stash = settleRaid(stash, raid);
                    writeStash(stash);
                }
            }
            pressed.clear();
            stepFx(fx, dt);

            const scored = hasRaidControls(controls);
            drawScene(ctx, raid, view, fx, layers);
            if (briefing) {
                drawBriefing(ctx, view, stash, scored);
            } else {
                drawHud(ctx, raid, view, scored, fx);
                drawEnding(ctx, raid, view, stash);
            }

            if (now - musicAt >= MUSIC_INTERVAL_MS) {
                musicAt = now;
                const music = briefing ? CALM : raidMusic(raid);
                sendRaidMusic(controls, music, sentRef.current, send);
                sentRef.current = music;
            }
        };
        frame = requestAnimationFrame(tick);

        return () => {
            cancelAnimationFrame(frame);
            observer.disconnect();
            root.removeEventListener('keydown', onKeyDown);
            root.removeEventListener('keyup', onKeyUp);
            root.removeEventListener('mousemove', onMouseMove);
            root.removeEventListener('mousedown', onMouseDown);
            root.removeEventListener('blur', onBlur);
            window.removeEventListener('mouseup', onMouseUp);
            sendRaidMusic(
                controlsRef.current,
                CALM,
                null,
                propsRef.current.setModuleParam,
            );
        };
    }, []);

    return (
        <div className="raid-layer" ref={rootRef} tabIndex={0}>
            <canvas className="raid-canvas" ref={canvasRef} />
        </div>
    );
}
