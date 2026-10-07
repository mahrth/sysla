import type { Model, Component, PartPort } from 'sysla-language';
import { GraphVizGeneratorBase, type GraphGenerator } from './graphviz-generator.js';
import { Anchor, InternalConnection } from './generator-helpers.js';

export class GeneratorCompositionFull extends GraphVizGeneratorBase implements GraphGenerator {

    generate(model: Model, outputDir: string): string[] {
        return this.generateGraphs(model.components, {
            outputDir,
            getName: component => `${component.name}_Composition`,
            compile: component => this.compileComponent(component)
        });
    }

    generateForComponent(component: Component, args: { outputDir: string; model?: Model }): string[] {
        return this.generateGraphs([component], {
            outputDir: args.outputDir,
            getName: c => `${c.name}_Composition`,
            compile: c => this.compileComponent(c)
        });
    }

    private compileComponent(component: Component): string {
        let output = this.beginGraph(`${component.name} — Composition`);
        if (component.parts.length === 0) {
            return output + this.renderComponentNode(component) + '}\n';
        }

        // External inputs feed the parts; external outputs receive their signals.
        const boundaryNodes = new Map<PartPort, string>();
        const groups = [
            { suffix: 'inputs', title: 'External inputs', ports: component.ports.filter(port => port.input), rank: 'source' },
            { suffix: 'outputs', title: 'External outputs', ports: component.ports.filter(port => port.output), rank: 'sink' },
            { suffix: 'ports', title: 'External ports', ports: component.ports.filter(port => !port.input && !port.output) }
        ];
        for (const group of groups) {
            if (group.ports.length === 0) {
                continue;
            }
            const nodeId = this.getNodeId(component, group.suffix);
            output += this.renderPortTable(nodeId, component.name, group.title, group.ports, undefined, true);
            for (const port of group.ports) {
                boundaryNodes.set(port, nodeId);
            }
            if (group.rank) {
                output += `    { rank=${group.rank}; ${nodeId}; }\n`;
            }
        }

        for (const part of component.parts) {
            if (part.component.ref) {
                output += this.renderComponentNode(part.component.ref, part);
            }
        }
        for (const connection of component.connections) {
            output += this.renderConnection(new InternalConnection(connection));
        }

        for (const delegation of component.delegations) {
            const proxyPort = component.ports.find(port => port.port === delegation.port1.ref);
            const part = component.parts.find(part => part.instance === delegation.components2.ref);
            const delegatedPort = part?.component.ref?.ports.find(port => port.port === delegation.port2.ref);
            const boundaryNode = proxyPort && boundaryNodes.get(proxyPort);
            if (!proxyPort || !part || !delegatedPort || !boundaryNode) {
                continue;
            }
            let start = this.getPortEndpoint(boundaryNode, proxyPort, undefined, true);
            let end = this.getAnchorEndpoint(new Anchor(part, delegatedPort));
            if (proxyPort.output) {
                [start, end] = [end, start];
            }
            const attributes = ['style=dashed', 'color="#777777"'];
            if (proxyPort.bidirectional) {
                attributes.push('dir=both');
            } else if (!proxyPort.input && !proxyPort.output) {
                attributes.push('dir=none');
            }
            output += `    ${start} -> ${end} [${attributes.join(', ')}];\n`;
        }
        return output + '}\n';
    }
}
