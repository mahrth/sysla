import type { ValidationAcceptor, ValidationChecks } from 'langium';
import type { SyslaAstType, Component, Connection, Delegation, PartPort, Instance, Call, QueryInvocation, StateAction, ScenarioAction } from './generated/ast.js';
import type { SyslaServices } from './sysla-module.js';
import { visibleBindings } from './sysla-scope-provider.js';
import { isCall, isReceive } from './generated/ast.js';
import { type AstNode, AstUtils } from 'langium';

/**
 * Register custom validation checks.
 */
export function registerValidationChecks(services: SyslaServices) {
    const registry = services.validation.ValidationRegistry;
    const validator = services.validation.SyslaValidator;
    const checks: ValidationChecks<SyslaAstType> = {
        Component: [
            (component, accept) => {
                checkUniqueNames(component.functions, accept);
                checkUniqueNames(component.scenarios, accept);
                checkUniqueNames(component.machines, accept);
                const triggers = new Set(component.ports.flatMap(port =>
                    (port.input || port.bidirectional) && port.signal?.ref?.event ? [port.signal.ref.name] : []
                ));
                checkUniqueNames(component.events, accept, triggers);
            },
            validator.checkMehrfachverbindungen
        ],
        Signal: (signal, accept) => checkUniqueNames(signal.values, accept),
        State: (state, accept) => {
            const kinds = new Set<string>();
            for (const action of state.actions) {
                if (kinds.has(action.kind)) {
                    accept('error', `Duplicate ${action.kind} function.`, { node: action, property: 'kind' });
                }
                kinds.add(action.kind);
            }
        },
        MachineDefinition: (machine, accept) => checkUniqueNames(machine.states, accept),
        Guard: (guard, accept) => {
            const operation = guard.operation.ref;
            if (operation && !(operation.query && operation.result?.boolean && !operation.parameters.length)) {
                accept('error', 'A guard requires a parameterless Boolean query.', { node: guard, property: 'operation' });
            }
        },
        StateAction: checkImplicitCall,
        ScenarioAction: checkImplicitCall,
        Call: checkArguments,
        Loop: (loop, accept) => {
            const next = loop.$container.steps[(loop.$containerIndex ?? 0) + 1];
            if (next) accept('error', 'This step is unreachable after an unconditional loop.', { node: next });
        },
        QueryInvocation: (query, accept) => {
            const operation = query.callee.ref;
            if (operation && !(operation.query && operation.result?.boolean)) {
                accept('error', 'If requires a Boolean query.', { node: query, property: 'callee' });
            }
            checkArguments(query, accept);
        },
        Emit: (emit, accept) => {
            if (emit.event.ref?.part) {
                accept('error', 'This event is bound to a part and cannot be emitted locally.', { node: emit, property: 'event' });
            }
        },
        Receive: (receive, accept) => {
            if (visibleBindings(receive).some(binding => binding.name === receive.name)) {
                accept('error', `Duplicate name '${receive.name}'.`, { node: receive, property: 'name' });
            }
        },
        FunctionDeclaration: (declaration, accept) => {
            checkUniqueNames(declaration.parameters, accept);
            if (declaration.query && !declaration.result) {
                accept('error', 'A query must declare its return type.', { node: declaration, property: 'name' });
            }
            const seen = new Set<string>();
            for (const requirement of declaration.requirements) {
                if (requirement.machine.$refText !== declaration.requirements[0].machine.$refText) {
                    accept('error', 'All alternatives must refer to the same state machine.', { node: requirement, property: 'machine' });
                } else if (seen.has(requirement.state.$refText)) {
                    accept('error', 'Duplicate state in function precondition.', { node: requirement, property: 'state' });
                }
                seen.add(requirement.state.$refText);
            }
        },
        FunctionDefinition: (definition, accept) => {
            const operation = definition.declaration.ref;
            if (!operation) return;
            if (operation.query) {
                for (const step of AstUtils.streamAllContents(definition)) {
                    if (step.$type === 'Receive' || step.$type === 'Emit' || (isCall(step) && !step.callee.ref?.query)) {
                        accept('error', 'Queries may not receive signals, emit events or call non-query functions.', { node: step });
                    }
                }
            }
        },
        Choice: (choice, accept) => {
            const seen = new Set<string>();
            for (const branch of choice.branches) {
                const value = branch.value.$refText;
                if (seen.has(value)) {
                    accept('error', `Duplicate case value '${value}'.`, { node: branch, property: 'value' });
                }
                seen.add(value);
            }
        },
        Connection: [
            validator.checkVerbindungSignalKompatibilitaet,
            validator.checkVerbindungRichtung
        ],
        Delegation: [
            validator.checkDelegationSignalKompatibilitaet,
            validator.checkDelegationRichtung
        ]
    };
    registry.register(checks, validator);
}

/**
 * Implementation of custom validations.
 */
export class SyslaValidator {

    // checkKomponenteStartsWithCapital(komponente: Komponente, accept: ValidationAcceptor): void {
    //     if (komponente.name) {
    //         const firstChar = komponente.name.substring(0, 1);
    //         if (firstChar.toUpperCase() !== firstChar) {
    //             accept('warning', 'Komponente name should start with a capital.', { node: komponente, property: 'name' });
    //         }
    //     }
    // }

    // checkSignal(signal: Signal, accept: ValidationAcceptor): void {
    //     if (signal.name.length <= 5) {
    //         accept('error', 'Signal name too short.', { node: signal, property: 'name' });
    //     }
    // }

    /**
     * Prüft auf mehrfach verbundene Ports in Verbindungen und Delegationen
     */
    checkMehrfachverbindungen(komponente: Component, accept: ValidationAcceptor): void {
        const verwendeteAnker = new Map<Instance, Set<PartPort>>();
        const verwendetePorts = new Set<PartPort>();

        // Instanz und Port anhand ihrer Identität unterscheiden, unabhängig von Namen.
        const registriereAnker = (instanz: Instance, port: PartPort): boolean => {
            const ports = verwendeteAnker.get(instanz) ?? new Set<PartPort>();
            if (ports.has(port)) {
                return false;
            }
            ports.add(port);
            verwendeteAnker.set(instanz, ports);
            return true;
        };

        // Prüfe Verbindungen
        for (const verbindung of komponente.connections) {
            const port1 = this.getPortVonInstanz(verbindung.components1?.ref, verbindung.port1?.ref);
            const port2 = this.getPortVonInstanz(verbindung.components2?.ref, verbindung.port2?.ref);

            if (port1 && verbindung.components1?.ref) {
                if (!registriereAnker(verbindung.components1.ref, port1)) {
                    accept('error', 'Port ist mehrfach verbunden.', { node: verbindung, property: 'port1' });
                }
            }

            if (port2 && verbindung.components2?.ref) {
                if (!registriereAnker(verbindung.components2.ref, port2)) {
                    accept('error', 'Port ist mehrfach verbunden.', { node: verbindung, property: 'port2' });
                }
            }
        }

        // Prüfe Delegationen
        for (const delegation of komponente.delegations) {
            // port1: Port der Komponente selbst
            const port1 = komponente.ports.find(p => p.port.name === delegation.port1?.ref?.name);
            if (port1) {
                if (verwendetePorts.has(port1)) {
                    accept('error', 'Port ist mehrfach verbunden.', { node: delegation, property: 'port1' });
                } else {
                    verwendetePorts.add(port1);
                }
            }

            // port2: Port der Instanz
            const port2 = this.getPortVonInstanz(delegation.components2?.ref, delegation.port2?.ref);
            if (port2 && delegation.components2?.ref) {
                if (!registriereAnker(delegation.components2.ref, port2)) {
                    accept('error', 'Port ist mehrfach verbunden.', { node: delegation, property: 'port2' });
                }
            }
        }
    }

    /**
     * Prüft, ob die Signale an beiden Ports einer Verbindung kompatibel sind
     */
    checkVerbindungSignalKompatibilitaet(verbindung: Connection, accept: ValidationAcceptor): void {
        const port1 = this.getPortVonInstanz(verbindung.components1?.ref, verbindung.port1?.ref);
        const port2 = this.getPortVonInstanz(verbindung.components2?.ref, verbindung.port2?.ref);

        if (!port1 || !port2) return; // Bereits durch Referenz-Fehler abgedeckt

        const signal1 = port1.signal?.ref;
        const signal2 = port2.signal?.ref;

        // Beide haben Signal oder beide haben keins
        if ((signal1 && !signal2) || (!signal1 && signal2)) {
            accept('error', 'Nur ein Port hat ein Signal zugewiesen.', { node: verbindung, property: 'port2' });
            return;
        }

        // Wenn beide Signale haben, müssen sie gleich sein
        if (signal1 && signal2 && signal1 !== signal2) {
            accept('error', 'Die Signale der Ports müssen übereinstimmen.', { node: verbindung, property: 'port2' });
        }
    }

    /**
     * Prüft die Richtungskompatibilität bei Verbindungen
     */
    checkVerbindungRichtung(verbindung: Connection, accept: ValidationAcceptor): void {
        const port1 = this.getPortVonInstanz(verbindung.components1?.ref, verbindung.port1?.ref);
        const port2 = this.getPortVonInstanz(verbindung.components2?.ref, verbindung.port2?.ref);

        if (!port1 || !port2) return;

        const bi1 = port1.bidirectional;
        const bi2 = port2.bidirectional;

        // Bidirektional-Checks
        if ((bi1 && !bi2) || (!bi1 && bi2)) {
            accept('error', 'Ein bidirektionaler Port kann nur mit einem anderen bidirektionalen Port verbunden werden.',
                { node: verbindung, property: 'port2' });
            return;
        }

        // Wenn beide bidirektional, ist alles OK
        if (bi1 && bi2) return;

        // Eingang/Ausgang-Checks
        const aus1 = port1.output;
        const ein1 = port1.input;
        const aus2 = port2.output;
        const ein2 = port2.input;

        // Beide Eingang oder beide Ausgang ist falsch
        if ((aus1 && aus2) || (ein1 && ein2)) {
            accept('error', 'Ein Eingang muss mit einem Ausgang verbunden werden.',
                { node: verbindung, property: 'port2' });
        }
    }

    /**
     * Prüft Signal-Kompatibilität bei Delegationen
     */
    checkDelegationSignalKompatibilitaet(delegation: Delegation, accept: ValidationAcceptor): void {
        const komponente = AstUtils.getContainerOfType(delegation, (n): n is Component =>
            n.$type === 'Component'
        );

        if (!komponente) return;

        const port1 = komponente.ports.find(p => p.port.name === delegation.port1?.ref?.name);
        const port2 = this.getPortVonInstanz(delegation.components2?.ref, delegation.port2?.ref);

        if (!port1 || !port2) return;

        const signal1 = port1.signal?.ref;
        const signal2 = port2.signal?.ref;

        if ((signal1 && !signal2) || (!signal1 && signal2)) {
            accept('error', 'Nur ein Port hat ein Signal zugewiesen.', { node: delegation, property: 'port2' });
            return;
        }

        if (signal1 && signal2 && signal1 !== signal2) {
            accept('error', 'Die Signale der Ports müssen übereinstimmen.', { node: delegation, property: 'port2' });
        }
    }

    /**
     * Prüft Richtungskompatibilität bei Delegationen
     * Regel: Eingang→Eingang, Ausgang→Ausgang
     */
    checkDelegationRichtung(delegation: Delegation, accept: ValidationAcceptor): void {
        const komponente = AstUtils.getContainerOfType(delegation, (n): n is Component =>
            n.$type === 'Component'
        );

        if (!komponente) return;

        const port1 = komponente.ports.find(p => p.port.name === delegation.port1?.ref?.name);
        const port2 = this.getPortVonInstanz(delegation.components2?.ref, delegation.port2?.ref);

        if (!port1 || !port2) return;

        const bi1 = port1.bidirectional;
        const bi2 = port2.bidirectional;

        // Bidirektional-Checks
        if ((bi1 && !bi2) || (!bi1 && bi2)) {
            accept('error', 'Ein bidirektionaler Port kann nur mit einem anderen bidirektionalen Port delegiert werden.',
                { node: delegation, property: 'port2' });
            return;
        }

        if (bi1 && bi2) return;

        // Bei Delegation: Eingang→Eingang, Ausgang→Ausgang
        if (port1.output && !port2.output) {
            accept('error', 'Ein Ausgang muss an einen Ausgang des Teils delegiert werden.',
                { node: delegation, property: 'port2' });
        }

        if (port1.input && !port2.input) {
            accept('error', 'Ein Eingang muss an einen Eingang des Teils delegiert werden.',
                { node: delegation, property: 'port2' });
        }
    }

    /**
     * Hilfsmethode: Findet den BestandteilPort einer Instanz
     */
    private getPortVonInstanz(instanz: any, port: any): PartPort | undefined {
        if (!instanz || !port) return undefined;

        // Navigiere von Instanz zu PartComponent zu Component
        const bestandteil = AstUtils.getContainerOfType(instanz, (n): n is any =>
            n.$type === 'PartComponent'
        );

        const komponente = bestandteil?.component?.ref;
        if (!komponente) return undefined;

        return komponente.ports.find((bp: PartPort) => bp.port.name === port.name);
    }

}

function checkUniqueNames(nodes: Array<AstNode & { name: string }>, accept: ValidationAcceptor, seen = new Set<string>()): void {
    for (const node of nodes) {
        if (seen.has(node.name)) {
            accept('error', `Duplicate name '${node.name}'.`, { node, property: 'name' });
        }
        seen.add(node.name);
    }
}

function checkImplicitCall(action: StateAction | ScenarioAction, accept: ValidationAcceptor): void {
    if (action.callee.ref?.parameters.length) {
        accept('error', 'This invocation requires a parameterless function.', { node: action, property: 'callee' });
    }
}

function checkArguments(call: Call | QueryInvocation, accept: ValidationAcceptor): void {
    const operation = call.callee.ref;
    if (!operation) return;
    const args = call.argument ? [call.argument, ...call.additionalArguments] : [];
    if (args.length !== operation.parameters.length) {
        accept('error', `Expected ${operation.parameters.length} arguments.`, { node: call, property: 'callee' });
        return;
    }
    args.forEach((arg, index) => {
        const binding = arg.ref;
        if (!binding) return;
        const expected = operation.parameters[index].valueType;
        const actual = isReceive(binding) ? binding.signal.ref : binding.valueType.signal?.ref;
        const actualBoolean = !isReceive(binding) && binding.valueType.boolean;
        if (actualBoolean !== expected.boolean || actual !== expected.signal?.ref) {
            accept('error', 'Argument type does not match parameter.', { node: call, property: 'callee' });
        }
    });
}
