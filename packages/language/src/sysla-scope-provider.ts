import { type AstNode, AstUtils, DefaultScopeProvider, ReferenceInfo, Scope, LangiumCoreServices } from 'langium';
import { Component, Connection, Delegation, PartPort, PartComponent, isMachineDefinition, isFunctionDefinition, isReceive, isBranch, isModel, isStateRequirement, isScenarioDefinition, isScenarioAction, isGuard, isFunctionalContext, isEventDeclaration, isConditional, isLoop, type Binding } from './generated/ast.js';

/** Parameters and receives preceding this use in its enclosing statement blocks. */
export function visibleBindings(node: AstNode): Binding[] {
    const bindings: Binding[] = [];
    let child = node;
    while (child.$container) {
        const parent = child.$container;
        if ((isFunctionDefinition(parent) || isLoop(parent) || isConditional(parent)) && child.$containerProperty === 'steps') {
            bindings.push(...parent.steps.slice(0, child.$containerIndex).filter(isReceive));
        }
        if (isFunctionDefinition(parent)) {
            bindings.push(...(parent.declaration.ref?.parameters ?? []));
            break;
        }
        child = parent;
    }
    return bindings;
}

export class SyslaScopeProvider extends DefaultScopeProvider {
    private readonly documents;

    constructor(services: LangiumCoreServices) {
        super(services);
        this.documents = services.shared.workspace.LangiumDocuments;
    }

    override getScope(context: ReferenceInfo): Scope {
        const node = context.container;
        const property = context.property;
        const view = AstUtils.getContainerOfType(node, isFunctionalContext);
        if (view && property !== 'owner') {
            if (property === 'operation') {
                const target = view.subject.ref?.$container.component.ref;
                return this.createScopeForNodes(target?.functions ?? []);
            }
            const parts = view.owner.ref?.parts.map(part => part.instance) ?? [];
            return this.createScopeForNodes(property === 'neighbor' ? parts.filter(part => part !== view.subject.ref) : parts);
        }
        if (isEventDeclaration(node)) {
            if (property === 'part') return this.createScopeForNodes(node.$container.parts.map(part => part.instance));
            if (property === 'source') return this.createScopeForNodes(node.part?.ref?.$container.component.ref?.events ?? []);
        }
        const scenario = AstUtils.getContainerOfType(node, isScenarioDefinition);
        if (scenario) {
            if (property === 'declaration') {
                return this.createScopeForNodes(scenario.owner.ref?.scenarios ?? []);
            }
            if (property === 'part') {
                return this.createScopeForNodes(scenario.owner.ref?.parts.map(part => part.instance) ?? []);
            }
            if (property === 'callee' && isScenarioAction(node)) {
                return this.createScopeForNodes(node.part.ref?.$container.component.ref?.functions ?? []);
            }
        }
        if (isStateRequirement(node)) {
            if (property === 'machine') {
                return this.createScopeForNodes(node.$container.$container.machines);
            }
            const declaration = node.machine.ref;
            const states = this.documents.all.flatMap(document => {
                const model = document.parseResult.value;
                if (!declaration || !isModel(model)) return [];
                return model.machines.filter(def => def.declaration.ref === declaration).flatMap(def => def.states);
            });
            return this.createScopeForNodes(states);
        }
        const machine = AstUtils.getContainerOfType(node, isMachineDefinition);
        if (machine && property !== 'owner') {
            if (property === 'declaration') {
                return this.createScopeForNodes(machine.owner.ref?.machines ?? []);
            }
            if (property === 'callee') {
                return this.createScopeForNodes(machine.owner.ref?.functions ?? []);
            }
            if (property === 'effect') {
                return this.createScopeForNodes(machine.owner.ref?.functions.filter(fn => !fn.parameters.length) ?? []);
            }
            if (isGuard(node)) {
                if (property === 'part') return this.createScopeForNodes(machine.owner.ref?.parts.map(part => part.instance) ?? []);
                return this.createScopeForNodes(node.part.ref?.$container.component.ref?.functions ?? []);
            }
            if (property === 'trigger') {
                const owner = machine.owner.ref;
                const signals = owner?.ports.flatMap(port => {
                    const signal = port.signal?.ref;
                    return (port.input || port.bidirectional) && signal?.event ? [signal] : [];
                }) ?? [];
                return this.createScopeForNodes([...(owner?.events ?? []), ...signals]);
            }
            return this.createScopeForNodes(machine.states);
        }

        const definition = AstUtils.getContainerOfType(node, isFunctionDefinition);
        if (definition) {
            switch (property) {
                case 'declaration':
                case 'callee':
                    return this.createScopeForNodes(definition.owner.ref?.functions ?? []);
                case 'event':
                    return this.createScopeForNodes(definition.owner.ref?.events ?? []);
                case 'port': {
                    const inputs = definition.owner.ref?.ports.filter(port =>
                        (port.input || port.bidirectional) && isReceive(node) && port.signal?.ref === node.signal.ref
                    ) ?? [];
                    return this.createScopeForNodes(inputs.map(input => input.port));
                }
                case 'binding':
                case 'argument':
                case 'additionalArguments':
                    return this.createScopeForNodes(visibleBindings(node));
                case 'value':
                    if (isBranch(node)) {
                        const binding = node.$container.binding.ref;
                        const signal = binding && (isReceive(binding) ? binding.signal.ref : binding.valueType.signal?.ref);
                        return this.createScopeForNodes(signal?.values ?? []);
                    }
            }
        }
        // Instanz-Referenzen in Verbindungen und Delegationen
        if (context.property === 'components1' || context.property === 'components2') {
            const component = AstUtils.getContainerOfType(context.container, (n): n is Component => 
                n.$type === 'Component'
            );
            
            if (component) {
                const instances = component.parts.map(t => t.instance);
                return this.createScopeForNodes(instances);
            }
        }
        
        // Port-Referenzen in Verbindungen
        if (context.container.$type === 'Connection') {
            const connection = context.container as Connection;
            
            if (context.property === 'port1' && connection.components1?.ref) {
                // port1: Ports der Komponente von Instanz components1
                // Navigiere von Instanz zurück zu PartComponent
                const partComponent = AstUtils.getContainerOfType(connection.components1.ref, (n): n is PartComponent => 
                    n.$type === 'PartComponent'
                );
                const component = partComponent?.component?.ref;
                if (component) {
                    const ports = component.ports.map((bp: PartPort) => bp.port);
                    return this.createScopeForNodes(ports);
                }
            }
            
            if (context.property === 'port2' && connection.components2?.ref) {
                // port2: Ports der Komponente von Instanz components2
                const partComponent = AstUtils.getContainerOfType(connection.components2.ref, (n): n is PartComponent => 
                    n.$type === 'PartComponent'
                );
                const component = partComponent?.component?.ref;
                if (component) {
                    const ports = component.ports.map((bp: PartPort) => bp.port);
                    return this.createScopeForNodes(ports);
                }
            }
        }
        
        // Port-Referenzen in Delegationen
        if (context.container.$type === 'Delegation') {
            const delegation = context.container as Delegation;
            const componentOwner = AstUtils.getContainerOfType(delegation, (n): n is Component => 
                n.$type === 'Component'
            );
            
            if (context.property === 'port1' && componentOwner) {
                // port1: Eigene Ports der umgebenden Komponente
                const ports = componentOwner.ports.map((bp: PartPort) => bp.port);
                return this.createScopeForNodes(ports);
            }
            
            if (context.property === 'port2' && delegation.components2?.ref) {
                // port2: Ports der Komponente von Instanz components2
                const partComponent = AstUtils.getContainerOfType(delegation.components2.ref, (n): n is PartComponent => 
                    n.$type === 'PartComponent'
                );
                const component = partComponent?.component?.ref;
                if (component) {
                    const ports = component.ports.map((bp: PartPort) => bp.port);
                    return this.createScopeForNodes(ports);
                }
            }
        }
        
        return super.getScope(context);
    }
}
