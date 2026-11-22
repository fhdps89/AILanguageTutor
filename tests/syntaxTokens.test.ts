import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  getSyntaxRoleStyle,
  mapRoleLabel,
  parseSyntaxDiagram,
  parseSyntaxTokens,
} from '../src/utils/syntaxTokens';

describe('syntaxTokens parser & color mapping', () => {
  it('maps role labels to subject/predicate/object/modifier/connector/other colors', () => {
    assert.equal(mapRoleLabel('주어'), 'subject');
    assert.equal(mapRoleLabel('술어 동사'), 'predicate');
    assert.equal(mapRoleLabel('목적어 중심어'), 'object');
    assert.equal(mapRoleLabel('목적어 수식'), 'modifier');
    assert.equal(mapRoleLabel('시간 부사구'), 'modifier');
    assert.equal(mapRoleLabel('장소'), 'modifier');
    assert.equal(mapRoleLabel('상관 접속'), 'connector');

    assert.match(getSyntaxRoleStyle('subject').containerClass, /blue/);
    assert.match(getSyntaxRoleStyle('predicate').containerClass, /emerald/);
    assert.match(getSyntaxRoleStyle('object').containerClass, /purple/);
    assert.match(getSyntaxRoleStyle('modifier').containerClass, /orange/);
    assert.match(getSyntaxRoleStyle('connector').containerClass, /slate/);
    assert.match(getSyntaxRoleStyle('other').containerClass, /slate/);
  });

  it('parses Chinese s01 and French s01 completely with no ellipsis truncation', () => {
    const root = process.cwd();
    const zh = JSON.parse(fs.readFileSync(path.join(root, 'demo_chinese.json'), 'utf8'));
    const fr = JSON.parse(fs.readFileSync(path.join(root, 'demo_page.json'), 'utf8'));

    const zhS01 = zh.sentences.find((s: any) => s.id === 's01');
    const frS01 = fr.sentences.find((s: any) => s.id === 's01');

    assert.ok(zhS01 && frS01);
    assert.equal(zhS01.syntax_diagram.includes('…'), false);
    assert.equal(frS01.syntax_diagram.includes('…'), false);

    const zhParsed = parseSyntaxDiagram(zhS01.syntax_diagram);
    assert.equal(zhParsed.isFallback, false);
    assert.ok(zhParsed.tokens.length >= 4);
    const longMod = zhParsed.tokens.find((t) => t.role === 'modifier');
    assert.ok(longMod);
    assert.ok(longMod.text.includes('木质结构古建筑群'));
    assert.equal(longMod.text.includes('…'), false);

    const frParsed = parseSyntaxDiagram(frS01.syntax_diagram);
    assert.equal(frParsed.isFallback, false);
    assert.ok(frParsed.tokens.some((t) => t.role === 'subject'));
    assert.ok(frParsed.tokens.some((t) => t.role === 'predicate'));
    const frLongMod = frParsed.tokens.find((t) => t.text.includes('au sommet d’une colline'));
    assert.ok(frLongMod);
    assert.equal(frLongMod.role, 'modifier');
  });

  it('falls back when diagram has fewer than 2 labeled tokens', () => {
    const unparsable = 'c’est ce rôle que joue l’Arc\n(jouer un rôle 가 도치됨)';
    const res = parseSyntaxDiagram(unparsable);
    assert.equal(res.isFallback, true);
    assert.equal(res.rawText, unparsable);
    assert.deepEqual(parseSyntaxTokens(unparsable), []);

    // Single labeled token still triggers fallback
    const oneLabel = 'Il [주어] + trône';
    assert.equal(parseSyntaxDiagram(oneLabel).isFallback, true);
  });
});
