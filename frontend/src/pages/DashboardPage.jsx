import React from 'react';
import { Activity, MapPin, Phone, PhoneCall, Target, CheckCircle2, DollarSign, PiggyBank, Percent } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { motion } from 'framer-motion';
import classes from './DashboardPage.module.css';

const performanceData = [
  { name: 'Mon', sales: 0, calls: 0 },
  { name: 'Tue', sales: 0, calls: 0 },
  { name: 'Wed', sales: 0, calls: 0 },
  { name: 'Thu', sales: 0, calls: 0 },
  { name: 'Fri', sales: 0, calls: 0 },
  { name: 'Sat', sales: 0, calls: 0 },
  { name: 'Sun', sales: 0, calls: 0 },
];

const StatCard = ({ title, value, icon: Icon, valueColor = 'white' }) => (
  <motion.div 
    className={classes.statCard}
    whileHover={{ y: -5, boxShadow: '0 10px 30px -10px rgba(59, 130, 246, 0.3)', borderColor: 'rgba(59, 130, 246, 0.5)' }}
    transition={{ type: "spring", stiffness: 300, damping: 20 }}
  >
    <div className={classes.statHeader}>
      <span className={classes.statTitle}>{title}</span>
      <div className={classes.iconWrapper}>
        <Icon size={18} />
      </div>
    </div>
    <div className={classes.statValue} style={{ color: valueColor }}>{value}</div>
  </motion.div>
);

const CampaignCard = ({ title, price, buffer, isTV }) => (
  <motion.div 
    className={classes.campaignCard}
    whileHover={{ scale: 1.02, boxShadow: '0 8px 30px rgba(0,0,0,0.5)', borderColor: isTV ? 'rgba(34, 211, 238, 0.5)' : 'rgba(59, 130, 246, 0.5)' }}
    transition={{ type: "spring", stiffness: 400, damping: 25 }}
  >
    <div className={classes.campaignHeader}>
      <DollarSign size={16} className={isTV ? classes.tvIcon : classes.blueIcon} />
      <span className={classes.campaignTitle}>{title}</span>
    </div>
    <div className={classes.campaignPrice}>
      <span className={classes.priceLarge}>${price}</span>
      <span className={classes.priceSub}>/call</span>
    </div>
    <div className={classes.campaignBuffer}>
      <CheckCircle2 size={12} />
      <span>{buffer}s buffer</span>
    </div>
  </motion.div>
);

const DashboardPage = () => {
  return (
    <div className={classes.dashboard}>
      <div className={classes.sectionStats}>
        <StatCard title="Today's Calls" value="0" icon={PhoneCall} />
        <StatCard title="This Week" value="0" icon={Phone} />
        <StatCard title="Close Rate" value="0%" icon={Target} />
        <StatCard title="Conversions" value="0" icon={CheckCircle2} />
      </div>

      <div className={classes.campaignSection}>
        <div className={classes.sectionHeader}>
          <h3>Campaign Pricing</h3>
          <button className={classes.dollarBtn}><DollarSign size={16} /></button>
        </div>
        <div className={classes.campaignGrid}>
          <CampaignCard title="ACA" price="50" buffer="90" />
          <CampaignCard title="Final Expense" price="60" buffer="90" />
          <CampaignCard title="Medicare" price="35" buffer="25" />
          <CampaignCard title="TV Inbounds" price="85" buffer="10" isTV={true} />
        </div>
      </div>

      <div className={classes.performanceHeader}>
        <h3><Activity size={18} /> Performance Stats</h3>
        <select className={classes.periodSelect}>
          <option>This Month</option>
        </select>
      </div>

      <div className={classes.perfStatsGrid}>
        <div className={`${classes.statCard} ${classes.largeCard}`}>
          <div className={classes.statHeader}>
            <span className={classes.statTitle}>Spend</span>
            <div className={classes.iconWrapper}><DollarSign size={18} /></div>
          </div>
          <div className={classes.statValue}>$0.00</div>
          <div className={classes.statSub}>Total cost on conversions</div>
        </div>
        <div className={`${classes.statCard} ${classes.largeCard}`}>
          <div className={classes.statHeader}>
            <span className={classes.statTitle}>Total AP</span>
            <div className={classes.iconWrapper}><PiggyBank size={18} /></div>
          </div>
          <div className={classes.statValue}>$0.00</div>
          <div className={classes.statSub}>Annual premium written</div>
        </div>
        <div className={`${classes.statCard} ${classes.wideCard}`}>
          <div className={classes.statHeader}>
            <span className={classes.statTitle}>ROI</span>
            <div className={classes.iconWrapper}><Percent size={18} /></div>
          </div>
          <div className={classes.statValue}>—</div>
          <div className={classes.statSub}>Return on investment</div>
        </div>
      </div>

      <div className={classes.chartSection}>
        <div className={classes.chartHeader}>
          <div className={classes.chartTitleBox}>
            <div className={classes.chartIcon}><Target size={16} /></div>
            <div>
              <div className={classes.chartTitle}>Close Rate</div>
              <div className={classes.chartValue}>0%</div>
            </div>
          </div>
          <div className={classes.chartStats}>
            <div>0 sales</div>
            <div>0 qualified calls</div>
          </div>
        </div>
        <div className={classes.chartContainer}>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={performanceData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="name" stroke="var(--text-secondary)" fontSize={12} axisLine={false} tickLine={false} />
              <YAxis stroke="var(--text-secondary)" fontSize={12} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ backgroundColor: 'var(--bg-secondary)', border: 'none', borderRadius: '8px', color: 'white' }}
                itemStyle={{ color: 'white' }}
              />
              <Line type="monotone" dataKey="sales" stroke="var(--accent-blue)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      
      <div className={classes.statesSection}>
         <div className={classes.sectionHeader}>
            <h3><MapPin size={18} /> Licensed States</h3>
            <button className={classes.editBtn}>⚙️ Edit</button>
         </div>
         <div className={classes.statesBox}>
            No states selected. Click Edit to add your licensed states.
         </div>
      </div>

      <div className={classes.callsSection}>
         <div className={classes.sectionHeader}>
            <h3>Recent Calls</h3>
            <button className={classes.viewAllBtn}>View All</button>
         </div>
         <div className={classes.callsBox}>
            No calls yet
         </div>
      </div>
    </div>
  );
};

export default DashboardPage;
