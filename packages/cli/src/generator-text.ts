import type { Model, Component, PartPort } from 'sysla-language';
import * as fs from 'node:fs';
import * as path from 'node:path';

export class GeneratorText {
    generate(model: Model, outputDir: string, baseName: string): string {
        const filePath = path.join(outputDir, `${baseName}.txt`);
        
        let output = `=== SysLa Model ${baseName} ===\n\n`;
        
        output += '--- Signals ---\n';
        for (const signal of model.signals) {
            output += `Signal: ${signal.name}\n`;
        }
        output += '\n';
        
        output += '--- Components ---\n';
        for (const component of model.components) {
            output += this.generateComponent(component);
            output += '\n';
        }
        
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        fs.writeFileSync(filePath, output);
        
        return filePath;
    }

    private generateComponent(component: Component): string {
        let output = `\nComponent: ${component.name}\n`;
        
        // Ports
        if (component.ports.length > 0) {
            output += '  Ports:\n';
            for (const partPort of component.ports) {
                output += this.generatePort(partPort, '    ');
            }
        }
        
        // Parts
        if (component.parts.length > 0) {
            output += '  Parts:\n';
            for (const part of component.parts) {
                output += `    - ${part.component.ref?.name || '???'} as ${part.instance.name}\n`;
            }
        }
        
        // Connections
        if (component.connections.length > 0) {
            output += '  Connections:\n';
            for (const connection of component.connections) {
                const component1 = connection.components1?.$refText || connection.components1?.ref?.name || '???';
                const component2 = connection.components2?.$refText || connection.components2?.ref?.name || '???';
                const port1 = (connection.port1 as any)?.$refText || (connection.port1 as any)?.ref?.name || '???';
                const port2 = (connection.port2 as any)?.$refText || (connection.port2 as any)?.ref?.name || '???';
                
                output += `    - ${component1}:${port1} -> ${component2}:${port2}\n`;
            }
        }

        // Delegations
        if (component.delegations.length > 0) {
            output += '  Delegations:\n';
            for (const delegation of component.delegations) {
                const component2 = delegation.components2?.$refText || delegation.components2?.ref?.name || '???';
                const port1 = (delegation.port1 as any)?.$refText || (delegation.port1 as any)?.ref?.name || '???';
                const port2 = (delegation.port2 as any)?.$refText || (delegation.port2 as any)?.ref?.name || '???';
                
                output += `    - ${port1} -> ${component2}:${port2}\n`;
            }
        }
        
        return output;
    }

    private generatePort(partPort: PartPort, indent: string): string {
        const port = partPort.port;
        let output = `${indent}Port ${port.name}`;
        
        // Direction
        if (partPort.output) {
            output += ' (Output)';
        } else if (partPort.input) {
            output += ' (Input)';
        } else if (partPort.bidirectional) {
            output += ' (Bidirectional)';
        }
        
        // Signal
        if (partPort.signal) {
            output += ` Signal: ${partPort.signal.ref?.name || '???'}`;
        }
        
        output += '\n';
        
        // Subports (if present)
        if (port.subports && port.subports.length > 0) {
            for (const subport of port.subports) {
                output += `${indent}  [${subport.name}]\n`;
            }
        }
        
        return output;
    }
}
