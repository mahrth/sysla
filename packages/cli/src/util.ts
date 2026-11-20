import type { AstNode, LangiumCoreServices, LangiumDocument } from 'langium';
import chalk from 'chalk';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { URI } from 'langium';

export async function extractDocument(fileName: string, services: LangiumCoreServices): Promise<LangiumDocument> {
    const document = await loadDocument(fileName, services);
    await services.shared.workspace.DocumentBuilder.build([document], { validation: true });
    exitOnValidationErrors([document]);

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
    // Check the selected file before looking for companion files.
    const mainDocument = await loadDocument(fileName, services);
    const dir = path.dirname(fileName);
    const mainFileName = path.basename(fileName);
    
    // Find all .sysla files in the directory
    const allSyslaFiles = fs.readdirSync(dir, { withFileTypes: true })
        .filter(entry => (entry.isFile() || entry.isSymbolicLink()) && entry.name.endsWith('.sysla'))
        .map(entry => path.join(dir, entry.name));
    
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
    exitOnValidationErrors(documents);

    return mainDocument.parseResult.value as T;
}

function exitOnValidationErrors(documents: LangiumDocument[]): void {
    const errors = documents.flatMap(document =>
        (document.diagnostics ?? [])
            .filter(diagnostic => diagnostic.severity === 1)
            .map(diagnostic => ({ document, diagnostic }))
    );

    if (errors.length === 0) return;

    console.error(chalk.red('There are validation errors:'));
    for (const { document, diagnostic } of errors) {
        const line = diagnostic.range.start.line + 1;
        const column = diagnostic.range.start.character + 1;
        const text = document.textDocument.getText(diagnostic.range);
        const message = typeof diagnostic.message === 'string' ? diagnostic.message : diagnostic.message.value;
        console.error(chalk.red(`${document.uri.fsPath}:${line}:${column}: ${message} [${text}]`));
    }
    process.exit(1);
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

    if (!fs.statSync(fileName).isFile()) {
        console.error(chalk.red(`Path ${fileName} is not a file.`));
        process.exit(1);
    }

    const document = services.shared.workspace.LangiumDocuments.getOrCreateDocument(URI.file(path.resolve(fileName)));
    
    // Validation is performed later for all documents together
    return document;
}

export function extractDestinationAndName(filePath: string, destination = 'generated', sourceRoot?: string) {
    const name = path.basename(filePath, path.extname(filePath)).replace(/[.-]/g, '');
    if (sourceRoot === undefined) {
        return { outputDir: path.join(destination, name), name };
    }

    if (!fs.statSync(sourceRoot, { throwIfNoEntry: false })?.isDirectory()) {
        console.error(chalk.red(`Source root is not a directory: ${sourceRoot}`));
        process.exit(1);
    }
    const relativeDir = path.relative(sourceRoot, path.dirname(filePath));
    if (relativeDir === '..' || relativeDir.startsWith(`..${path.sep}`) || path.isAbsolute(relativeDir)) {
        console.error(chalk.red(`Model file ${filePath} is outside source root ${sourceRoot}.`));
        process.exit(1);
    }
    return { outputDir: path.join(destination, relativeDir), name };
}
