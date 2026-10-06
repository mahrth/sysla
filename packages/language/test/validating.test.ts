import { describe, expect, test } from 'vitest';
import { parseModel } from './helpers.js';

async function errorMessages(text: string): Promise<string[]> {
    const document = await parseModel(text);
    expect(document.parseResult.parserErrors).toHaveLength(0);
    return (document.diagnostics ?? []).filter(diagnostic => diagnostic.severity === 1).map(diagnostic => diagnostic.message);
}

describe('Validating connections', () => {
    test.each([
        ['Output Data', 'Input Data', true],
        ['Input Data', 'Output Data', true],
        ['Bidirectional Data', 'Bidirectional Data', true],
        ['', '', true],
        ['Output Data', 'Output Data', false],
        ['Input Data', 'Input Data', false],
        ['Output Data', 'Input Other', false],
        ['Bidirectional Data', 'Input Data', false],
        ['Output Data', '', false]
    ])('%s to %s: valid=%s', async (source, sink, valid) => {
        const errors = await errorMessages(`
            Signal Data
            Signal Other
            Component Source Port P ${source}
            Component Sink Port P ${sink}
            Component Root
                Part Source as source
                Part Sink as sink
                Connection source:P - sink:P
        `);
        expect(errors.length === 0).toBe(valid);
    });

    test('rejects multiple connections to one instance port', async () => {
        const errors = await errorMessages(`
            Signal Data
            Component Source Port P Output Data
            Component Sink Port P Input Data
            Component Root
                Part Source as source
                Part Sink as a
                Part Sink as b
                Connection source:P - a:P
                Connection source:P - b:P
        `);
        expect(errors).toContain('Port ist mehrfach verbunden.');
    });

    test('allows the same port on separate instances', async () => {
        const errors = await errorMessages(`
            Signal Data
            Component Source Port P Output Data
            Component Sink Port P Input Data
            Component Root
                Part Source as source1
                Part Source as source2
                Part Sink as a
                Part Sink as b
                Connection source1:P - a:P
                Connection source2:P - b:P
        `);
        expect(errors).toHaveLength(0);
    });

    test.each([
        ['Connection a_b:c - x:P', 'Connection a:b_c - y:P'],
        ['Connection x:P - a_b:c', 'Connection y:P - a:b_c']
    ])('distinguishes underscore-containing endpoint names: %s; %s', async (first, second) => {
        const errors = await errorMessages(`
            Component Device Port c Port b_c
            Component Peer Port P
            Component Root
                Part Device as a_b
                Part Device as a
                Part Peer as x
                Part Peer as y
                ${first}
                ${second}
        `);
        expect(errors).toHaveLength(0);
    });

    test('rejects reuse of an underscore-containing endpoint on either connection side', async () => {
        const errors = await errorMessages(`
            Component Device Port data_port
            Component Root
                Part Device as source_device
                Part Device as a
                Part Device as b
                Connection source_device:data_port - a:data_port
                Connection b:data_port - source_device:data_port
        `);
        expect(errors).toEqual(['Port ist mehrfach verbunden.']);
    });
});

describe('Validating delegations', () => {
    test.each([
        ['Input Data', 'Input Data', true],
        ['Output Data', 'Output Data', true],
        ['Bidirectional Data', 'Bidirectional Data', true],
        ['', '', true],
        ['Input Data', 'Output Data', false],
        ['Output Data', 'Input Data', false],
        ['Input Data', 'Input Other', false],
        ['Bidirectional Data', 'Input Data', false]
    ])('%s to %s: valid=%s', async (outer, inner, valid) => {
        const errors = await errorMessages(`
            Signal Data
            Signal Other
            Component Leaf Port P ${inner}
            Component Root
                Port P ${outer}
                Part Leaf as leaf
                Delegation P - leaf:P
        `);
        expect(errors.length === 0).toBe(valid);
    });

    test('rejects delegating a port that is already connected', async () => {
        const errors = await errorMessages(`
            Signal Data
            Component Source Port P Output Data
            Component Sink Port P Input Data
            Component Root
                Port P Input Data
                Part Source as source
                Part Sink as sink
                Connection source:P - sink:P
                Delegation P - sink:P
        `);
        expect(errors).toContain('Port ist mehrfach verbunden.');
    });

    test('rejects multiple delegations of the same external port', async () => {
        const errors = await errorMessages(`
            Signal Data
            Component Sink Port P Input Data
            Component Root
                Port P Input Data
                Part Sink as a
                Part Sink as b
                Delegation P - a:P
                Delegation P - b:P
        `);
        expect(errors).toContain('Port ist mehrfach verbunden.');
    });

    test('distinguishes underscore-containing endpoints of separate delegations', async () => {
        const errors = await errorMessages(`
            Component Device Port c Port b_c
            Component Root
                Port First Port Second
                Part Device as a_b
                Part Device as a
                Delegation First - a_b:c
                Delegation Second - a:b_c
        `);
        expect(errors).toHaveLength(0);
    });

    test('allows delegating the same port definition on separate instances', async () => {
        const errors = await errorMessages(`
            Component Device Port data_port
            Component Root
                Port First Port Second
                Part Device as a
                Part Device as b
                Delegation First - a:data_port
                Delegation Second - b:data_port
        `);
        expect(errors).toHaveLength(0);
    });

    test('distinguishes underscore-containing endpoints across a connection and a delegation', async () => {
        const errors = await errorMessages(`
            Component Device Port c Port b_c
            Component Peer Port P
            Component Root
                Port External
                Part Device as a_b
                Part Device as a
                Part Peer as peer
                Connection a_b:c - peer:P
                Delegation External - a:b_c
        `);
        expect(errors).toHaveLength(0);
    });

    test('rejects multiple delegations to an underscore-containing instance port', async () => {
        const errors = await errorMessages(`
            Component Device Port data_port
            Component Root
                Port First Port Second
                Part Device as child_device
                Delegation First - child_device:data_port
                Delegation Second - child_device:data_port
        `);
        expect(errors).toEqual(['Port ist mehrfach verbunden.']);
    });

    test('rejects connecting and delegating the same underscore-containing endpoint', async () => {
        const errors = await errorMessages(`
            Component Device Port data_port
            Component Root
                Port External
                Part Device as child_device
                Part Device as peer
                Connection peer:data_port - child_device:data_port
                Delegation External - child_device:data_port
        `);
        expect(errors).toEqual(['Port ist mehrfach verbunden.']);
    });
});
