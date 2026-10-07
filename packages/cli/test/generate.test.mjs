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
    for (const match of dot.matchAll(/(ID_\d+) \[label=<<TABLE\b[^>]*>(.*?)<\/TABLE>>\];/g)) {
        const header = match[2].match(/<B>(.*?)<\/B>.*?<FONT POINT-SIZE="9">(.*?)<\/FONT>/);
        assert.ok(header, match[0]);
        nodes.set(match[1], {
            name: header[1].replace(/<BR\/>/g, ' ').replace(/\s*:\s*/g, ':'),
            type: header[2],
            background: match[2].match(/BGCOLOR="([^"]*)"/)[1]
        });
        for (const port of match[2].matchAll(/<TD PORT="(ID_\d+)"([^>]*)><FONT POINT-SIZE="11">(.*?)<\/FONT><BR\/><FONT POINT-SIZE="9">(.*?)<\/FONT><\/TD>/g)) {
            nodes.set(`${match[1]}:${port[1]}`, {
                name: port[3], type: `Port (${port[4]})`, parent: match[1],
                background: port[2].match(/BGCOLOR="([^"]*)"/)[1]
            });
        }
    }
    const edges = [...dot.matchAll(/(ID_\d+(?::ID_\d+)?)(?::[ew])? -> (ID_\d+(?::ID_\d+)?)(?::[ew])?\s*(\[[^\]]*\])?;/g)]
        .map(match => ({ from: match[1], to: match[2], attributes: match[3] ?? '' }));
    assert.ok(nodes.size > 0, dot);
    return { nodes, edges };
}

function portId(graph, parentName, portName) {
    const port = [...graph.nodes].find(([, node]) => node.name === portName && node.parent
        && graph.nodes.get(node.parent)?.name === parentName);
    assert.ok(port, `Missing port ${parentName}:${portName}`);
    return port[0];
}

function assertConnections(graph, signalName, expectedPairs) {
    const connections = graph.edges.filter(edge => !edge.attributes.includes('style=dashed')
        && graph.nodes.get(edge.from)?.type.endsWith(` ${signalName})`)
        && graph.nodes.get(edge.to)?.type.endsWith(` ${signalName})`));
    assert.equal(connections.length, expectedPairs.length, 'Each modeled connection must have its own edge');
    const actualPairs = connections.map(edge => [edge.from, edge.to].sort());
    const expectedIds = expectedPairs.map(pair => pair.map(([instance, port]) => portId(graph, instance, port)).sort());
    assert.deepEqual(actualPairs.sort(), expectedIds.sort(), 'Edges must link only the modeled endpoint pairs');
    return connections;
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
                const dataEdges = assertConnections(graph, 'Data', [
                    [['computer:Computer', 'RJ45_1 [Ethernet]'], ['nas1:NAS', 'RJ45 [Ethernet]']],
                    [['computer:Computer', 'RJ45_2 [Ethernet]'], ['nas2:NAS', 'RJ45 [Ethernet]']]
                ]);
                for (const edge of dataEdges) {
                    assert.match(edge.attributes, /dir=both/);
                }
                for (const edge of graph.edges) {
                    assert.match(edge.attributes, /color="#555555"/);
                    assert.doesNotMatch(edge.attributes, /label=/);
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
        assertConnections(graph, 'Data', pairs);
        // The modeled flow runs directly from output to input.
        const flows = graph.edges.filter(edge => !edge.attributes.includes('dir=none'))
            .map(edge => edge.attributes.includes('dir=back') ? [edge.to, edge.from] : [edge.from, edge.to]);
        for (const [source, sink] of pairs) {
            const sourceId = portId(graph, ...source);
            const sinkId = portId(graph, ...sink);
            assert.deepEqual(flows.filter(([from]) => from === sourceId), [[sourceId, sinkId]]);
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
        assertConnections(graph, 'Data', [
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
            assert.equal(graph.edges.filter(edge => edge.from === spare || edge.to === spare).length, 0);
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
        assert.equal(graph.edges.filter(edge => edge.from === spare || edge.to === spare).length, 0);
    }
    assert.equal(graph.edges.filter(edge => graph.nodes.get(edge.from).type.startsWith('Port')).length, 2);
    for (const [instance, external] of [['a', 'First'], ['b', 'Second']]) {
        const partial = readGraph(path.join(result.output, 'Main', 'Root', `Root_Composition_${instance}.dot`));
        assert.equal(partial.edges.length, 1);
        assert.deepEqual([partial.edges[0].from, partial.edges[0].to], [portId(partial, 'Root', external), portId(partial, `${instance}:Sink`, 'P')]);
        assert.equal([...partial.nodes.values()].filter(node => node.parent).length, 2);
    }
    for (const spare of ['spare1', 'spare2']) {
        assert.equal(existsSync(path.join(result.output, 'Main', 'Root', `Root_Composition_${spare}.dot`)), false);
    }
});

test('includes external delegation partners alongside connections only for the focused instance', t => {
    const result = generate(t, { 'Main.sysla': `
Signal Data
Component Leaf
    Port P Input Data
    Port Internal Output Data
Component Peer Port P Input Data
Component Root
    Port External Input Data
    Port Other Input Data
    Part Leaf as a
    Part Peer as b
    Part Leaf as spare
    Connection a:Internal - b:P
    Delegation External - a:P
    Delegation Other - spare:P
` });
    assert.equal(result.status, 0, result.stderr);
    const directory = path.join(result.output, 'Main', 'Root');
    const partial = readGraph(path.join(directory, 'Root_Composition_a.dot'));
    assert.equal(partial.edges.length, 2);
    assertConnections(partial, 'Data', [[['a:Leaf', 'Internal'], ['b:Peer', 'P']]]);
    const external = portId(partial, 'Root', 'External');
    const internal = portId(partial, 'a:Leaf', 'P');
    const delegation = partial.edges.find(edge => edge.attributes.includes('style=dashed'));
    assert.deepEqual([delegation.from, delegation.to], [external, internal]);
    assert.ok(![...partial.nodes.values()].some(node => node.name === 'Other' || node.name === 'spare:Leaf'));
    const outerPort = partial.nodes.get(external);
    const innerPort = partial.nodes.get(internal);
    assert.notEqual(outerPort.background, innerPort.background);
    assert.notEqual(partial.nodes.get(outerPort.parent).background, partial.nodes.get(innerPort.parent).background);

    const full = readGraph(path.join(directory, 'Root_Composition.dot'));
    const fullExternal = full.nodes.get(portId(full, 'Root', 'External'));
    assert.equal(fullExternal.background, outerPort.background);
    assert.equal(full.nodes.get(fullExternal.parent).background, partial.nodes.get(outerPort.parent).background);

    const peerView = readGraph(path.join(directory, 'Root_Composition_b.dot'));
    assert.equal(peerView.edges.length, 1);
    assert.ok(![...peerView.nodes.values()].some(node => node.type.startsWith('External')));
});

test('generates a model with distinct underscore-containing connection and delegation endpoints', t => {
    const result = generate(t, { 'Main.sysla': `
Component Device Port c Port b_c
Component Peer Port P
Component Root
    Port External
    Part Device as a_b
    Part Device as a
    Part Peer as peer
    Connection a_b:c - peer:P
    Delegation External - a:b_c
` });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
    const graph = readGraph(path.join(result.output, 'Main', 'Root', 'Root_Composition.dot'));
    const connected = portId(graph, 'a_b:Device', 'c');
    const peer = portId(graph, 'peer:Peer', 'P');
    const external = portId(graph, 'Root', 'External');
    const delegated = portId(graph, 'a:Device', 'b_c');
    assert.ok(graph.edges.some(edge => edge.from === connected && edge.to === peer && edge.attributes.includes('dir=none')));
    assert.ok(graph.edges.some(edge => edge.from === external && edge.to === delegated && edge.attributes.includes('style=dashed')));
});

test('uses the same port boxes in decomposition and composition while preserving structural edges', t => {
    const result = generate(t, { 'Main.sysla': `
Signal Data
Component Leaf Port Value Input Data
Component Root
    Port In Input Data
    Port Out Output Data
    Port Bus [Port A] [Port B] Bidirectional Data
    Port Mount
    Part Leaf as a
    Part Leaf as b
` });
    assert.equal(result.status, 0, result.stderr);
    const directory = path.join(result.output, 'Main', 'Root');
    const decomposition = readGraph(path.join(directory, 'Root_Decomposition.dot'));
    const composition = readGraph(path.join(directory, 'Root_Composition.dot'));
    for (const name of ['In', 'Out', 'Bus [A, B]', 'Mount']) {
        const first = decomposition.nodes.get(portId(decomposition, 'Root', name));
        const second = composition.nodes.get(portId(composition, 'Root', name));
        assert.equal(first.type, second.type);
    }
    const root = [...decomposition.nodes].find(([, node]) => node.name === 'Root')[0];
    const parts = [...decomposition.nodes].filter(([, node]) => node.type === 'Instance');
    assert.deepEqual(decomposition.edges.map(edge => [edge.from, edge.to]).sort(), parts.map(([id]) => [root, id]).sort());
    assert.equal([...decomposition.nodes.values()].filter(node => node.parent).length, 4);
    assert.equal([...composition.nodes.values()].filter(node => node.parent).length, 6);
    assert.equal(composition.edges.length, 0, 'Unconnected ports must not acquire membership or connection edges');
});

test('draws input, output, bidirectional, and untyped delegations between integrated ports', t => {
    const result = generate(t, { 'Main.sysla': `
Signal Data
Component Leaf
    Port In Input Data
    Port Out Output Data
    Port Bus Bidirectional Data
    Port Mount
    Port Unused Bidirectional Data
Component Root
    Port In Input Data
    Port Out Output Data
    Port Bus Bidirectional Data
    Port Mount
    Port Unused Bidirectional Data
    Part Leaf as leaf
    Delegation In - leaf:In
    Delegation Out - leaf:Out
    Delegation Bus - leaf:Bus
    Delegation Mount - leaf:Mount
` });
    assert.equal(result.status, 0, result.stderr);
    for (const filename of ['Root_Composition.dot', 'Root_Composition_leaf.dot']) {
        const graph = readGraph(path.join(result.output, 'Main', 'Root', filename));
        assert.equal(graph.edges.length, 4);
        for (const [name, outward, direction] of [['In', false, 'forward'], ['Out', true, 'forward'], ['Bus', false, 'both'], ['Mount', false, 'none']]) {
            const outer = portId(graph, 'Root', name);
            const inner = portId(graph, 'leaf:Leaf', name);
            const edge = graph.edges.find(edge => edge.from === (outward ? inner : outer) && edge.to === (outward ? outer : inner));
            assert.ok(edge, `Missing delegation for ${name}`);
            assert.match(edge.attributes, /style=dashed/);
            if (direction === 'forward') {
                assert.doesNotMatch(edge.attributes, /dir=/);
            } else {
                assert.ok(edge.attributes.includes(`dir=${direction}`), edge.attributes);
            }
        }
        if (filename === 'Root_Composition_leaf.dot') {
            assert.ok(![...graph.nodes.values()].some(node => node.name === 'Unused'));
        }
    }
});

test('draws a connection within one instance exactly once in both composition views', t => {
    const result = generate(t, { 'Main.sysla': `
Signal Data
Component Device
    Port In Input Data
    Port Out Output Data
Component Root
    Part Device as device
    Connection device:In - device:Out
` });
    assert.equal(result.status, 0, result.stderr);
    for (const filename of ['Root_Composition.dot', 'Root_Composition_device.dot']) {
        const graph = readGraph(path.join(result.output, 'Main', 'Root', filename));
        assertConnections(graph, 'Data', [[['device:Device', 'Out'], ['device:Device', 'In']]]);
        assert.equal(graph.edges.length, 1);
        assert.deepEqual([graph.edges[0].from, graph.edges[0].to], [portId(graph, 'device:Device', 'Out'), portId(graph, 'device:Device', 'In')]);
    }
});

const graphvizAvailable = spawnSync('dot', ['-V'], { encoding: 'utf8', timeout: 10000 }).status === 0;
test('Graphviz renders all demo diagrams with valid port references', { skip: !graphvizAvailable }, t => {
    for (const example of ['Demo1', 'DemoMulti1', 'Computer']) {
        const files = Object.fromEntries(readdirSync(path.join(demosPath, example))
            .filter(name => name.endsWith('.sysla'))
            .map(name => [name, readFileSync(path.join(demosPath, example, name), 'utf8')]));
        const result = generate(t, files, `${example}.sysla`);
        assert.equal(result.status, 0, result.stderr);
        const directory = path.join(result.output, example);
        for (const filename of readdirSync(directory, { recursive: true }).filter(name => name.endsWith('.dot'))) {
            const rendered = spawnSync('dot', ['-Tsvg', path.join(directory, filename)], { encoding: 'utf8', timeout: 10000 });
            assert.ifError(rendered.error);
            assert.equal(rendered.status, 0, `${filename}: ${rendered.stderr}`);
            assert.equal(rendered.stderr, '', `${filename}: ${rendered.stderr}`);
            assert.match(rendered.stdout, /<svg\b/);
        }
    }
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
