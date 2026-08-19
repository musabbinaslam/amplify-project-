import React, { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import useAuthStore from '../../store/authStore';
import classes from './PersonaVerificationBlocker.module.css';

const PersonaVerificationBlocker = ({ onComplete }) => {
  const [isLaunching, setIsLaunching] = useState(false);

  const handleVerify = () => {
    if (isLaunching) return;
    setIsLaunching(true);

    const templateId = import.meta.env.VITE_PERSONA_TEMPLATE_ID;
    const environmentId = import.meta.env.VITE_PERSONA_ENVIRONMENT_ID;
    
    if (!window.Persona) {
      toast.error('Identity verification service is currently unavailable.');
      setIsLaunching(false);
      return;
    }

    try {
      const client = new window.Persona.Client({
        templateId,
        environmentId,
        referenceId: useAuthStore.getState().user?.uid,
        onReady: () => {
          client.open();
          setIsLaunching(false);
        },
        onComplete: async ({ inquiryId, status }) => {
          console.log('[Persona] completed', status);
          toast.success('Identity verification completed successfully!');
          const { user, setUserField } = useAuthStore.getState();
          if (user) {
            setUserField('personaStatus', 'verified');
            if (import.meta.env.DEV) {
              try {
                const { saveProfile } = await import('../../services/profileService');
                await saveProfile(user.uid, { personaStatus: 'verified' });
              } catch (e) {
                console.warn('Local dev persona save failed', e);
              }
            }
          }
          if (onComplete) onComplete();
        },
        onCancel: () => {
          toast('Verification cancelled');
          setIsLaunching(false);
        },
        onError: (error) => {
          console.error('[Persona] Error:', error);
          toast.error('Failed to start verification.');
          setIsLaunching(false);
        }
      });
    } catch (err) {
      console.error('[Persona] Client init error:', err);
      setIsLaunching(false);
    }
  };

  return (
    <section className={classes.blocker}>
      <div className={classes.bgGlow} />

      <div className={classes.content}>
        <div className={classes.iconWrap}>
          <ShieldCheck size={40} className={classes.icon} />
        </div>

        <h2 className={classes.title}>
          Verify Your Identity
        </h2>
        <p className={classes.description}>
          To ensure a secure environment and comply with regulations, please complete a quick identity check before taking inbound calls.
        </p>

        <button
          type="button"
          onClick={handleVerify}
          disabled={isLaunching}
          className={classes.ctaButton}
        >
          {isLaunching ? (
            <>
              <span className={classes.spinner} />
              Starting Verification...
            </>
          ) : (
            'Verify Identity to Start'
          )}
        </button>
      </div>
    </section>
  );
};

export default PersonaVerificationBlocker;
