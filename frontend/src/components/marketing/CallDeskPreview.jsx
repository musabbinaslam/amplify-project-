/* eslint-disable react/prop-types -- presentational marketing illustration */
import { DollarSign, FileText, LayoutGrid, List, Phone } from 'lucide-react';
import classes from './CallDeskPreview.module.css';

/*
 * Illustrative "Take Calls" window shown on the landing hero and the auth
 * showcase. Purely decorative: it mirrors the real call desk so visitors see
 * the product, and it is hidden from assistive tech (the wrapper carries a
 * text description instead).
 */
const SIDEBAR = [
  { Icon: LayoutGrid, active: false },
  { Icon: Phone, active: true },
  { Icon: List, active: false },
  { Icon: FileText, active: false },
  { Icon: DollarSign, active: false },
];

const WAVE = Array.from({ length: 34 }, (_, i) => ({
  accent: i % 6 === 0,
  duration: `${(0.8 + ((i * 7) % 5) * 0.13).toFixed(2)}s`,
  delay: `-${((i * 0.17) % 1.2).toFixed(2)}s`,
}));

const RECENT = [
  { line: 'Medicare · FL', time: '04:12', badge: 'Billed $15', billed: true },
  { line: 'ACA · GA', time: '02:51', badge: 'Billed $35', billed: true },
  { line: 'Final Expense · NC', time: '00:08', badge: 'Under buffer', billed: false },
  { line: 'Home · OH', time: '06:05', badge: 'Billed $70', billed: true },
];

const AGENTS = ['MR', 'JK', 'PS', 'AL'];

export default function CallDeskPreview({ className = '' }) {
  return (
    <div
      className={`${classes.stage} ${className}`}
      role="img"
      aria-label="Preview of the CallsFlow call desk: an incoming Final Expense call from Texas, ready to answer"
    >
      <div className={classes.plane} aria-hidden="true">
        <span className={classes.glow} />

        <div className={classes.toast}>
          <span className={classes.toastIcon}><Phone /></span>
          <span>
            <span className={classes.toastTitle}>New call routed to you</span>
            <span className={classes.toastSub}>Medicare · FL · just now</span>
          </span>
        </div>

        <div className={classes.windowWrap}>
          <div className={classes.window}>
            <div className={classes.topbar}>
              <span className={classes.brand}>
                <img src="/logo.png" alt="" className={classes.brandLogo} />
                <b>CALLSFLOW</b>
              </span>
              <span className={classes.topActions}>
                <span className={classes.online}><span className={classes.ping} />Online</span>
                <span className={classes.wallet}>$1,000.00</span>
              </span>
            </div>

            <div className={classes.body}>
              <div className={classes.sidebar}>
                {SIDEBAR.map(({ Icon, active }, i) => (
                  <span key={i} className={`${classes.navIcon} ${active ? classes.navIconActive : ''}`}>
                    <Icon />
                  </span>
                ))}
              </div>

              <div className={classes.callCard}>
                <div className={classes.callHead}>
                  <span className={classes.incoming}><span className={classes.ping} />Incoming call</span>
                  <span className={classes.timer}>00:04</span>
                </div>
                <div className={classes.caller}>
                  <span className={classes.callerIcon}><Phone /></span>
                  <span className={classes.callerText}>
                    <span className={classes.callerTitle}>Final Expense · TX</span>
                    <span className={classes.callerSub}>Consumer-initiated · exclusive to you</span>
                  </span>
                </div>
                <div className={classes.wave}>
                  {WAVE.map((b, i) => (
                    <span
                      key={i}
                      className={`${classes.waveBar} ${b.accent ? classes.waveBarAccent : ''}`}
                      style={{ animationDuration: b.duration, animationDelay: b.delay }}
                    />
                  ))}
                </div>
                <div className={classes.facts}>
                  <span className={classes.fact}><span className={classes.factLabel}>Campaign</span><span className={classes.factValue}>FE Inbounds</span></span>
                  <span className={classes.fact}><span className={classes.factLabel}>Price</span><span className={classes.factValue}>$25 / call</span></span>
                  <span className={classes.fact}><span className={classes.factLabel}>Buffer</span><span className={classes.factValue}>10s</span></span>
                </div>
                <div className={classes.actions}>
                  <span className={classes.answer}><Phone />Answer</span>
                  <span className={classes.script}>Open script</span>
                </div>
              </div>

              <div className={classes.side}>
                <div className={classes.panel}>
                  <span className={classes.factLabel}>Today</span>
                  <div className={classes.todayRow}>
                    <span className={classes.todayValue}>6 calls</span>
                    <span className={classes.miniBars}>
                      <span style={{ height: '35%' }} />
                      <span style={{ height: '60%' }} />
                      <span style={{ height: '45%' }} />
                      <span style={{ height: '80%' }} />
                      <span className={classes.miniBarAccent} style={{ height: '100%' }} />
                    </span>
                  </div>
                </div>
                <div className={`${classes.panel} ${classes.recent}`}>
                  <span className={classes.factLabel}>Recent calls</span>
                  {RECENT.map((r, i) => (
                    <div key={r.line} className={classes.recentRow} style={{ animationDelay: `${(1.2 + i * 0.15).toFixed(2)}s` }}>
                      <span className={classes.recentText}>
                        <span className={classes.recentLine}>{r.line}</span>
                        <span className={classes.recentTime}>{r.time}</span>
                      </span>
                      <span className={`${classes.badge} ${r.billed ? classes.badgeBilled : ''}`}>{r.badge}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className={classes.agents}>
          <span className={classes.avatars}>
            {AGENTS.map((a, i) => (
              <span key={a} className={`${classes.avatar} ${i === AGENTS.length - 1 ? classes.avatarAccent : ''}`}>{a}</span>
            ))}
          </span>
          <span className={classes.agentsText}><span className={classes.ping} />Agents taking calls now</span>
        </div>
      </div>
    </div>
  );
}
