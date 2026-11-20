import { readdirSync, readFileSync } from 'node:fs';
import { EmptyFileSystem, URI } from 'langium';
import { expect, test } from 'vitest';
import { createSyslaServices, type Model } from 'sysla-language';
import { parseModel } from './helpers.js';

test('links the alarm behavior to the reset signal across the state machine stage files', async () => {
    const { shared } = createSyslaServices(EmptyFileSystem);
    const directory = new URL('../../../demos/AlarmSystem/v03-state-machine/', import.meta.url);
    const documents = readdirSync(directory).filter(name => name.endsWith('.sysla')).map(name => {
        const file = new URL(name, directory);
        const document = shared.workspace.LangiumDocumentFactory.fromString<Model>(
            readFileSync(file, 'utf8'), URI.parse(file.href)
        );
        shared.workspace.LangiumDocuments.addDocument(document);
        return document;
    });
    await shared.workspace.DocumentBuilder.build(documents, { validation: true });
    for (const document of documents) expect(document.diagnostics).toEqual([]);
    const models = documents.map(doc => doc.parseResult.value);
    const machine = models.flatMap(model => model.machines).find(m => m.declaration.$refText === 'AlarmBehavior')!;
    const resetSignal = models.flatMap(model => model.signals).find(signal => signal.name === 'ResetCommand')!;
    expect(resetSignal.event).toBe(true);
    expect(machine.initial.ref?.name).toBe('Off');
    expect(machine.declaration.ref).toBe(machine.owner.ref?.machines[0]);
    expect(machine.transitions.find(t => t.trigger.$refText === 'ResetCommand')?.trigger.ref).toBe(resetSignal);
});

test.each([
    'StateMachine A.M Initial Missing State Ready',
    'StateMachine A.M Initial Ready State Ready Transition Ready -> Ready on Command',
    'StateMachine A.M Initial Ready State Ready Transition Ready -> Ready on Foreign',
    'StateMachine A.M Initial Ready State Ready State Ready',
    'Function A.Work Receive Command at OutputPort as c',
    'Function A.Work Receive Command at InputPort as input Case input other -> Emit Done',
    'Function A.Work Call Work(c) Receive Command at InputPort as c',
    'Function A.Other Emit Done'
])('rejects invalid behavior: %s', async behavior => {
    const document = await parseModel(`
        Signal Command [on, off]
        Component B Event Foreign Function Other()
        Component A Port InputPort Input Command Port OutputPort Output Command
        Function Work(inputCommand: Command) StateMachine M Event Done
        ${behavior}
    `);
    expect(document.parseResult.parserErrors).toEqual([]);
    expect(document.diagnostics?.some(diagnostic => diagnostic.severity === 1)).toBe(true);
});

test.each([
    ['M.Ready', true],
    ['M.Ready or M.Busy', true],
    ['M.Ready or M.Ready', false],
    ['M.Ready or N.Ready', false],
    ['M.Missing', false],
    ['Foreign.Ready', false],
    ['M.Ready and M.Busy', false]
])('validates function precondition %s', async (condition, valid) => {
    const document = await parseModel(`
        Component Other StateMachine Foreign
        Component Unit StateMachine M StateMachine N Function Work() requires ${condition}
        StateMachine Unit.M Initial Ready State Ready State Busy
        StateMachine Unit.N Initial Ready State Ready
        StateMachine Other.Foreign Initial Ready State Ready
    `);
    expect(document.diagnostics?.length === 0).toBe(valid);
});

test.each([
    ['sensor.read', true],
    ['Parallel sensor.read device.reset Join', true],
    ['device.read', false],
    ['unknown.read', false],
    ['Parallel device.reset Join', false],
    ['Parallel sensor.read device.reset', false]
])('validates scenario steps: %s', async (steps, valid) => {
    const document = await parseModel(`
        Component Sensor Function read()
        Component Device Function reset()
        Component Root Part Sensor as sensor Part Device as device Scenario Run
        Scenario Root.Run ${steps}
    `);
    expect(document.diagnostics?.length === 0).toBe(valid);
});

test.each([
    ['Entry local Do local Exit local', true],
    ['Exit local Entry local', true],
    ['Do foreign', false],
    ['Entry local Entry local', false]
])('validates state functions: %s', async (actions, valid) => {
    const document = await parseModel(`
        Component Other Function foreign()
        Component Unit Function local() StateMachine M
        StateMachine Unit.M Initial Idle State Idle ${actions}
    `);
    expect(document.diagnostics?.length === 0).toBe(valid);
});

test.each([
    ['Receive Data at P as value Parallel Call sub(value) Call finish Join Call finish', true],
    ['Parallel Call sub(value) Call finish Join Receive Data at P as value', false],
    ['Parallel Call finish Join', false],
    ['Parallel Call finish Call foreign Join', false]
])('validates parallel function calls: %s', async (steps, valid) => {
    const document = await parseModel(`
        Signal Data Component Other Function foreign()
        Component Unit Port P Input Data Function sub(value: Data) Function finish() Function run()
        Function Unit.run ${steps}
    `);
    expect(document.diagnostics?.length === 0).toBe(valid);
});

test.each([
    ['returns Boolean query', 'camera.ready()', true],
    ['returns Boolean', 'camera.ready()', false],
    ['returns Frame query', 'camera.ready()', false],
    ['returns Boolean query', 'other.ready()', false],
    ['returns Boolean query', 'camera.missing()', false]
])('checks guard ownership and query signature: %s %s', async (signature, guard, valid) => {
    const document = await parseModel(`
        Signal Frame
        Component Camera Function ready() ${signature}
        Component Alarm Part Camera as camera StateMachine M Event Arm
        StateMachine Alarm.M Initial Off State Off State On Transition Off -> On on Arm [${guard}]
    `);
    expect(document.diagnostics?.length === 0).toBe(valid);
});

test.each([
    ['Call process(b, a)', true],
    ['Call process(a, b)', false],
    ['Call process(b)', false],
    ['Call process()', false]
])('checks typed function arguments: %s', async (call, valid) => {
    const document = await parseModel(`
        Signal Frame Component Camera
        Function run(a: Boolean, b: Frame)
        Function process(image: Frame, ready: Boolean)
        Function Camera.run ${call}
    `);
    expect(document.diagnostics?.length === 0).toBe(valid);
});

test('rejects side effects in a query definition', async () => {
    const document = await parseModel('Component C Event E Function ready() returns Boolean query Function C.ready Emit E');
    expect(document.diagnostics?.some(d => String(d.message).includes('Queries may not'))).toBe(true);
});

test.each([
    ['logStart()', true],
    ['missing()', false],
    ['foreign()', false],
    ['withArgument()', false],
    ['logStart', false]
])('checks transition effect without a guard: %s', async (effect, valid) => {
    const doc = await parseModel(`
        Component Other Function foreign()
        Component Unit Function logStart() Function withArgument(value: Boolean)
        StateMachine M Event Start
        StateMachine Unit.M Initial Off State Off State On
        Transition Off -> On on Start / ${effect}
    `);
    expect(doc.diagnostics?.length === 0).toBe(valid);
});

test.each([
    ['left.Detected', '', true],
    ['right.Detected', '', false],
    ['Left.Detected', '', false],
    ['left.Other', '', false],
    ['left.Detected', 'Emit Alarm', false]
])('resolves event origin %s and checks local emission %s', async (origin, step, valid) => {
    const doc = await parseModel(`
        Component Left Event Detected
        Component Right Event Other
        Component Parent Part Left as left Part Right as right
        Event Alarm from ${origin} Function run()
        Function Parent.run ${step}
    `);
    expect(doc.diagnostics?.length === 0).toBe(valid);
});

test.each([
    ['Loop Receive Frame at P as f If ready(f) Emit E EndIf Call update(f) EndLoop', true],
    ['If ready(seed) Loop Call update(seed) EndLoop EndIf Call update(seed)', true],
    ['If ready(seed) Receive Frame at P as f EndIf Call update(f)', false],
    ['Loop If ready(f) Emit E EndIf Receive Frame at P as f EndLoop', false],
    ['Loop Receive Frame at P as seed EndLoop', false],
    ['If update(seed) Emit E EndIf', false],
    ['If ready() Emit E EndIf', false],
    ['If ready(flag) Emit E EndIf', false],
    ['Loop Emit E', false],
    ['Loop Emit E EndLoop Call update(seed)', false],
])('checks block scope and Boolean conditions: %s', async (body, valid) => {
    const doc = await parseModel(`
        Signal Frame Component Unit Port P Input Frame Event E
        Function ready(f: Frame) returns Boolean query
        Function update(f: Frame) Function run(seed: Frame, flag: Boolean)
        Function Unit.run ${body}
    `);
    expect(doc.diagnostics?.length === 0).toBe(valid);
});

test.each([
    ['target', 'peer <-> Monitor peer -> Reset peer <- Monitor', true],
    ['target', 'target -> Monitor', false],
    ['target', 'missing -> Monitor', false],
    ['target', 'peer -> OnlyOnNeighbor', false],
    ['missing', 'peer -> Monitor', false]
])('scopes functional context participants and functions: %s, %s', async (subject, interactions, valid) => {
    const doc = await parseModel(`
        Component Device Function Monitor() Function Reset()
        Component Neighbor Function OnlyOnNeighbor()
        Component Root Part Device as target Part Neighbor as peer
        FunctionalContext Root.Context for ${subject}
            ${interactions}
    `);
    expect(doc.diagnostics?.length === 0).toBe(valid);
});

test.each([
    'Component Unit Activity Run',
    'Component Unit Function Run() Activity Unit.Run'
])('rejects legacy Activity syntax: %s', async text => {
    const document = await parseModel(text);
    expect(document.parseResult.parserErrors.length).toBeGreaterThan(0);
});
