import type { PartComponent, PartPort, Connection, Component } from 'sysla-language';

export class Anchor {
    constructor(
        public partComponent: PartComponent,
        public partPort: PartPort
    ) {}
}

export class InternalConnection {
    anchor1: Anchor;
    anchor2: Anchor;

    constructor(anchor1: Anchor | Connection, anchor2?: Anchor) {
        if (anchor2) {
            // Constructor: new InternalConnection(anchor1, anchor2)
            this.anchor1 = anchor1 as Anchor;
            this.anchor2 = anchor2;
        } else {
            // Constructor: new InternalConnection(connection)
            const connection = anchor1 as Connection;
            
            // Find part components for both ends
            const component = this.findComponent(connection);
            const partComponent1 = component?.parts.find(t => t.instance.name === connection.components1?.ref?.name);
            const partComponent2 = component?.parts.find(t => t.instance.name === connection.components2?.ref?.name);
            
            // Find part ports for both ends
            const partPort1 = partComponent1?.component?.ref?.ports.find(p => p.port.name === connection.port1?.ref?.name);
            const partPort2 = partComponent2?.component?.ref?.ports.find(p => p.port.name === connection.port2?.ref?.name);
            
            if (!partComponent1 || !partComponent2 || !partPort1 || !partPort2) {
                throw new Error('Could not resolve connection references');
            }
            
            this.anchor1 = new Anchor(partComponent1, partPort1);
            this.anchor2 = new Anchor(partComponent2, partPort2);
        }
    }

    private findComponent(connection: Connection): Component | undefined {
        let node: any = connection;
        while (node) {
            if (node.$type === 'Component') {
                return node as Component;
            }
            node = node.$container;
        }
        return undefined;
    }
}
