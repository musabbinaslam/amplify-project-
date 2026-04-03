import React from 'react';
import { Activity, MapPin, Phone, PhoneCall, Target, CheckCircle2, DollarSign, PiggyBank, Percent, PhoneIncoming, Clock } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import classes from './DashboardPage.module.css';

const performanceData = [
  { name: 'Mon', sales: 3, calls: 18 },
  { name: 'Tue', sales: 5, calls: 22 },
  { name: 'Wed', sales: 2, calls: 15 },
  { name: 'Thu', sales: 6, calls: 28 },
  { name: 'Fri', sales: 4, calls: 20 },
  { name: 'Sat', sales: 1, calls: 8 },
  { name: 'Sun', sales: 0, calls: 3 },
];

const LICENSED_STATES = ['TX', 'FL', 'CA', 'NY', 'GA', 'OH', 'IL', 'AZ'];

const RECENT_CALLS = [
  { id: 1, name: 'Martha Johnson', phone: '(305) 555-0142', type: 'Inbound', duration: '12:34', time: '2:15 PM', disposition: 'Sold' },
  { id: 2, name: 'Robert Williams', phone: '(713) 555-0198', type: 'Outbound', duration: '8:47', time: '1:30 PM', disposition: 'Callback' },
  { id: 3, name: 'Linda Davis', phone: '(469) 555-0233', type: 'Inbound', duration: '0:00', time: '12:45 PM', disposition: 'No Answer' },
  { id: 4, name: 'James Brown', phone: '(832) 555-0177', type: 'Outbound', duration: '18:22', time: '11:10 AM', disposition: 'Sold' },
  { id: 5, name: 'Patricia Garcia', phone: '(214) 555-0321', type: 'Inbound', duration: '6:15', time: '10:00 AM', disposition: 'Not Interested' },
];

const DISP_CLS = {
  Sold: 'dispSold',
  Callback: 'dispCallback',
  'Not Interested': 'dispNotInterested',
  'No Answer': 'dispNoAnswer',
};

const StatCard = ({ title, value, icon: Icon }) => (
  <motion.div
    className={classes.statCard}
    whileHover={{ y: -4, boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}
    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
  >
    <div className={classes.statHeader}>
      <span className={classes.statTitle}>{title}</span>
      <div className={classes.iconWrapper}>
        <Icon size={18} />
      </div>
    </div>
    <div className={classes.statValue}>{value}</div>
  </motion.div>
);

const CampaignCard = ({ title, price, buffer, isTV }) => (
  <motion.div
    className={classes.campaignCard}
    whileHover={{ scale: 1.02, boxShadow: '0 8px 24px rgba(0,0,0,0.15)' }}
    transition={{ type: 'spring', stiffness: 400, damping: 25 }}
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
  const navigate = useNavigate();
  const totalSales = performanceData.reduce((s, d) => s + d.sales, 0);
  const totalCalls = performanceData.reduce((s, d) => s + d.calls, 0);
  const closeRate = totalCalls ? Math.round((totalSales / totalCalls) * 100) : 0;

  return (
    <div className={classes.dashboard}>
      <div className={classes.sectionStats}>
        <StatCard title="Today's Calls" value="28" icon={PhoneCall} />
        <StatCard title="This Week" value={String(totalCalls)} icon={Phone} />
        <StatCard title="Close Rate" value={`${closeRate}%`} icon={Target} />
        <StatCard title="Conversions" value={String(totalSales)} icon={CheckCircle2} />
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
          <CampaignCard title="TV Inbounds" price="85" buffer="10" isTV />
        </div>
      </div>

      <div className={classes.performanceHeader}>
        <h3><Activity size={18} /> Performance Stats</h3>
        <select className={classes.periodSelect}>
          <option>This Week</option>
          <option>This Month</option>
          <option>Last 30 Days</option>
        </select>
      </div>

      <div className={classes.perfStatsGrid}>
        <div className={`${classes.statCard} ${classes.largeCard}`}>
          <div className={classes.statHeader}>
            <span className={classes.statTitle}>Spend</span>
            <div className={classes.iconWrapper}><DollarSign size={18} /></div>
          </div>
          <div className={classes.statValue}>$1,260.00</div>
          <div className={classes.statSub}>Total cost on conversions</div>
        </div>
        <div className={`${classes.statCard} ${classes.largeCard}`}>
          <div className={classes.statHeader}>
            <span className={classes.statTitle}>Total AP</span>
            <div className={classes.iconWrapper}><PiggyBank size={18} /></div>
          </div>
          <div className={classes.statValue}>$8,450.00</div>
          <div className={classes.statSub}>Annual premium written</div>
        </div>
        <div className={`${classes.statCard} ${classes.wideCard}`}>
          <div className={classes.statHeader}>
            <span className={classes.statTitle}>ROI</span>
            <div className={classes.iconWrapper}><Percent size={18} /></div>
          </div>
          <div className={classes.statValue} style={{ color: 'var(--accent-green)' }}>570%</div>
          <div className={classes.statSub}>Return on investment</div>
        </div>
      </div>

      <div className={classes.chartSection}>
        <div className={classes.chartHeader}>
          <div className={classes.chartTitleBox}>
            <div className={classes.chartIcon}><Target size={16} /></div>
            <div>
              <div className={classes.chartTitle}>Close Rate</div>
              <div className={classes.chartValue}>{closeRate}%</div>
            </div>
          </div>
          <div className={classes.chartStats}>
            <div>{totalSales} sales</div>
            <div>{totalCalls} qualified calls</div>
          </div>
        </div>
        <div className={classes.chartContainer}>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={performanceData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={12} axisLine={false} tickLine={false} />
              <YAxis stroke="var(--text-muted)" fontSize={12} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ backgroundColor: 'var(--surface-container-high)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)' }}
                itemStyle={{ color: 'var(--text-secondary)' }}
                labelStyle={{ color: 'var(--text-primary)', fontWeight: 600 }}
              />
              <Line type="monotone" dataKey="sales" name="Sales" stroke="var(--accent-green)" strokeWidth={2} dot={{ r: 4, fill: 'var(--accent-green)' }} activeDot={{ r: 6 }} />
              <Line type="monotone" dataKey="calls" name="Calls" stroke="var(--text-muted)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className={classes.statesSection}>
        <div className={classes.sectionHeader}>
          <h3><MapPin size={18} /> Licensed States</h3>
          <button className={classes.editBtn} onClick={() => navigate('/app/licensed-states')}>Edit</button>
        </div>
        <div className={classes.statesPills}>
          {LICENSED_STATES.map((st) => (
            <span key={st} className={classes.statePill}>{st}</span>
          ))}
        </div>
      </div>

      <div className={classes.callsSection}>
        <div className={classes.sectionHeader}>
          <h3>Recent Calls</h3>
          <button className={classes.viewAllBtn} onClick={() => navigate('/app/call-logs')}>View All</button>
        </div>
        <div className={classes.callsTable}>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Type</th>
                <th>Duration</th>
                <th>Time</th>
                <th>Disposition</th>
              </tr>
            </thead>
            <tbody>
              {RECENT_CALLS.map((call) => (
                <tr key={call.id}>
                  <td className={classes.callName}>{call.name}</td>
                  <td className={classes.callPhone}>{call.phone}</td>
                  <td>
                    <span className={`${classes.callType} ${call.type === 'Inbound' ? classes.callInbound : classes.callOutbound}`}>
                      {call.type}
                    </span>
                  </td>
                  <td className={classes.callDuration}>
                    <Clock size={13} /> {call.duration}
                  </td>
                  <td className={classes.callTime}>{call.time}</td>
                  <td>
                    <span className={`${classes.callDisp} ${classes[DISP_CLS[call.disposition]] || ''}`}>
                      {call.disposition}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
