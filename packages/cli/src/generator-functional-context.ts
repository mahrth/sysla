import type { Component, FunctionalContext, Model } from 'sysla-language';
import { GraphVizGeneratorBase, type GraphGenerator } from './graphviz-generator.js';

export class GeneratorFunctionalContext extends GraphVizGeneratorBase implements GraphGenerator {
    generate(model: Model, outputDir: string): string[] {
        return model.components.flatMap(component => this.generateForComponent(component, { model, outputDir }));
    }

    generateForComponent(component: Component, { model, outputDir }: { model?: Model; outputDir: string }): string[] {
        return this.generateGraphs(model?.contexts.filter(view => view.owner.ref === component) ?? [], {
            outputDir,
            getName: view => `${component.name}_FunctionalContext_${view.name}`,
            compile: view => this.compile(view)
        });
    }

    private compile(view: FunctionalContext): string {
        const instance = view.subject.ref!;
        const subject = instance.$container.component.$refText;
        let dot = this.beginGraph(`Functional Context — ${subject}`);
        dot += '    subgraph cluster_subject {\n';
        dot += `        label=${JSON.stringify(instance.name + ' : ' + subject)}; margin=16;\n`;
        const operations = new Set(view.interactions.map(interaction => interaction.operation.ref!));
        for (const operation of operations) {
            dot += `        ${this.getNodeId(operation)} [shape=ellipse, label=${JSON.stringify(operation.name)}];\n`;
        }
        dot += '    }\n';
        const neighbors = new Set(view.interactions.map(interaction => interaction.neighbor.ref!));
        for (const neighbor of neighbors) {
            const label = `${neighbor.name} : ${neighbor.$container.component.$refText}`;
            dot += `    ${this.getNodeId(neighbor)} [shape=box, label=${JSON.stringify(label)}];\n`;
        }
        const directions = { '->': 'forward', '<->': 'both', '<-': 'back' };
        for (const interaction of view.interactions) {
            const neighbor = this.getNodeId(interaction.neighbor.ref!);
            const operation = this.getNodeId(interaction.operation.ref!);
            dot += `    ${neighbor} -> ${operation} [dir=${directions[interaction.direction]}];\n`;
        }
        return dot + '}\n';
    }
}
