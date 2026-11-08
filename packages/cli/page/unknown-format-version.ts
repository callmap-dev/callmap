import type { UnknownFormatVersionError } from '@callmap/review-input';

export const showUnknownFormatVersion = (
  graph: HTMLElement,
  error: UnknownFormatVersionError,
): void => {
  const message = document.createElement('section');
  message.className = 'empty-state unknown-format-version';
  message.setAttribute('role', 'alert');
  const heading = document.createElement('h2');
  heading.textContent = 'This page cannot read its review input';
  const text = document.createElement('p');
  text.textContent = error.message;
  message.append(heading, text);
  graph.before(message);
  graph.hidden = true;
  graph.setAttribute('aria-busy', 'false');
};
