import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import PropTypes from 'prop-types';
import classes from './EditableText.module.css';

function readText(el, multiline) {
  // Walk the DOM rather than use innerText, which would bake in CSS text-transform.
  // Browsers represent Enter as "\n", <br> or a wrapping <div> depending on the mode.
  let out = '';
  const walk = (node) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        out += child.nodeValue;
      } else if (child.nodeName === 'BR') {
        out += '\n';
      } else {
        if (out && !out.endsWith('\n')) out += '\n';
        walk(child);
      }
    });
  };
  walk(el);
  // A lone trailing "\n" is the browser's caret placeholder, not something the user typed.
  const text = out.replace(/\u00a0/g, ' ').replace(/\r/g, '').replace(/\n$/, '');
  return multiline ? text : text.replace(/\n/g, ' ');
}

function caretToEnd(el) {
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

function selectionInside(el) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  const range = sel.getRangeAt(0);
  return el.contains(range.commonAncestorContainer) ? range : null;
}

function insertAtCaret(el, text) {
  let range = selectionInside(el);
  if (!range) {
    el.focus();
    caretToEnd(el);
    range = selectionInside(el);
  }
  if (!range) return;
  range.deleteContents();
  const node = document.createTextNode(text);
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

/**
 * Plain-text, in-place editable region. The DOM owns the text while the user
 * types (so the caret never jumps); the `value` prop is only written back when
 * it changes from somewhere else.
 */
const EditableText = forwardRef(function EditableText({
  value,
  onChange,
  placeholder,
  maxLength,
  multiline = false,
  invalid = false,
  onEnter,
  onBackspaceEmpty,
  onFocus,
  onBlur,
  className = '',
  ariaLabel,
  as: Tag = 'div',
}, forwardedRef) {
  const ref = useRef(null);
  const lastEmitted = useRef(null);
  const live = useRef({});
  live.current = { onChange, onEnter, onBackspaceEmpty, maxLength, multiline };

  const emit = () => {
    const el = ref.current;
    if (!el) return;
    const { maxLength: max, multiline: multi, onChange: change } = live.current;
    let text = readText(el, multi);
    if (max && text.length > max) {
      text = text.slice(0, max);
      el.textContent = text;
      caretToEnd(el);
    }
    // Browsers leave a stray <br> behind in an emptied element, which hides the placeholder.
    if (!text && el.childNodes.length) el.textContent = '';
    if (text === lastEmitted.current) return;
    lastEmitted.current = text;
    change(text);
  };

  useImperativeHandle(forwardedRef, () => ({
    focus: ({ scroll = false } = {}) => {
      const el = ref.current;
      if (!el) return;
      el.focus({ preventScroll: scroll });
      caretToEnd(el);
      if (scroll) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    },
    insertText: (text) => {
      const el = ref.current;
      if (!el) return;
      const max = live.current.maxLength;
      const room = max ? max - readText(el, live.current.multiline).length : text.length;
      if (room <= 0) return;
      insertAtCaret(el, text.slice(0, room));
      emit();
    },
  }));

  // Use the browser's plain-text editing mode where it exists (no bold, no pasted markup).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    try {
      el.contentEditable = 'plaintext-only';
    } catch {
      el.contentEditable = 'true';
    }
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || value === lastEmitted.current) return;
    lastEmitted.current = value;
    if (readText(el, multiline) === value) return;
    el.textContent = value;
    if (document.activeElement === el) caretToEnd(el);
  }, [value, multiline]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const onBeforeInput = (e) => {
      const { maxLength: max, multiline: multi } = live.current;
      if (!e.inputType || !e.inputType.startsWith('insert')) return;
      const isBreak = e.inputType === 'insertParagraph' || e.inputType === 'insertLineBreak';
      if (isBreak && !multi) {
        e.preventDefault();
        return;
      }
      if (!max || e.isComposing) return;
      const incoming = isBreak ? 1 : String(e.data || '').length;
      const selected = selectionInside(el)?.toString().length || 0;
      if (readText(el, multi).length - selected + incoming > max) e.preventDefault();
    };
    el.addEventListener('beforeinput', onBeforeInput);
    return () => el.removeEventListener('beforeinput', onBeforeInput);
  }, []);

  const onKeyDown = (e) => {
    const el = ref.current;
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !multiline) {
      e.preventDefault();
      live.current.onEnter?.();
      return;
    }
    if (e.key === 'Backspace' && live.current.onBackspaceEmpty && !readText(el, multiline)) {
      e.preventDefault();
      live.current.onBackspaceEmpty();
    }
  };

  const onPaste = (e) => {
    e.preventDefault();
    const el = ref.current;
    let text = (e.clipboardData?.getData('text/plain') || '').replace(/\r\n?/g, '\n');
    if (!multiline) text = text.replace(/\s*\n\s*/g, ' ');
    if (maxLength) {
      const selected = selectionInside(el)?.toString().length || 0;
      text = text.slice(0, Math.max(0, maxLength - readText(el, multiline).length + selected));
    }
    if (!text) return;
    insertAtCaret(el, text);
    emit();
  };

  return (
    <Tag
      ref={ref}
      role="textbox"
      tabIndex={0}
      aria-label={ariaLabel || placeholder}
      aria-multiline={multiline}
      aria-invalid={invalid || undefined}
      data-placeholder={placeholder}
      spellCheck
      className={`${classes.editable} ${multiline ? classes.multiline : ''} ${invalid ? classes.invalid : ''} ${className}`}
      onInput={emit}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      onDrop={(e) => e.preventDefault()}
      onFocus={onFocus}
      onBlur={(e) => {
        emit();
        const el = ref.current;
        // Collapse whatever the browser built while typing back to clean text.
        if (el && el.children.length) el.textContent = lastEmitted.current || '';
        onBlur?.(e);
      }}
    />
  );
});

EditableText.propTypes = {
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  placeholder: PropTypes.string,
  maxLength: PropTypes.number,
  multiline: PropTypes.bool,
  invalid: PropTypes.bool,
  onEnter: PropTypes.func,
  onBackspaceEmpty: PropTypes.func,
  onFocus: PropTypes.func,
  onBlur: PropTypes.func,
  className: PropTypes.string,
  ariaLabel: PropTypes.string,
  as: PropTypes.string,
};

export default EditableText;
