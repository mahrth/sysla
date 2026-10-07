import type { Model, Component } from 'sysla-language';
import { GraphVizGeneratorBase, type GraphGenerator } from './graphviz-generator.js';

export class GeneratorDecomposition extends GraphVizGeneratorBase implements GraphGenerator {

    generate(model: Model, outputDir: string): string[] {
        return this.generateGraphs(model.components, {
            outputDir,
            getName: component => `${component.name}_Decomposition`,
            compile: component => this.compileComponent(component)
        });
    }

    generateForComponent(component: Component, args: { outputDir: string; model?: Model }): string[] {
        return this.generateGraphs([component], {
            outputDir: args.outputDir,
            getName: c => `${c.name}_Decomposition`,
            compile: c => this.compileComponent(c)
        });
    }

    private compileComponent(component: Component): string {
        let output = this.beginGraph(`${component.name} — Decomposition`);
        output += this.renderComponentNode(component);
        for (const part of component.parts) {
            if (part.component.ref) {
                // This view shows the component's own ports and its direct parts.
                output += this.renderComponentNode(part.component.ref, part, []);
                output += `    ${this.getNodeId(component)} -> ${this.getNodeId(part)} [dir=none, color="#555555"];\n`;
            }
        }
        return output + '}\n';
    }
}
