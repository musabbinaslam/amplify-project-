import { useEffect } from 'react';
import Cropper from 'react-easy-crop';
import { X, Trash2, Loader2 } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import classes from './AvatarEditorModal.module.css';

/* eslint-disable react/prop-types -- modal props are simple and stable */
const AvatarEditorModal = ({
  isOpen,
  avatarSource,
  avatarCrop,
  avatarZoom,
  uploadingAvatar,
  avatarUploadProgress,
  onClose,
  onCropChange,
  onZoomChange,
  onCropComplete,
  onApply,
  onRemove,
}) => {
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!isOpen) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  if (!isOpen || !avatarSource) return null;

  const panelMotion = reduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 } }
    : { initial: { opacity: 0, y: 16, scale: 0.98 }, animate: { opacity: 1, y: 0, scale: 1 } };

  return (
    <div
      className={classes.overlay}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="avatarEditorTitle"
    >
      <motion.div
        className={`glass ${classes.modal}`}
        onClick={(e) => e.stopPropagation()}
        {...panelMotion}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className={classes.header}>
          <h2 id="avatarEditorTitle">Edit avatar</h2>
          <button type="button" className={classes.closeBtn} onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className={classes.cropWrap}>
          <Cropper
            image={avatarSource}
            crop={avatarCrop}
            zoom={avatarZoom}
            aspect={1}
            onCropChange={onCropChange}
            onZoomChange={onZoomChange}
            onCropComplete={onCropComplete}
          />
        </div>

        <div className={classes.sliderRow}>
          <span>Zoom</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.1}
            value={avatarZoom}
            onChange={(e) => onZoomChange(Number(e.target.value))}
          />
        </div>

        {uploadingAvatar && (
          <div className={classes.uploadProgress}>
            <div style={{ width: `${avatarUploadProgress}%` }} />
          </div>
        )}

        <div className={classes.actions}>
          <button type="button" className={classes.cancelBtn} onClick={onClose} disabled={uploadingAvatar}>
            Cancel
          </button>
          <button type="button" className={classes.removeBtn} onClick={onRemove} disabled={uploadingAvatar}>
            <Trash2 size={14} />
            Remove Photo
          </button>
          <button type="button" className={classes.applyBtn} onClick={onApply} disabled={uploadingAvatar}>
            {uploadingAvatar ? (
              <>
                <Loader2 size={14} className={classes.spinner} />
                Uploading...
              </>
            ) : (
              'Apply'
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default AvatarEditorModal;
