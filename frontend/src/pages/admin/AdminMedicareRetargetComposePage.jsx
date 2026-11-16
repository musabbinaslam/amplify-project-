import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, History, Mail, Send, X } from 'lucide-react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  cancelMedicareCustomBroadcast,
  getMedicareCustomAudiences,
  listMedicareCustomBroadcasts,
} from '../../services/adminService';
import { ADMIN_CATEGORIES, findAdminModuleById } from '../../config/adminModules';
import AdminPageShell from '../../components/admin/AdminPageShell';
import EmailEditor from '../../components/admin/medicareCompose/EmailEditor';
import SendPanel from '../../components/admin/medicareCompose/SendPanel';
import ReviewSendDialog from '../../components/admin/medicareCompose/ReviewSendDialog';
import HistoryDrawer from '../../components/admin/medicareCompose/HistoryDrawer';
import { EMPTY_COPY, normalizeDraft, validateCopy } from '../../components/admin/medicareCompose/copyModel';
import useAuthStore from '../../store/authStore';
import { useSubtlePageMotion } from '../../hooks/useSubtlePageMotion';
import shared from '../../components/admin/adminShared.module.css';
import classes from './AdminMedicareRetargetComposePage.module.css';

const MODULE = findAdminModuleById('medicare-retarget');
const DRAFT_KEY = 'callsflow:medicareCustomEmailDraft';
const POLL_MS = 3000;

function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function draftHasContent(copy) {
  return ['subject', 'preheader', 'headline', 'sub', 'intro', 'body'].some((k) => copy[k].trim());
}

export default function AdminMedicareRetargetComposePage() {
  const presets = useSubtlePageMotion();
  const user = useAuthStore((s) => s.user);
  const [copy, setCopy] = useState(() => normalizeDraft(loadDraft()));
  const [meta, setMeta] = useState({ audiences: [], templates: [], limits: {} });
  const [editorKey, setEditorKey] = useState(0);
  const [pendingTemplate, setPendingTemplate] = useState(null);
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  const [sendMode, setSendMode] = useState('group');
  const [audience, setAudience] = useState('active');
  const [selected, setSelected] = useState([]);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [broadcasts, setBroadcasts] = useState([]);
  const [broadcastsLoading, setBroadcastsLoading] = useState(true);
  const editorRef = useRef(null);
  const templateMenuRef = useRef(null);
  const untouched = useRef(true);
  const savedRef = useRef(false);

  useEffect(() => {
    getMedicareCustomAudiences()
      .then((out) => {
        const audiences = Array.isArray(out?.audiences) ? out.audiences : [];
        setMeta({
          audiences,
          templates: Array.isArray(out?.templates) ? out.templates : [],
          limits: out?.limits || {},
        });
        if (audiences.length) setAudience((cur) => (audiences.some((a) => a.key === cur) ? cur : audiences[0].key));
      })
      .catch((err) => toast.error(err.message || 'Failed to load the composer'));
  }, []);

  useEffect(() => {
    if (untouched.current) {
      untouched.current = false;
      return;
    }
    let saved = true;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(copy));
    } catch {
      saved = false;
    }
    // Only touch state when it flips; this runs on every keystroke.
    if (savedRef.current !== saved) {
      savedRef.current = saved;
      setDraftSaved(saved);
    }
  }, [copy]);

  const loadBroadcasts = useCallback(async () => {
    try {
      const out = await listMedicareCustomBroadcasts({ limit: 10 });
      setBroadcasts(Array.isArray(out?.items) ? out.items : []);
    } catch (err) {
      toast.error(err.message || 'Failed to load send history');
    } finally {
      setBroadcastsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBroadcasts();
  }, [loadBroadcasts]);

  const running = broadcasts.some((b) => b.status === 'running');

  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(loadBroadcasts, POLL_MS);
    return () => clearInterval(id);
  }, [running, loadBroadcasts]);

  const applyTemplate = (key) => {
    const source = key === 'blank' ? EMPTY_COPY : meta.templates.find((t) => t.key === key)?.copy;
    if (!source && key !== 'blank') {
      toast.error('That template is not available');
      return;
    }
    setCopy(normalizeDraft(source));
    setEditorKey((k) => k + 1);
    setPendingTemplate(null);
    setTemplateMenuOpen(false);
    toast.success(key === 'blank' ? 'Started from a blank email' : `Started from ${meta.templates.find((t) => t.key === key)?.label || key}`);
  };

  const requestTemplate = (key) => {
    if (!key) return;
    setTemplateMenuOpen(false);
    if (draftHasContent(copy)) setPendingTemplate(key);
    else applyTemplate(key);
  };

  useEffect(() => {
    if (!templateMenuOpen) return undefined;
    const onDown = (e) => {
      if (!templateMenuRef.current?.contains(e.target)) setTemplateMenuOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setTemplateMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [templateMenuOpen]);

  /** True when the email is ready; otherwise says what is missing and puts the cursor there. */
  const validate = () => {
    const issue = validateCopy(copy)[0];
    if (!issue) return true;
    toast.error(issue.message);
    editorRef.current?.focusField(issue.field);
    return false;
  };

  const openReview = () => {
    if (!validate()) return;
    if (sendMode === 'people' && !selected.length) {
      toast.error('Pick at least one person to send to');
      return;
    }
    setReviewOpen(true);
  };

  const onSent = async () => {
    setReviewOpen(false);
    await loadBroadcasts();
    setHistoryOpen(true);
  };

  const cancelRun = async (id) => {
    try {
      await cancelMedicareCustomBroadcast(id);
      toast.success('Cancel requested — stops within the next few sends');
      await loadBroadcasts();
    } catch (err) {
      toast.error(err.message || 'Cancel failed');
    }
  };

  const templateLabel = (key) => (key === 'blank' ? 'a blank email' : meta.templates.find((t) => t.key === key)?.label || key);

  return (
    <AdminPageShell
      title="Custom Medicare email"
      description="Click any text in the email and type. Pick who gets it on the right, test it, then send."
      icon={Mail}
      category={ADMIN_CATEGORIES[MODULE?.category] || ADMIN_CATEGORIES.communications}
      backTo="/app/admin/email-campaigns/medicare-retarget"
      backLabel="Back to Medicare Retarget"
      actions={(
        <div className={classes.actions}>
          {draftSaved ? (
            <span className={classes.saved}>
              <Check size={12} />
              Draft saved
            </span>
          ) : null}
          <div className={classes.startFrom} ref={templateMenuRef}>
            <button
              type="button"
              className={`${shared.modalCancelBtn} ${classes.startFromBtn}`}
              aria-haspopup="menu"
              aria-expanded={templateMenuOpen}
              onClick={() => setTemplateMenuOpen((open) => !open)}
            >
              Start from…
              <ChevronDown size={14} />
            </button>
            {templateMenuOpen ? (
              <div className={classes.startFromMenu} role="menu" aria-label="Start from a template">
                {meta.templates.map((t) => (
                  <button key={t.key} type="button" role="menuitem" className={classes.startFromItem} onClick={() => requestTemplate(t.key)}>
                    {t.label}
                  </button>
                ))}
                <button type="button" role="menuitem" className={classes.startFromItem} onClick={() => requestTemplate('blank')}>
                  Blank
                </button>
              </div>
            ) : null}
          </div>
          <button type="button" className={`${shared.modalCancelBtn} ${classes.iconTextBtn}`} onClick={() => setHistoryOpen(true)}>
            <History size={14} />
            History
            {running ? <span className={classes.liveDot} aria-label="Send in progress" /> : null}
          </button>
          <button type="button" className={`${shared.primaryBtn} ${classes.iconTextBtn}`} onClick={openReview}>
            <Send size={14} />
            Review &amp; send
          </button>
        </div>
      )}
    >
      <motion.div className={classes.stage} variants={presets.child}>
        <div className={classes.layout}>
          <div className={classes.editorCol}>
            <EmailEditor key={editorKey} ref={editorRef} copy={copy} setCopy={setCopy} limits={meta.limits} />
            <p className={classes.note}>
              <code>{'{firstName}'}</code> and <code>{'{name}'}</code> become each agent’s name when the email is sent.
              Anything you leave empty is left out.
            </p>
          </div>
          <aside className={classes.rail} aria-label="Send settings">
            <SendPanel
              copy={copy}
              audiences={meta.audiences}
              mode={sendMode}
              onModeChange={setSendMode}
              audience={audience}
              onAudienceChange={setAudience}
              selected={selected}
              onSelectedChange={setSelected}
              defaultTestTo={user?.email || ''}
              testName={user?.displayName || ''}
              running={running}
              validate={validate}
              onReview={openReview}
            />
          </aside>
        </div>
      </motion.div>

      <ReviewSendDialog
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        copy={copy}
        target={{
          mode: sendMode,
          audience,
          audienceLabel: meta.audiences.find((a) => a.key === audience)?.label || audience,
          includesPaid: sendMode === 'people' || meta.audiences.find((a) => a.key === audience)?.includesPaid === true,
          people: selected,
        }}
        running={running}
        onSent={onSent}
      />

      <HistoryDrawer
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        broadcasts={broadcasts}
        loading={broadcastsLoading}
        audiences={meta.audiences}
        onRefresh={loadBroadcasts}
        onCancel={cancelRun}
      />

      {pendingTemplate ? (
        <div className={shared.modalOverlay} role="dialog" aria-modal="true" onClick={() => setPendingTemplate(null)}>
          <div className={`glass ${shared.modalBox}`} onClick={(e) => e.stopPropagation()}>
            <div className={shared.modalHeader}>
              <h3>Replace your draft?</h3>
              <button type="button" className={shared.modalCloseBtn} onClick={() => setPendingTemplate(null)} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <p className={shared.modalSub}>Starting from {templateLabel(pendingTemplate)} replaces everything you have written.</p>
            <div className={shared.modalActions}>
              <button type="button" className={shared.modalCancelBtn} onClick={() => setPendingTemplate(null)}>Keep my draft</button>
              <button type="button" className={shared.primaryBtn} onClick={() => applyTemplate(pendingTemplate)}>Replace</button>
            </div>
          </div>
        </div>
      ) : null}
    </AdminPageShell>
  );
}
