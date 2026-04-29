import React, { useEffect, useState, useRef, useMemo } from 'react';
import { Save, Loader, FileEdit, Plus, Trash2, Sidebar as SidebarIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import { getApiBaseUrl } from '../config/apiBase';
import useAuthStore from '../store/authStore';
import PageLoader from '../components/ui/PageLoader';
import classes from './NotesPage.module.css';

const NotesPage = () => {
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  
  const [notes, setNotes] = useState([]);
  const [activeNoteId, setActiveNoteId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  const saveTimeoutRef = useRef(null);

  const fetchNotes = async () => {
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/users/me/notes`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to load notes');
      const data = await res.json();
      setNotes(data.notes || []);
      
      // Select first note if available and none selected
      if (data.notes && data.notes.length > 0 && !activeNoteId) {
        setActiveNoteId(data.notes[0].id);
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
      setNotes(prev => [newNote, ...prev]);
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

  const saveNoteToServer = async (id, title, text) => {
    setIsSaving(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/users/me/notes/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ title, text })
      });
      if (!res.ok) throw new Error('Failed to save note');
      
      // Update local state's updatedAt timestamp
      setNotes(prev => prev.map(n => 
        n.id === id ? { ...n, updatedAt: new Date().toISOString() } : n
      ));
    } catch (err) {
      console.error(err);
      toast.error('Failed to save note');
    } finally {
      setIsSaving(false);
    }
  };

  const handleNoteChange = (field, value) => {
    if (!activeNoteId) return;

    // Update local state immediately for snappy UI
    setNotes(prev => prev.map(n => 
      n.id === activeNoteId ? { ...n, [field]: value } : n
    ));

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    const updatedNote = notes.find(n => n.id === activeNoteId);
    const titleToSave = field === 'title' ? value : updatedNote.title;
    const textToSave = field === 'text' ? value : updatedNote.text;

    // Auto-save after 1.5 seconds of inactivity
    saveTimeoutRef.current = setTimeout(() => {
      saveNoteToServer(activeNoteId, titleToSave, textToSave);
    }, 1500);
  };

  const handleManualSave = () => {
    if (!activeNote) return;
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveNoteToServer(activeNote.id, activeNote.title, activeNote.text);
  };

  if (isLoading) {
    return <PageLoader message="Loading your notes..." />;
  }

  return (
    <div className={classes.pageContainer}>
      
      {/* Sidebar Panel */}
      <div className={`${classes.sidebar} ${!isSidebarOpen ? classes.collapsed : ''}`}>
        <div className={classes.sidebarHeader}>
          <h2 className={classes.sidebarTitle}>Notes</h2>
          <button className={classes.newNoteBtn} onClick={createNote} title="New Note">
            <Plus size={18} />
          </button>
        </div>
        
        <div className={classes.notesList}>
          {notes.length === 0 ? (
            <div className={classes.emptyState}>
              No notes yet. Click the + button to create one.
            </div>
          ) : (
            notes.map(note => (
              <button 
                key={note.id} 
                className={`${classes.noteItem} ${activeNoteId === note.id ? classes.active : ''}`}
                onClick={() => setActiveNoteId(note.id)}
              >
                <h3 className={classes.noteItemTitle}>{note.title || 'Untitled Note'}</h3>
                <p className={classes.noteItemDate}>
                  {new Date(note.updatedAt).toLocaleDateString()}
                </p>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Editor Panel */}
      <div className={classes.mainContent}>
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
              
              <div className={classes.actions}>
                {isSaving ? (
                  <span className={classes.statusText}>
                    <Loader size={14} className={classes.spinnerSmall} /> Saving...
                  </span>
                ) : (
                  <button 
                    className={classes.saveBtn}
                    onClick={handleManualSave}
                    disabled={isSaving}
                  >
                    <Save size={14} />
                    Save Note
                  </button>
                )}
                <div className={classes.deleteContainer}>
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
              <textarea
                className={classes.textArea}
                value={activeNote.text}
                onChange={(e) => handleNoteChange('text', e.target.value)}
                placeholder="Start typing your notes here..."
                spellCheck="false"
              />
            </div>
          </>
        ) : (
          <div className={classes.noNoteSelected}>
            <button 
              className={classes.toggleSidebarBtn} 
              style={{ position: 'absolute', top: 24, left: 32 }}
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            >
              <SidebarIcon size={18} />
            </button>
            <FileEdit size={48} className={classes.noNoteIcon} />
            <h2>No Note Selected</h2>
            <p>Select a note from the sidebar or create a new one.</p>
          </div>
        )}
      </div>
      
    </div>
  );
};

export default NotesPage;
