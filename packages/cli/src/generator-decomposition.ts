import type { Model, Component } from 'sysla-language';
import { GraphVizGeneratorBase, COLOR_COMPONENT, GraphGenerator } from './graphviz-generator.js';

export class GeneratorDecomposition extends GraphVizGeneratorBase implements GraphGenerator {

    generate(model: Model, outputDir: string): string[] {
        this.resetIds();
        return this.generateGraphs(model.components, {
            outputDir,
            getName: component => `${component.name}_Decomposition`,
            compile: component => this.compileComponent(component)
        });
    }

    generateForComponent(component: Component, args: { outputDir: string; model?: Model }): string[] {
        this.resetIds();
        return this.generateGraphs([component], {
            outputDir: args.outputDir,
            getName: c => `${c.name}_Decomposition`,
            compile: c => this.compileComponent(c)
        });
    }

    private compileComponent(component: Component): string {
        const id1 = this.getNodeId(component);
        const name1 = component.name;
        const type1 = 'Component';
        
        let output = 'digraph G\n{\n';
        
        // Component node
        output += `    node [shape=box, fillcolor=${COLOR_COMPONENT}, style=filled, label = ${this.createLabel(name1, type1)}]; ${id1};\n`;
        
        // Ports
        for (const port of component.ports) {
            output += this.renderPortNode(port);
            output += `    ${id1} -> ${this.getPortNodeId(port)} [dir=none];\n`;
        }
        
        // Parts (instances)
        for (const partComponent of component.parts) {
            const id2 = this.getNodeId(partComponent);
            const name2 = `${partComponent.instance.name}:${partComponent.component.ref?.name || '???'}`;
            const type2 = 'Instance';
            
            output += `    node [shape=box, fillcolor=${COLOR_COMPONENT}, style=filled, label = ${this.createLabel(name2, type2)}]; ${id2};\n`;
            output += `    ${id1} -> ${id2} [dir=none];\n`;
        }
        
        output += '}\n';
        return output;
    }
}
