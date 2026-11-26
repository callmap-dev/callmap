import type { GraphDocument } from '@callmap/graph-document';
import type { SourceTexts } from '@callmap/review-input';

export interface SourceLine {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

interface LineRule {
  readonly commentMarkers: readonly string[];
  readonly canHoldCall: (text: string) => boolean;
}

const holdsOpeningParenthesis = (text: string): boolean => text.includes('(');

const RUBY_KEYWORDS = new Set([
  'BEGIN',
  'END',
  '__FILE__',
  '__LINE__',
  '__ENCODING__',
  'alias',
  'and',
  'begin',
  'break',
  'case',
  'class',
  'def',
  'defined?',
  'do',
  'else',
  'elsif',
  'end',
  'ensure',
  'false',
  'for',
  'if',
  'in',
  'module',
  'next',
  'nil',
  'not',
  'or',
  'redo',
  'rescue',
  'retry',
  'return',
  'self',
  'super',
  'then',
  'true',
  'undef',
  'unless',
  'until',
  'when',
  'while',
  'yield',
]);

const RUBY_IDENTIFIER = /[A-Za-z_]\w*[?!]?/g;

const holdsRubyIdentifier = (text: string): boolean =>
  [...text.matchAll(RUBY_IDENTIFIER)].some(([word]) => !RUBY_KEYWORDS.has(word));

const RUBY_RULE: LineRule = {
  commentMarkers: ['#'],
  canHoldCall: (text) => holdsOpeningParenthesis(text) || holdsRubyIdentifier(text),
};

const C_STYLE_RULE: LineRule = {
  commentMarkers: ['//', '/*', '*'],
  canHoldCall: holdsOpeningParenthesis,
};

const ruleOf = (language: string): LineRule => (language === 'ruby' ? RUBY_RULE : C_STYLE_RULE);

const languageOfFile = (documents: readonly GraphDocument[]): ReadonlyMap<string, string> =>
  new Map(documents.flatMap((document) => document.files.map((file) => [file, document.language])));

const isCandidate = (text: string, rule: LineRule): boolean => {
  const trimmed = text.trim();
  return (
    trimmed !== '' &&
    !rule.commentMarkers.some((marker) => trimmed.startsWith(marker)) &&
    rule.canHoldCall(trimmed)
  );
};

const byCodePoint = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

export const candidateLinesOf = (
  sources: SourceTexts,
  documents: readonly GraphDocument[],
): readonly SourceLine[] => {
  const languages = languageOfFile(documents);
  return Object.keys(sources)
    .sort(byCodePoint)
    .flatMap((file) => {
      const language = languages.get(file);
      if (language === undefined)
        throw new Error(`The branch source ${file} is in no graph document of the branch.`);
      const rule = ruleOf(language);
      return (sources[file] ?? '')
        .split('\n')
        .map((text, index) => ({ file, line: index + 1, text: text.replace(/\r$/, '') }))
        .filter(({ text }) => isCandidate(text, rule));
    });
};

export const inFileAndLineOrder = (lines: readonly SourceLine[]): readonly SourceLine[] =>
  [...lines].sort((left, right) => byCodePoint(left.file, right.file) || left.line - right.line);
