/* eslint-disable react/prop-types */
import { useEffect, useState } from 'react';
import {
  Calendar,
  Check,
  Coins,
  Copy,
  History,
  Lock,
  MessageSquare,
  PanelRightClose,
  PhoneCall,
  PhoneIncoming,
  PhoneOutgoing,
  Plus,
  RefreshCw,
  Send,
  Shield,
  Trash2,
  User,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  getSupportCustomerSummary,
  addSupportDeskInternalNote,
  deleteSupportDeskInternalNote,
  issueSupportCourtesyCredit,
} from '../../services/supportLiveService';
import { RecordingModal } from '../../pages/CallLogsPage';
import classes from './CustomerIntelligencePanel.module.css';

function formatDurationSec(secs = 0) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

function formatDate(iso) {
  if (!iso) return 'Recent';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return 'Recent';
  }
}

function CustomerIntelligenceSkeleton() {
  return (
    <div className={classes.skeletonWrap} aria-busy="true" aria-label="Loading customer intelligence">
      {/* Identity Card Skeleton */}
      <div className={classes.skelCard}>
        <div className={classes.skelAvatarRow}>
          <div className={`${classes.skelPulse} ${classes.skelAvatarCircle}`} />
          <div className={classes.skelUserMeta}>
            <div className={`${classes.skelPulse} ${classes.skelLineTitle}`} />
            <div className={`${classes.skelPulse} ${classes.skelLineSub}`} />
          </div>
        </div>
        <div className={classes.skelChipRow}>
          <div className={`${classes.skelPulse} ${classes.skelChip}`} />
          <div className={`${classes.skelPulse} ${classes.skelChip}`} />
        </div>
      </div>

      {/* Wallet Skeleton */}
      <div className={classes.skelSection}>
        <div className={`${classes.skelPulse} ${classes.skelSectionLabel}`} />
        <div className={classes.skelWalletCard}>
          <div className={`${classes.skelPulse} ${classes.skelLineMini}`} />
          <div className={`${classes.skelPulse} ${classes.skelBalance}`} />
        </div>
      </div>

      {/* Recent Calls Skeleton */}
      <div className={classes.skelSection}>
        <div className={`${classes.skelPulse} ${classes.skelSectionLabel}`} />
        <div className={classes.skelCallsList}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className={classes.skelCallRow}>
              <div className={`${classes.skelPulse} ${classes.skelCallIcon}`} />
              <div className={classes.skelCallBody}>
                <div className={`${classes.skelPulse} ${classes.skelCallPhone}`} />
                <div className={`${classes.skelPulse} ${classes.skelCallDate}`} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Notes Skeleton */}
      <div className={classes.skelSection}>
        <div className={`${classes.skelPulse} ${classes.skelSectionLabel}`} />
        <div className={classes.skelNotesBox}>
          <div className={`${classes.skelPulse} ${classes.skelNotesTextarea}`} />
        </div>
      </div>
    </div>
  );
}

export default function CustomerIntelligencePanel({
  conversation,
  isOpen = true,
  onClose,
}) {
  const conversationId = conversation?.id;
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState(null);
  const [noteInput, setNoteInput] = useState('');
  const [submittingNote, setSubmittingNote] = useState(false);
  const [creditModalOpen, setCreditModalOpen] = useState(false);
  const [creditAmount, setCreditAmount] = useState('5.00');
  const [creditReason, setCreditReason] = useState('Support courtesy credit');
  const [issuingCredit, setIssuingCredit] = useState(false);
  const [copiedKey, setCopiedKey] = useState('');
  const [selectedCall, setSelectedCall] = useState(null);

  const loadSummary = async (id) => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await getSupportCustomerSummary(id);
      setSummary(data);
    } catch {
      // Fall back gracefully to conversation metadata
      setSummary({
        user: {
          id: conversation?.userId || id,
          name: conversation?.userName || 'Customer',
          email: conversation?.userEmail || '',
          role: 'user',
          createdAt: conversation?.createdAt || null,
        },
        wallet: {
          balanceCents: 0,
          balanceFormatted: '$0.00',
        },
        recentCalls: [],
        internalNotes: conversation?.notes || [],
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (conversationId && isOpen) {
      setSummary(null); // Show skeleton on switch so it smoothly loads stats
      loadSummary(conversationId);
    }
  }, [conversationId, isOpen]);

  const handleCopy = (text, key) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success(`Copied ${key}`);
    setTimeout(() => setCopiedKey(''), 1800);
  };

  const handleAddNote = async (e) => {
    e?.preventDefault();
    const text = noteInput.trim();
    if (!text || !conversationId || submittingNote) return;
    setSubmittingNote(true);
    try {
      const res = await addSupportDeskInternalNote(conversationId, text);
      setNoteInput('');
      setSummary((prev) => ({
        ...prev,
        internalNotes: res.notes || [res.note, ...(prev?.internalNotes || [])],
      }));
      toast.success('Internal note added');
    } catch (err) {
      toast.error(err?.message || 'Could not add note');
    } finally {
      setSubmittingNote(false);
    }
  };

  const handleDeleteNote = async (noteId) => {
    if (!conversationId || !noteId) return;
    try {
      const res = await deleteSupportDeskInternalNote(conversationId, noteId);
      setSummary((prev) => ({
        ...prev,
        internalNotes: res.notes || (prev?.internalNotes || []).filter((n) => n.id !== noteId),
      }));
      toast.success('Note removed');
    } catch (err) {
      toast.error(err?.message || 'Could not delete note');
    }
  };

  const handleIssueCredit = async (e) => {
    e?.preventDefault();
    const dollars = parseFloat(creditAmount);
    if (Number.isNaN(dollars) || dollars <= 0 || dollars > 100) {
      toast.error('Enter an amount between $0.50 and $100');
      return;
    }
    const cents = Math.round(dollars * 100);
    setIssuingCredit(true);
    try {
      const res = await issueSupportCourtesyCredit(conversationId, {
        amountCents: cents,
        reason: creditReason.trim() || 'Support adjustment',
      });
      setSummary((prev) => ({
        ...prev,
        wallet: {
          balanceCents: res.newBalanceCents,
          balanceFormatted: res.newBalanceFormatted,
        },
      }));
      setCreditModalOpen(false);
      toast.success(`Issued ${res.newBalanceFormatted ? `$${dollars.toFixed(2)}` : 'credit'}!`);
    } catch (err) {
      toast.error(err?.message || 'Failed to issue credit');
    } finally {
      setIssuingCredit(false);
    }
  };

  if (!isOpen) return null;

  const user = summary?.user || {
    name: conversation?.userName || 'Customer',
    email: conversation?.userEmail || '',
    id: conversation?.userId || conversationId,
    role: 'user',
  };
  const wallet = summary?.wallet || { balanceCents: 0, balanceFormatted: '$0.00' };
  const recentCalls = summary?.recentCalls || [];
  const notes = summary?.internalNotes || [];

  return (
    <aside className={classes.panel}>
      {/* Panel Header */}
      <div className={classes.head}>
        <div className={classes.headTitle}>
          <Shield size={16} className={classes.headIcon} />
          <span>Customer Intelligence</span>
        </div>
        <div className={classes.headActions}>
          <button
            type="button"
            className={classes.iconBtn}
            onClick={() => loadSummary(conversationId)}
            title="Refresh customer data"
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? classes.spin : ''} />
          </button>
          {onClose ? (
            <button
              type="button"
              className={classes.iconBtn}
              onClick={onClose}
              title="Close panel"
            >
              <PanelRightClose size={15} />
            </button>
          ) : null}
        </div>
      </div>

      <div className={classes.body}>
        {loading && !summary ? (
          <CustomerIntelligenceSkeleton />
        ) : (
          <div className={classes.contentReveal}>
            {/* User Identity Card */}
            <div className={classes.userCard}>
              <div className={classes.userAvatarRow}>
                <div className={classes.userAvatar}>
                  {user.avatarUrl ? (
                    <img src={user.avatarUrl} alt={user.name} className={classes.avatarImg} />
                  ) : (
                    <span>{String(user.name || user.email || 'U').charAt(0).toUpperCase()}</span>
                  )}
                </div>
                <div className={classes.userInfo}>
                  <div className={classes.userNameRow}>
                    <h3 className={classes.userName}>{user.name || 'Unnamed User'}</h3>
                    {user.role === 'admin' ? (
                      <span className={classes.roleTag}>Admin</span>
                    ) : null}
                  </div>
                  <div className={classes.userEmailRow}>
                    <span className={classes.userEmail} title={user.email}>
                      {user.email || 'No email provided'}
                    </span>
                    {user.email ? (
                      <button
                        type="button"
                        className={classes.miniCopyBtn}
                        onClick={() => handleCopy(user.email, 'email')}
                        title="Copy email"
                      >
                        {copiedKey === 'email' ? <Check size={11} /> : <Copy size={11} />}
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className={classes.userSubMeta}>
                <span className={classes.metaChip}>
                  <User size={11} />
                  <span>ID: {String(user.id || '').slice(0, 8)}…</span>
                  <button
                    type="button"
                    className={classes.miniCopyBtn}
                    onClick={() => handleCopy(user.id, 'user ID')}
                    title="Copy user ID"
                  >
                    {copiedKey === 'user ID' ? <Check size={10} /> : <Copy size={10} />}
                  </button>
                </span>
                {user.createdAt ? (
                  <span className={classes.metaChip}>
                    <Calendar size={11} />
                    <span>Joined {formatDate(user.createdAt)}</span>
                  </span>
                ) : null}
              </div>
            </div>

            {/* Live Wallet Balance */}
            <div className={classes.section}>
              <div className={classes.sectionHead}>
                <span className={classes.sectionLabel}>
                  <Coins size={14} className={classes.accentGold} />
                  <span>Wallet & Balance</span>
                </span>
                <button
                  type="button"
                  className={classes.actionLinkBtn}
                  onClick={() => setCreditModalOpen(true)}
                >
                  <Plus size={12} />
                  <span>Issue Credit</span>
                </button>
              </div>

              <div className={classes.walletCard}>
                <div className={classes.walletBalanceRow}>
                  <div>
                    <span className={classes.walletCaption}>Current Balance</span>
                    <div key={wallet.balanceFormatted} className={classes.walletAmount}>
                      {wallet.balanceFormatted}
                    </div>
                  </div>
                  <button
                    type="button"
                    className={classes.creditPillBtn}
                    onClick={() => setCreditModalOpen(true)}
                  >
                    <Plus size={13} />
                    <span>Adjust</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Recent Calls */}
            <div className={classes.section}>
              <div className={classes.sectionHead}>
                <span className={classes.sectionLabel}>
                  <History size={14} />
                  <span>Recent Calls</span>
                  {recentCalls.length > 0 ? (
                    <span className={classes.callsCountBadge}>{recentCalls.length}</span>
                  ) : null}
                </span>
              </div>

              {recentCalls.length === 0 ? (
                <div className={classes.emptyBox}>
                  <PhoneCall size={18} className={classes.emptyIcon} />
                  <p>No recent calls recorded</p>
                </div>
              ) : (
                <div className={classes.callsList}>
                  {recentCalls.slice(0, 5).map((call) => (
                    <button
                      key={call.id}
                      type="button"
                      className={`${classes.callRow} ${classes.callRowInteractive}`}
                      onClick={() => setSelectedCall(call)}
                      title="Click to view call details & recording"
                    >
                      <div className={classes.callIconWrap}>
                        {call.direction === 'inbound' ? (
                          <PhoneIncoming size={13} className={classes.callInbound} />
                        ) : (
                          <PhoneOutgoing size={13} className={classes.callOutbound} />
                        )}
                      </div>
                      <div className={classes.callMeta}>
                        <div className={classes.callTop}>
                          <span className={classes.callParty}>{call.caller || 'Call'}</span>
                          <span className={classes.callDur}>{formatDurationSec(call.durationSeconds)}</span>
                        </div>
                        <div className={classes.callBottom}>
                          <span className={classes.callDate}>{formatDate(call.createdAt)}</span>
                          <span className={`${classes.callStatus} ${call.status === 'completed' ? classes.statusSuccess : ''}`}>
                            {call.status}
                          </span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Internal Team Notes */}
            <div className={classes.section}>
              <div className={classes.sectionHead}>
                <span className={`${classes.sectionLabel} ${classes.labelAmber}`}>
                  <Lock size={13} />
                  <span>Internal Team Notes</span>
                  {notes.length > 0 ? (
                    <span className={classes.notesCountBadge}>{notes.length}</span>
                  ) : null}
                </span>
                <span className={classes.privatePill}>Staff Only</span>
              </div>

              <form onSubmit={handleAddNote} className={classes.noteForm}>
                <textarea
                  className={classes.noteInput}
                  rows={2}
                  placeholder="Leave a private note for staff..."
                  value={noteInput}
                  onChange={(e) => setNoteInput(e.target.value)}
                  disabled={submittingNote}
                />
                <div className={classes.noteFormBottom}>
                  <span className={classes.noteHint}>Never visible to the customer</span>
                  <button
                    type="submit"
                    className={classes.noteSubmitBtn}
                    disabled={submittingNote || !noteInput.trim()}
                  >
                    <Send size={12} />
                    <span>Save</span>
                  </button>
                </div>
              </form>

              <div className={classes.notesList}>
                {notes.length === 0 ? (
                  <div className={classes.emptyNotesBox}>
                    <MessageSquare size={16} />
                    <span>No private notes yet.</span>
                  </div>
                ) : (
                  notes.map((n) => (
                    <div key={n.id} className={classes.noteCard}>
                      <div className={classes.noteHead}>
                        <span className={classes.noteAuthor}>
                          <strong>{n.authorName || 'Staff'}</strong>
                          {n.authorRole ? ` (${n.authorRole})` : ''}
                        </span>
                        <span className={classes.noteDate}>{formatDate(n.createdAt)}</span>
                        <button
                          type="button"
                          className={classes.noteDeleteBtn}
                          onClick={() => handleDeleteNote(n.id)}
                          title="Delete note"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                      <p className={classes.noteText}>{n.text}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Credit Adjustment Modal */}
      {creditModalOpen ? (
        <div className={classes.modalOverlay} role="presentation" onClick={() => setCreditModalOpen(false)}>
          <div
            className={classes.modalContent}
            role="dialog"
            aria-label="Issue courtesy credit"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={classes.modalHeader}>
              <div className={classes.modalTitleRow}>
                <Coins size={16} className={classes.accentGold} />
                <h4>Issue Courtesy Credit</h4>
              </div>
              <button
                type="button"
                className={classes.modalClose}
                onClick={() => setCreditModalOpen(false)}
              >
                <X size={15} />
              </button>
            </div>

            <form onSubmit={handleIssueCredit} className={classes.modalBody}>
              <p className={classes.modalDesc}>
                Add credit directly to <strong>{user.name}</strong>’s live wallet balance.
              </p>

              <div className={classes.presetChips}>
                {['2.00', '5.00', '10.00', '20.00'].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className={`${classes.presetChip} ${creditAmount === preset ? classes.presetChipActive : ''}`}
                    onClick={() => setCreditAmount(preset)}
                  >
                    +${preset}
                  </button>
                ))}
              </div>

              <label className={classes.inputField}>
                <span className={classes.fieldLabel}>Amount ($ USD)</span>
                <input
                  type="number"
                  step="0.50"
                  min="0.50"
                  max="100.00"
                  className={classes.amountInput}
                  value={creditAmount}
                  onChange={(e) => setCreditAmount(e.target.value)}
                  placeholder="5.00"
                  required
                />
              </label>

              <label className={classes.inputField}>
                <span className={classes.fieldLabel}>Reason</span>
                <input
                  type="text"
                  className={classes.reasonInput}
                  value={creditReason}
                  onChange={(e) => setCreditReason(e.target.value)}
                  placeholder="Support adjustment / Call issue"
                />
              </label>

              <div className={classes.modalActions}>
                <button
                  type="button"
                  className={classes.cancelBtn}
                  onClick={() => setCreditModalOpen(false)}
                  disabled={issuingCredit}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={classes.confirmCreditBtn}
                  disabled={issuingCredit || !creditAmount}
                >
                  {issuingCredit ? 'Adding…' : `Issue +$${parseFloat(creditAmount || '0').toFixed(2)}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Call Recording & Details Modal */}
      {selectedCall ? (
        <RecordingModal
          log={selectedCall}
          onClose={() => setSelectedCall(null)}
        />
      ) : null}
    </aside>
  );
}
