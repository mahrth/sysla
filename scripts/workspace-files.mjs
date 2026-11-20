import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';

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
    case 'prepare-extension': {
        const grammar = JSON.parse(await readFile('../language/syntaxes/sysla.tmLanguage.json', 'utf8'));
        const keywords = grammar.patterns.find(pattern => pattern.name === 'keyword.control.sysla');
        // Langium omits keywords implemented as terminals and treats contextual 'on' as global.
        keywords.match = keywords.match.replace('(', '(FunctionalContext|StateMachine|Function|Scenario|');
        grammar.patterns.unshift(
            {
                begin: '\\[',
                end: '\\]',
                patterns: [{ match: '\\bon\\b' }, { include: '$self' }]
            },
            { match: '\\bon\\b(?=\\s*->)' },
            { name: keywords.name, match: '<->|<-|->|[-:.]' }
        );
        await mkdir('syntaxes', { recursive: true });
        await writeFile('syntaxes/sysla.tmLanguage.json', JSON.stringify(grammar, null, 2));
        break;
    }
    default:
        throw new Error(`Unknown workspace file command: ${command}`);
}
