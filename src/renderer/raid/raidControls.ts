/**
 * Binds a raid to the running patch. The patch declares sliders and buttons
 * in a `Raid` control group; the game rides the sliders and presses the
 * buttons, so the engine synthesizes every sound of the raid. A live edit
 * goes straight to each control's signal module and leaves the source alone.
 */

import type { ButtonDefinition } from '../../shared/dsl/buttonTypes';
import { GATE_HIGH_VOLTAGE } from '../../shared/dsl/buttonTypes';
import { controlParams, gateParams } from '../../shared/dsl/controlRanges';
import type { SliderDefinition } from '../../shared/dsl/sliderTypes';
import type { RaidEvent, RaidEventType, RaidMusic } from './types';
import type { Point } from './world';

export const RAID_GROUP = 'Raid';

export interface RaidControls {
    sliders: Map<string, SliderDefinition>;
    buttons: Map<string, ButtonDefinition>;
}

export type SetModuleParam = (
    moduleId: string,
    moduleType: string,
    params: Record<string, unknown>,
) => void;

/** Sliders move the engine only once they have changed by this much. */
const SLIDER_STEP = 0.05;
/** How long a pressed button stays down: long enough to be a clean edge. */
const PRESS_MS = 35;
/** World units of sideways offset per volt of pan, and of distance per volt. */
const BEARING_SCALE = 110;
const RANGE_SCALE = 150;

/** The button each event presses. Events without one make no sound. */
const EVENT_BUTTONS: Partial<Record<RaidEventType, string>> = {
    blast: 'Blast',
    enemyShot: 'Incoming',
    hurt: 'Hurt',
    kill: 'Kill',
    loot: 'Loot',
    reload: 'Reload',
    shot: 'Shot',
    spotted: 'Spotted',
    squad: 'Spotted',
    step: 'Step',
    thunder: 'Thunder',
};

export function findRaidControls(
    sliders: SliderDefinition[],
    buttons: ButtonDefinition[],
): RaidControls {
    const inGroup = (c: { group: string[] }) => c.group[0] === RAID_GROUP;
    return {
        buttons: new Map(buttons.filter(inGroup).map((b) => [b.label, b])),
        sliders: new Map(sliders.filter(inGroup).map((s) => [s.label, s])),
    };
}

export function hasRaidControls(controls: RaidControls): boolean {
    return controls.sliders.size + controls.buttons.size > 0;
}

function setSlider(
    controls: RaidControls,
    label: string,
    value: number,
    setModuleParam: SetModuleParam,
): void {
    const slider = controls.sliders.get(label);
    if (slider) {
        const clamped = Math.max(slider.min, Math.min(slider.max, value));
        setModuleParam(
            slider.moduleId,
            '$signal',
            controlParams(slider, clamped),
        );
    }
}

function setGate(
    controls: RaidControls,
    label: string,
    high: boolean,
    setModuleParam: SetModuleParam,
): void {
    const button = controls.buttons.get(label);
    if (button) {
        setModuleParam(
            button.moduleId,
            '$signal',
            gateParams(high ? GATE_HIGH_VOLTAGE : 0),
        );
    }
}

/**
 * Send what changed between `previous` and `next` to the engine. A `null`
 * `previous` sends everything.
 */
export function sendRaidMusic(
    controls: RaidControls,
    next: RaidMusic,
    previous: RaidMusic | null,
    setModuleParam: SetModuleParam,
): void {
    for (const [label, key] of [
        ['Stress', 'stress'],
        ['Storm', 'storm'],
    ] as const) {
        if (!previous || Math.abs(previous[key] - next[key]) >= SLIDER_STEP) {
            setSlider(controls, label, next[key], setModuleParam);
        }
    }
    for (const [label, key] of [
        ['Contact', 'contact'],
        ['Extract', 'extract'],
        ['Indoors', 'indoors'],
    ] as const) {
        if (!previous || previous[key] !== next[key]) {
            setGate(controls, label, next[key], setModuleParam);
        }
    }
}

/** Buttons currently held down by a press, by module. */
const pressed = new Map<string, ReturnType<typeof setTimeout>>();

function press(
    controls: RaidControls,
    label: string,
    setModuleParam: SetModuleParam,
): void {
    const button = controls.buttons.get(label);
    // A button still down cannot make a second edge.
    if (!button || pressed.has(button.moduleId)) {
        return;
    }
    setGate(controls, label, true, setModuleParam);
    pressed.set(
        button.moduleId,
        setTimeout(() => {
            pressed.delete(button.moduleId);
            setGate(controls, label, false, setModuleParam);
        }, PRESS_MS),
    );
}

/** Press the button for each of this step's events, as heard from `ear`. */
export function playRaidEvents(
    controls: RaidControls,
    events: RaidEvent[],
    ear: Point,
    setModuleParam: SetModuleParam,
): void {
    for (const event of events) {
        const label = EVENT_BUTTONS[event.type];
        if (!label) {
            continue;
        }
        if (event.type === 'enemyShot') {
            setSlider(
                controls,
                'Bearing',
                (event.x - ear.x) / BEARING_SCALE,
                setModuleParam,
            );
            setSlider(
                controls,
                'Range',
                Math.hypot(event.x - ear.x, event.y - ear.y) / RANGE_SCALE,
                setModuleParam,
            );
        }
        press(controls, label, setModuleParam);
    }
}
