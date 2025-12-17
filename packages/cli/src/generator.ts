import type { Model, Component } from 'sysla-language';
import type { LangiumCoreServices } from 'langium';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { extractDestinationAndName } from './util.js';
import { GeneratorText } from './generator-text.js';
import { GeneratorDecomposition } from './generator-decomposition.js';
import { GeneratorComposition } from './generator-composition.js';
import { GeneratorCompositionFull } from './generator-composition-full.js';
import type { GraphGenerator } from './graphviz-generator.js';

export function generateJavaScript(
    model: Model, 
    filePath: string, 
    destination: string | undefined,
    services?: LangiumCoreServices
): string {
    const data = extractDestinationAndName(filePath, destination);
    const baseOutputDir = path.join(data.destination, data.name);
    
    if (!fs.existsSync(baseOutputDir)) {
        fs.mkdirSync(baseOutputDir, { recursive: true });
    }
    
    const results: string[] = [];
    
    // Collect all models from workspace (for multi-file support)
    const allModels = services 
        ? getAllModelsFromWorkspace(services)
        : [model];
    
    const mergedView = createMergedModelView(allModels);
    
    // 1. Text generator (at the root) - now with all components/signals
    const generatorText = new GeneratorText();
    const textFile = generatorText.generate(mergedView, baseOutputDir, data.name);
    results.push(`Text: ${textFile}`);
    
    // 2. Find root components (those not used as parts)
    const usedComponents = new Set<Component>();
    for (const component of mergedView.components) {
        for (const part of component.parts) {
            if (part.component.ref) {
                usedComponents.add(part.component.ref);
            }
        }
    }
    
    const rootComponents = mergedView.components.filter(component => !usedComponents.has(component));
    
    const generators: GraphGenerator[] = [
        new GeneratorDecomposition(),
        new GeneratorCompositionFull(),
        new GeneratorComposition()
    ];

    // 3. Generate hierarchical diagrams only for root components
    const allGraphNames: string[] = [];
    const processed = new Set<Component>();
    
    for (const component of rootComponents) {
        generateComponentHierarchically(
            component, 
            baseOutputDir, 
            mergedView,
            allGraphNames,
            [],  // path stack for directory nesting
            processed,
            generators
        );
    }
    
    // 4. Generate shell script (recursively)
    if (allGraphNames.length > 0) {
        const scriptPath = path.join(baseOutputDir, 'gen-pdfs.sh');
        const scriptContent = compileImagesRecursive(baseOutputDir);
        fs.writeFileSync(scriptPath, scriptContent);
        fs.chmodSync(scriptPath, '755');
        
        results.push(`GraphViz: ${allGraphNames.length} diagrams in hierarchical structure`);
        results.push(`Run: cd ${baseOutputDir} && ./gen-pdfs.sh`);
    }
    
    return results.join('\n');
}

/**
 * Collect all models from the workspace (for multi-file support)
 */
function getAllModelsFromWorkspace(services: LangiumCoreServices): Model[] {
    const models: Model[] = [];
    const allDocuments = services.shared.workspace.LangiumDocuments.all.toArray();
    
    for (const doc of allDocuments) {
        if (doc.parseResult.value.$type === 'Model') {
            models.push(doc.parseResult.value as Model);
        }
    }
    
    return models;
}

/**
 * Create a merged view of all models (all components and signals)
 */
function createMergedModelView(models: Model[]): Model {
    const allComponents: Component[] = [];
    const allSignals: any[] = [];
    
    for (const model of models) {
        allComponents.push(...model.components);
        allSignals.push(...model.signals);
    }
    
    // Return a view that aggregates all components/signals
    return {
        $type: 'Model',
        components: allComponents,
        signals: allSignals,
        imports: []
    } as Model;
}

function generateComponentHierarchically(
    component: Component,
    baseDir: string,
    model: Model,
    allGraphNames: string[],
    pathStack: string[],
    processed: Set<Component>,
    generators: GraphGenerator[]
): void {
    // Avoid duplicate processing
    if (processed.has(component)) {
        return;
    }
    processed.add(component);
    
    // Directory for this component
    const componentDir = path.join(baseDir, ...pathStack, component.name);
    
    if (!fs.existsSync(componentDir)) {
        fs.mkdirSync(componentDir, { recursive: true });
    }
    
    for (const generator of generators) {
        const names = generator.generateForComponent(component, {
            model,
            outputDir: componentDir
        });
        allGraphNames.push(...names);
    }
    
    // Recurse for subcomponents
    for (const part of component.parts) {
        const subComponent = part.component.ref;
        if (subComponent) {
            generateComponentHierarchically(
                subComponent,
                baseDir,
                model,
                allGraphNames,
                [...pathStack, component.name],
                processed,
                generators
            );
        }
    }
}

function compileImagesRecursive(baseDir: string): string {
    let script = '#!/bin/sh\n\n';
    script += '# Generate PDFs from DOT files recursively\n\n';
    script += 'find . -name "*.dot" -type f | while read dotfile; do\n';
    script += '    pdffile="${dotfile%.dot}.pdf"\n';
    script += '    echo "Generating $pdffile..."\n';
    script += '    dot -Tpdf -o "$pdffile" "$dotfile"\n';
    script += 'done\n\n';
    script += 'echo "Done!"\n';
    return script;
}