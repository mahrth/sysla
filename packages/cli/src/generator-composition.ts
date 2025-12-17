import type { Model, Component, PartComponent } from 'sysla-language';
import { GraphVizGeneratorBase, COLOR_COMPONENT, COLOR_SIGNAL, GraphGenerator } from './graphviz-generator.js';
import { Anchor, InternalConnection } from './generator-helpers.js';

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
        const id1 = this.getNodeId(partComponent);
        const name1 = `${partComponent.instance.name}:${partComponent.component.ref?.name || '???'}`;
        const type1 = 'Instance';
        
        let output = 'digraph G\n{\n';
        
        // Central instance
        output += `    node [shape=box, fillcolor=${COLOR_COMPONENT}, style=filled, label = ${this.createLabel(name1, type1)}]; ${id1};\n`;
        
        // Neighbor instances and connections
        for (const connection of connections) {
            const id2 = this.getNodeId(connection.anchor2.partComponent);
            const name2 = `${connection.anchor2.partComponent.instance.name}:${connection.anchor2.partComponent.component.ref?.name || '???'}`;
            const type2 = 'Instance';
            
            output += `    node [shape=box, fillcolor=${COLOR_COMPONENT}, style=filled, label = ${this.createLabel(name2, type2)}]; ${id2};\n`;
            output += this.compileConnection(connection);
        }
        
        output += '}\n';
        return output;
    }

    private compileConnection(connection: InternalConnection): string {
        const hash1 = this.getNodeId(connection.anchor1.partComponent);
        const hash2 = this.getNodeId(connection.anchor2.partComponent);
        
        let output = '';
        output += this.compilePartPort(hash1, connection.anchor1);
        output += this.compilePartPort(hash2, connection.anchor2);
        
        const hashPort1 = this.getPortNodeId(connection.anchor1.partPort, connection.anchor1.partComponent);
        const hashPort2 = this.getPortNodeId(connection.anchor2.partPort, connection.anchor2.partComponent);
        
        // Signal node (if available)
        if (connection.anchor1.partPort.signal?.ref) {
            // Use the signal object directly as a key
            const hash3 = this.getNodeId(connection.anchor1.partPort.signal.ref);
            const name3 = connection.anchor1.partPort.signal.ref.name;
            const type3 = 'Signal';
            
            output += `    node [shape=box, fillcolor=${COLOR_SIGNAL}, style=filled, label = ${this.createLabel(name3, type3)}]; ${hash3};\n`;
            
            // Connections to signal with direction
            const dir1 = this.getPortDirection(connection.anchor1.partPort);
            const dir2 = this.getPortDirection(connection.anchor2.partPort);
            
            output += `    ${hashPort1} -> ${hash3} ${dir1};\n`;
            output += `    ${hashPort2} -> ${hash3} ${dir2};\n`;
        } else {
            // Direct connection without a signal
            output += `    ${hashPort1} -> ${hashPort2} [dir=none];\n`;
        }
        
        return output;
    }

    private compilePartPort(parentNodeId: string, anchor: Anchor): string {
        const port = anchor.partPort;
        const portNode = this.renderPortNode(port, {
            instance: anchor.partComponent,
            showSignal: false
        });
        const portNodeId = this.getPortNodeId(port, anchor.partComponent);
        
        return `${portNode}    ${parentNodeId} -> ${portNodeId} [dir=none];\n`;
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
                list = neighbors.get(partComponent2);
                if (!list) {
                    list = [];
                    neighbors.set(partComponent2, list);
                }
                list.push(new InternalConnection(internalConnection.anchor2, internalConnection.anchor1));
            } catch (error) {
                console.error(`Warning: Could not resolve connection: ${error}`);
            }
        }
        
        return neighbors;
    }
}
