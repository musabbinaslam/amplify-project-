import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
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
import classes from './LandingPage.module.css';

const QUICK_PROOF = [
  { value: '2.7 min', label: 'Average time to first routed call' },
  { value: '100%', label: 'Consumer-initiated inbound calls' },
  { value: '0%', label: 'Recycled lead resells' },
  { value: '24/7', label: 'Real-time routing engine uptime' },
];

const TRUST_CHIPS = ['TCPA aware workflows', 'Exclusive call sessions', 'Built for licensed agents', 'Transparent call billing'];

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

const VERTICAL_PRICING = [
  { name: 'FE Transfers',         price: '$35', buffer: '120s', detail: 'Live-transferred Final Expense callers ready to speak with an agent.' },
  { name: 'FE Inbounds',          price: '$45', buffer: '90s',  detail: 'Direct inbound Final Expense calls from high-intent consumers.' },
  { name: 'Medicare Transfers',   price: '$25', buffer: '120s', detail: 'Live-transferred Medicare callers seeking plan guidance.' },
  { name: 'Medicare Inbounds (1)',price: '$35', buffer: '90s',  detail: 'Inbound seniors actively requesting Medicare plan information.' },
  { name: 'Medicare Inbounds (2)',price: '$18', buffer: '15s',  detail: 'Short-buffer Medicare inbounds — high volume, low friction.' },
  { name: 'ACA Transfers',        price: '$30', buffer: '120s', detail: 'Live-transferred ACA shoppers comparing health plan options.' },
];

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

const FAQItem = ({ item, isOpen, onToggle }) => (
  <div className={classes.faqItem}>
    <button className={classes.faqQuestion} onClick={onToggle}>
      <span>{item.q}</span>
      <ChevronDown className={`${classes.faqChevron} ${isOpen ? classes.faqChevronOpen : ''}`} size={18} />
    </button>
    <div className={`${classes.faqAnswer} ${isOpen ? classes.faqAnswerOpen : ''}`}>
      <p>{item.a}</p>
    </div>
  </div>
);

const LandingPage = () => {
  const [openFaq, setOpenFaq] = useState(null);
  const { theme, toggleTheme } = useUIStore();
  const bookingUrl = import.meta.env.VITE_CALENDLY_URL || '#';
  const reduceMotion = useReducedMotion();

  const fadeUp = {
    hidden: { opacity: 0, y: reduceMotion ? 0 : 24 },
    visible: {
      opacity: 1,
      y: 0,
      transition: reduceMotion
        ? { duration: 0.15 }
        : { duration: 0.62, ease: [0.22, 1, 0.36, 1] },
    },
  };

  const stagger = {
    hidden: {},
    visible: {
      transition: reduceMotion
        ? { staggerChildren: 0.02, delayChildren: 0 }
        : { staggerChildren: 0.1, delayChildren: 0.08 },
    },
  };

  const pageEnter = {
    hidden: { opacity: 0, y: reduceMotion ? 0 : 10 },
    visible: {
      opacity: 1,
      y: 0,
      transition: reduceMotion
        ? { duration: 0.18 }
        : { duration: 0.55, ease: [0.22, 1, 0.36, 1] },
    },
  };

  return (
    <motion.div
      id="top"
      className={classes.page}
      initial="hidden"
      animate="visible"
      variants={pageEnter}
    >
      <nav className={classes.navbar}>
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
              className={classes.themeToggle}
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <Link to="/login" className={classes.navBtnGhost}>Log In</Link>
            <Link to="/signup" className={classes.navBtnFilled}>Create Account</Link>
          </div>
        </div>
      </nav>

      <section className={classes.hero}>
        <div className={classes.heroGridOverlay} />
        <motion.div
          className={classes.heroInner}
          initial="hidden"
          animate="visible"
          variants={stagger}
        >
          <motion.span className={classes.eyebrow} variants={fadeUp}>Built for agents who close, not chase</motion.span>
          <motion.h1 className={classes.heroTitle} variants={fadeUp}>
            The Fastest Way to Get<br />
            Ready-to-Buy Insurance Calls
          </motion.h1>
          <motion.p className={classes.heroSubtitle} variants={fadeUp}>
            CallsFlow routes exclusive consumer-initiated inbound calls to licensed agents in real time.
            No cold lists. No recycled leads. Just live conversations you can close.
          </motion.p>
          <motion.div className={classes.heroActions} variants={fadeUp}>
            <Link to="/signup" className={classes.ctaPrimary}>
              Create Account <ArrowRight size={16} />
            </Link>
            <a
              href={bookingUrl}
              target="_blank"
              rel="noreferrer"
              className={`${classes.ctaSecondary} ${classes.bookingPulseBorder}`}
            >
              <PlayCircle size={16} /> Book Demo Call
            </a>
          </motion.div>
          <motion.div className={classes.heroTrustRow} variants={fadeUp}>
            {TRUST_CHIPS.map((chip) => (
              <span key={chip} className={classes.trustChip}>{chip}</span>
            ))}
          </motion.div>
        </motion.div>
      </section>

      <section className={classes.proofSection}>
        <div className={classes.proofGrid}>
          {QUICK_PROOF.map((item) => (
            <motion.div
              key={item.label}
              className={classes.proofCard}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: '-50px' }}
              variants={fadeUp}
            >
              <span className={classes.proofValue}>{item.value}</span>
              <span className={classes.proofLabel}>{item.label}</span>
            </motion.div>
          ))}
        </div>
      </section>

      <section id="how-it-works" className={classes.section}>
        <motion.div
          className={classes.sectionInner}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          variants={stagger}
        >
          <motion.div className={classes.sectionHeader} variants={fadeUp}>
            <span className={classes.sectionTag}>How it Works</span>
            <h2 className={classes.sectionTitle}>Three steps from click to closed deal</h2>
            <p className={classes.sectionSubtitle}>
              A simple flow designed for speed. You can be online and receiving calls without rebuilding your stack.
            </p>
          </motion.div>
          <div className={classes.stepsGrid}>
            {HOW_IT_WORKS.map((step, index) => (
              <motion.article key={step.title} className={classes.stepCard} variants={fadeUp}>
                <div className={classes.stepIcon}><step.icon size={18} /></div>
                <h3>{step.title}</h3>
                <p>{step.desc}</p>
              </motion.article>
            ))}
          </div>
        </motion.div>
      </section>

      <section id="pricing" className={classes.section}>
        <motion.div
          className={classes.sectionInner}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          variants={stagger}
        >
          <motion.div className={classes.sectionHeader} variants={fadeUp}>
            <span className={classes.sectionTag}>Vertical Pricing</span>
            <h2 className={classes.sectionTitle}>Transparent pricing by insurance line</h2>
            <p className={classes.sectionSubtitle}>
              You know what you pay before you answer. The buffer marks the minimum connected call duration for billing.
            </p>
          </motion.div>

          <div className={classes.pricingGrid}>
            {VERTICAL_PRICING.map((item) => (
              <motion.article key={item.name} className={classes.pricingCard} variants={fadeUp}>
                <h3>{item.name}</h3>
                <div className={classes.priceRow}>
                  <span className={classes.price}>{item.price}</span>
                  <span className={classes.priceUnit}>per connected call</span>
                </div>
                <p className={classes.pricingDetail}>{item.detail}</p>
                <div className={classes.bufferBadge}>
                  <Timer size={14} />
                  <span>{item.buffer} buffer</span>
                </div>
              </motion.article>
            ))}
          </div>
        </motion.div>
      </section>

      <section id="comparison" className={classes.section}>
        <motion.div
          className={classes.sectionInner}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          variants={stagger}
        >
          <motion.div className={classes.sectionHeader} variants={fadeUp}>
            <span className={classes.sectionTag}>Why CallsFlow</span>
            <h2 className={classes.sectionTitle}>Conversation-first beats lead-chasing</h2>
          </motion.div>

          <motion.div className={classes.compareTable} variants={fadeUp}>
            <div className={classes.compareHead}>
              <span>Category</span>
              <span>CallsFlow</span>
              <span>Shared Leads</span>
              <span>Cold Calling</span>
            </div>
            {COMPARE_ROWS.map((row) => (
              <div className={classes.compareRow} key={row[0]}>
                <span>{row[0]}</span>
                <span className={classes.callsflowValue}>{row[1]}</span>
                <span>{row[2]}</span>
                <span>{row[3]}</span>
              </div>
            ))}
          </motion.div>
        </motion.div>
      </section>

      <section id="book-call" className={classes.section}>
        <motion.div
          className={classes.sectionInner}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          variants={stagger}
        >
          <div className={classes.onboardingWrap}>
            <motion.div className={classes.onboardingPanel} variants={fadeUp}>
              <span className={classes.sectionTag}>Onboarding Flow</span>
              <h2 className={classes.sectionTitle}>Go live in under 15 minutes</h2>
              <ul className={classes.onboardingList}>
                {ONBOARDING_STEPS.map((step) => (
                  <li key={step}>
                    <CheckCircle2 size={16} />
                    <span>{step}</span>
                  </li>
                ))}
              </ul>
              <div className={classes.onboardingMeta}>
                <span><Users size={14} /> Built for licensed agents</span>
                <span><ShieldCheck size={14} /> Compliance aware setup</span>
              </div>
            </motion.div>

            <motion.div className={classes.demoCard} variants={fadeUp}>
              <h3>Book a 45-min Demo</h3>
              <p>Choose any open time and book instantly through Calendly.</p>
              <div className={classes.demoInfo}>
                <span className={classes.demoInfoPill}>Live availability shown on Calendly</span>
                <span className={classes.demoInfoPill}>45-minute strategy call</span>
              </div>
              <a
                href={bookingUrl}
                target="_blank"
                rel="noreferrer"
                className={`${classes.ctaPrimary} ${classes.bookingPulseBorder}`}
              >
                View Live Slots on Calendly <ArrowRight size={16} />
              </a>
            </motion.div>
          </div>
        </motion.div>
      </section>

      <section id="faq" className={classes.section}>
        <motion.div
          className={classes.sectionInner}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          variants={stagger}
        >
          <motion.div className={classes.sectionHeader} variants={fadeUp}>
            <span className={classes.sectionTag}>FAQ</span>
            <h2 className={classes.sectionTitle}>Questions agents ask before joining</h2>
          </motion.div>
          <motion.div className={classes.faqList} variants={fadeUp}>
            {FAQ_ITEMS.map((item, index) => (
              <FAQItem
                key={item.q}
                item={item}
                isOpen={openFaq === index}
                onToggle={() => setOpenFaq(openFaq === index ? null : index)}
              />
            ))}
          </motion.div>
        </motion.div>
      </section>

      <section className={classes.finalCta}>
        <motion.div
          className={classes.finalCtaContent}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-70px' }}
          variants={stagger}
        >
          <motion.h2 variants={fadeUp}>Ready to replace lead-chasing with live conversations?</motion.h2>
          <motion.p variants={fadeUp}>
            Join CallsFlow, go online, and start receiving exclusive inbound calls routed to your license map.
          </motion.p>
          <motion.div className={classes.finalActions} variants={fadeUp}>
            <Link to="/signup" className={classes.ctaPrimary}>
              Create Account <ArrowRight size={16} />
            </Link>
            <a
              href={bookingUrl}
              target="_blank"
              rel="noreferrer"
              className={`${classes.ctaSecondary} ${classes.bookingPulseBorder}`}
            >
              Book Demo
            </a>
          </motion.div>
        </motion.div>
      </section>

      <footer className={classes.footer}>
        <div className={classes.footerInner}>
          <div className={classes.footerBrand}>
            <div className={classes.navLogo}>
              <img src="/logo.png" alt="Callsflow logo" className={classes.logoImg} loading="eager" decoding="async" />
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
            <a href={bookingUrl} target="_blank" rel="noreferrer" className={classes.bookingPulseBorder}>Book Demo</a>
          </div>
        </div>
        <div className={classes.footerBottom}>
          <p>&copy; {new Date().getFullYear()} CallsFlow. All rights reserved.</p>
        </div>
      </footer>
    </motion.div>
  );
};

export default LandingPage;
