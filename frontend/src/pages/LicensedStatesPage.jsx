import React, { useMemo } from 'react';
import { MapPin, Info } from 'lucide-react';
import classes from './LicensedStatesPage.module.css';

const REGIONS = [
  {
    id: 'northeast',
    label: 'Northeast',
    description: 'New England and the Mid-Atlantic corridor.',
    states: [
      { code: 'CT', name: 'Connecticut' },
      { code: 'ME', name: 'Maine' },
      { code: 'MA', name: 'Massachusetts' },
      { code: 'NH', name: 'New Hampshire' },
      { code: 'NJ', name: 'New Jersey' },
      { code: 'NY', name: 'New York' },
      { code: 'PA', name: 'Pennsylvania' },
      { code: 'RI', name: 'Rhode Island' },
      { code: 'VT', name: 'Vermont' },
    ],
  },
  {
    id: 'south',
    label: 'South',
    description: 'Atlantic coast, Gulf states, and the wider Southeast.',
    states: [
      { code: 'AL', name: 'Alabama' },
      { code: 'AR', name: 'Arkansas' },
      { code: 'DE', name: 'Delaware' },
      { code: 'FL', name: 'Florida' },
      { code: 'GA', name: 'Georgia' },
      { code: 'KY', name: 'Kentucky' },
      { code: 'LA', name: 'Louisiana' },
      { code: 'MD', name: 'Maryland' },
      { code: 'MS', name: 'Mississippi' },
      { code: 'NC', name: 'North Carolina' },
      { code: 'OK', name: 'Oklahoma' },
      { code: 'SC', name: 'South Carolina' },
      { code: 'TN', name: 'Tennessee' },
      { code: 'TX', name: 'Texas' },
      { code: 'VA', name: 'Virginia' },
      { code: 'WV', name: 'West Virginia' },
    ],
  },
  {
    id: 'midwest',
    label: 'Midwest',
    description: 'Great Lakes and the central plains.',
    states: [
      { code: 'IL', name: 'Illinois' },
      { code: 'IN', name: 'Indiana' },
      { code: 'IA', name: 'Iowa' },
      { code: 'KS', name: 'Kansas' },
      { code: 'MI', name: 'Michigan' },
      { code: 'MN', name: 'Minnesota' },
      { code: 'MO', name: 'Missouri' },
      { code: 'NE', name: 'Nebraska' },
      { code: 'ND', name: 'North Dakota' },
      { code: 'OH', name: 'Ohio' },
      { code: 'SD', name: 'South Dakota' },
      { code: 'WI', name: 'Wisconsin' },
    ],
  },
  {
    id: 'west',
    label: 'West',
    description: 'Mountain, Pacific, and non-contiguous states.',
    states: [
      { code: 'AK', name: 'Alaska' },
      { code: 'AZ', name: 'Arizona' },
      { code: 'CA', name: 'California' },
      { code: 'CO', name: 'Colorado' },
      { code: 'HI', name: 'Hawaii' },
      { code: 'ID', name: 'Idaho' },
      { code: 'MT', name: 'Montana' },
      { code: 'NV', name: 'Nevada' },
      { code: 'NM', name: 'New Mexico' },
      { code: 'OR', name: 'Oregon' },
      { code: 'UT', name: 'Utah' },
      { code: 'WA', name: 'Washington' },
      { code: 'WY', name: 'Wyoming' },
    ],
  },
];

const LicensedStatesPage = () => {
  const totalStates = useMemo(
    () => REGIONS.reduce((sum, region) => sum + region.states.length, 0),
    []
  );

  return (
    <div className={classes.container}>
      <div className={classes.header}>
        <div className={classes.iconBox}><MapPin size={24} /></div>
        <div className={classes.headerContent}>
          <h2>Licensed States</h2>
          <p>Reference list of states currently present in the system.</p>
          <div className={classes.headerMeta}>
            <span className={classes.countPill}>{totalStates} total</span>
            <span className={classes.metaChip}>Read-only catalog</span>
            <span className={classes.metaChip}>Grouped by region</span>
            <span className={classes.metaChip}>No profile sync</span>
          </div>
        </div>
      </div>

      <div className={classes.regionGrid}>
        {REGIONS.map((region) => (
          <section key={region.id} className={classes.regionPanel} aria-labelledby={`region-${region.id}`}>
            <div className={classes.regionPanelHeader}>
              <h3 id={`region-${region.id}`} className={classes.regionTitle}>{region.label}</h3>
              <span className={classes.regionCount}>{region.states.length} states</span>
            </div>
            <p className={classes.regionDesc}>{region.description}</p>
            <div className={classes.regionDivider} />
            <div className={classes.regionTiles} role="list" aria-label={`${region.label} states`}>
              {region.states.map((st) => (
                <div
                  key={st.code}
                  className={classes.stateTile}
                  role="listitem"
                  data-tooltip={st.name}
                  aria-label={st.name}
                >
                  <span className={classes.tileBadge}>{st.code}</span>
                  <span className={classes.tileName}>{st.name}</span>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className={classes.infoBox}>
        <Info size={16} className={classes.infoIcon} />
        <p>
          This page shows the state catalog only. No profile state updates are made here.
        </p>
      </div>
    </div>
  );
};

export default LicensedStatesPage;
