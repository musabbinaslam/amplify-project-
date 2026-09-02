import React, { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import useAuthStore from '../../store/authStore';
import { confirmPersonaInquiry } from '../../services/personaService';
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
          console.log('[Persona] completed', status, inquiryId);
          try {
            if (inquiryId) {
              await confirmPersonaInquiry(inquiryId);
            }
            await useAuthStore.getState().refreshUserRole();
            const verified = useAuthStore.getState().user?.personaStatus === 'verified';
            if (!verified) {
              throw new Error('Verification has not been saved yet');
            }
            toast.success('Identity verification completed successfully!');
            if (onComplete) onComplete();
          } catch (err) {
            console.error('[Persona] confirm failed:', err);
            toast.error(
              err?.message?.includes('API key')
                ? 'Verification finished in Persona, but the server could not save it. Add PERSONA_API_KEY and the Persona webhook.'
                : 'Verification finished, but your account is not marked verified yet. Refresh in a few seconds.',
            );
            setIsLaunching(false);
          }
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
