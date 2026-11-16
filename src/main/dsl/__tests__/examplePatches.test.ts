/**
 * Validates that every patch in `examples/` evaluates to a valid patch: it
 * must run through `executePatchScript` without error and produce a graph
 * that passes the engine's own `validatePatchGraph`.
 */

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { validatePatchGraph } from '@modular/core';
import schemas from '@modular/core/schemas.json';
import { executePatchScript } from '../executor';

const EXAMPLES_DIR = path.resolve(__dirname, '../../../../examples');

const examples = readdirSync(EXAMPLES_DIR)
    .filter((file) => file.endsWith('.js'))
    .toSorted();

describe('every example patch evaluates to a valid patch', () => {
    test('finds the examples', () => {
        expect(examples.length).toBeGreaterThan(0);
    });

    test.each(examples)('%s', (file) => {
        const code = readFileSync(path.join(EXAMPLES_DIR, file), 'utf8');
        const result = executePatchScript(code, schemas, {
            sampleRate: 48_000,
            workspaceRoot: EXAMPLES_DIR,
        });

        expect(validatePatchGraph(result.patch)).toEqual([]);
        expect(result.patch.modules.length).toBeGreaterThan(0);
    });
});
