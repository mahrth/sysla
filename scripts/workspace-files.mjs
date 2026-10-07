import { copyFile, mkdir, readdir, rm } from 'node:fs/promises';

// npm runs workspace scripts in the corresponding package directory.
const [command, ...extraDirectories] = process.argv.slice(2);

switch (command) {
    case 'clean': {
        const buildInfo = (await readdir('.')).filter(name => name.endsWith('.tsbuildinfo'));
        for (const path of ['out', ...buildInfo, ...extraDirectories]) {
            await rm(path, { recursive: true, force: true });
        }
        break;
    }
    case 'prepare-extension':
        await mkdir('syntaxes', { recursive: true });
        await copyFile('../language/syntaxes/sysla.tmLanguage.json', 'syntaxes/sysla.tmLanguage.json');
        break;
    default:
        throw new Error(`Unknown workspace file command: ${command}`);
}
