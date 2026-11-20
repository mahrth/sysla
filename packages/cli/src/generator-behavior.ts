import type { FunctionDeclaration, FunctionDefinition, Call, QueryInvocation, Loop, Conditional, Component, MachineDefinition, Model, ParallelCalls, ParallelBlock, ScenarioAction, ScenarioDefinition, Step } from 'sysla-language';
import { GraphVizGeneratorBase, type GraphGenerator } from './graphviz-generator.js';

type Behavior = FunctionDefinition | MachineDefinition | ScenarioDefinition;

export class GeneratorBehavior extends GraphVizGeneratorBase implements GraphGenerator {
    generate(model: Model, outputDir: string): string[] {
        return model.components.flatMap(component => this.generateForComponent(component, { model, outputDir }));
    }

    generateForComponent(component: Component, { model, outputDir }: { model?: Model; outputDir: string }): string[] {
        if (!model) return [];
        const definitions: Behavior[] = [...model.machines, ...model.functions, ...model.scenarios];
        return this.generateGraphs(definitions.filter(definition => definition.owner.ref === component), {
            outputDir,
            getName: definition => {
                const kind = { MachineDefinition: 'StateMachine', FunctionDefinition: 'Function', ScenarioDefinition: 'Scenario' }[definition.$type];
                return `${component.name}_${kind}_${definition.declaration.$refText}`;
            },
            compile: definition => {
                const condition = definition.$type === 'FunctionDefinition' ? this.precondition(definition.declaration.ref) : '';
                const title = `${component.name}.${definition.declaration.$refText}`;
                let body: string;
                switch (definition.$type) {
                    case 'MachineDefinition': body = this.machineBody(definition); break;
                    case 'FunctionDefinition': body = this.functionBody(definition); break;
                    case 'ScenarioDefinition': body = this.scenarioBody(definition); break;
                }
                // The final node's outer ring measures 20 pt; DOT widths are in inches.
                const size = definition.$type === 'ScenarioDefinition' ? '' : `, width=${20 / 72}`;
                return this.beginGraph(title, condition) + `    start [shape=point${size}];\n` + body + '}\n';
            }
        });
    }

    private scenarioBody(scenario: ScenarioDefinition): string {
        let dot = '    rankdir=TB;\n    node [shape=box, style=rounded];\n';
        let previous = 'start';
        for (const step of scenario.steps) {
            if (step.$type === 'ScenarioAction') {
                const id = this.getNodeId(step);
                dot += `    ${id} [label=${this.scenarioLabel(step)}];\n`;
                dot += `    ${previous} -> ${id};\n`;
                previous = id;
            } else {
                const fork = this.getNodeId(step, 'fork');
                const join = this.getNodeId(step, 'join');
                dot += this.parallelBody(step);
                dot += `    ${previous} -> ${fork};\n`;
                previous = join;
            }
        }
        return dot + `    end [shape=doublecircle, label="", width=0.16, fixedsize=true];\n    ${previous} -> end;\n`;
    }

    private scenarioLabel(action: ScenarioAction): string {
        return this.labelWithDetail(`${action.part.$refText}.${action.callee.$refText}`, this.precondition(action.callee.ref));
    }

    private parallelBody(block: ParallelCalls | ParallelBlock): string {
        const fork = this.getNodeId(block, 'fork');
        const join = this.getNodeId(block, 'join');
        let dot = '';
        for (const bar of [fork, join]) {
            dot += `    ${bar} [shape=rect, label="", width=1.3, height=0.07, fixedsize=true, style=filled, fillcolor=black];\n`;
        }
        const branches = block.$type === 'ParallelCalls' ? block.calls : block.actions;
        for (const branch of branches) {
            const id = this.getNodeId(branch);
            const label = branch.$type === 'Call' ? this.stepLabel(branch) : this.scenarioLabel(branch);
            dot += `    ${id} [label=${label}];\n    ${fork} -> ${id};\n    ${id} -> ${join};\n`;
        }
        return dot;
    }

    private precondition(declaration: FunctionDeclaration | undefined): string {
        if (!declaration?.requirements.length) return '';
        const alternatives = declaration.requirements.map(item => `${item.machine.$refText}.${item.state.$refText}`);
        return `requires ${alternatives.join(' or ')}`;
    }

    private machineBody(machine: MachineDefinition): string {
        let dot = '    node [shape=box, style=rounded];\n';
        for (const state of machine.states) {
            const name = `<FONT POINT-SIZE="12"><B>${this.escapeHtml(state.name)}</B></FONT>`;
            const actions = state.actions.map(action => this.detailLine(`${action.kind} / ${action.callee.$refText}`));
            dot += `    ${this.getNodeId(state)} [label=<${name}${this.detailLine('state')}${actions.join('')}>];\n`;
        }
        const initial = machine.initial.ref;
        if (initial) dot += `    start -> ${this.getNodeId(initial)};\n`;
        for (const transition of machine.transitions) {
            const source = transition.source.ref;
            const target = transition.target.ref;
            const guard = transition.guard;
            const guardLabel = guard ? ` [${guard.part.$refText}.${guard.operation.$refText}()]` : '';
            const effectLabel = transition.effect ? ` / ${transition.effect.$refText}()` : '';
            if (source && target) {
                const event = transition.trigger.ref;
                const origin = event?.$type === 'EventDeclaration' && event.part && event.source
                    ? `from ${event.part.$refText}.${event.source.$refText}` : '';
                const label = this.labelWithDetail(transition.trigger.$refText + guardLabel + effectLabel, origin);
                dot += `    ${this.getNodeId(source)} -> ${this.getNodeId(target)} [label=${label}];\n`;
            }
        }
        return dot;
    }

    private functionBody(definition: FunctionDefinition): string {
        let dot = '    rankdir=TB;\n    node [shape=box, style=rounded];\n';
        const renderSteps = (steps: Step[], predecessors: string[], entryLabel = ''): string[] => {
            for (const step of steps) {
                if (!predecessors.length) break;
                const id = this.getNodeId(step);
                const entry = step.$type === 'ParallelCalls' ? this.getNodeId(step, 'fork') : id;
                for (const source of predecessors) dot += `    ${source} -> ${entry}${entryLabel};\n`;
                entryLabel = '';
                if (step.$type === 'Loop') {
                    dot += `    ${id} [shape=diamond, label="", width=0.2, height=0.2, fixedsize=true];\n`;
                    for (const tail of renderSteps(step.steps, [id])) dot += `    ${tail} -> ${id};\n`;
                    predecessors = [];
                    continue;
                }
                if (step.$type === 'Conditional') {
                    dot += `    ${id} [shape=diamond, label=${JSON.stringify(this.invocation(step.condition))}];\n`;
                    const tails = renderSteps(step.steps, [id], ' [label="true"]');
                    const merge = this.getNodeId(step, 'merge');
                    dot += `    ${merge} [shape=diamond, label="", width=0.2, height=0.2, fixedsize=true];\n`;
                    dot += `    ${id} -> ${merge} [label="false"];\n`;
                    for (const tail of tails) dot += `    ${tail} -> ${merge};\n`;
                    predecessors = [merge];
                    continue;
                }
                if (step.$type === 'ParallelCalls') {
                    dot += this.parallelBody(step);
                    predecessors = [this.getNodeId(step, 'join')];
                    continue;
                }
                const shape = step.$type === 'Choice' ? 'diamond' : 'box';
                dot += `    ${id} [shape=${shape}, label=${this.stepLabel(step)}];\n`;
                predecessors = [id];
                if (step.$type === 'Choice') {
                    predecessors = [];
                    for (const branch of step.branches) {
                        const action = this.getNodeId(branch.action);
                        dot += `    ${action} [label=${this.stepLabel(branch.action)}];\n`;
                        dot += `    ${id} -> ${action} [label=${JSON.stringify(branch.value.$refText)}];\n`;
                        predecessors.push(action);
                    }
                }
            }
            return predecessors;
        };
        const predecessors = renderSteps(definition.steps, ['start']);
        if (!predecessors.length) return dot;
        dot += '    end [shape=doublecircle, label="", width=0.16, fixedsize=true, style=filled];\n';
        for (const source of predecessors) dot += `    ${source} -> end;\n`;
        return dot;
    }

    private invocation(call: Call | QueryInvocation): string {
        const args = call.argument ? [call.argument, ...call.additionalArguments] : [];
        const parentheses = call.$type === 'QueryInvocation' || call.parentheses;
        return call.callee.$refText + (parentheses ? `(${args.map(arg => arg.$refText).join(', ')})` : '');
    }

    private stepLabel(step: Exclude<Step, ParallelCalls | Loop | Conditional>): string {
        switch (step.$type) {
            case 'Receive': return JSON.stringify(`Receive ${step.signal.$refText}\nat ${step.port.$refText} as ${step.name}`);
            case 'Emit': return JSON.stringify(`Emit ${step.event.$refText}`);
            case 'Call': return this.labelWithDetail(this.invocation(step), this.precondition(step.callee.ref));
            case 'Choice': return JSON.stringify(`Case ${step.binding.$refText}`);
        }
    }
}
