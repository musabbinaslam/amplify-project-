import { motion } from 'framer-motion';
import { ADMIN_CATEGORIES, findAdminModuleById } from '../../config/adminModules';
import AdminPageShell from '../../components/admin/AdminPageShell';
import AdminModuleCard from '../../components/admin/AdminModuleCard';
import { useSubtlePageMotion } from '../../hooks/useSubtlePageMotion';
import classes from './AdminEmailCampaignsPage.module.css';

const MODULE = findAdminModuleById('email-campaigns');

export default function AdminEmailCampaignsPage() {
  const presets = useSubtlePageMotion();
  const Icon = MODULE?.icon;
  const children = MODULE?.children || [];

  return (
    <AdminPageShell
      title={MODULE?.title || 'Email Campaigns'}
      description={MODULE?.description}
      icon={Icon}
      category={ADMIN_CATEGORIES[MODULE?.category] || ADMIN_CATEGORIES.communications}
    >
      <motion.div className={classes.grid} variants={presets.grid}>
        {children.map((child) => (
          <AdminModuleCard
            key={child.id}
            title={child.title}
            description={child.description}
            icon={child.icon}
            route={child.route}
            category={ADMIN_CATEGORIES[child.category]}
            variants={presets.child}
          />
        ))}
      </motion.div>
    </AdminPageShell>
  );
}
