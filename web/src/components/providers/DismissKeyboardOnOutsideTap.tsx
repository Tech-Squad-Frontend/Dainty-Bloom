'use client';

import { useEffect } from 'react';

const interactiveSelector = [
  'a[href]',
  'button',
  'input',
  'select',
  'textarea',
  'label',
  'summary',
  'details',
  '[role="button"]',
  '[role="link"]',
  '[role="combobox"]',
  '[role="listbox"]',
  '[role="option"]',
  '[role="menu"]',
  '[role="menuitem"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
  '[role="tab"]',
  '[role="slider"]',
  '[role="spinbutton"]',
  '[role="treeitem"]',
  '[role="gridcell"]',
  '[role="dialog"]',
  '[role="tablist"]',
  '[role="menuitemcheckbox"]',
  '[role="menuitemradio"]',
  '[role="toolbar"]',
  '[role="grid"]',
  '[role="tree"]',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable]:not([contenteditable="false"])',
  '[data-keyboard-interactive]',
].join(',');

function isEditableTextField(element: Element | null): element is HTMLElement {
  if (!(element instanceof HTMLElement)) return false;
  if (element instanceof HTMLTextAreaElement) return true;
  if (element instanceof HTMLInputElement) {
    return [
      'email',
      'number',
      'password',
      'search',
      'tel',
      'text',
      'url',
    ].includes(element.type);
  }
  const contentEditable = element.getAttribute('contenteditable');
  return (
    contentEditable === '' ||
    contentEditable === 'true' ||
    contentEditable === 'plaintext-only'
  );
}

export function DismissKeyboardOnOutsideTap() {
  useEffect(() => {
    function dismissOnOutsideClick(event: MouseEvent) {
      const activeElement = document.activeElement;
      if (!isEditableTextField(activeElement)) return;

      const path = event.composedPath();
      if (
        path.includes(activeElement) ||
        path.some(
          (target) =>
            target instanceof Element && target.matches(interactiveSelector),
        )
      ) {
        return;
      }

      activeElement.blur();
    }

    document.addEventListener('click', dismissOnOutsideClick);
    return () => document.removeEventListener('click', dismissOnOutsideClick);
  }, []);

  return null;
}
