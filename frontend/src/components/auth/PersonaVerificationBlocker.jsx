import React, { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import useAuthStore from '../../store/authStore';

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
    <div style={{
      marginTop: '2rem',
      padding: '4rem 2rem',
      textAlign: 'center',
      background: 'linear-gradient(145deg, rgba(37, 244, 37, 0.05) 0%, rgba(20, 20, 20, 0.8) 100%)',
      backdropFilter: 'blur(12px)',
      border: '1px solid rgba(37, 244, 37, 0.15)',
      borderRadius: '24px',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Decorative background glow */}
      <div style={{
        position: 'absolute',
        top: '-50%',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '300px',
        height: '300px',
        background: 'radial-gradient(circle, rgba(37,244,37,0.1) 0%, transparent 70%)',
        pointerEvents: 'none'
      }} />

      <div style={{ 
        width: '80px', 
        height: '80px', 
        borderRadius: '50%', 
        background: 'rgba(37, 244, 37, 0.1)', 
        border: '1px solid rgba(37, 244, 37, 0.2)',
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        margin: '0 auto 1.5rem',
        boxShadow: '0 0 20px rgba(37, 244, 37, 0.1)'
      }}>
        <ShieldCheck size={40} color="var(--sp-brand)" />
      </div>
      
      <div style={{ textAlign: 'center', width: '100%', position: 'relative', zIndex: 1 }}>
        <h2 style={{ fontSize: '2rem', marginBottom: '1rem', color: 'var(--sp-text)', fontWeight: '600', letterSpacing: '-0.02em' }}>
          Verify Your Identity
        </h2>
        <p style={{ marginBottom: '2.5rem', color: 'var(--sp-sub)', fontSize: '1.15rem', maxWidth: '500px', margin: '0 auto 2.5rem', lineHeight: '1.6' }}>
          To ensure a secure environment and comply with regulations, please complete a quick identity check before taking inbound calls.
        </p>
        
        <button 
          type="button" 
          onClick={handleVerify} 
          disabled={isLaunching}
          style={{ 
            margin: '0 auto', 
            fontSize: '1.1rem', 
            padding: '14px 32px', 
            background: 'var(--sp-brand)',
            color: '#000',
            fontWeight: '600',
            border: 'none',
            borderRadius: '12px',
            cursor: isLaunching ? 'not-allowed' : 'pointer',
            opacity: isLaunching ? 0.8 : 1,
            transition: 'all 0.2s ease',
            boxShadow: '0 4px 14px rgba(37, 244, 37, 0.3)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}
          onMouseOver={(e) => !isLaunching && (e.currentTarget.style.transform = 'translateY(-2px)')}
          onMouseOut={(e) => !isLaunching && (e.currentTarget.style.transform = 'translateY(0)')}
        >
          {isLaunching ? (
            <>
              <div style={{ width: '18px', height: '18px', borderTopColor: '#000', border: '2px solid rgba(0,0,0,0.1)', borderTop: '2px solid #000', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
              Starting Verification...
            </>
          ) : (
            'Verify Identity to Start'
          )}
        </button>
      </div>
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}} />
    </div>
  );
};

export default PersonaVerificationBlocker;
