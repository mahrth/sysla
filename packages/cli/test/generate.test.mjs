import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const cliPath = fileURLToPath(new URL('../bin/cli.js', import.meta.url));
const demosPath = fileURLToPath(new URL('../../../demos/', import.meta.url));

function generate(t, files, entry = 'Main.sysla', setup = () => {}) {
    const directory = mkdtempSync(path.join(tmpdir(), 'sysla-cli-test-'));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const source = path.join(directory, 'source');
    const output = path.join(directory, 'output');
    mkdirSync(source);
    for (const [name, text] of Object.entries(files)) {
        writeFileSync(path.join(source, name), text);
    }
    setup({ source, output });
    const result = spawnSync(process.execPath, [cliPath, 'generate', path.join(source, entry), '-d', output], {
        encoding: 'utf8',
        timeout: 10000
    });
    assert.ifError(result.error);
    return { ...result, output };
}

function assertRejected(result, file, line) {
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.ok(result.stderr.includes(`${file}:${line}:`), result.stderr);
    assert.doesNotMatch(result.stdout, /generated successfully/i);
    assert.equal(existsSync(result.output), false, 'Invalid input must not create output');
}

function readGraph(filename) {
    const dot = readFileSync(filename, 'utf8');
    const nodes = new Map();
    for (const match of dot.matchAll(/node \[[^\n]*label = < <FONT POINT-SIZE="15">(.*?)<\/FONT><br\/><FONT POINT-SIZE="10">(.*?)<\/FONT> >\]; (ID_\d+);/g)) {
        nodes.set(match[3], { name: match[1], type: match[2] });
    }
    const edges = [...dot.matchAll(/(ID_\d+) -> (ID_\d+)\s*(\[[^\]]*\])?;/g)]
        .map(match => ({ from: match[1], to: match[2], attributes: match[3] ?? '' }));
    assert.ok(nodes.size > 0, dot);
    return { nodes, edges };
}

function portId(graph, parentName, portName) {
    const parent = [...graph.nodes].find(([, node]) => node.name === parentName);
    assert.ok(parent, `Missing component or instance ${parentName}`);
    const port = graph.edges.find(edge => edge.from === parent[0]
        && graph.nodes.get(edge.to)?.name === portName
        && graph.nodes.get(edge.to)?.type.startsWith('Port'));
    assert.ok(port, `Missing port ${parentName}:${portName}`);
    return port.to;
}

function assertSignalConnections(graph, signalName, expectedPairs) {
    const signals = [...graph.nodes].filter(([, node]) => node.type === 'Signal' && node.name === signalName);
    assert.equal(signals.length, expectedPairs.length, 'Each connection must have its own signal node');
    const actualPairs = signals.map(([id]) => graph.edges
        .filter(edge => edge.from === id || edge.to === id)
        .map(edge => edge.from === id ? edge.to : edge.from).sort());
    const expectedIds = expectedPairs.map(pair => pair.map(([instance, port]) => portId(graph, instance, port)).sort());
    assert.deepEqual(actualPairs.sort(), expectedIds.sort(), 'Signal nodes must link only the modeled endpoint pairs');
}

for (const [example, diagramCount] of [['Demo1', 17], ['DemoMulti1', 17], ['Computer', 24]]) {
    test(`generates text and diagrams for ${example}`, t => {
        const files = Object.fromEntries(
            readdirSync(path.join(demosPath, example))
                .filter(name => name.endsWith('.sysla'))
                .map(name => [name, readFileSync(path.join(demosPath, example, name), 'utf8')])
        );
        const result = generate(t, files, `${example}.sysla`);
        assert.equal(result.status, 0, result.stderr);
        assert.equal(result.stderr, '');
        assert.match(result.stdout, /Model artifacts generated successfully/);
        assert.doesNotMatch(result.stdout, /JavaScript code/);
        const modelDirectory = path.join(result.output, example);
        assert.match(readFileSync(path.join(modelDirectory, `${example}.txt`), 'utf8'), /Component: Supersystem/);
        assert.equal(readdirSync(modelDirectory, { recursive: true }).filter(name => name.endsWith('.dot')).length, diagramCount);
        assert.ok(existsSync(path.join(modelDirectory, 'gen-pdfs.sh')));
        if (example === 'Computer') {
            for (const filename of ['Supersystem_Composition.dot', 'Supersystem_Composition_computer.dot']) {
                const graph = readGraph(path.join(modelDirectory, 'Supersystem', filename));
                assertSignalConnections(graph, 'Data', [
                    [['computer:Computer', 'RJ45_1 [Ethernet]'], ['nas1:NAS', 'RJ45 [Ethernet]']],
                    [['computer:Computer', 'RJ45_2 [Ethernet]'], ['nas2:NAS', 'RJ45 [Ethernet]']]
                ]);
                const dataIds = new Set([...graph.nodes].filter(([, node]) => node.type === 'Signal' && node.name === 'Data').map(([id]) => id));
                for (const edge of graph.edges.filter(edge => dataIds.has(edge.from) || dataIds.has(edge.to))) {
                    assert.match(edge.attributes, /dir=none/);
                }
            }
        }
    });
}

test('draws separate directed connections regardless of endpoint order in both composition views', t => {
    const result = generate(t, { 'Main.sysla': `
Signal Data
Component Source
Port P Output Data
Component Sink
Port P Input Data
Component Root
Part Source as a
Part Sink as b
Part Source as c
Part Sink as d
Connection a:P - b:P
Connection d:P - c:P
` });
    assert.equal(result.status, 0, result.stderr);
    const directory = path.join(result.output, 'Main', 'Root');
    for (const [filename, pairs] of [
        ['Root_Composition.dot', [[['a:Source', 'P'], ['b:Sink', 'P']], [['c:Source', 'P'], ['d:Sink', 'P']]]],
        ['Root_Composition_a.dot', [[['a:Source', 'P'], ['b:Sink', 'P']]]],
        ['Root_Composition_d.dot', [[['c:Source', 'P'], ['d:Sink', 'P']]]]
    ]) {
        const graph = readGraph(path.join(directory, filename));
        assertSignalConnections(graph, 'Data', pairs);
        // The direction of the modeled flow is output -> signal -> input.
        const flows = graph.edges.filter(edge => !edge.attributes.includes('dir=none'))
            .map(edge => edge.attributes.includes('dir=back') ? [edge.to, edge.from] : [edge.from, edge.to]);
        for (const [source, sink] of pairs) {
            const sourceId = portId(graph, ...source);
            const sinkId = portId(graph, ...sink);
            const outgoing = flows.filter(([from]) => from === sourceId);
            assert.equal(outgoing.length, 1);
            assert.ok(flows.some(([from, to]) => from === outgoing[0][1] && to === sinkId));
            assert.match(graph.nodes.get(sourceId).type, /Output Data/);
            assert.match(graph.nodes.get(sinkId).type, /Input Data/);
        }
    }
});

test('keeps multiple connections between the same instances separate', t => {
    const result = generate(t, { 'Main.sysla': `
Signal Data
Component Device
Port First Bidirectional Data
Port Second Bidirectional Data
Component Root
Part Device as a
Part Device as b
Connection a:First - b:First
Connection a:Second - b:Second
` });
    assert.equal(result.status, 0, result.stderr);
    for (const filename of ['Root_Composition.dot', 'Root_Composition_a.dot', 'Root_Composition_b.dot']) {
        const graph = readGraph(path.join(result.output, 'Main', 'Root', filename));
        assertSignalConnections(graph, 'Data', [
            [['a:Device', 'First'], ['b:Device', 'First']],
            [['a:Device', 'Second'], ['b:Device', 'Second']]
        ]);
    }
});

test('draws untyped connections as direct edges between the modeled ports', t => {
    const result = generate(t, { 'Main.sysla': `
Component Device
Port P
Component Root
Part Device as a
Part Device as b
Part Device as spare
Connection a:P - b:P
` });
    assert.equal(result.status, 0, result.stderr);
    for (const filename of ['Root_Composition.dot', 'Root_Composition_a.dot', 'Root_Composition_b.dot']) {
        const graph = readGraph(path.join(result.output, 'Main', 'Root', filename));
        const a = portId(graph, 'a:Device', 'P');
        const b = portId(graph, 'b:Device', 'P');
        const connections = graph.edges.filter(edge => graph.nodes.get(edge.from).type.startsWith('Port')
            && graph.nodes.get(edge.to).type.startsWith('Port'));
        assert.equal(connections.length, 1);
        assert.deepEqual([connections[0].from, connections[0].to].sort(), [a, b].sort());
        assert.match(connections[0].attributes, /dir=none/);
        assert.equal([...graph.nodes.values()].filter(node => node.type === 'Signal').length, 0);
        if (filename === 'Root_Composition.dot') {
            const spare = portId(graph, 'spare:Device', 'P');
            assert.equal(graph.edges.filter(edge => edge.from === spare || edge.to === spare).length, 1);
        }
    }
});

test('preserves delegations and unconnected typed ports without inventing connections', t => {
    const result = generate(t, { 'Main.sysla': `
Signal Data
Component Sink
Port P Input Data
Component Root
Port First Input Data
Port Second Input Data
Part Sink as a
Part Sink as b
Part Sink as spare1
Part Sink as spare2
Delegation First - a:P
Delegation Second - b:P
` });
    assert.equal(result.status, 0, result.stderr);
    const graph = readGraph(path.join(result.output, 'Main', 'Root', 'Root_Composition.dot'));
    const delegations = graph.edges.filter(edge => edge.attributes.includes('style=dashed'));
    assert.deepEqual(delegations.map(edge => [edge.from, edge.to]).sort(), [
        [portId(graph, 'Root', 'First'), portId(graph, 'a:Sink', 'P')],
        [portId(graph, 'Root', 'Second'), portId(graph, 'b:Sink', 'P')]
    ].sort());
    assert.equal([...graph.nodes.values()].filter(node => node.type === 'Signal').length, 0);
    for (const name of ['spare1:Sink', 'spare2:Sink']) {
        const spare = portId(graph, name, 'P');
        assert.match(graph.nodes.get(spare).type, /Input Data/);
        assert.equal(graph.edges.filter(edge => edge.from === spare || edge.to === spare).length, 1);
    }
    assert.equal(graph.edges.filter(edge => graph.nodes.get(edge.from).type.startsWith('Port')).length, 2);
});

test('rejects syntax errors in the selected file', t => {
    assertRejected(generate(t, { 'Main.sysla': 'Komponente Device' }), 'Main.sysla', 1);
});

test('leaves existing generated artifacts untouched when the model is invalid', t => {
    const result = generate(t, { 'Main.sysla': 'Komponente Device' }, 'Main.sysla', ({ output }) => {
        mkdirSync(path.join(output, 'Main'), { recursive: true });
        writeFileSync(path.join(output, 'Main', 'Main.txt'), 'Previous valid output');
    });
    assert.equal(result.status, 1, result.stderr);
    assert.equal(readFileSync(path.join(result.output, 'Main', 'Main.txt'), 'utf8'), 'Previous valid output');
    assert.deepEqual(readdirSync(path.join(result.output, 'Main')), ['Main.txt']);
});

test('generates a selected model reached through a symbolic link', t => {
    const result = generate(t, { 'Model.txt': 'Component Root' }, 'Main.sysla', ({ source }) => {
        symlinkSync('Model.txt', path.join(source, 'Main.sysla'));
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(readFileSync(path.join(result.output, 'Main', 'Main.txt'), 'utf8'), /Component: Root/);
});

test('validates a selected model reached through a symbolic link', t => {
    const result = generate(t, { 'Model.txt': 'Komponente Device' }, 'Main.sysla', ({ source }) => {
        symlinkSync('Model.txt', path.join(source, 'Main.sysla'));
    });
    assertRejected(result, 'Main.sysla', 1);
});

test('ignores companion directories with the model extension', t => {
    const result = generate(t, { 'Main.sysla': 'Component Root' }, 'Main.sysla', ({ source }) => {
        mkdirSync(path.join(source, 'Assets.sysla'));
    });
    assert.equal(result.status, 0, result.stderr);
});

test('rejects a directory selected as the model file', t => {
    const result = generate(t, {}, 'Main.sysla', ({ source }) => {
        mkdirSync(path.join(source, 'Main.sysla'));
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Path .*Main\.sysla is not a file/);
    assert.equal(existsSync(result.output), false);
});

test('rejects unresolved references', t => {
    const result = generate(t, { 'Main.sysla': 'Component Root\nPart Missing as missing' });
    assertRejected(result, 'Main.sysla', 2);
    assert.match(result.stderr, /Missing/);
});

test('reports errors from all companion files before generating output', t => {
    const result = generate(t, {
        'Main.sysla': 'Component Root',
        'Broken.sysla': 'Komponente Device',
        'Other.sysla': 'Component Other\nPart Missing as missing'
    });
    assertRejected(result, 'Broken.sysla', 1);
    assert.ok(result.stderr.includes('Other.sysla:2:'), result.stderr);
});

test('rejects signal mismatches across files', t => {
    const result = generate(t, {
        'Main.sysla': 'Component Root\nPart Source as source\nPart Sink as sink\nConnection source:P - sink:P',
        'Source.sysla': 'Signal Data\nComponent Source\nPort P Output Data',
        'Sink.sysla': 'Signal Heat\nComponent Sink\nPort P Input Heat'
    });
    assertRejected(result, 'Main.sysla', 4);
    assert.match(result.stderr, /Signale/);
});

test('rejects incompatible directions', t => {
    const result = generate(t, {
        'Main.sysla': 'Signal Data\nComponent Source\nPort P Output Data\nComponent Sink\nPort P Output Data\nComponent Root\nPart Source as source\nPart Sink as sink\nConnection source:P - sink:P'
    });
    assertRejected(result, 'Main.sysla', 9);
    assert.match(result.stderr, /Eingang/);
});

test('rejects a missing selected file even when companion files exist', t => {
    const result = generate(t, { 'Other.sysla': 'Component Other' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /File .*Main\.sysla does not exist/);
    assert.equal(existsSync(result.output), false);
});

test('rejects a selected file with an unsupported extension', t => {
    const result = generate(t, { 'Main.txt': 'Component Root' }, 'Main.txt');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Please choose a file.*\.sysla/);
    assert.equal(existsSync(result.output), false);
});
