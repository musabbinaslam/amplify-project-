import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  Check,
  ChevronDown,
  Moon,
  Phone,
  PlayCircle,
  ShieldCheck,
  Sun,
  Timer,
  Users,
  Zap,
} from 'lucide-react';
import { useUIStore } from '../store/uiStore';
import { fetchCampaignPricing } from '../services/dashboardService';
import CallDeskPreview from '../components/marketing/CallDeskPreview';
import LightRibbons from '../components/marketing/LightRibbons';
import classes from './LandingPage.module.css';

const QUICK_PROOF = [
  { value: '2.7 min', label: 'Average time to first routed call' },
  { value: '100%', label: 'Consumer-initiated inbound calls' },
  { value: '0%', label: 'Recycled lead resells' },
  { value: '24/7', label: 'Real-time routing engine uptime', accent: true },
];

const TRUST_CHIPS = ['TCPA aware workflows', 'Exclusive call sessions', 'Built for licensed agents', 'Transparent call billing'];

const HERO_LINES = ['Final Expense', 'Medicare', 'ACA health'];

const TICKER = ['Final Expense · TX', 'Medicare · FL', 'ACA · GA', 'Final Expense · NC', 'Medicare · AZ', 'ACA · TX', 'Medicare · PA', 'Spanish Final Expense · CA'];

const MANIFESTO = 'No cold lists. No recycled leads. No shared lead files. Just live, consumer-initiated conversations routed to your license map in real time, so you spend your day closing, not chasing.'
  .split(' ')
  .map((word) => ({ word, accent: /^(live,|real|time,|closing,|chasing\.)$/.test(word) }));

const HOW_IT_WORKS = [
  {
    icon: Zap,
    title: 'We Generate Intent',
    desc: 'CallsFlow runs vertical-specific campaigns to attract people actively looking for insurance help now.',
  },
  {
    icon: Phone,
    title: 'Consumer Calls Live',
    desc: 'The caller requests to speak with an agent and is routed in real time based on state, vertical, and availability.',
  },
  {
    icon: BarChart3,
    title: 'You Answer and Close',
    desc: 'Take the call directly in-browser, close the policy, and track every conversation from your dashboard.',
  },
];

/* Illustrative agent profiles for the "built for licensed agents" wall. */
const AGENT_ROWS = [
  [['MR', 'Maria R.', 'Final Expense', 'TX, OK, LA', false], ['JK', 'James K.', 'Medicare', 'FL, GA', true], ['PS', 'Priya S.', 'ACA', 'GA, SC, NC', false], ['DO', 'Daniel O.', 'Final Expense', 'OH, PA, MI', false], ['AL', 'Ana L.', 'Medicare', 'AZ, NV, NM', true], ['KJ', 'Kevin J.', 'Final Expense', 'AL, MS', false]],
  [['CW', 'Chris W.', 'Final Expense', 'NC, VA', false], ['TB', 'Tasha B.', 'ACA', 'TX, LA', true], ['MD', 'Marcus D.', 'Medicare', 'IL, IN, WI', false], ['EV', 'Elena V.', 'Spanish Final Expense', 'FL', false], ['RH', 'Ray H.', 'Medicare', 'CO, UT', true], ['SN', 'Sara N.', 'Medicare', 'WA, OR', false]],
  [['NP', 'Nina P.', 'Medicare', 'NY, NJ', false], ['OF', 'Omar F.', 'ACA', 'MI, OH', false], ['GT', 'Grace T.', 'Final Expense', 'TN, KY, AL', true], ['LM', 'Luis M.', 'Medicare', 'CA, NV', false], ['BA', 'Beth A.', 'Final Expense', 'MO, KS', false], ['DF', 'Dev F.', 'ACA', 'NC, SC', true]],
];
const CALL_TIMES = ['04:12', '01:38', '06:05', '02:51', '03:20', '00:47'];
const FLY_X = [-220, 160, -90, 240, -180, 120];
const FLY_R = [-12, 9, -6, 14, -10, 7];

const COMPARE_ROWS = [
  ['Call exclusivity', '100% exclusive', 'Usually shared', 'Self-generated only'],
  ['Speed to conversation', 'Minutes', 'Hours to days', 'Manual outreach'],
  ['TCPA risk profile', 'Consumer initiated', 'Mixed sources', 'High if not managed'],
  ['Workflow complexity', 'Plug-and-play', 'List cleanup + dialing', 'Full outbound setup'],
  ['Pay model', 'Conversation-first', 'Per lead file', 'Labor + tools'],
];

const ONBOARDING_STEPS = [
  'Create your account and complete agent profile',
  'Select states and insurance verticals you want',
  'Add wallet balance and go online',
  'Receive live inbound calls and close',
];

const FAQ_ITEMS = [
  {
    q: 'Do I pay for recycled or shared leads?',
    a: 'No. CallsFlow routes live conversations. The platform is built around conversation-first billing, not bulk lead reselling.',
  },
  {
    q: 'How fast can I start receiving calls?',
    a: 'Most agents complete onboarding in minutes. Once your profile and funding are ready, you can go online and start receiving routed calls.',
  },
  {
    q: 'Can I control what calls I get?',
    a: 'Yes. You select verticals and licensed states, and routing respects your availability and preferences.',
  },
  {
    q: 'Do I need separate dialer software?',
    a: 'No additional softphone is required. Calls are handled through the in-browser workflow.',
  },
];

/* eslint-disable react/prop-types -- small local presentational component */
const FAQItem = ({ item, isOpen, onToggle, id }) => (
  <div className={`${classes.faqItem} ${isOpen ? classes.faqItemOpen : ''}`}>
    <button
      type="button"
      className={classes.faqQuestion}
      onClick={onToggle}
      aria-expanded={isOpen}
      aria-controls={`${id}-panel`}
      id={`${id}-button`}
    >
      <span>{item.q}</span>
      <ChevronDown className={classes.faqChevron} size={18} aria-hidden />
    </button>
    <div
      id={`${id}-panel`}
      role="region"
      aria-labelledby={`${id}-button`}
      className={classes.faqAnswer}
    >
      <div className={classes.faqAnswerInner}>
        <p>{item.a}</p>
      </div>
    </div>
  </div>
);
/* eslint-enable react/prop-types */

const LandingPage = () => {
  const [openFaq, setOpenFaq] = useState(0);
  const [verticalPricing, setVerticalPricing] = useState([]);
  const { theme, toggleTheme } = useUIStore();
  const bookingUrl = import.meta.env.VITE_CALENDLY_URL || '#';
  const pageRef = useRef(null);
  const frameRef = useRef(0);

  useEffect(() => {
    fetchCampaignPricing()
      .then((campaigns) => {
        setVerticalPricing(
          campaigns.map((c) => ({
            name: c.label,
            price: `$${Number(c.price).toFixed(0)}`,
            buffer: `${c.buffer}s`,
            detail: c.label,
          }))
        );
      })
      .catch(() => {
        // Non-blocking — page is still fully usable without pricing
      });
  }, []);

  useEffect(() => () => cancelAnimationFrame(frameRef.current), []);

  // Drives the cursor spotlight, card edge light and the hero preview tilt.
  const handlePointerMove = (e) => {
    if (e.pointerType === 'touch') return;
    const el = pageRef.current;
    if (!el) return;
    const { clientX, clientY } = e;
    cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      el.style.setProperty('--mx', `${clientX}px`);
      el.style.setProperty('--my', `${clientY}px`);
      el.style.setProperty('--px', (clientX / window.innerWidth - 0.5).toFixed(3));
      el.style.setProperty('--py', (clientY / window.innerHeight - 0.5).toFixed(3));
    });
  };

  const themeLabel = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';

  return (
    <div
      id="top"
      ref={pageRef}
      className={`appAmbient ${classes.page}`}
      onPointerMove={handlePointerMove}
    >
      <span className={classes.spotlight} aria-hidden />

      <nav className={classes.navbar} aria-label="Main">
        <div className={classes.navInner}>
          <Link to="/" className={classes.navLogo}>
            <img src="/logo.png" alt="Callsflow logo" className={classes.logoImg} loading="eager" decoding="async" />
            <span className={classes.logoText}>CALLSFLOW</span>
          </Link>

          <div className={classes.navLinks}>
            <a href="#top" className={classes.navLink}>Home</a>
            <a href="#how-it-works" className={classes.navLink}>How it Works</a>
            <a href="#pricing" className={classes.navLink}>Pricing</a>
            <a href="#comparison" className={classes.navLink}>Why CallsFlow</a>
            <a href="#faq" className={classes.navLink}>FAQ</a>
          </div>

          <div className={classes.navActions}>
            <button
              type="button"
              className={classes.themeToggle}
              onClick={toggleTheme}
              title={themeLabel}
              aria-label={themeLabel}
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <Link to="/login" className={classes.navBtnGhost}>Log In</Link>
            <Link to="/signup" className={`${classes.btnPrimary} ${classes.navBtnFilled}`}>Create Account</Link>
          </div>
        </div>
        <span className={classes.scrollProgress} aria-hidden />
      </nav>

      <header className={classes.hero}>
        <LightRibbons />
        <div className={classes.heroDots} aria-hidden />
        <div className={classes.heroGrid}>
          <div className={classes.heroCopy}>
            <span className={`${classes.eyebrow} ${classes.load}`} style={{ animationDelay: '0.05s' }}>
              <span className={classes.livePing} />
              Built for agents who close, not chase
            </span>
            <h1 className={classes.heroTitle} aria-label="The fastest way to get ready-to-buy insurance calls">
              <span aria-hidden>
                {['The', 'fastest', 'way', 'to', 'get', 'ready-to-buy'].map((w, i) => (
                  <span key={w} className={classes.word} style={{ animationDelay: `${0.15 + i * 0.07}s` }}>{w} </span>
                ))}
                <br />
                <span className={classes.word} style={{ animationDelay: '0.6s' }}>
                  <span className={classes.rotator}>
                    {HERO_LINES.map((line, i) => (
                      <span key={line} style={{ animationDelay: `${0.5 + i * 2.5}s` }}>{line}</span>
                    ))}
                  </span>
                </span>
                <br />
                <span className={classes.word} style={{ animationDelay: '0.68s' }}>calls.</span>
              </span>
            </h1>
            <p className={`${classes.heroSubtitle} ${classes.load}`} style={{ animationDelay: '0.75s' }}>
              CallsFlow routes exclusive consumer-initiated inbound calls to licensed agents in real time.
              No cold lists. No recycled leads. Just live conversations you can close.
            </p>
            <div className={`${classes.heroActions} ${classes.load}`} style={{ animationDelay: '0.85s' }}>
              <Link to="/signup" className={`${classes.btnPrimary} ${classes.btnLg}`}>
                Create Account <ArrowRight size={18} className={classes.arrow} />
              </Link>
              <a href={bookingUrl} target="_blank" rel="noreferrer" className={`${classes.btnGhost} ${classes.btnLg}`}>
                <PlayCircle size={18} /> Book Demo Call
              </a>
            </div>
            <ul className={`${classes.trustList} ${classes.load}`} style={{ animationDelay: '0.95s' }}>
              {TRUST_CHIPS.map((chip) => (
                <li key={chip}><Check size={18} strokeWidth={2.6} aria-hidden /> {chip}</li>
              ))}
            </ul>
          </div>
          <CallDeskPreview className={classes.heroPreview} />
        </div>

        <div className={`${classes.ticker} ${classes.load}`} style={{ animationDelay: '1.2s' }} aria-label="Insurance lines and states routed through CallsFlow">
          <div className={classes.tickerTrack}>
            {[...TICKER, ...TICKER].map((t, i) => (
              <span key={`${t}-${i}`} className={classes.tickerItem} aria-hidden={i >= TICKER.length}>
                <Phone size={16} aria-hidden /> {t}
              </span>
            ))}
          </div>
        </div>
      </header>

      <main className={classes.main}>
        <section className={classes.proofSection} aria-label="CallsFlow at a glance">
          <div className={classes.proofGrid}>
            {QUICK_PROOF.map((item, i) => (
              <div
                key={item.label}
                className={`${classes.card} ${classes.lit} ${classes.revealFly} ${classes.proofCard}`}
                style={{ '--fy': `${70 + i * 50}px` }}
              >
                <span className={`${classes.proofValue} ${item.accent ? classes.accentText : ''}`}>{item.value}</span>
                <span className={classes.proofLabel}>{item.label}</span>
              </div>
            ))}
          </div>
        </section>

        <section className={classes.manifesto} aria-label="The CallsFlow difference">
          <div className={classes.narrow}>
            <span className={classes.sectionTag}><i />The CallsFlow difference</span>
            <p className={classes.manifestoText}>
              {MANIFESTO.map((m, i) => (
                <span key={i} className={`${classes.mWord} ${m.accent ? classes.accentText : ''}`}>{m.word}</span>
              ))}
            </p>
          </div>
        </section>

        <section id="how-it-works" className={classes.section}>
          <div className={`${classes.sectionInner} ${classes.split}`}>
            <div className={classes.sticky}>
              <span className={classes.sectionTag}><i />How it Works</span>
              <h2 className={`${classes.sectionTitle} ${classes.reveal}`}>Three steps from click to closed deal</h2>
              <p className={`${classes.sectionSubtitle} ${classes.reveal}`}>
                A simple flow designed for speed. You can be online and receiving calls without rebuilding your stack.
              </p>
              <Link to="/signup" className={`${classes.btnPrimary} ${classes.reveal}`} style={{ marginTop: 32 }}>
                Get started <ArrowRight size={18} className={classes.arrow} />
              </Link>
            </div>
            <ol className={classes.timeline}>
              <span className={classes.timelineTrack} aria-hidden />
              <span className={classes.timelineFill} aria-hidden />
              {HOW_IT_WORKS.map((step, i) => (
                <li
                  key={step.title}
                  className={`${classes.card} ${classes.lit} ${classes.revealFly} ${classes.stepCard}`}
                  style={{ '--fx': `${i % 2 ? -120 : 120}px`, '--fy': '40px', '--fr': `${i % 2 ? -4 : 4}deg` }}
                >
                  <span className={classes.stepDot} aria-hidden />
                  <div className={classes.stepHead}>
                    <span className={classes.stepIcon}><step.icon size={18} /></span>
                    <span className={classes.stepNum}>Step 0{i + 1}</span>
                  </div>
                  <h3>{step.title}</h3>
                  <p>{step.desc}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className={`${classes.section} ${classes.agentsSection}`} aria-labelledby="agents-title">
          <div className={`${classes.sectionInner} ${classes.centerHead}`}>
            <span className={classes.sectionTag}><i />Built for licensed agents</span>
            <h2 id="agents-title" className={`${classes.sectionTitle} ${classes.reveal}`}>Pick your states and lines. Go online. The calls find you.</h2>
            <p className={`${classes.sectionSubtitle} ${classes.reveal}`}>
              Routing respects your license map, the verticals you choose and whether you&apos;re available, so every call that rings is one you can take.
            </p>
          </div>
          <div className={classes.agentRows} aria-hidden>
            {AGENT_ROWS.map((row, r) => {
              let busyIndex = r * 2;
              return (
                <div key={r} className={`${classes.agentRow} ${r % 2 ? classes.driftRight : classes.driftLeft}`}>
                  {row.map(([ini, name, vert, lic, busy], j) => {
                    const time = busy ? CALL_TIMES[busyIndex++ % CALL_TIMES.length] : null;
                    return (
                      <div
                        key={name}
                        className={`${classes.card} ${classes.revealFly} ${classes.agentCard}`}
                        style={{
                          '--fx': `${FLY_X[(j + r * 2) % 6] * (r === 1 ? -1 : 1)}px`,
                          '--fy': `${140 + ((j * 53 + r * 37) % 160)}px`,
                          '--fr': `${FLY_R[(j + r) % 6]}deg`,
                        }}
                      >
                        <span className={classes.agentAvatar}>{ini}</span>
                        <span className={classes.agentText}>
                          <span className={classes.agentName}>{name}</span>
                          <span className={classes.agentMeta}>{vert} · {lic}</span>
                          <span className={classes.agentStatus}>
                            <span className={busy ? classes.dotBusy : classes.dotOnline} />
                            {busy ? `On a call · ${time}` : 'Online · ready for calls'}
                          </span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </section>

        <section id="pricing" className={classes.section}>
          <div className={classes.sectionInner}>
            <div className={classes.headRow}>
              <div>
                <span className={classes.sectionTag}><i />Vertical Pricing</span>
                <h2 className={`${classes.sectionTitle} ${classes.reveal}`}>Transparent pricing by insurance line</h2>
              </div>
              <p className={`${classes.sectionSubtitle} ${classes.reveal} ${classes.headRowText}`}>
                You know what you pay before you answer. The buffer marks the minimum connected call duration for billing.
              </p>
            </div>

            <div className={classes.pricingGrid}>
              {verticalPricing.map((item, i) => (
                <article
                  key={item.name}
                  className={`${classes.card} ${classes.lit} ${classes.revealFly} ${classes.pricingCard}`}
                  style={{ '--fx': `${[-60, 0, 60, 0][i % 4]}px`, '--fy': `${70 + (i % 4) * 45}px`, '--fr': `${[-5, -2, 2, 5][i % 4]}deg` }}
                >
                  <div className={classes.pricingTop}>
                    <h3>{item.name}</h3>
                    <span className={classes.bufferBadge}><Timer size={14} aria-hidden />{item.buffer} buffer</span>
                  </div>
                  <div className={classes.priceRow}>
                    <span className={classes.price}>{item.price}</span>
                    <span className={classes.priceUnit}>per connected call</span>
                  </div>
                  <p className={classes.pricingDetail}>{item.detail}</p>
                </article>
              ))}
              <Link
                to="/signup"
                className={`${classes.revealFly} ${classes.pricingCta}`}
                style={{ '--fy': '160px', '--fr': '3deg' }}
              >
                <span>Fund your wallet and go live today</span>
                <span className={classes.pricingCtaLink}>Create Account <ArrowRight size={18} /></span>
              </Link>
            </div>
          </div>
        </section>

        <section id="comparison" className={classes.section}>
          <div className={classes.sectionInner}>
            <span className={classes.sectionTag}><i />Why CallsFlow</span>
            <h2 className={`${classes.sectionTitle} ${classes.reveal}`}>Conversation-first beats lead-chasing</h2>
            <div className={`${classes.card} ${classes.lit} ${classes.reveal} ${classes.compareBox}`}>
              <table className={classes.compareTable}>
                <thead>
                  <tr>
                    <th scope="col">Category</th>
                    <th scope="col">CallsFlow</th>
                    <th scope="col">Shared Leads</th>
                    <th scope="col">Cold Calling</th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARE_ROWS.map((row) => (
                    <tr key={row[0]}>
                      <th scope="row">{row[0]}</th>
                      <td>{row[1]}</td>
                      <td>{row[2]}</td>
                      <td>{row[3]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section id="book-call" className={classes.section}>
          <div className={classes.sectionInner}>
            <span className={classes.sectionTag}><i />Onboarding Flow</span>
            <h2 className={`${classes.sectionTitle} ${classes.reveal}`}>Go live in under 15 minutes</h2>
            <div className={classes.stepsRail}>
              <span className={classes.railTrack} aria-hidden />
              <span className={classes.railFill} aria-hidden />
              <ol className={classes.onboardingSteps}>
                {ONBOARDING_STEPS.map((step, i) => (
                  <li key={step} className={classes.revealFly} style={{ '--fy': `${80 + i * 50}px` }}>
                    <span className={`${classes.railDot} ${i === ONBOARDING_STEPS.length - 1 ? classes.railDotLast : ''}`}>{i + 1}</span>
                    <p>{step}</p>
                  </li>
                ))}
              </ol>
            </div>

            <div className={`${classes.card} ${classes.lit} ${classes.reveal} ${classes.demoCard}`}>
              <div className={classes.demoMain}>
                <span className={classes.demoIcon}><CalendarDays size={26} aria-hidden /></span>
                <div>
                  <h3>Book a 45-min Demo</h3>
                  <p>Choose any open time and book instantly through Calendly.</p>
                  <div className={classes.demoInfo}>
                    <span className={classes.pill}>Live availability shown on Calendly</span>
                    <span className={classes.pill}>45-minute strategy call</span>
                    <span className={classes.pill}><Users size={14} aria-hidden /> Built for licensed agents</span>
                    <span className={classes.pill}><ShieldCheck size={14} aria-hidden /> Compliance aware setup</span>
                  </div>
                </div>
              </div>
              <a href={bookingUrl} target="_blank" rel="noreferrer" className={`${classes.btnPrimary} ${classes.btnLg}`}>
                View Live Slots on Calendly <ArrowRight size={18} className={classes.arrow} />
              </a>
            </div>
          </div>
        </section>

        <section id="faq" className={classes.section}>
          <div className={`${classes.sectionInner} ${classes.split} ${classes.faqSplit}`}>
            <div className={classes.sticky}>
              <span className={classes.sectionTag}><i />FAQ</span>
              <h2 className={`${classes.sectionTitle} ${classes.reveal}`}>Questions agents ask before joining</h2>
            </div>
            <div className={`${classes.faqList} ${classes.reveal}`}>
              {FAQ_ITEMS.map((item, index) => (
                <FAQItem
                  key={item.q}
                  id={`faq-${index}`}
                  item={item}
                  isOpen={openFaq === index}
                  onToggle={() => setOpenFaq(openFaq === index ? null : index)}
                />
              ))}
            </div>
          </div>
        </section>

        <section className={classes.section}>
          <div className={classes.sectionInner}>
            <div className={`${classes.card} ${classes.lit} ${classes.reveal} ${classes.finalCta}`}>
              <span className={classes.finalGlow} aria-hidden />
              <div className={classes.finalCopy}>
                <h2>Ready to replace lead-chasing with live conversations?</h2>
                <p>Join CallsFlow, go online, and start receiving exclusive inbound calls routed to your license map.</p>
                <div className={classes.heroActions}>
                  <Link to="/signup" className={`${classes.btnPrimary} ${classes.btnLg}`}>
                    Create Account <ArrowRight size={18} className={classes.arrow} />
                  </Link>
                  <a href={bookingUrl} target="_blank" rel="noreferrer" className={`${classes.btnGhost} ${classes.btnLg}`}>
                    Book Demo
                  </a>
                </div>
              </div>
              <div className={classes.orbit} aria-hidden>
                <span className={classes.orbitRingOuter} />
                <span className={classes.orbitRingInner} />
                <span className={classes.orbitHub}><img src="/logo.png" alt="" /></span>
                <div className={classes.orbitSpin}>
                  {['MR', 'JK', 'PS', 'DO', 'AL', 'CW', 'TB', 'NP'].map((ini, i) => {
                    const angle = (i / 8) * 2 * Math.PI;
                    return (
                      <span
                        key={ini}
                        className={classes.orbitSlot}
                        style={{ left: `${50 + 38 * Math.cos(angle)}%`, top: `${50 + 38 * Math.sin(angle)}%` }}
                      >
                        <span className={classes.orbitUnspin}>
                          <span className={`${classes.orbitAvatar} ${i % 3 === 0 ? classes.orbitAvatarAccent : ''}`}>{ini}</span>
                        </span>
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className={classes.footer}>
        <div className={classes.footerInner}>
          <div className={classes.footerBrand}>
            <div className={classes.navLogo}>
              <img src="/logo.png" alt="Callsflow logo" className={classes.logoImg} loading="lazy" decoding="async" />
              <span className={classes.logoText}>CALLSFLOW</span>
            </div>
            <p>Real-time insurance call routing for licensed agents.</p>
          </div>
          <div className={classes.footerLinks}>
            <a href="#how-it-works">How it Works</a>
            <a href="#pricing">Pricing</a>
            <a href="#comparison">Why CallsFlow</a>
            <a href="#faq">FAQ</a>
          </div>
          <div className={classes.footerLinks}>
            <Link to="/login">Log In</Link>
            <Link to="/signup">Create Account</Link>
            <Link to="/terms">Terms of Service</Link>
            <Link to="/privacy">Privacy Policy</Link>
            <a href={bookingUrl} target="_blank" rel="noreferrer">Book Demo</a>
          </div>
        </div>
        <div className={classes.footerBottom}>
          <p>&copy; {new Date().getFullYear()} CallsFlow. All rights reserved.</p>
        </div>
        <div className={classes.wordmarkWrap} aria-hidden>
          <div className={classes.wordmark}>CallsFlow</div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
