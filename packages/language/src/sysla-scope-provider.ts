import { AstUtils, DefaultScopeProvider, ReferenceInfo, Scope } from 'langium';
import { Component, Connection, Delegation, PartPort, PartComponent } from './generated/ast.js';

export class SyslaScopeProvider extends DefaultScopeProvider {
    override getScope(context: ReferenceInfo): Scope {
        // Instanz-Referenzen in Verbindungen und Delegationen
        if (context.property === 'components1' || context.property === 'components2') {
            const component = AstUtils.getContainerOfType(context.container, (n): n is Component => 
                n.$type === 'Component'
            );
            
            if (component) {
                const instances = component.parts.map(t => t.instance);
                return this.createScopeForNodes(instances);
            }
        }
        
        // Port-Referenzen in Verbindungen
        if (context.container.$type === 'Connection') {
            const connection = context.container as Connection;
            
            if (context.property === 'port1' && connection.components1?.ref) {
                // port1: Ports der Komponente von Instanz components1
                // Navigiere von Instanz zurück zu PartComponent
                const partComponent = AstUtils.getContainerOfType(connection.components1.ref, (n): n is PartComponent => 
                    n.$type === 'PartComponent'
                );
                const component = partComponent?.component?.ref;
                if (component) {
                    const ports = component.ports.map((bp: PartPort) => bp.port);
                    return this.createScopeForNodes(ports);
                }
            }
            
            if (context.property === 'port2' && connection.components2?.ref) {
                // port2: Ports der Komponente von Instanz components2
                const partComponent = AstUtils.getContainerOfType(connection.components2.ref, (n): n is PartComponent => 
                    n.$type === 'PartComponent'
                );
                const component = partComponent?.component?.ref;
                if (component) {
                    const ports = component.ports.map((bp: PartPort) => bp.port);
                    return this.createScopeForNodes(ports);
                }
            }
        }
        
        // Port-Referenzen in Delegationen
        if (context.container.$type === 'Delegation') {
            const delegation = context.container as Delegation;
            const componentOwner = AstUtils.getContainerOfType(delegation, (n): n is Component => 
                n.$type === 'Component'
            );
            
            if (context.property === 'port1' && componentOwner) {
                // port1: Eigene Ports der umgebenden Komponente
                const ports = componentOwner.ports.map((bp: PartPort) => bp.port);
                return this.createScopeForNodes(ports);
            }
            
            if (context.property === 'port2' && delegation.components2?.ref) {
                // port2: Ports der Komponente von Instanz components2
                const partComponent = AstUtils.getContainerOfType(delegation.components2.ref, (n): n is PartComponent => 
                    n.$type === 'PartComponent'
                );
                const component = partComponent?.component?.ref;
                if (component) {
                    const ports = component.ports.map((bp: PartPort) => bp.port);
                    return this.createScopeForNodes(ports);
                }
            }
        }
        
        return super.getScope(context);
    }
}
