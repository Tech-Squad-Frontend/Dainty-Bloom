import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DismissKeyboardOnOutsideTap } from './DismissKeyboardOnOutsideTap';

afterEach(cleanup);

describe('DismissKeyboardOnOutsideTap', () => {
  it('blurs an editable field when a non-interactive area is clicked', () => {
    render(
      <>
        <DismissKeyboardOnOutsideTap />
        <input aria-label="Name" />
        <div data-testid="blank-area">Blank area</div>
      </>,
    );
    const input = screen.getByRole('textbox', { name: 'Name' });
    input.focus();

    fireEvent.click(screen.getByTestId('blank-area'));

    expect(document.activeElement).not.toBe(input);
  });

  it('blurs textareas and contenteditable text when clicking outside', () => {
    render(
      <>
        <DismissKeyboardOnOutsideTap />
        <textarea aria-label="Message" />
        <div
          contentEditable
          role="textbox"
          aria-label="Editable notes"
          suppressContentEditableWarning
        />
        <div data-testid="blank-area">Blank area</div>
      </>,
    );
    const blankArea = screen.getByTestId('blank-area');
    const textarea = screen.getByRole('textbox', { name: 'Message' });
    textarea.focus();
    fireEvent.click(blankArea);
    expect(document.activeElement).not.toBe(textarea);

    const editor = screen.getByRole('textbox', { name: 'Editable notes' });
    editor.focus();
    fireEvent.click(blankArea);
    expect(document.activeElement).not.toBe(editor);
  });

  it('keeps focus when clicking inside the field or scrolling outside it', () => {
    render(
      <>
        <DismissKeyboardOnOutsideTap />
        <input aria-label="Name" />
        <div data-testid="blank-area">Blank area</div>
      </>,
    );
    const input = screen.getByRole('textbox', { name: 'Name' });
    input.focus();

    fireEvent.click(input);
    fireEvent.scroll(screen.getByTestId('blank-area'));

    expect(document.activeElement).toBe(input);
  });

  it('does not programmatically blur when an interactive control is clicked', () => {
    render(
      <>
        <DismissKeyboardOnOutsideTap />
        <input aria-label="Name" />
        <button type="button">Action</button>
        <a href="#destination">Link</a>
        <label>Label</label>
        <select aria-label="Choice">
          <option>One</option>
        </select>
        <input aria-label="Date" type="date" />
        <input aria-label="Attachment" type="file" />
        <input aria-label="Consent" type="checkbox" />
        <div role="button" tabIndex={0}>
          Custom action
        </div>
      </>,
    );
    const input = screen.getByRole('textbox', { name: 'Name' });
    input.focus();
    const blur = vi.spyOn(input, 'blur');

    for (const control of [
      screen.getByRole('button', { name: 'Action' }),
      screen.getByRole('link', { name: 'Link' }),
      screen.getByText('Label'),
      screen.getByRole('combobox', { name: 'Choice' }),
      screen.getByLabelText('Date'),
      screen.getByLabelText('Attachment'),
      screen.getByLabelText('Consent'),
      screen.getByRole('button', { name: 'Custom action' }),
    ]) {
      fireEvent.click(control);
      expect(blur).not.toHaveBeenCalled();
    }
  });
});
