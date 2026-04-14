import React from 'react';
import { MapPin, Info } from 'lucide-react';
import classes from './LicensedStatesPage.module.css';

const STATE_LIST = [
  { code: 'AL', name: 'Alabama' },
  { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' },
  { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' },
  { code: 'DE', name: 'Delaware' },
  { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' },
  { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' },
  { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' },
  { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' },
  { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' },
  { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' },
];

const LicensedStatesPage = () => {
  return (
    <div className={classes.container}>
      <div className={classes.header}>
        <div className={classes.iconBox}><MapPin size={24} /></div>
        <div>
          <h2>Licensed States</h2>
          <p>Reference list of states currently present in the system.</p>
        </div>
      </div>

      <div className={classes.mainBox}>
        <div className={classes.topRow}>
          <div className={classes.summary}>
            <div className={classes.summaryTitleRow}>
              <h3>Available States</h3>
              <div className={classes.countPill}>{STATE_LIST.length} total</div>
            </div>
            <p className={classes.summaryHint}>
              This is a static view for visibility only. Editing and saving are disabled on this page.
            </p>
          </div>
        </div>

        <div className={classes.metaRow}>
          <span className={classes.metaChip}>Read-only catalog</span>
          <span className={classes.metaChip}>A-Z sorted</span>
          <span className={classes.metaChip}>No profile sync</span>
        </div>

        <div className={classes.grid} role="list" aria-label="States present">
          {STATE_LIST.map((st) => (
            <div key={st.code} className={classes.stateTile} role="listitem">
              <span className={classes.tileCode}>{st.code}</span>
              <span className={classes.tileName}>{st.name}</span>
            </div>
          ))}
        </div>

        <div className={classes.infoBox}>
          <Info size={16} className={classes.infoIcon} />
          <p>
            This page shows the state catalog only. No profile state updates are made here.
          </p>
        </div>
      </div>
    </div>
  );
};

export default LicensedStatesPage;
