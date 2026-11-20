import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const grammar = JSON.parse(readFileSync(new URL('../syntaxes/sysla.tmLanguage.json', import.meta.url)));

function firstMatch(patterns, text) {
    return patterns.find(pattern => pattern.match && new RegExp(pattern.match).exec(text)?.index === 0);
}

test('highlights syntax symbols like Transition and consumes the entire arrow', () => {
    const keyword = firstMatch(grammar.patterns, 'Transition');
    assert.equal(keyword.name, 'keyword.control.sysla');
    for (const token of ['->', '-', ':', '.']) {
        const rule = firstMatch(grammar.patterns, token);
        assert.equal(rule?.name, keyword.name);
        assert.equal(new RegExp(rule.match).exec(token)[0], token);
    }
});

test('highlights behavior keywords and distinguishes signal values from transition triggers', () => {
    for (const word of ['Function', 'StateMachine', 'on ResetCommand']) {
        assert.equal(firstMatch(grammar.patterns, word)?.name, 'keyword.control.sysla');
    }
    assert.equal(firstMatch(grammar.patterns, 'Activity'), undefined);
    const brackets = grammar.patterns.find(pattern => pattern.begin && new RegExp(pattern.begin).test('['));
    assert.ok(firstMatch(brackets.patterns, 'on, off]'));
    assert.equal(firstMatch(brackets.patterns, 'on, off]').name, undefined);
    assert.equal(firstMatch(grammar.patterns, 'on -> Emit SwitchOnRequested').name, undefined);
});
