import React from 'react';
import { User, MessageCircle } from 'lucide-react';
import useAuthStore from '../store/authStore';
import classes from './ProfilePage.module.css';

const ProfilePage = () => {
  const user = useAuthStore((s) => s.user);

  return (
    <div className={classes.profilePage}>
       <div className={classes.header}>
          <div className={classes.iconBox}><User size={24} /></div>
          <div>
             <h2>Profile & Landing Page</h2>
             <p>Customize your public profile for lead capture</p>
          </div>
       </div>

       <div className={classes.mainBox}>
          <h3>Your Profile</h3>
          <div className={classes.avatarRow}>
             <div className={classes.avatar}>{user?.name?.charAt(0)?.toUpperCase() || 'A'}</div>
             <div>
                <h4>{user?.name || 'Agent'}</h4>
                <p>{user?.email || ''}</p>
                <button className={classes.uploadBtn}>Click avatar to upload a photo</button>
             </div>
          </div>

          <div className={classes.formGroup}>
             <label>Landing Page URL</label>
             <div className={classes.urlInputGroup}>
                <span className={classes.urlPrefix}>https://agentcalls.io/a/</span>
                <input type="text" defaultValue={user?.name?.toLowerCase().replace(/\s+/g, '') || ''} className={classes.urlInput} />
             </div>
          </div>

          <div className={classes.formGroup}>
             <label>Bio</label>
             <textarea 
                className={classes.bioInput} 
                defaultValue="Licensed insurance agent specializing in..."
                rows={4}
             ></textarea>
             <div className={classes.charCount}>0/500 characters</div>
          </div>

          <button className={classes.saveBtn}>Save Profile</button>
       </div>
    </div>
  );
};

export default ProfilePage;
