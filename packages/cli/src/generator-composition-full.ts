import type { Model, Component, PartPort, PartComponent } from 'sysla-language';
import { GraphVizGeneratorBase, COLOR_COMPONENT, GraphGenerator } from './graphviz-generator.js';

export class GeneratorCompositionFull extends GraphVizGeneratorBase implements GraphGenerator {

    generate(model: Model, outputDir: string): string[] {
        this.resetIds();
        return this.generateGraphs(model.components, {
            outputDir,
            getName: component => `${component.name}_Composition`,
            compile: component => this.compileComponent(component)
        });
    }

    generateForComponent(component: Component, args: { outputDir: string; model?: Model }): string[] {
        this.resetIds();
        return this.generateGraphs([component], {
            outputDir: args.outputDir,
            getName: c => `${c.name}_Composition`,
            compile: c => this.compileComponent(c)
        });
    }

    private compileComponent(component: Component): string {
        const id1 = this.getNodeId(component);
        const name1 = component.name;
        const type1 = 'Component';
        
        let output = 'digraph G\n{\n';
        
        // Component node
        output += `\tnode [shape=box, fillcolor=${COLOR_COMPONENT}, style=filled, label = ${this.createLabel(name1, type1)}]; ${id1};\n`;
        
        // Collect delegations with instance context
        const delegations = this.collectDelegations(component);
        
        // Component ports
        for (const partPort of component.ports) {
            const delegationInfo = delegations.get(partPort.port.name);
            output += this.renderPortNode(partPort, { showSignal: !delegationInfo, indent: '\t' });
            output += `\t${id1} -> ${this.getPortNodeId(partPort)} [dir=none];\n`;
        }
        
        // Parts (instances)
        for (const partComponent of component.parts) {
            const id2 = this.getNodeId(partComponent);
            const name2 = `${partComponent.instance.name}:${partComponent.component.ref?.name || '???'}`;
            const type2 = 'Instance';
            
            output += `\tnode [shape=box, fillcolor=${COLOR_COMPONENT}, style=filled, label = ${this.createLabel(name2, type2)}]; ${id2};\n`;
            output += `\t${id1} -> ${id2} [dir=none];\n`;
            
            // Ports of the parts with instance context
            const childComponent = partComponent.component.ref;
            if (childComponent) {
                for (const childPort of childComponent.ports) {
                    output += this.renderPortNode(childPort, { instance: partComponent, indent: '\t' });
                    const portId = this.getPortNodeId(childPort, partComponent);
                    output += `\t${id2} -> ${portId} [dir=none];\n`;
                }
            }
        }
        
        // Delegations
        for (const [proxyPortName, target] of delegations.entries()) {
            const proxyPort = component.ports.find(p => p.port.name === proxyPortName);
            if (proxyPort) {
                const delegatedPortId = this.getPortNodeId(target.port, target.instance);
                output += `\t${this.getPortNodeId(proxyPort)} -> ${delegatedPortId} [style=dashed, dir=none, color=black];\n`;
            }
        }
        
        output += '}\n';
        return output;
    }

    private collectDelegations(component: Component): Map<string, { instance: PartComponent; port: PartPort }> {
        const delegations = new Map<string, { instance: PartComponent; port: PartPort }>();
        const portCache = new Map<PartComponent, Map<string, PartPort>>();

        const resolveInstance = (ref: any): PartComponent | undefined => {
            if (!ref) {
                return undefined;
            }
            if ((ref as PartComponent).component) {
                return ref as PartComponent;
            }
            return component.parts.find(part => part.instance.name === ref.name);
        };

        const resolvePort = (instance?: PartComponent, portName?: string): PartPort | undefined => {
            if (!instance || !portName) {
                return undefined;
            }
            let cache = portCache.get(instance);
            if (!cache) {
                cache = new Map<string, PartPort>();
                const ports = instance.component.ref?.ports ?? [];
                for (const p of ports) {
                    cache.set(p.port.name, p);
                }
                portCache.set(instance, cache);
            }
            return cache.get(portName);
        };

        for (const delegation of component.delegations) {
            const proxyPortName = delegation.port1?.ref?.name;
            const instance = resolveInstance(delegation.components2?.ref);
            const delegatedPort = resolvePort(instance, delegation.port2?.ref?.name);
            if (proxyPortName && instance && delegatedPort) {
                delegations.set(proxyPortName, { instance, port: delegatedPort });
            }
        }

        return delegations;
    }
}
