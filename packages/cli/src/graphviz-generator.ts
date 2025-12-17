import type { PartComponent, PartPort, Component, Model } from 'sysla-language';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Colors for GraphViz
export const COLOR_COMPONENT = 'bisque';
export const COLOR_PORT = 'lavender';
export const COLOR_SIGNAL = 'aquamarine';

export interface GraphGenerator {
    generate(model: Model, outputDir: string): string[];
    generateForComponent(
        component: Component,
        args: {
            outputDir: string;
            model?: Model;
        }
    ): string[];
}

/**
 * Base class for GraphViz generators that share common utilities
 */
export class GraphVizGeneratorBase {
    protected nodeIds = new Map<string, string>();
    protected nodeIdCounter = 0;
    protected objCounter = 0;
    protected objIds = new WeakMap<any, number>();

    protected resetIds(): void {
        this.nodeIdCounter = 0;
        this.nodeIds.clear();
        this.objCounter = 0;
        this.objIds = new WeakMap<any, number>();  // Neue WeakMap erstellen!
    }

    protected getObjId(obj: any): number {
        if (!this.objIds.has(obj)) {
            this.objIds.set(obj, this.objCounter++);
        }
        return this.objIds.get(obj)!;
    }

    protected getNodeId(obj: any, suffix?: string): string {
        const objId = this.getObjId(obj);
        const key = suffix ? `${objId}_${suffix}` : `${objId}`;
        
        if (!this.nodeIds.has(key)) {
            this.nodeIds.set(key, `ID_${this.nodeIdCounter++}`);
        }
        return this.nodeIds.get(key)!;
    }

    protected createLabel(name: string, type: string, subports?: string[]): string {
        const subportInfo = subports && subports.length > 0
            ? ` [${subports.join(', ')}]`
            : '';
        return `< <FONT POINT-SIZE="15">${name}${subportInfo}</FONT><br/><FONT POINT-SIZE="10">${type}</FONT> >`;
    }

    protected getPortDirection(port: PartPort): string {
        if (port.bidirectional) {
            return '[dir=none]';
        } else if (!port.input && !port.output) {
            return '[dir=none]';
        } else if (port.input) {
            return '[dir=back]';
        }
        return '';
    }

    protected generateGraphs<T>(
        items: Iterable<T>,
        options: {
            outputDir: string;
            getName: (item: T) => string;
            compile: (item: T) => string;
        }
    ): string[] {
        const graphNames: string[] = [];
        for (const item of items) {
            this.resetIds();
            const nameGraph = options.getName(item);
            const dotContent = options.compile(item);
            this.writeDotFile(options.outputDir, nameGraph, dotContent);
            graphNames.push(nameGraph);
        }
        return graphNames;
    }

    protected writeDotFile(outputDir: string, nameGraph: string, dotContent: string): void {
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        const filePath = path.join(outputDir, `${nameGraph}.dot`);
        fs.writeFileSync(filePath, dotContent);
    }

    protected getPortNodeId(port: PartPort, instance?: PartComponent): string {
        return instance
            ? this.getNodeId(instance, port.port.name)
            : this.getNodeId(port);
    }

    protected renderPortNode(
        port: PartPort,
        options?: {
            instance?: PartComponent;
            showSignal?: boolean;
            indent?: string;
        }
    ): string {
        const indent = options?.indent ?? '    ';
        const showSignal = options?.showSignal ?? true;
        const portId = this.getPortNodeId(port, options?.instance);
        const name1 = port.port.name;
        const type1 = 'Port';
        const subports = port.port.subports?.map(sp => sp.name) || [];

        let output = `${indent}node [shape=box, fillcolor=${COLOR_PORT}, style=filled, label = ${this.createLabel(name1, type1, subports)}]; ${portId};\n`;

        if (showSignal && port.signal?.ref) {
            const signalId = this.getNodeId(port.signal.ref);
            const name2 = port.signal.ref.name;
            const type2 = 'Signal';

            output += `${indent}node [shape=box, fillcolor=${COLOR_SIGNAL}, style=filled, label = ${this.createLabel(name2, type2)}]; ${signalId};\n`;
            output += `${indent}${portId} -> ${signalId} ${this.getPortDirection(port)};\n`;
        }

        return output;
    }
}
