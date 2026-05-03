import { motion } from 'framer-motion';
import { useSubtlePageMotion } from '../hooks/useSubtlePageMotion';

export default function LeadsPage() {
  const presets = useSubtlePageMotion();
  return (
    <motion.div
      style={{ padding: '1.5rem', color: 'var(--text-primary, #fff)' }}
      variants={presets.root}
      initial="hidden"
      animate="visible"
    >
      <motion.div variants={presets.child}>
        <h2 style={{ margin: 0 }}>Leads (Beta)</h2>
        <p style={{ opacity: 0.8, marginTop: '0.5rem', marginBottom: 0 }}>
          This area is coming soon.
        </p>
      </motion.div>
    </motion.div>
  );
}
