import React, { useState } from 'react';
import { MapPin } from 'lucide-react';
import classes from './LicensedStatesPage.module.css';

const states = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
];

const LicensedStatesPage = () => {
  const [selectedStates, setSelectedStates] = useState([]);

  const toggleState = (st) => {
    setSelectedStates(prev => 
      prev.includes(st) ? prev.filter(s => s !== st) : [...prev, st]
    );
  };

  const selectAll = () => setSelectedStates([...states]);
  const clearAll = () => setSelectedStates([]);

  return (
    <div className={classes.container}>
       <div className={classes.header}>
          <div className={classes.iconBox}><MapPin size={24} /></div>
          <div>
             <h2>Licensed States</h2>
             <p>Select the states you're licensed to take calls from</p>
          </div>
       </div>

       <div className={classes.mainBox}>
          <div className={classes.boxHeader}>
             <h3>Your Licensed States ({selectedStates.length})</h3>
             <div className={classes.actions}>
                <button onClick={selectAll}>Select All</button>
                <button onClick={clearAll}>Clear All</button>
             </div>
          </div>

          <div className={classes.grid}>
             {states.map(st => (
                <label key={st} className={classes.checkboxLabel}>
                   <input 
                      type="checkbox" 
                      className={classes.checkbox} 
                      checked={selectedStates.includes(st)}
                      onChange={() => toggleState(st)}
                   />
                   <span className={classes.customCheckbox}></span>
                   {st}
                </label>
             ))}
          </div>

          <div className={classes.footer}>
             <button className={classes.saveBtn}>
                ✓ Save Changes ({selectedStates.length} states)
             </button>
          </div>
       </div>
    </div>
  );
};

export default LicensedStatesPage;
