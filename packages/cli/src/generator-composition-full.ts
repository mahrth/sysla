import type { Model, Component } from 'sysla-language';
import { GraphVizGeneratorBase, type GraphGenerator } from './graphviz-generator.js';
import { InternalConnection, InternalDelegation } from './generator-helpers.js';

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

        const external = this.renderExternalPorts(component);
        output += external.output;

        for (const part of component.parts) {
            if (part.component.ref) {
                output += this.renderComponentNode(part.component.ref, part);
            }
        }
        for (const connection of component.connections) {
            output += this.renderConnection(new InternalConnection(connection));
        }

        for (const delegation of component.delegations) {
            const resolved = new InternalDelegation(component, delegation);
            output += this.renderDelegation(resolved, external.nodes.get(resolved.port)!);
        }
        return output + '}\n';
    }
}
