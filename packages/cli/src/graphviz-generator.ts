import type { PartComponent, PartPort, Component, Model } from 'sysla-language';
import type { Anchor, InternalConnection } from './generator-helpers.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

export const COLOR_COMPONENT = 'bisque';
export const COLOR_PORT = 'lavender';

export interface GraphGenerator {
    generate(model: Model, outputDir: string): string[];
    generateForComponent(
        component: Component,
        args: { outputDir: string; model?: Model }
    ): string[];
}

/** Shared layout and rendering for all Graphviz views. */
export class GraphVizGeneratorBase {
    protected nodeIds = new Map<string, string>();
    protected nodeIdCounter = 0;
    protected objCounter = 0;
    protected objIds = new WeakMap<object, number>();

    protected resetIds(): void {
        this.nodeIdCounter = 0;
        this.nodeIds.clear();
        this.objCounter = 0;
        this.objIds = new WeakMap<object, number>();
    }

    protected getNodeId(obj: object, suffix?: string): string {
        let objId = this.objIds.get(obj);
        if (objId === undefined) {
            objId = this.objCounter++;
            this.objIds.set(obj, objId);
        }
        const key = suffix ? `${objId}_${suffix}` : `${objId}`;
        let nodeId = this.nodeIds.get(key);
        if (!nodeId) {
            nodeId = `ID_${this.nodeIdCounter++}`;
            this.nodeIds.set(key, nodeId);
        }
        return nodeId;
    }

    protected beginGraph(title: string): string {
        return 'digraph G\n{\n'
            + `    graph [rankdir=LR, nodesep=0.45, ranksep=1.0, splines=spline, pad=0.3, fontname="DejaVu Sans", fontsize=18, labelloc=t, label=${JSON.stringify(title)}];\n`
            + '    node [shape=plain, fontname="DejaVu Sans"];\n'
            + '    edge [fontname="DejaVu Sans", fontsize=9, arrowsize=0.65, penwidth=1.2];\n';
    }

    protected generateGraphs<T>(
        items: Iterable<T>,
        options: { outputDir: string; getName: (item: T) => string; compile: (item: T) => string }
    ): string[] {
        const graphNames: string[] = [];
        for (const item of items) {
            this.resetIds();
            const nameGraph = options.getName(item);
            this.writeDotFile(options.outputDir, nameGraph, options.compile(item));
            graphNames.push(nameGraph);
        }
        return graphNames;
    }

    protected writeDotFile(outputDir: string, nameGraph: string, dotContent: string): void {
        fs.mkdirSync(outputDir, { recursive: true });
        fs.writeFileSync(path.join(outputDir, `${nameGraph}.dot`), dotContent);
    }

    protected getPortNodeId(port: PartPort, instance?: PartComponent): string {
        return instance ? this.getNodeId(instance, port.port.name) : this.getNodeId(port);
    }

    protected escapeHtml(text: string): string {
        return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    protected renderComponentNode(component: Component, instance?: PartComponent, ports = component.ports): string {
        const name = instance ? `${instance.instance.name}:${component.name}` : component.name;
        return this.renderPortTable(this.getNodeId(instance ?? component), name, instance ? 'Instance' : 'Component', ports, instance);
    }

    protected renderPortTable(
        nodeId: string,
        name: string,
        type: string,
        ports: PartPort[],
        instance?: PartComponent,
        boundary = false
    ): string {
        const left = ports.filter(port => boundary ? port.output : port.input);
        const right = ports.filter(port => boundary ? port.input : port.output);
        const undirected = ports.filter(port => !port.input && !port.output);
        const title = this.escapeHtml(name).replace(':', ' :<BR/>');
        const rows = [`<TR><TD COLSPAN="2" BGCOLOR="${COLOR_COMPONENT}"><FONT POINT-SIZE="12"><B>${title}</B></FONT><BR/><FONT POINT-SIZE="9">${this.escapeHtml(type)}</FONT></TD></TR>`];

        for (let index = 0; index < Math.max(left.length, right.length); index++) {
            const leftPort = left[index];
            const rightPort = right[index];
            if (leftPort && rightPort) {
                rows.push(`<TR>${this.renderPortCell(leftPort, instance)}${this.renderPortCell(rightPort, instance)}</TR>`);
            } else {
                const port = leftPort ?? rightPort;
                if (port) {
                    rows.push(`<TR>${this.renderPortCell(port, instance, true)}</TR>`);
                }
            }
        }
        // Ports without a preferred direction span the box so either side can be used.
        for (const port of undirected) {
            rows.push(`<TR>${this.renderPortCell(port, instance, true)}</TR>`);
        }
        return `    ${nodeId} [label=<<TABLE BORDER="1" CELLBORDER="1" CELLSPACING="0" CELLPADDING="4">${rows.join('')}</TABLE>>];\n`;
    }

    private renderPortCell(port: PartPort, instance?: PartComponent, fullWidth = false): string {
        const subports = port.port.subports.map(subport => subport.name);
        const name = port.port.name + (subports.length ? ` [${subports.join(', ')}]` : '');
        const direction = port.input ? 'Input' : port.output ? 'Output' : port.bidirectional ? 'Bidirectional' : 'Port';
        const signal = port.signal?.ref;
        const details = signal ? `${direction} ${signal.name}` : direction;
        return `<TD PORT="${this.getPortNodeId(port, instance)}"${fullWidth ? ' COLSPAN="2"' : ''} ALIGN="CENTER" BALIGN="CENTER" BGCOLOR="${COLOR_PORT}"><FONT POINT-SIZE="11">${this.escapeHtml(name)}</FONT><BR/><FONT POINT-SIZE="9">${this.escapeHtml(details)}</FONT></TD>`;
    }

    protected getPortEndpoint(nodeId: string, port: PartPort, instance?: PartComponent, boundary = false): string {
        const side = port.input ? (boundary ? ':e' : ':w') : port.output ? (boundary ? ':w' : ':e') : '';
        return `${nodeId}:${this.getPortNodeId(port, instance)}${side}`;
    }

    protected getAnchorEndpoint(anchor: Anchor): string {
        return this.getPortEndpoint(this.getNodeId(anchor.partComponent), anchor.partPort, anchor.partComponent);
    }

    protected renderConnection(connection: InternalConnection): string {
        let { anchor1, anchor2 } = connection;
        // Normalize flow independently of the order of endpoints in the model.
        if (anchor1.partPort.input) {
            [anchor1, anchor2] = [anchor2, anchor1];
        }
        const attributes = ['color="#555555"'];
        if (anchor1.partPort.bidirectional) {
            attributes.push('dir=both');
        } else if (!anchor1.partPort.output) {
            attributes.push('dir=none');
        }
        return `    ${this.getAnchorEndpoint(anchor1)} -> ${this.getAnchorEndpoint(anchor2)} [${attributes.join(', ')}];\n`;
    }
}
