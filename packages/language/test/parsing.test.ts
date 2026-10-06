import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { parseModel } from './helpers.js';

describe('Parsing SysLa', () => {
    test('parses signals, port directions, subports, and comments', async () => {
        const document = await parseModel(`
            // Component interfaces
            Signal Data
            /* A reusable endpoint */
            Component Endpoint
                Port InputPort Input Data
                Port OutputPort Output Data
                Port Socket [Port Ethernet] Bidirectional Data
                Port Screw
        `);
        expect(document.parseResult.lexerErrors).toHaveLength(0);
        expect(document.parseResult.parserErrors).toHaveLength(0);
        expect(document.diagnostics).toHaveLength(0);
        const component = document.parseResult.value.components[0];
        expect(component.name).toBe('Endpoint');
        expect(component.ports[2].bidirectional).toBe(true);
        expect(component.ports[2].port.subports[0].name).toBe('Ethernet');
        expect(component.ports[3].signal).toBeUndefined();
    });

    test.each(['Demo1', 'Computer'])('parses and validates the %s example', async example => {
        const text = readFileSync(new URL(`../../../demos/${example}/${example}.sysla`, import.meta.url), 'utf8');
        const document = await parseModel(text);
        expect(document.parseResult.parserErrors).toHaveLength(0);
        expect(document.diagnostics).toHaveLength(0);
        expect(document.parseResult.value.components.some(component => component.name === 'Supersystem')).toBe(true);
    });

    test('rejects keywords from the older German grammar', async () => {
        const document = await parseModel('Komponente Device');
        expect(document.parseResult.parserErrors.length).toBeGreaterThan(0);
    });

    test('requires a signal type after a port direction', async () => {
        const document = await parseModel('Component Device Port P Input');
        expect(document.parseResult.parserErrors.length).toBeGreaterThan(0);
    });
});
