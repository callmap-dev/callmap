import type { LanguageRate } from '@callmap/review';
import { eyebrowOf, spanOf } from '../panel-elements.ts';
import type { PagePart } from '../reader-page.ts';
import { countTextOf } from '../words.ts';

const NAMED_MISSING_PACKAGES = 5;

const missingPackagesWarningOf = (names: readonly string[]): HTMLElement => {
  const named = names.slice(0, NAMED_MISSING_PACKAGES).join(', ');
  const more = names.length - NAMED_MISSING_PACKAGES;
  const list = more > 0 ? `${named} and ${String(more)} more` : named;
  const packages = names.length === 1 ? '1 package finds' : `${String(names.length)} packages find`;
  const them = names.length === 1 ? 'it' : 'them';
  const warning = document.createElement('p');
  warning.className = 'missing-packages';
  warning.setAttribute('role', 'note');
  warning.textContent = `${packages} no code: ${list}. Each call into ${them} is an open end, so install the dependencies and run the review again.`;
  return warning;
};

const languageRateOf = ({
  checker,
  resolved,
  open,
  rate,
  missingPackages,
}: LanguageRate): HTMLElement => {
  const checkerText = `${checker.name} ${checker.version}`;
  const language = document.createElement('div');
  language.className = 'language-rate';
  language.setAttribute('role', 'group');
  language.setAttribute('aria-label', checkerText);

  const value = document.createElement('p');
  value.className = 'rate';
  value.append(
    spanOf('checker', checkerText),
    ' · ',
    spanOf('rate-value', `${(rate * 100).toFixed(1)}%`),
  );
  const bar = document.createElement('div');
  bar.className = 'rate-bar';
  const filled = document.createElement('span');
  filled.style.width = `${String(rate * 100)}%`;
  bar.append(filled);
  const calls = document.createElement('p');
  calls.className = 'rate-calls';
  calls.textContent = `${countTextOf(resolved)} of ${countTextOf(resolved + open)} calls proved`;

  language.append(value, bar, calls);
  if (missingPackages.length > 0) language.append(missingPackagesWarningOf(missingPackages));
  return language;
};

const resolutionRate: PagePart = ({ data, panels }) => {
  const section = document.createElement('section');
  section.setAttribute('aria-label', 'Resolution rate');
  section.className = 'resolution-rate';
  section.title = 'Calls in the whole repo in scope. A one-of group counts as one call.';
  section.append(eyebrowOf('Resolution'), ...data.review.resolutionRates.map(languageRateOf));
  panels.prepend(section);
};

export default resolutionRate;
