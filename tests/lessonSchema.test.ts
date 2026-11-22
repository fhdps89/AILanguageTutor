import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { stripPromptLeakage } from '../src/utils/translationSanitize';
import {
  chunksFromBreathMarks,
  ensureSentenceSchema,
  normalizeLessonPage,
} from '../src/utils/lessonSchema';

describe('translationSanitize & lessonSchema', () => {
  it('strips s02/s04 style prompt leakage while preserving legitimate translations', () => {
    const s02Dirty =
      '개선문은 이 종류의 기념물 가운데 세계에서 가장 크다고 이 글은 말한다. (글의 수사. 독립 사실로 단정하지 말 것)';
    assert.equal(
      stripPromptLeakage(s02Dirty),
      '개선문은 이 종류의 기념물 가운데 세계에서 가장 크다.'
    );

    const s04Dirty =
      '아우스터리츠 전투 다음날인 1805년 12월 2일, 나폴레옹 1세가 병사들에게 이렇게 말했다고 글은 전한다. 「너희는 개선문 아래로만 집으로 돌아가리라.」';
    assert.equal(
      stripPromptLeakage(s04Dirty),
      '아우스터리츠 전투 다음날인 1805년 12월 2일, 나폴레옹 1세가 병사들에게 이렇게 말했다. 「너희는 개선문 아래로만 집으로 돌아가리라.」'
    );

    const legitimate = '로마 황제들이 세운 것들처럼, 무엇보다 승리한 군대를 기리려고 지어졌다.';
    assert.equal(stripPromptLeakage(legitimate), legitimate);
  });

  it('builds >=2 chunks from breath_marks or raw text fallbacks, including titles', () => {
    const fromSlash = chunksFromBreathMarks('Il trône / sur la place', 'Il trône sur la place');
    assert.equal(fromSlash.length, 2);
    assert.deepEqual(
      fromSlash.map((c) => c.text),
      ['Il trône', 'sur la place']
    );

    const frTitle = chunksFromBreathMarks('L’ARC DE TRIOMPHE', 'L’ARC DE TRIOMPHE');
    assert.ok(frTitle.length >= 2);

    const zhTitle = chunksFromBreathMarks('北京故宫', '北京故宫');
    assert.deepEqual(
      zhTitle.map((c) => c.text),
      ['北京', '故宫']
    );
  });

  it('handles empty and short title edge cases safely', () => {
    assert.deepEqual(chunksFromBreathMarks('', ''), []);
    assert.deepEqual(chunksFromBreathMarks('Hi', 'Hi'), [{ text: 'Hi' }]);
    assert.deepEqual(chunksFromBreathMarks('故宫', '故宫'), [{ text: '故宫' }]);

    const shortEnsured = ensureSentenceSchema({ id: 's00', raw_text: 'Hi', translation: '안녕' }, 'en-US');
    assert.equal(shortEnsured.raw_text, 'Hi');
    assert.ok(shortEnsured.chunks && shortEnsured.chunks.length === 1);
  });

  it('derives pronunciationGuide from pinyin and liaison_hint and ensures >=2 chunks + breath_marks', () => {
    const zhSentence = ensureSentenceSchema(
      {
        id: 's01',
        raw_text: '北京故宫很大',
        pinyin: 'Běijīng Gùgōng hěn dà',
        translation: '베이징 고궁은 매우 크다.',
      },
      'zh-CN'
    );
    assert.equal(zhSentence.pronunciationGuide, 'Běijīng Gùgōng hěn dà');
    assert.ok((zhSentence.chunks?.length ?? 0) >= 2);
    assert.ok(zhSentence.breath_marks?.includes('/'));
    assert.notEqual(zhSentence.breath_marks, zhSentence.raw_text);

    const frSentence = ensureSentenceSchema(
      {
        id: 's02',
        raw_text: 'l’Arc de triomphe est le plus grand monument de ce genre au monde.',
        translation:
          '개선문은 이 종류의 기념물 가운데 세계에서 가장 크다고 이 글은 말한다. (글의 수사. 독립 사실로 단정하지 말 것)',
        liaison_hint: 'l’‿Arc · grand‿monument',
      },
      'fr-FR'
    );
    assert.equal(frSentence.pronunciationGuide, 'l’‿Arc · grand‿monument');
    assert.equal(
      frSentence.translation,
      '개선문은 이 종류의 기념물 가운데 세계에서 가장 크다.'
    );
    assert.ok((frSentence.chunks?.length ?? 0) >= 2);
    assert.ok(frSentence.breath_marks?.includes('/'));
  });

  it('normalizes demo_page.json and demo_chinese.json completely', () => {
    const frRaw = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'demo_page.json'), 'utf-8')
    );
    const zhRaw = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'demo_chinese.json'), 'utf-8')
    );

    const frPage = normalizeLessonPage(frRaw);
    assert.equal(frPage.language?.code, 'fr-FR');
    for (const s of frPage.sentences) {
      assert.ok(s.pronunciationGuide, `${s.id} should have pronunciationGuide`);
      assert.ok((s.chunks?.length ?? 0) >= 2, `${s.id} should have >=2 chunks`);
      assert.ok(s.breath_marks?.includes('/'), `${s.id} should have "/" in breath_marks`);
      assert.ok(!s.translation.includes('이 글은 말한다'));
      assert.ok(!s.translation.includes('단정하지 말 것'));
      assert.ok(!s.translation.includes('글은 전한다'));
    }

    const zhPage = normalizeLessonPage(zhRaw);
    assert.equal(zhPage.language?.code, 'zh-CN');
    for (const s of zhPage.sentences) {
      assert.ok(s.pronunciationGuide, `${s.id} should have pronunciationGuide`);
      assert.ok((s.chunks?.length ?? 0) >= 2, `${s.id} should have >=2 chunks`);
      assert.ok(s.breath_marks?.includes('/'), `${s.id} should have "/" in breath_marks`);
    }
  });

  it('preserves ellipses and does not rewrite ~라고 tails that are not 이라고', () => {
    const withEllipsis = '...잘려 있다... 그리고 이어진다.';
    assert.equal(stripPromptLeakage(withEllipsis), withEllipsis);
    assert.equal(stripPromptLeakage('잠깐.. 그리고 간다.'), '잠깐. 그리고 간다.');

    assert.equal(
      stripPromptLeakage('돌아가리라고 글은 전한다.'),
      '돌아가리라고 한다.'
    );
    assert.equal(
      stripPromptLeakage('집으로 가라고 글은 말한다.'),
      '집으로 가라고 한다.'
    );
    assert.equal(
      stripPromptLeakage('사실이라고 이 글은 설명한다.'),
      '사실이다.'
    );
    assert.equal(
      stripPromptLeakage('그는 의사라고 글은 말한다.'),
      '그는 의사라고 한다.'
    );
    assert.equal(
      stripPromptLeakage('사실이 아니라고 글은 전한다.'),
      '사실이 아니다.'
    );
  });

  it('normalizeLessonPage is idempotent and keeps ellipses after two passes', () => {
    const raw = {
      title: '잘린 문장',
      language: { code: 'fr-FR', name_ko: '프랑스어', name_en: 'French' },
      sentences: [
        {
          id: 's01',
          raw_text: 'Il dit que le texte continue...',
          translation: '...잘려 있다... 돌아가리라고 글은 전한다.',
        },
      ],
    };
    const once = normalizeLessonPage(raw);
    const twice = normalizeLessonPage(once);
    assert.equal(once.sentences[0].translation, twice.sentences[0].translation);
    assert.ok(once.sentences[0].translation.includes('...잘려 있다...'));
    assert.ok(once.sentences[0].translation.includes('돌아가리라고 한다'));
    assert.ok(!once.sentences[0].translation.includes('돌아가리다'));
  });
});
