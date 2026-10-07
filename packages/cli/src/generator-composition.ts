import type { Model, Component, PartComponent, PartPort } from 'sysla-language';
import { GraphVizGeneratorBase, type GraphGenerator } from './graphviz-generator.js';
import { InternalConnection } from './generator-helpers.js';

export class GeneratorComposition extends GraphVizGeneratorBase implements GraphGenerator {

    generate(model: Model, outputDir: string): string[] {
        this.resetIds();
        const graphNames: string[] = [];

        for (const component of model.components) {
            const componentGraphNames = this.generateForComponent(component, {
                model,
                outputDir
            });
            graphNames.push(...componentGraphNames);
        }

        return graphNames;
    }

    generateForComponent(component: Component, args: { outputDir: string; model?: Model }): string[] {
        this.resetIds();
        const graphNames: string[] = [];
        const neighbors = this.neighborComponents(component);
        
        for (const [partComponent, connections] of neighbors.entries()) {
            this.resetIds();
            const nameGraph = `${component.name}_Composition_${partComponent.instance.name}`;
            graphNames.push(nameGraph);
            
            const dotContent = this.compileNeighbors(partComponent, connections);
            this.writeDotFile(args.outputDir, nameGraph, dotContent);
        }
        
        return graphNames;
    }

    private compileNeighbors(partComponent: PartComponent, connections: InternalConnection[]): string {
        let output = this.beginGraph(`${partComponent.instance.name} : ${partComponent.component.ref?.name} — Connections`);
        const portsByInstance = new Map<PartComponent, Set<PartPort>>();
        for (const connection of connections) {
            for (const anchor of [connection.anchor1, connection.anchor2]) {
                const ports = portsByInstance.get(anchor.partComponent) ?? new Set<PartPort>();
                ports.add(anchor.partPort);
                portsByInstance.set(anchor.partComponent, ports);
            }
        }
        for (const [instance, ports] of portsByInstance) {
            const component = instance.component.ref;
            if (component) {
                output += this.renderComponentNode(component, instance, component.ports.filter(port => ports.has(port)));
            }
        }
        for (const connection of connections) {
            output += this.renderConnection(connection);
        }
        return output + '}\n';
    }

    private neighborComponents(component: Component): Map<PartComponent, InternalConnection[]> {
        const neighbors = new Map<PartComponent, InternalConnection[]>();

        for (const connection of component.connections) {
            try {
                const internalConnection = new InternalConnection(connection);
                const partComponent1 = internalConnection.anchor1.partComponent;
                const partComponent2 = internalConnection.anchor2.partComponent;
                
                // Add connection to partComponent1 neighbors
                let list = neighbors.get(partComponent1);
                if (!list) {
                    list = [];
                    neighbors.set(partComponent1, list);
                }
                list.push(new InternalConnection(internalConnection.anchor1, internalConnection.anchor2));
                
                // Add connection to partComponent2 neighbors (reverse)
                if (partComponent2 !== partComponent1) {
                    list = neighbors.get(partComponent2);
                    if (!list) {
                        list = [];
                        neighbors.set(partComponent2, list);
                    }
                    list.push(new InternalConnection(internalConnection.anchor2, internalConnection.anchor1));
                }
            } catch (error) {
                console.error(`Warning: Could not resolve connection: ${error}`);
            }
        }
        
        return neighbors;
    }
}
