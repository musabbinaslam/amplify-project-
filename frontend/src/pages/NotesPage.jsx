import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  Save,
  Loader,
  FileEdit,
  Plus,
  Trash2,
  Sidebar as SidebarIcon,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  Quote,
  Link,
  Unlink,
  Eraser,
  Heading1,
  Pilcrow,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { getApiBaseUrl } from '../config/apiBase';
import useAuthStore from '../store/authStore';
import PageLoader from '../components/ui/PageLoader';
import { useSubtlePageMotion } from '../hooks/useSubtlePageMotion';
import classes from './NotesPage.module.css';

const EMPTY_EDITOR_HTML = '<p><br></p>';

function escapeHtml(value = '') {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function plainTextToHtml(text = '') {
  const lines = String(text).split('\n');
  const html = lines.map((line) => `<p>${escapeHtml(line) || '<br>'}</p>`).join('');
  return html || EMPTY_EDITOR_HTML;
}

function normalizeEditorHtml(rawHtml = '') {
  const draft = String(rawHtml || '').trim();
  if (!draft) return EMPTY_EDITOR_HTML;

  const parser = new DOMParser();
  const doc = parser.parseFromString(draft, 'text/html');

  doc.querySelectorAll('script,style,iframe,object').forEach((node) => node.remove());
  doc.querySelectorAll('*').forEach((el) => {
    [...el.attributes].forEach((attr) => {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on') || name === 'style') {
        el.removeAttribute(attr.name);
      }
    });
  });

  const bodyHtml = (doc.body.innerHTML || '').trim();
  if (!bodyHtml || bodyHtml === '<br>') return EMPTY_EDITOR_HTML;
  return bodyHtml;
}

function htmlToPlainText(html = '') {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html || '', 'text/html');
  return (doc.body.textContent || '').replace(/\u00a0/g, ' ').trim();
}

const NotesPage = () => {
  const presets = useSubtlePageMotion();
  const token = useAuthStore((s) => s.token);
  
  const [notes, setNotes] = useState([]);
  const [activeNoteId, setActiveNoteId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [toolbarState, setToolbarState] = useState({
    bold: false,
    italic: false,
    underline: false,
    strikeThrough: false,
    insertUnorderedList: false,
    insertOrderedList: false,
    heading: false,
    paragraph: true,
    quote: false,
    link: false,
  });
  
  const saveTimeoutRef = useRef(null);
  const editorRef = useRef(null);
  const deleteContainerRef = useRef(null);

  const fetchNotes = async () => {
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/users/me/notes`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to load notes');
      const data = await res.json();
      const hydrated = (data.notes || []).map((note) => {
        const text = note.text || '';
        const textHtml = note.textHtml || plainTextToHtml(text);
        return { ...note, text, textHtml };
      });
      setNotes(hydrated);
      
      // Select first note if available and none selected
      if (hydrated.length > 0 && !activeNoteId) {
        setActiveNoteId(hydrated[0].id);
      }
    } catch (err) {
      console.error(err);
      toast.error('Could not load your notes');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchNotes();
    }
  }, [token]);

  const activeNote = useMemo(() => {
    return notes.find(n => n.id === activeNoteId) || null;
  }, [notes, activeNoteId]);

  const sortedNotes = useMemo(() => {
    return [...notes].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [notes]);

  const createNote = async () => {
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/users/me/notes`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to create note: ${res.status} ${text}`);
      }
      const newNote = await res.json();
      setNotes(prev => [{ ...newNote, textHtml: newNote.textHtml || EMPTY_EDITOR_HTML }, ...prev]);
      setActiveNoteId(newNote.id);
    } catch (err) {
      console.error('CREATE NOTE ERROR:', err);
      toast.error(err.message || 'Failed to create a new note');
    }
  };

  const deleteNote = async (id) => {
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/users/me/notes/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to delete note');
      
      setNotes(prev => prev.filter(n => n.id !== id));
      if (activeNoteId === id) {
        setActiveNoteId(null);
      }
      setShowDeleteConfirm(false);
      toast.success('Note deleted');
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete note');
    }
  };

  const saveNoteToServer = async (id, title, text, textHtml) => {
    setIsSaving(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/users/me/notes/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ title, text, textHtml })
      });
      if (!res.ok) throw new Error('Failed to save note');
      
      // Update local state's updatedAt timestamp
      setNotes(prev => prev.map(n => 
        n.id === id ? { ...n, updatedAt: new Date().toISOString(), title, text, textHtml } : n
      ));
    } catch (err) {
      console.error(err);
      toast.error('Failed to save note');
    } finally {
      setIsSaving(false);
    }
  };

  const queueSave = (nextTitle, nextText, nextHtml) => {
    if (!activeNoteId) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveNoteToServer(activeNoteId, nextTitle, nextText, nextHtml);
    }, 1500);
  };

  const handleNoteChange = (field, value) => {
    if (!activeNoteId) return;

    // Update local state immediately for snappy UI
    const updatedNote = notes.find(n => n.id === activeNoteId);
    if (!updatedNote) return;

    const titleToSave = field === 'title' ? value : updatedNote.title;
    const textToSave = field === 'text' ? value : updatedNote.text;
    const htmlToSave = field === 'textHtml' ? value : (updatedNote.textHtml || plainTextToHtml(updatedNote.text || ''));

    setNotes(prev => prev.map(n => (
      n.id === activeNoteId ? { ...n, title: titleToSave, text: textToSave, textHtml: htmlToSave } : n
    )));

    queueSave(titleToSave, textToSave, htmlToSave);
  };

  const handleManualSave = () => {
    if (!activeNote) return;
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveNoteToServer(
      activeNote.id,
      activeNote.title,
      activeNote.text || '',
      activeNote.textHtml || plainTextToHtml(activeNote.text || ''),
    );
  };

  useEffect(() => {
    if (!activeNote || !editorRef.current) return;
    const html = normalizeEditorHtml(activeNote.textHtml || plainTextToHtml(activeNote.text || ''));
    if (editorRef.current.innerHTML !== html) {
      editorRef.current.innerHTML = html;
    }
  }, [activeNote?.id, activeNote?.textHtml, activeNote?.text]);

  const handleEditorInput = (e) => {
    if (!activeNoteId) return;
    const html = normalizeEditorHtml(e.currentTarget.innerHTML);
    const text = htmlToPlainText(html);
    const current = notes.find((n) => n.id === activeNoteId);
    if (!current) return;

    setNotes((prev) => prev.map((n) => (n.id === activeNoteId ? { ...n, textHtml: html, text } : n)));
    queueSave(current.title, text, html);
  };

  const runCommand = (command, value = null) => {
    if (!editorRef.current || !activeNote) return;
    editorRef.current.focus();
    document.execCommand(command, false, value);
    const html = normalizeEditorHtml(editorRef.current.innerHTML);
    const text = htmlToPlainText(html);
    setNotes((prev) => prev.map((n) => (n.id === activeNote.id ? { ...n, textHtml: html, text } : n)));
    queueSave(activeNote.title, text, html);
    syncToolbarState();
  };

  const setParagraph = () => runCommand('formatBlock', 'p');
  const setHeading = () => runCommand('formatBlock', 'h1');
  const setQuote = () => runCommand('formatBlock', 'blockquote');

  const createLink = () => {
    const url = window.prompt('Enter URL');
    if (!url) return;
    runCommand('createLink', url);
  };

  const getSelectionContainerInEditor = () => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !editorRef.current) return null;
    const node = selection.getRangeAt(0).commonAncestorContainer;
    const elementNode = node.nodeType === 1 ? node : node.parentElement;
    if (!elementNode) return null;
    if (!editorRef.current.contains(elementNode)) return null;
    return elementNode;
  };

  const syncToolbarState = () => {
    const container = getSelectionContainerInEditor();
    if (!container) return;

    const tag = container.tagName?.toLowerCase?.() || '';
    const closest = (selector) => container.closest?.(selector);

    setToolbarState({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      strikeThrough: document.queryCommandState('strikeThrough'),
      insertUnorderedList: document.queryCommandState('insertUnorderedList'),
      insertOrderedList: document.queryCommandState('insertOrderedList'),
      heading: tag === 'h1' || Boolean(closest('h1')),
      paragraph: tag === 'p' || Boolean(closest('p')),
      quote: tag === 'blockquote' || Boolean(closest('blockquote')),
      link: tag === 'a' || Boolean(closest('a')),
    });
  };

  useEffect(() => {
    const onSelectionChange = () => syncToolbarState();
    document.addEventListener('selectionchange', onSelectionChange);
    return () => document.removeEventListener('selectionchange', onSelectionChange);
  }, []);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (!showDeleteConfirm) return;
      if (!deleteContainerRef.current) return;
      if (deleteContainerRef.current.contains(event.target)) return;
      setShowDeleteConfirm(false);
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showDeleteConfirm]);

  if (isLoading) {
    return <PageLoader message="Loading your notes..." />;
  }

  return (
    <motion.div
      className={classes.pageContainer}
      variants={presets.root}
      initial="hidden"
      animate="visible"
    >
      <motion.div className={`${classes.sidebar} ${!isSidebarOpen ? classes.collapsed : ''}`} variants={presets.child}>
        <div className={classes.sidebarHeader}>
          <div className={classes.sidebarMeta}>
            <p className={classes.sidebarCount}>{sortedNotes.length} notes</p>
          </div>
          <button className={classes.newNoteBtn} onClick={createNote} title="New Note">
            <Plus size={16} />
            <span>New</span>
          </button>
        </div>
        
        <div className={classes.notesList}>
          {notes.length === 0 ? (
            <div className={classes.emptyState}>
              <p>No notes yet.</p>
              <button className={classes.emptyActionBtn} onClick={createNote}>Create note</button>
            </div>
          ) : (
            sortedNotes.map(note => (
              <button 
                key={note.id} 
                className={`${classes.noteItem} ${activeNoteId === note.id ? classes.active : ''}`}
                onClick={() => setActiveNoteId(note.id)}
              >
                <h3 className={classes.noteItemTitle}>{note.title || 'Untitled Note'}</h3>
                <p className={classes.noteItemPreview}>
                  {(note.text || 'No content yet').trim().replace(/\s+/g, ' ').slice(0, 100)}
                </p>
                <p className={classes.noteItemDate}>
                  {new Date(note.updatedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                </p>
              </button>
            ))
          )}
        </div>
      </motion.div>

      <motion.div className={classes.mainContent} variants={presets.child}>
        {activeNote ? (
          <>
            <div className={classes.editorHeader}>
              <div className={classes.editorHeaderLeft}>
                <button 
                  className={classes.toggleSidebarBtn} 
                  onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                  title="Toggle Sidebar"
                >
                  <SidebarIcon size={18} />
                </button>
                <input
                  type="text"
                  className={classes.noteTitleInput}
                  value={activeNote.title}
                  onChange={(e) => handleNoteChange('title', e.target.value)}
                  placeholder="Note Title..."
                />
              </div>
              <div className={classes.toolbar}>
                <button className={`${classes.toolBtn} ${toolbarState.bold ? classes.activeToolBtn : ''}`} onClick={() => runCommand('bold')} title="Bold"><Bold size={14} /></button>
                <button className={`${classes.toolBtn} ${toolbarState.italic ? classes.activeToolBtn : ''}`} onClick={() => runCommand('italic')} title="Italic"><Italic size={14} /></button>
                <button className={`${classes.toolBtn} ${toolbarState.underline ? classes.activeToolBtn : ''}`} onClick={() => runCommand('underline')} title="Underline"><Underline size={14} /></button>
                <button className={`${classes.toolBtn} ${toolbarState.strikeThrough ? classes.activeToolBtn : ''}`} onClick={() => runCommand('strikeThrough')} title="Strikethrough"><Strikethrough size={14} /></button>
                <span className={classes.toolDivider} />
                <button className={`${classes.toolBtn} ${toolbarState.heading ? classes.activeToolBtn : ''}`} onClick={setHeading} title="Heading"><Heading1 size={14} /></button>
                <button className={`${classes.toolBtn} ${toolbarState.paragraph ? classes.activeToolBtn : ''}`} onClick={setParagraph} title="Paragraph"><Pilcrow size={14} /></button>
                <button className={`${classes.toolBtn} ${toolbarState.quote ? classes.activeToolBtn : ''}`} onClick={setQuote} title="Quote"><Quote size={14} /></button>
                <span className={classes.toolDivider} />
                <button className={`${classes.toolBtn} ${toolbarState.insertUnorderedList ? classes.activeToolBtn : ''}`} onClick={() => runCommand('insertUnorderedList')} title="Bulleted list"><List size={14} /></button>
                <button className={`${classes.toolBtn} ${toolbarState.insertOrderedList ? classes.activeToolBtn : ''}`} onClick={() => runCommand('insertOrderedList')} title="Numbered list"><ListOrdered size={14} /></button>
                <span className={classes.toolDivider} />
                <button className={`${classes.toolBtn} ${toolbarState.link ? classes.activeToolBtn : ''}`} onClick={createLink} title="Add link"><Link size={14} /></button>
                <button className={classes.toolBtn} onClick={() => runCommand('unlink')} title="Remove link"><Unlink size={14} /></button>
                <button className={classes.toolBtn} onClick={() => runCommand('removeFormat')} title="Clear formatting"><Eraser size={14} /></button>
              </div>
              <div className={classes.actions}>
                <button
                  type="button"
                  className={classes.saveBtn}
                  onClick={handleManualSave}
                  disabled={isSaving}
                  aria-busy={isSaving}
                >
                  {isSaving ? (
                    <>
                      <Loader size={14} className={classes.spinnerSmall} aria-hidden />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Save size={14} aria-hidden />
                      <span>Save Note</span>
                    </>
                  )}
                </button>
                <div className={classes.deleteContainer} ref={deleteContainerRef}>
                  <button 
                    className={`${classes.deleteBtn} ${showDeleteConfirm ? classes.active : ''}`} 
                    onClick={() => setShowDeleteConfirm(!showDeleteConfirm)}
                    title="Delete Note"
                  >
                    <Trash2 size={18} />
                  </button>
                  
                  {showDeleteConfirm && (
                    <div className={classes.deleteConfirmPopover}>
                      <span className={classes.deleteConfirmText}>Delete note?</span>
                      <button 
                        className={classes.deleteConfirmYes}
                        onClick={() => deleteNote(activeNote.id)}
                      >
                        Yes
                      </button>
                      <button 
                        className={classes.deleteConfirmNo}
                        onClick={() => setShowDeleteConfirm(false)}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className={classes.editorContainer}>
              <div
                ref={editorRef}
                className={classes.richEditor}
                contentEditable
                onInput={handleEditorInput}
                onKeyUp={syncToolbarState}
                onMouseUp={syncToolbarState}
                suppressContentEditableWarning
                spellCheck
                role="textbox"
                aria-label="Rich text note editor"
              />
            </div>
          </>
        ) : (
          <div className={classes.noNoteSelected}>
            <button 
              className={classes.toggleSidebarBtn} 
              style={{ position: 'absolute', top: 16, left: 16 }}
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            >
              <SidebarIcon size={18} />
            </button>
            <FileEdit size={48} className={classes.noNoteIcon} />
            <h2>No Note Selected</h2>
            <p>Select a note from the sidebar or create a new one.</p>
            <button className={classes.emptyActionBtn} onClick={createNote}>Create note</button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};

export default NotesPage;
