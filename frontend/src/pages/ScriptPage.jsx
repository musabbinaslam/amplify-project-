import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  FileText, Phone, User, Heart, DollarSign, CheckCircle2,
  Circle, AlertTriangle, Loader2, Save, Plus, Trash2
} from 'lucide-react';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import useAuthStore from '../store/authStore';
import { useSubtlePageMotion } from '../hooks/useSubtlePageMotion';
import { SCRIPTS, SCRIPT_OPTIONS } from '../data/scriptData';
import { loadScriptData, saveScriptData } from '../services/scriptService';
import { apiFetch } from '../services/apiClient';
import CustomSelect from '../components/ui/CustomSelect';
import PageLoader from '../components/ui/PageLoader';
import AddCustomScriptModal from '../components/modals/AddCustomScriptModal';
import classes from './ScriptPage.module.css';

const ICON_MAP = {
  phone: Phone,
  user: User,
  heart: Heart,
  dollar: DollarSign,
  file: FileText,
  circle: Circle,
  checkCircle: CheckCircle2,
};

const ScriptPage = () => {
  const presets = useSubtlePageMotion();
  const user = useAuthStore((s) => s.user);
  const [selectedScript, setSelectedScript] = useState('final-expense-en');
  const [values, setValues] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [customScripts, setCustomScripts] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const saveTimeoutRef = useRef(null);

  const script = SCRIPTS[selectedScript];

  useEffect(() => {
    if (!user?.uid) return;
    setLoading(true);
    
    // Load custom scripts list
    const fetchCustomScripts = async () => {
      try {
        const data = await apiFetch('/api/users/me/custom-scripts');
        if (data && data.scripts) {
          setCustomScripts(data.scripts);
        }
      } catch (err) {
        console.error('Failed to load custom scripts:', err);
      }
    };

    const loadData = async () => {
      if (selectedScript.startsWith('custom_')) {
        // Find it in custom scripts
        const csId = selectedScript.replace('custom_', '');
        // For custom scripts, we don't need loadScriptData because the text is in the customScripts array.
        // We'll rely on fetchCustomScripts to populate it if needed, but it's handled below.
      } else {
        try {
          const data = await loadScriptData(user.uid, selectedScript);
          setValues(data || {});
        } catch (err) {
          console.error(err);
        }
      }
    };

    Promise.all([
      fetchCustomScripts(),
      loadData()
    ]).finally(() => setLoading(false));
  }, [user?.uid, selectedScript]);

  // When custom scripts load or selectedScript changes to a custom one, ensure values.text is synced
  useEffect(() => {
    if (selectedScript.startsWith('custom_') && customScripts.length > 0) {
      const cs = customScripts.find(s => `custom_${s.id}` === selectedScript);
      if (cs) {
        setValues(prev => ({ ...prev, text: cs.text || '' }));
      }
    }
  }, [selectedScript, customScripts]);

  const handleChange = useCallback((fieldId, value) => {
    setValues((prev) => {
      const next = { ...prev, [fieldId]: value };
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        if (user?.uid) {
          saveScriptData(user.uid, selectedScript, next).catch(() => {});
        }
      }, 2000);
      return next;
    });
  }, [user?.uid, selectedScript]);

  const handleCheckboxToggle = useCallback((groupId, option) => {
    setValues((prev) => {
      const current = prev[groupId] || [];
      const next = current.includes(option)
        ? current.filter((o) => o !== option)
        : [...current, option];
      const updated = { ...prev, [groupId]: next };
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        if (user?.uid) {
          saveScriptData(user.uid, selectedScript, updated).catch(() => {});
        }
      }, 2000);
      return updated;
    });
  }, [user?.uid, selectedScript]);

  const handleSave = async () => {
    if (!user?.uid) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    setSaving(true);
    try {
      if (selectedScript.startsWith('custom_')) {
        // Find current text in values or customScripts state
        const cs = customScripts.find(s => `custom_${s.id}` === selectedScript);
        if (cs) {
          await apiFetch(`/api/users/me/custom-scripts/${cs.id}`, {
            method: 'PUT',
            body: { text: values.text || cs.text }
          });
          toast.success('Custom script saved');
        }
      } else {
        await saveScriptData(user.uid, selectedScript, values);
        toast.success('Script saved');
      }
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteScript = async () => {
    if (!user?.uid || !selectedScript.startsWith('custom_')) return;
    
    const csId = selectedScript.replace('custom_', '');
    if (!window.confirm('Are you sure you want to delete this custom script?')) return;
    
    try {
      await apiFetch(`/api/users/me/custom-scripts/${csId}`, { method: 'DELETE' });
      setCustomScripts(prev => prev.filter(s => s.id !== csId));
      setSelectedScript('final-expense-en');
      toast.success('Script deleted');
    } catch {
      toast.error('Failed to delete script');
    }
  };

  const handleScriptChange = (newValue) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      if (user?.uid && !selectedScript.startsWith('custom_')) {
        saveScriptData(user.uid, selectedScript, values).catch(() => {});
      }
    }
    setSelectedScript(newValue);
    if (newValue.startsWith('custom_')) {
      const cs = customScripts.find(s => `custom_${s.id}` === newValue);
      setValues({ text: cs?.text || '' });
    }
  };

  const handleCustomScriptAdded = (newScript) => {
    setCustomScripts(prev => [newScript, ...prev]);
    setSelectedScript(`custom_${newScript.id}`);
    setValues({ text: newScript.text || '' });
  };

  const renderField = (field) => {
    if (field.type === 'checkbox') {
      return (
        <label key={field.id} className={classes.checkboxLabel}>
          <input
            type="checkbox"
            checked={!!values[field.id]}
            onChange={(e) => handleChange(field.id, e.target.checked)}
            className={classes.checkbox}
          />
          <span>{field.label}</span>
        </label>
      );
    }
    return (
      <div key={field.id} className={`${classes.fieldWrap} ${field.fullWidth ? classes.fullWidth : ''}`}>
        <label className={classes.fieldLabel}>{field.label}</label>
        <input
          type="text"
          value={values[field.id] || ''}
          onChange={(e) => handleChange(field.id, e.target.value)}
          placeholder={field.placeholder || ''}
          className={classes.fieldInput}
        />
      </div>
    );
  };

  const renderFieldGrid = (fields, layout) => {
    const cls = layout === 'grid-3' ? classes.grid3
      : layout === 'grid-2' ? classes.grid2
      : layout === 'grid-3-2' ? classes.grid3_2
      : layout === 'inline-3' ? classes.inline3
      : '';
    return <div className={`${classes.fieldGrid} ${cls}`}>{fields.map(renderField)}</div>;
  };

  const renderPrompt = (p, idx) => {
    if (p.field) {
      return (
        <p key={idx} className={classes.promptText}>
          {p.text && <span>{p.text} </span>}
          {p.label && <span className={classes.inlineLabel}>{p.label}: </span>}
          <input
            type="text"
            value={values[p.field] || ''}
            onChange={(e) => handleChange(p.field, e.target.value)}
            placeholder={p.placeholder || ''}
            className={classes.inlineInput}
          />
          {p.after && <span> {p.after}</span>}
        </p>
      );
    }
    return (
      <p key={idx} className={`${classes.promptText} ${p.italic ? classes.italic : ''}`}>
        <span dangerouslySetInnerHTML={{ __html: p.text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') }} />
        {p.badge && (
          <span className={`${classes.badge} ${p.badgeColor === 'orange' ? classes.badgeOrange : classes.badgeGreen}`}>
            {p.badge}
          </span>
        )}
      </p>
    );
  };

  const renderSection = (section) => {
    const Icon = ICON_MAP[section.icon] || FileText;

    return (
      <div key={section.id} className={`${classes.sectionCard} ${classes[`border_${section.color}`]}`}>
        <div className={`${classes.sectionHeader} ${classes[`header_${section.color}`]}`}>
          <Icon size={18} />
          <h3>{section.title}</h3>
        </div>

        <div className={classes.sectionBody}>
          {section.prompts?.map(renderPrompt)}

          {section.fields && renderFieldGrid(section.fields, section.fieldLayout)}

          {section.additionalPrompts?.map(renderPrompt)}
          {section.additionalFields && renderFieldGrid(section.additionalFields, section.additionalFieldLayout)}

          {section.tip && <p className={classes.tip}>{section.tip}</p>}

          {section.conditionGroup && (
            <div className={classes.conditionGroup}>
              <p className={classes.conditionLabel}>{section.conditionGroup.label}</p>
              <div className={classes.conditionOptions}>
                {section.conditionGroup.options.map((opt) => (
                  <label key={opt} className={classes.conditionOption}>
                    <input
                      type="checkbox"
                      checked={(values[section.conditionGroup.id] || []).includes(opt)}
                      onChange={() => handleCheckboxToggle(section.conditionGroup.id, opt)}
                      className={classes.checkbox}
                    />
                    <span>{opt}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {section.trailingFields && renderFieldGrid(section.trailingFields, section.trailingFieldLayout)}

          {section.quoteTiers && (
            <div className={classes.quoteTiers}>
              {section.quoteTiers.map((tier) => (
                <div key={tier.id} className={classes.tierCard}>
                  <span className={classes.tierEmoji}>{tier.emoji}</span>
                  <span className={classes.tierLabel}>{tier.label}</span>
                  <input
                    type="text"
                    value={values[tier.id] || ''}
                    onChange={(e) => handleChange(tier.id, e.target.value)}
                    placeholder={tier.placeholder}
                    className={classes.tierInput}
                  />
                </div>
              ))}
            </div>
          )}

          {section.trailingPrompts?.map(renderPrompt)}

          {section.warning && (
            <div className={classes.warning}>
              <AlertTriangle size={16} />
              <span>{section.warning}</span>
            </div>
          )}

          {section.checklist && (
            <ul className={classes.checklist}>
              {section.checklist.map((item) => (
                <li key={item}><CheckCircle2 size={16} /><span>{item}</span></li>
              ))}
            </ul>
          )}

          {section.trailingChecklist && (
            <ul className={classes.checklist}>
              {section.trailingChecklist.map((item) => (
                <li key={item}><CheckCircle2 size={16} /><span>{item}</span></li>
              ))}
            </ul>
          )}

          {section.morePrompts?.map(renderPrompt)}
          {section.moreFields && renderFieldGrid(section.moreFields, null)}

          {section.finalPrompts?.map(renderPrompt)}
          {section.finalFields && renderFieldGrid(section.finalFields, null)}

          {section.bankPrompts?.map(renderPrompt)}
          {section.bankFields && renderFieldGrid(section.bankFields, section.bankFieldLayout)}

          {section.closingPrompts?.map(renderPrompt)}
        </div>
      </div>
    );
  };

  if (loading) {
    return <PageLoader />;
  }

  const allScriptOptions = [
    ...SCRIPT_OPTIONS,
    ...(customScripts.length > 0 ? [{ label: '--- My Custom Scripts ---', value: 'header', disabled: true }] : []),
    ...customScripts.map(cs => ({ label: cs.title, value: `custom_${cs.id}` }))
  ];

  const isCustom = selectedScript.startsWith('custom_');
  const customScriptObj = isCustom ? customScripts.find(s => `custom_${s.id}` === selectedScript) : null;

  return (
    <>
    <motion.div
      className={classes.page}
      variants={presets.root}
      initial="hidden"
      animate="visible"
    >
      <motion.div className={classes.topBar} variants={presets.child}>
        <div className={classes.selectorWrap}>
          <span className={classes.selectorLabel}>Script:</span>
          <CustomSelect
            options={allScriptOptions}
            value={selectedScript}
            onChange={handleScriptChange}
          />
          <button className={classes.addBtn} onClick={() => setIsModalOpen(true)} title="Add Script">
            <Plus size={18} />
          </button>
        </div>
        <button type="button" className={classes.saveBtn} onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 size={16} className={classes.spinner} /> : <Save size={16} />}
          {saving ? 'Saving...' : 'Save'}
        </button>
      </motion.div>

      {isCustom ? (
        <motion.div className={classes.customScriptContainer} variants={presets.child}>
          <div className={classes.scriptHeaderRow}>
            <div className={classes.scriptTitleLeft}>
              <h1>{customScriptObj?.title?.toUpperCase()}</h1>
              <p>Custom Uploaded Script</p>
            </div>
            <button className={classes.deleteBtn} onClick={handleDeleteScript} title="Delete Script">
              <Trash2 size={16} /> Delete
            </button>
          </div>
          <textarea
            className={classes.customTextarea}
            value={values.text || ''}
            onChange={(e) => {
              setValues({ text: e.target.value });
              if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
              saveTimeoutRef.current = setTimeout(handleSave, 2000);
            }}
          />
        </motion.div>
      ) : (
        <motion.div variants={presets.child}>
          <div className={classes.scriptTitle}>
            <h1>{script?.title?.toUpperCase()} CALL SCRIPT</h1>
            <p>{script?.subtitle}</p>
          </div>
          {script?.sections?.map(renderSection)}
        </motion.div>
      )}
    </motion.div>

      <AddCustomScriptModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onScriptAdded={handleCustomScriptAdded}
      />
    </>
  );
};

export default ScriptPage;
