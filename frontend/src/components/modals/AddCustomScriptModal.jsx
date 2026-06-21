import { useState, useRef, useEffect } from 'react';
import { X, Upload, Type, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, useReducedMotion } from 'framer-motion';
import { apiFetch } from '../../services/apiClient';
import classes from './AddCustomScriptModal.module.css';

/* eslint-disable react/prop-types -- modal props are simple and stable */
const AddCustomScriptModal = ({ isOpen, onClose, onScriptAdded }) => {
  const reduceMotion = useReducedMotion();
  const [activeTab, setActiveTab] = useState('write');
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef(null);

  const resetForm = () => {
    setActiveTab('write');
    setTitle('');
    setText('');
    setFile(null);
    setIsSubmitting(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  useEffect(() => {
    if (!isOpen) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleManualSubmit = async () => {
    if (!title.trim() || !text.trim()) {
      toast.error('Please enter a title and script content');
      return;
    }

    setIsSubmitting(true);
    try {
      const newScript = await apiFetch('/api/users/me/custom-scripts', {
        method: 'POST',
        body: { title, text }
      });
      toast.success('Script created!');
      onScriptAdded(newScript);
      handleClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUploadSubmit = async () => {
    if (!file) {
      toast.error('Please select a file to upload');
      return;
    }

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const newScript = await apiFetch('/api/users/me/custom-scripts/upload', {
        method: 'POST',
        body: formData
      });

      toast.success('Script uploaded successfully!');
      onScriptAdded(newScript);
      handleClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      const validTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
      if (!validTypes.includes(selected.type) && !selected.name.endsWith('.docx')) {
        toast.error('Please upload a PDF or DOCX file');
        return;
      }
      setFile(selected);
    }
  };

  const panelMotion = reduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 } }
    : { initial: { opacity: 0, y: 16, scale: 0.98 }, animate: { opacity: 1, y: 0, scale: 1 } };

  return (
    <div
      className={classes.overlay}
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="addScriptTitle"
    >
      <motion.div
        className={`glass ${classes.modal}`}
        onClick={(e) => e.stopPropagation()}
        {...panelMotion}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className={classes.header}>
          <h2 id="addScriptTitle">Add custom script</h2>
          <button type="button" className={classes.closeBtn} onClick={handleClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className={`glass ${classes.tabTray}`}>
          <button
            type="button"
            className={`${classes.tab} ${activeTab === 'write' ? classes.tabActive : ''}`}
            onClick={() => setActiveTab('write')}
          >
            <Type size={15} /> Write manually
          </button>
          <button
            type="button"
            className={`${classes.tab} ${activeTab === 'upload' ? classes.tabActive : ''}`}
            onClick={() => setActiveTab('upload')}
          >
            <Upload size={15} /> Upload file
          </button>
        </div>

        <div className={classes.body}>
          {activeTab === 'write' ? (
            <div className={classes.writeSection}>
              <div className={classes.formGroup}>
                <label htmlFor="script-title">Script title</label>
                <input
                  id="script-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. My custom life insurance pitch"
                  className={classes.input}
                />
              </div>
              <div className={classes.formGroup}>
                <label htmlFor="script-content">Script content</label>
                <textarea
                  id="script-content"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Type or paste your script here..."
                  className={classes.textarea}
                />
              </div>
              <button
                type="button"
                className={classes.submitBtn}
                onClick={handleManualSubmit}
                disabled={isSubmitting}
              >
                {isSubmitting ? <Loader2 size={16} className={classes.spinner} /> : null}
                {isSubmitting ? 'Saving...' : 'Save script'}
              </button>
            </div>
          ) : (
            <div className={classes.uploadSection}>
              <div
                className={classes.uploadBox}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className={classes.hiddenInput}
                />
                <Upload size={32} className={classes.uploadIcon} />
                {file ? (
                  <p className={classes.fileName}>{file.name}</p>
                ) : (
                  <>
                    <p className={classes.uploadTitle}>Click to upload</p>
                    <p className={classes.uploadSub}>PDF or DOCX</p>
                  </>
                )}
              </div>
              <button
                type="button"
                className={classes.submitBtn}
                onClick={handleUploadSubmit}
                disabled={!file || isSubmitting}
              >
                {isSubmitting ? <Loader2 size={16} className={classes.spinner} /> : null}
                {isSubmitting ? 'Uploading...' : 'Upload script'}
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default AddCustomScriptModal;
