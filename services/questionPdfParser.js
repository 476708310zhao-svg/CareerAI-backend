'use strict';

// Deterministic extraction only. PDF text is treated as data, never as a
// prompt, instruction, or evidence that an answer may be guessed.
const SECTION_RE = /(?:第[一二三四五六七八九十0-9]+部分|[一二三四五六七八九十]+、)/g;
const MAJOR_SECTION_RE = /^第[一二三四五六七八九十0-9]+部分/;
const HEADING_RE = /^(?:第[一二三四五六七八九十0-9]+部分|[一二三四五六七八九十]+、)/;
// Scanned PDFs often lose the punctuation in headings such as "二、多项选择题".
const OCR_HEADING_RE = /^[一二三四五六七八九十]+\s*(?:单项选择|多项选择|单选|多选|判断)(?:题)?(?:\s|$)/;
const ANSWER_PAIR_RE = /(\d{1,3})\s*[.．、]\s*([A-H]{1,8})(?![A-Za-z])/g;
const ANSWER_EXPLANATION_RE = /^\s*(\d{1,3})\s*[.．、]?\s*[【\[]\s*答\s*案\s*[】\]]\s*([A-H]{1,8})(?![A-Za-z])/;
const QUESTION_RE = /^\s*(\d{1,3})\s*[.．、]\s*(.+)$/;
const OPTION_RE = /([A-H])\s*[.．、]\s*/g;
const OCR_DIGIT_GLYPHS = { 0: 'O', 1: 'IlL', 4: 'A', 5: 'S', 6: 'OG', 7: 'T', 8: 'B' };

function sectionKey(value) {
  const match = String(value || '').match(SECTION_RE);
  return match ? match[0] : 'default';
}

function splitLines(page) {
  return String(page.text || '').split(/\r?\n/).map(text => text.trim()).filter(Boolean);
}

function isAnswerPage(lines) {
  return lines.some(line => /答案(?:汇总|表|速查|索引)|参考答案/.test(line)) ||
    lines.some(line => /^答案\s+第.+\d+[.．、][A-H]/.test(line));
}
function hasAnswerAppendixHeading(text) {
  return String(text || '').split(/\r?\n/).some(line =>
    line.length <= 80 && /参考答案(?:及解析|解析|汇总|速查|索引|表)?\s*$/.test(line.trim()));
}

function inferOcrQuestionNumbers(lines) {
  const corrections = new Map();
  const anchors = lines.map((line, index) => ({ index, match: QUESTION_RE.exec(line) }))
    .filter(item => item.match);
  for (let a = 0; a + 1 < anchors.length; a++) {
    const before = anchors[a], after = anchors[a + 1];
    const expected = Number(before.match[1]) + 1;
    if (Number(after.match[1]) !== expected + 1 || after.index - before.index > 25) continue;
    const between = lines.slice(before.index + 1, after.index);
    if (between.some(line => HEADING_RE.test(line) || OCR_HEADING_RE.test(line))) continue;
    const suspects = between.map((line, offset) => ({ index: before.index + offset + 1,
      match: /^([A-Za-z0-9]{2,3})\s*[.．、]\s*(.{12,})$/.exec(line) })).filter(item => item.match && /[A-Za-z]/.test(item.match[1]));
    if (suspects.length !== 1) continue;
    const suspect = suspects[0], actual = suspect.match[1], wanted = String(expected);
    if (actual.length !== wanted.length) continue;
    if (![...actual].every((glyph, position) => glyph === wanted[position] ||
      OCR_DIGIT_GLYPHS[wanted[position]]?.includes(glyph))) continue;
    corrections.set(suspect.index, { number: wanted, body: suspect.match[2] });
  }
  return corrections;
}
function answerHeaderIndex(lines) {
  return lines.findIndex(line => /答案(?:汇总|表|速查|索引)|参考答案/.test(line) ||
    /^答案\s+第.+\d+[.．、][A-H]/.test(line));
}

function answerPairsFromPage(page, lines, initialSection) {
  const evidence = [];
  let currentSection = initialSection, activeExplanation = null;
  for (const line of lines) {
    const major = MAJOR_SECTION_RE.exec(line);
    if (major) { currentSection = major[0]; activeExplanation = null; }
    const explained = ANSWER_EXPLANATION_RE.exec(line);
    if (explained) {
      activeExplanation = { sectionKey:currentSection, questionNumber:explained[1], choices:[...explained[2]],
        pageNumber:page.page, text:line.trim().slice(0,500), kind:'answer_key' };
      evidence.push(activeExplanation);
    }
    const conclusion = /故(?:本题)?选\s*([A-H]{1,8})(?![A-Za-z])/.exec(line);
    if (conclusion && activeExplanation) activeExplanation.conclusionChoices = [...conclusion[1]];
    // In explanatory prose, strings such as B4、B5 are option references,
    // not another numbered answer. Only parse compact answer-table lines.
    if (!/^\s*(?:答案|参考答案|\d{1,3}\s*[.．、]\s*[A-H])/.test(line) || /解析/.test(line)) continue;
    const parts = line.split(/([；;])/).filter(part => part && part !== '；' && part !== ';');
    for (const part of parts) {
      const headings = [...part.matchAll(SECTION_RE)];
      if (headings.length && ANSWER_PAIR_RE.test(part)) currentSection = headings.at(-1)[0];
      ANSWER_PAIR_RE.lastIndex = 0;
      for (const match of part.matchAll(ANSWER_PAIR_RE)) {
        evidence.push({ sectionKey: currentSection, questionNumber: match[1], choices: [...match[2]],
          pageNumber: page.page, text: part.trim().slice(0, 500), kind: 'answer_key' });
      }
    }
  }
  return evidence;
}

function parseQuestion(raw, pageMap) {
  const body = raw.lines.join('\n');
  const inline = [];
  raw.lines.forEach((line, index) => {
    for (const match of line.matchAll(/答案\s*[:：]\s*([A-H]{1,8})(?![A-Za-z])/g)) {
      inline.push({ choices: [...match[1]], pageNumber: raw.linePages[index],
        text: match[0], kind: 'inline' });
    }
  });
  const explanationMatch = /解析\s*[:：]\s*([^\n]+)/.exec(body);
  const answerCut = body.search(/答案\s*[:：]|解析\s*[:：]/);
  const content = (answerCut >= 0 ? body.slice(0, answerCut) : body).trim();
  const matches = [...content.matchAll(OPTION_RE)];
  const rawStem = (matches.length ? content.slice(0, matches[0].index) : content).trim();
  const rawOptions = matches.map((match, index) => ({ id: match[1],
    text: content.slice(match.index + match[0].length, index + 1 < matches.length ? matches[index + 1].index : content.length).trim() }));
  // OCR may miss a question boundary and append later page text to one option.
  // Keep a bounded review placeholder instead of losing every draft in the PDF.
  const truncated = rawStem.length > 5000 || rawOptions.length > 8 || rawOptions.some(option => option.text.length > 2000);
  const stem = rawStem.slice(0, 5000);
  const options = rawOptions.slice(0, 8).map(option => ({ id: option.id, text: option.text.slice(0, 2000) }));
  const section = raw.sectionLabel;
  const type = /判断/.test(section) ? 'boolean' : /多选|多项选择/.test(section) ? 'multiple' : 'single';
  const flags = [];
  if (raw.inferredNumber) flags.push('OCR_QUESTION_NUMBER_INFERRED');
  if (truncated) flags.push('PARSER_TEXT_TRUNCATED');
  for (const number of raw.sourcePages) {
    const page = pageMap.get(number);
    if (page?.status === 'complex_layout' && !page.flags?.length) flags.push('COMPLEX_LAYOUT');
    for (const flag of page?.flags || []) if (!flags.includes(flag)) flags.push(flag);
  }
  if (/如图|下图|图表|表格|见图|示意图/.test(content)) flags.push('COMPLEX_GRAPHIC');
  if (truncated || options.length < 2 || options.some(option => !option.text) || new Set(options.map(option => option.id)).size !== options.length) flags.push('OPTIONS_NEED_REVIEW');
  const sourceBlocks = raw.sourcePages.flatMap(number => (pageMap.get(number)?.blocks || [])
    .slice(0, 100).map(block => ({ pageNumber: number, x: block.x, y: block.y, width: block.width, height: block.height,
      text: block.text.slice(0, 200) }))).slice(0, 200);
  return { pageNumber: raw.sourcePages[0], sourcePages: raw.sourcePages, sourceBlocks,
    section, sectionKey: raw.sectionKey, questionNumber: raw.questionNumber,
    type, stem, options, explanation: explanationMatch?.[1]?.trim() || '',
    inline, flags };
}

function parseDigitalPages(pages, paperVersion) {
  if (!Array.isArray(pages) || !paperVersion || typeof paperVersion !== 'string') throw new Error('INVALID_PARSER_INPUT');
  const pageMap = new Map(pages.map(page => [page.page, page]));
  const rawQuestions = [], answerEvidence = [], answerPages = [];
  let currentSection = 'default', currentMajor = null, currentSectionLabel = '未分节', active = null, inAnswerAppendix = false;
  const flush = () => { if (active) rawQuestions.push(active); active = null; };
  for (const page of pages) {
    const lines = splitLines(page);
    if (page.status === 'scanned' || !lines.length) { flush(); continue; }
    const answerStart = answerHeaderIndex(lines);
    if (answerStart >= 0 && lines[answerStart] && /参考答案/.test(lines[answerStart])) inAnswerAppendix = true;
    if (inAnswerAppendix) { flush(); answerPages.push({ page, lines:answerStart >= 0 ? lines.slice(answerStart) : lines }); continue; }
    if (answerStart >= 0) answerPages.push({ page, lines: lines.slice(answerStart) });
    const questionLines = answerStart >= 0 ? lines.slice(0, answerStart) : lines;
    const numberCorrections = page.flags?.includes('OCR_UNVERIFIED') ? inferOcrQuestionNumbers(questionLines) : new Map();
    for (const [lineIndex, line] of questionLines.entries()) {
      const heading = HEADING_RE.exec(line) || OCR_HEADING_RE.exec(line);
      if (heading && !QUESTION_RE.test(line)) {
        flush();
        if (MAJOR_SECTION_RE.test(heading[0])) currentMajor = heading[0];
        currentSection = currentMajor || heading[0]; currentSectionLabel = line.slice(0, 120);
        continue;
      }
      const corrected = numberCorrections.get(lineIndex);
      const question = corrected ? [line, corrected.number, corrected.body] : QUESTION_RE.exec(line);
      if (question) {
        flush();
        active = { sectionKey: currentSection, sectionLabel: currentSectionLabel,
          questionNumber: question[1], sourcePages: [page.page], lines: [question[2]], linePages: [page.page],
          inferredNumber: Boolean(corrected) };
      } else if (active) {
        active.lines.push(line);
        active.linePages.push(page.page);
        if (!active.sourcePages.includes(page.page)) active.sourcePages.push(page.page);
      }
    }
    if (answerStart >= 0) flush();
  }
  flush();
  if (rawQuestions.length > 1000) throw Object.assign(new Error('PARSER_DRAFT_BUDGET_EXCEEDED'), { code: 'PARSER_DRAFT_BUDGET_EXCEEDED' });
  const sections = new Set(rawQuestions.map(item => item.sectionKey));
  let answerSection = sections.size === 1 ? [...sections][0] : 'ambiguous';
  for (const { page, lines } of answerPages) {
    // A new major section can start halfway down a page. Process evidence in
    // reading order so answers above the heading retain the prior section.
    const pageEvidence = answerPairsFromPage(page, lines, answerSection);
    answerEvidence.push(...pageEvidence);
    const heading = lines.map(line => MAJOR_SECTION_RE.exec(line)?.[0]).filter(Boolean).at(-1);
    if (heading) answerSection = heading;
    if (answerEvidence.length > 5000) throw Object.assign(new Error('PARSER_EVIDENCE_BUDGET_EXCEEDED'), { code: 'PARSER_EVIDENCE_BUDGET_EXCEEDED' });
  }
  const drafts = rawQuestions.map(raw => parseQuestion(raw, pageMap));
  const counts = new Map();
  for (const draft of drafts) {
    const key = `${paperVersion}\u0000${draft.sectionKey}\u0000${draft.questionNumber}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  for (const draft of drafts) {
    const key = `${paperVersion}\u0000${draft.sectionKey}\u0000${draft.questionNumber}`;
    const matches = [...draft.inline, ...answerEvidence.filter(item => item.sectionKey === draft.sectionKey && item.questionNumber === draft.questionNumber)];
    if (matches.length > 50) throw Object.assign(new Error('PARSER_EVIDENCE_BUDGET_EXCEEDED'), { code: 'PARSER_EVIDENCE_BUDGET_EXCEEDED' });
    draft.answerEvidenceCandidates = matches;
    const answerKinds = new Set(matches.map(item => item.choices.join('')));
    const distinctEvidence = new Set(matches.map(item => `${item.pageNumber}\u0000${item.text}\u0000${item.choices.join('')}`));
    if (counts.get(key) > 1) draft.flags.push('DUPLICATE_QUESTION_NUMBER');
    if (!matches.length) draft.flags.push('MISSING_ANSWER');
    if (answerKinds.size > 1) draft.flags.push('CONFLICTING_ANSWER');
    if (distinctEvidence.size > 1) draft.flags.push('AMBIGUOUS_ANSWER_SOURCE');
    if (matches.some(item => item.conclusionChoices && item.conclusionChoices.join('') !== item.choices.join('')))
      draft.flags.push('ANSWER_EXPLANATION_CONFLICT');
    if (matches.length && matches.every(item => item.conclusionChoices?.join('') === item.choices.join('')))
      draft.flags.push('ANSWER_EXPLANATION_AGREES');
    if (matches.some(item => item.choices.some(choice => !draft.options.some(option => option.id === choice)))) draft.flags.push('ANSWER_NOT_IN_OPTIONS');
    if (matches.some(item => draft.type !== 'multiple' && item.choices.length !== 1 ||
      draft.type === 'multiple' && item.choices.length < 2)) draft.flags.push('ANSWER_SHAPE_MISMATCH');
    const ocrUnverified = draft.flags.includes('OCR_UNVERIFIED') ||
      matches.some(item => pageMap.get(item.pageNumber)?.flags?.includes('OCR_UNVERIFIED'));
    if (ocrUnverified && !draft.flags.includes('OCR_UNVERIFIED')) draft.flags.push('OCR_UNVERIFIED');
    const unambiguous = matches.length > 0 && answerKinds.size === 1 && distinctEvidence.size === 1 && counts.get(key) === 1 &&
      !draft.flags.some(flag => ['ANSWER_NOT_IN_OPTIONS','ANSWER_SHAPE_MISMATCH','OPTIONS_NEED_REVIEW',
        'PARSER_TEXT_TRUNCATED','ANSWER_EXPLANATION_CONFLICT','OCR_QUESTION_NUMBER_INFERRED'].includes(flag));
    draft.answerStatus = !matches.length || ocrUnverified ? 'UNVERIFIED' :
      unambiguous ? 'VERIFIED' : 'ANSWER_UNCERTAIN';
    draft.answerOptionIds = unambiguous ? [...matches[0].choices] : [];
    if (unambiguous && ocrUnverified) draft.flags.push('AUTO_MATCHED_ANSWER');
    draft.answerEvidence = draft.answerStatus === 'VERIFIED' ? matches[0] : null;
    draft.status = draft.flags.length || draft.answerStatus !== 'VERIFIED' ? 'needs_repair' : 'pending_review';
    delete draft.inline;
  }
  return { drafts, pageCount: pages.length, scannedPages: pages.filter(page => page.status === 'scanned').map(page => page.page),
    complexPages: pages.filter(page => page.status === 'complex_layout').map(page => page.page) };
}

module.exports = { parseDigitalPages, sectionKey, isAnswerPage, hasAnswerAppendixHeading };
