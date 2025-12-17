import type { AstNode, LangiumCoreServices, LangiumDocument } from 'langium';
import chalk from 'chalk';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { URI } from 'langium';

export async function extractDocument(fileName: string, services: LangiumCoreServices): Promise<LangiumDocument> {
    const extensions = services.LanguageMetaData.fileExtensions;
    if (!extensions.includes(path.extname(fileName))) {
        console.error(chalk.yellow(`Please choose a file with one of these extensions: ${extensions}.`));
        process.exit(1);
    }

    if (!fs.existsSync(fileName)) {
        console.error(chalk.red(`File ${fileName} does not exist.`));
        process.exit(1);
    }

    const document = await services.shared.workspace.LangiumDocuments.getOrCreateDocument(URI.file(path.resolve(fileName)));
    await services.shared.workspace.DocumentBuilder.build([document], { validation: true });

    const validationErrors = (document.diagnostics ?? []).filter(e => e.severity === 1);
    if (validationErrors.length > 0) {
        console.error(chalk.red('There are validation errors:'));
        for (const validationError of validationErrors) {
            console.error(chalk.red(
                `line ${validationError.range.start.line + 1}: ${validationError.message} [${document.textDocument.getText(validationError.range)}]`
            ));
        }
        process.exit(1);
    }

    return document;
}

export async function extractAstNode<T extends AstNode>(fileName: string, services: LangiumCoreServices): Promise<T> {
    return (await extractDocument(fileName, services)).parseResult?.value as T;
}

/**
 * Loads the main file AND all other .sysla files in the same directory
 * to enable automatic modularization without explicit imports.
 */
export async function extractAstNodeWithDirectory<T extends AstNode>(
    fileName: string,
    services: LangiumCoreServices
): Promise<T> {
    const dir = path.dirname(fileName);
    const mainFileName = path.basename(fileName);
    
    // Find all .sysla files in the directory
    const allSyslaFiles = fs.readdirSync(dir)
        .filter(f => f.endsWith('.sysla'))
        .map(f => path.join(dir, f));
    
    if (allSyslaFiles.length > 1) {
        console.log(chalk.blue(`📁 Loading ${allSyslaFiles.length} .sysla files from ${path.basename(dir)}/`));
    }
    
    // Load all files into the workspace
    const documents: LangiumDocument[] = [];
    for (const file of allSyslaFiles) {
        const document = await loadDocument(file, services);
        documents.push(document);
        
        if (allSyslaFiles.length > 1) {
            const isMain = path.basename(file) === mainFileName;
            const marker = isMain ? chalk.green('●') : chalk.gray('○');
            console.log(chalk.gray(`   ${marker} ${path.basename(file)}`));
        }
    }
    
    // Build all documents together
    await services.shared.workspace.DocumentBuilder.build(documents, { validation: true });
    
    // Return the model of the main file
    const mainUri = URI.file(path.resolve(fileName));
    const mainDoc = services.shared.workspace.LangiumDocuments.getDocument(mainUri);
    
    if (!mainDoc) {
        console.error(chalk.red(`Main file not found: ${fileName}`));
        process.exit(1);
    }
    
    return mainDoc.parseResult.value as T;
}

async function loadDocument(fileName: string, services: LangiumCoreServices): Promise<LangiumDocument> {
    const extensions = services.LanguageMetaData.fileExtensions;
    if (!extensions.includes(path.extname(fileName))) {
        console.error(chalk.yellow(`Please choose a file with one of these extensions: ${extensions}.`));
        process.exit(1);
    }

    if (!fs.existsSync(fileName)) {
        console.error(chalk.red(`File ${fileName} does not exist.`));
        process.exit(1);
    }

    const document = services.shared.workspace.LangiumDocuments.getOrCreateDocument(URI.file(path.resolve(fileName)));
    
    // Validation is performed later for all documents together
    return document;
}

interface FilePathData {
    destination: string,
    name: string
}

export function extractDestinationAndName(filePath: string, destination: string | undefined): FilePathData {
    filePath = path.basename(filePath, path.extname(filePath)).replace(/[.-]/g, '');
    return {
        destination: destination ?? path.join(path.dirname(filePath), 'generated'),
        name: path.basename(filePath)
    };
}
