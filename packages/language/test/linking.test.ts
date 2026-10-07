import { EmptyFileSystem, URI } from 'langium';
import { describe, expect, test } from 'vitest';
import { createSyslaServices, type Model } from 'sysla-language';
import { parseModel } from './helpers.js';

describe('Linking SysLa', () => {
    test('resolves equally named ports against the correct instance', async () => {
        const document = await parseModel(`
            Signal Data
            Component Source Port P Output Data
            Component Sink Port P Input Data
            Component Root
                Part Source as source
                Part Sink as sink
                Connection source:P - sink:P
        `);
        expect(document.diagnostics).toHaveLength(0);
        const [source, sink, root] = document.parseResult.value.components;
        const connection = root.connections[0];
        expect(connection.components1.ref).toBe(root.parts[0].instance);
        expect(connection.components2.ref).toBe(root.parts[1].instance);
        expect(connection.port1.ref).toBe(source.ports[0].port);
        expect(connection.port2.ref).toBe(sink.ports[0].port);
    });

    test('resolves a delegation against the owner and the inner component', async () => {
        const document = await parseModel(`
            Signal Data
            Component Leaf Port P Input Data
            Component Root
                Port P Input Data
                Part Leaf as leaf
                Delegation P - leaf:P
        `);
        expect(document.diagnostics).toHaveLength(0);
        const [leaf, root] = document.parseResult.value.components;
        expect(root.delegations[0].port1.ref).toBe(root.ports[0].port);
        expect(root.delegations[0].port2.ref).toBe(leaf.ports[0].port);
    });

    test('links components and signals across documents', async () => {
        const { shared } = createSyslaServices(EmptyFileSystem);
        const definitions = shared.workspace.LangiumDocumentFactory.fromString<Model>(
            'Signal Data\nComponent Leaf\nPort P Input Data', URI.parse('file:///models/Leaf.sysla')
        );
        const main = shared.workspace.LangiumDocumentFactory.fromString<Model>(
            'Component Root\nPort P Input Data\nPart Leaf as leaf\nDelegation P - leaf:P',
            URI.parse('file:///models/Main.sysla')
        );
        const documents = [main, definitions];
        documents.forEach(document => shared.workspace.LangiumDocuments.addDocument(document));
        await shared.workspace.DocumentBuilder.build(documents, { validation: true });
        for (const document of documents) expect(document.diagnostics).toHaveLength(0);
        const root = main.parseResult.value.components[0];
        expect(root.parts[0].component.ref).toBe(definitions.parseResult.value.components[0]);
        expect(root.ports[0].signal?.ref).toBe(definitions.parseResult.value.signals[0]);
    });

    test('reports unresolved component references', async () => {
        const document = await parseModel('Component Root Part Missing as missing');
        expect(document.diagnostics?.some(diagnostic => diagnostic.severity === 1
            && (typeof diagnostic.message === 'string' ? diagnostic.message : diagnostic.message.value).includes('Missing'))).toBe(true);
    });

    test('does not resolve a connection against an unrelated component port', async () => {
        const document = await parseModel(`
            Component Source Port P
            Component Other Port Q
            Component Root
                Part Source as a
                Part Source as b
                Connection a:Q - b:P
        `);
        const root = document.parseResult.value.components[2];
        expect(root.connections[0].port1.ref).toBeUndefined();
        expect(root.connections[0].port1.error).toBeDefined();
    });
});
