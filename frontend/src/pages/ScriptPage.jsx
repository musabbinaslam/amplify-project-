import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  FileText, Phone, User, Heart, DollarSign, CheckCircle2,
  Circle, AlertTriangle, Loader2, Save,
} from 'lucide-react';
import toast from 'react-hot-toast';
import useAuthStore from '../store/authStore';
import { SCRIPTS, SCRIPT_OPTIONS } from '../data/scriptData';
import { loadScriptData, saveScriptData } from '../services/scriptService';
import CustomSelect from '../components/ui/CustomSelect';
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
  const user = useAuthStore((s) => s.user);
  const [selectedScript, setSelectedScript] = useState('final-expense-en');
  const [values, setValues] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const saveTimeoutRef = useRef(null);

  const script = SCRIPTS[selectedScript];

  useEffect(() => {
    if (!user?.uid) return;
    setLoading(true);
    loadScriptData(user.uid, selectedScript)
      .then((data) => setValues(data))
      .catch(() => toast.error('Failed to load script data'))
      .finally(() => setLoading(false));
  }, [user?.uid, selectedScript]);

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
      await saveScriptData(user.uid, selectedScript, values);
      toast.success('Script saved');
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleScriptChange = (newValue) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      if (user?.uid) saveScriptData(user.uid, selectedScript, values).catch(() => {});
    }
    setSelectedScript(newValue);
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
    return (
      <div className={classes.page}>
        <div className={classes.loaderWrap}>
          <Loader2 size={32} className={classes.spinner} />
        </div>
      </div>
    );
  }

  return (
    <div className={classes.page}>
      <div className={classes.topBar}>
        <div className={classes.selectorWrap}>
          <span className={classes.selectorLabel}>Script:</span>
          <CustomSelect
            options={SCRIPT_OPTIONS}
            value={selectedScript}
            onChange={handleScriptChange}
          />
        </div>
        <button type="button" className={classes.saveBtn} onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 size={16} className={classes.spinner} /> : <Save size={16} />}
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      <div className={classes.scriptTitle}>
        <h1>{script.title.toUpperCase()} CALL SCRIPT</h1>
        <p>{script.subtitle}</p>
      </div>

      {script.sections.map(renderSection)}
    </div>
  );
};

export default ScriptPage;
