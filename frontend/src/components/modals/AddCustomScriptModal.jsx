import React, { useState, useRef } from 'react';
import { X, Upload, Type, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiFetch } from '../../services/apiClient';
import useAuthStore from '../../store/authStore';
import classes from './AddCustomScriptModal.module.css';

const AddCustomScriptModal = ({ isOpen, onClose, onScriptAdded }) => {
  const [activeTab, setActiveTab] = useState('write'); // 'write' or 'upload'
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const user = useAuthStore((s) => s.user);
  const fileInputRef = useRef(null);

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
      onClose();
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
      onClose();
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

  return (
    <div className={classes.overlay}>
      <div className={classes.modal}>
        <div className={classes.header}>
          <h2>Add Custom Script</h2>
          <button className={classes.closeBtn} onClick={onClose}><X size={20} /></button>
        </div>

        <div className={classes.tabs}>
          <button 
            className={`${classes.tab} ${activeTab === 'write' ? classes.activeTab : ''}`}
            onClick={() => setActiveTab('write')}
          >
            <Type size={16} /> Write Manually
          </button>
          <button 
            className={`${classes.tab} ${activeTab === 'upload' ? classes.activeTab : ''}`}
            onClick={() => setActiveTab('upload')}
          >
            <Upload size={16} /> Upload File
          </button>
        </div>

        <div className={classes.body}>
          {activeTab === 'write' ? (
            <div className={classes.writeSection}>
              <div className={classes.formGroup}>
                <label>Script Title</label>
                <input 
                  type="text" 
                  value={title} 
                  onChange={(e) => setTitle(e.target.value)} 
                  placeholder="e.g. My Custom Life Insurance Pitch"
                  className={classes.input}
                />
              </div>
              <div className={classes.formGroup}>
                <label>Script Content</label>
                <textarea 
                  value={text} 
                  onChange={(e) => setText(e.target.value)} 
                  placeholder="Type or paste your script here..."
                  className={classes.textarea}
                />
              </div>
              <button 
                className={classes.submitBtn} 
                onClick={handleManualSubmit}
                disabled={isSubmitting}
              >
                {isSubmitting ? <Loader2 size={16} className={classes.spinner} /> : null}
                {isSubmitting ? 'Saving...' : 'Save Script'}
              </button>
            </div>
          ) : (
            <div className={classes.uploadSection}>
              <div className={classes.uploadBox} onClick={() => fileInputRef.current?.click()}>
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
                    <p className={classes.uploadTitle}>Click or drag to upload</p>
                    <p className={classes.uploadSub}>Supports PDF and DOCX</p>
                  </>
                )}
              </div>
              <button 
                className={classes.submitBtn} 
                onClick={handleUploadSubmit}
                disabled={!file || isSubmitting}
              >
                {isSubmitting ? <Loader2 size={16} className={classes.spinner} /> : null}
                {isSubmitting ? 'Uploading...' : 'Upload Script'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AddCustomScriptModal;
