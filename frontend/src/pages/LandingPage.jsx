import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Phone, LayoutDashboard, Shield, DollarSign, Brain, MapPin,
  ChevronDown, ArrowRight, Zap, Users, BarChart3, Play,
  Calendar, Clock, Video, Sun, Moon,
} from 'lucide-react';
import { useUIStore } from '../store/uiStore';
import classes from './LandingPage.module.css';

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: 'easeOut' } },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.12 } },
};

const STATS = [
  { value: '1,000+', label: 'Active Agents' },
  { value: '50,000+', label: 'Calls Connected' },
  { value: '5', label: 'Insurance Verticals' },
];

const TRUST_ITEMS = [
  'Licensed Agents Network',
  'TCPA Aware Workflows',
  'HIPAA-Ready Handling',
  'Insurance Community',
  'As Seen In',
];

const STEPS = [
  { icon: Users, title: 'Create Your Account', desc: 'Sign up in under two minutes. Select your licensed states and preferred verticals.' },
  { icon: Phone, title: 'Receive Inbound Calls', desc: 'Our routing engine matches you with high-intent leads in real time. No cold calling.' },
  { icon: DollarSign, title: 'Close & Earn', desc: 'Convert calls into policies and earn commissions. Track everything from your dashboard.' },
];

const LEAD_FLOW = [
  {
    title: 'Targeted Insurance Ads',
    desc: 'We run intent-based campaigns to reach consumers actively searching for insurance help in your selected verticals.',
  },
  {
    title: 'Consumer Click + Pre-Call Intent',
    desc: 'Consumers click through and submit key intent details before requesting to speak with a licensed agent.',
  },
  {
    title: 'Real-Time Inbound Transfer',
    desc: 'Qualified callers are matched by state, vertical, and availability, then routed to online agents in real time.',
  },
];

const FEATURES = [
  { icon: Zap, title: 'Real-Time Call Routing', desc: 'Intelligent matching connects the right lead to the right agent based on state, vertical, and availability.' },
  { icon: BarChart3, title: 'Live Dashboard', desc: 'Monitor your performance, call volume, conversion rates, and earnings in real time.' },
  { icon: Shield, title: 'Multiple Verticals', desc: 'Final Expense, ACA, Medicare, and more. Choose the verticals that match your expertise.' },
  { icon: DollarSign, title: 'Transparent Payouts', desc: 'See exactly what you earn on every call. No hidden fees, no surprises.' },
  { icon: Brain, title: 'AI Training Tools', desc: 'AI-powered call scripts and training resources to help you close more deals.' },
  { icon: MapPin, title: 'Licensed State Management', desc: 'Manage your licensed states easily. Only receive calls for states where you are licensed.' },
];

const VERTICALS = [
  { name: 'Final Expense', desc: 'Help families secure affordable burial and end-of-life coverage with whole life policies.' },
  { name: 'Spanish Final Expense', desc: 'Serve the Spanish-speaking market with dedicated final expense leads and scripts.' },
  { name: 'ACA', desc: 'Connect individuals and families with Affordable Care Act health insurance plans.' },
  { name: 'Medicare', desc: 'Guide seniors through Medicare Advantage, Supplement, and Part D plan options.' },
  { name: 'Leads', desc: 'Access our lead marketplace for additional prospecting beyond inbound calls.' },
];

const FAQ_ITEMS = [
  { q: 'How do I start receiving calls?', a: 'After creating your account, select your licensed states and preferred verticals. Once approved, toggle your status to "Online" and calls will be routed to you automatically.' },
  { q: 'What equipment do I need?', a: 'Just a computer with a stable internet connection and a modern web browser. Our built-in WebRTC dialer handles everything — no phone line or softphone needed.' },
  { q: 'How does billing work?', a: 'You purchase call credits through your dashboard. Each inbound call deducts from your balance. You only pay for calls you actually receive.' },
  { q: 'Can I choose which verticals I work?', a: 'Absolutely. You can select one or multiple verticals during signup and change them anytime from your profile settings.' },
  { q: 'Is there a minimum commitment?', a: 'No long-term contracts. You can go online and offline whenever you want. Use the platform on your own schedule.' },
  { q: 'What states are supported?', a: 'We support all 50 US states. You will only receive calls for states where you hold an active insurance license.' },
];

const FAQItem = ({ item, isOpen, onToggle }) => (
  <div className={classes.faqItem}>
    <button className={classes.faqQuestion} onClick={onToggle}>
      <span>{item.q}</span>
      <ChevronDown className={`${classes.faqChevron} ${isOpen ? classes.faqChevronOpen : ''}`} size={20} />
    </button>
    <div className={`${classes.faqAnswer} ${isOpen ? classes.faqAnswerOpen : ''}`}>
      <p>{item.a}</p>
    </div>
  </div>
);

const LandingPage = () => {
  const [openFaq, setOpenFaq] = useState(null);
  const { theme, toggleTheme } = useUIStore();
  const baseCalendlyUrl = import.meta.env.VITE_CALENDLY_URL || 'https://calendly.com/';
  const calendlyEmbedUrl = `${baseCalendlyUrl}${baseCalendlyUrl.includes('?') ? '&' : '?'}hide_event_type_details=1&hide_gdpr_banner=1`;

  return (
    <div className={classes.page}>
      {/* Navbar */}
      <nav className={classes.navbar}>
        <div className={classes.navInner}>
          <Link to="/" className={classes.navLogo}>
            <div className={classes.logoIcon}>
              <span className={classes.logoTriangle} />
            </div>
            <span className={classes.logoText}>AGENTCALLS</span>
          </Link>

          <div className={classes.navLinks}>
            <a href="#how-it-works" className={classes.navLink}>How It Works</a>
            <a href="#lead-source" className={classes.navLink}>Lead Source</a>
            <a href="#features" className={classes.navLink}>Features</a>
            <a href="#verticals" className={classes.navLink}>Verticals</a>
            <a href="#faq" className={classes.navLink}>FAQ</a>
            <a href="#book-call" className={classes.navLink}>Book a Call</a>
          </div>

          <div className={classes.navActions}>
            <button className={classes.themeToggle} onClick={toggleTheme} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <Link to="/login" className={classes.navBtnGhost}>Log In</Link>
            <Link to="/signup" className={classes.navBtnFilled}>Get Started</Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className={classes.hero}>
        <div className={classes.heroGlow} />
        <motion.div
          className={classes.heroContent}
          initial="hidden"
          animate="visible"
          variants={stagger}
        >
          <motion.h1 className={classes.heroTitle} variants={fadeUp}>
            Turn Inbound Calls<br />Into Commission
          </motion.h1>
          <motion.p className={classes.heroSubtitle} variants={fadeUp}>
            Stop cold calling. Start closing. AgentCalls routes high-intent insurance
            leads directly to your browser — so you can focus on what you do best.
          </motion.p>
          <motion.div className={classes.heroCtas} variants={fadeUp}>
            <Link to="/signup" className={classes.ctaPrimary}>
              Start Taking Calls Today <ArrowRight size={18} />
            </Link>
            <a href="#how-it-works" className={classes.ctaSecondary}>
              <Play size={16} /> See How It Works
            </a>
          </motion.div>
          <motion.p className={classes.heroUrgency} variants={fadeUp}>
            Limited onboarding spots this week.
          </motion.p>
        </motion.div>
      </section>

      {/* Stats */}
      <section className={classes.stats}>
        <div className={classes.statsInner}>
          {STATS.map((stat) => (
            <motion.div
              key={stat.label}
              className={classes.statItem}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: '-50px' }}
              variants={fadeUp}
            >
              <span className={classes.statValue}>{stat.value}</span>
              <span className={classes.statLabel}>{stat.label}</span>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Trusted By */}
      <section className={classes.trustSection}>
        <div className={classes.trustInner}>
          <p className={classes.trustHeading}>Trusted by industry professionals</p>
          <div className={classes.trustGrid}>
            {TRUST_ITEMS.map((item) => (
              <motion.div
                key={item}
                className={classes.trustItem}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: '-50px' }}
                variants={fadeUp}
              >
                {item}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className={classes.section}>
        <motion.div
          className={classes.sectionInner}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          variants={stagger}
        >
          <motion.div className={classes.sectionHeader} variants={fadeUp}>
            <span className={classes.sectionTag}>How It Works</span>
            <h2 className={classes.sectionTitle}>Three steps to your first call</h2>
            <p className={classes.sectionSubtitle}>
              Getting started takes minutes, not days. Here is exactly how the platform works.
            </p>
          </motion.div>

          <div className={classes.stepsGrid}>
            {STEPS.map((step, i) => (
              <motion.div key={step.title} className={classes.stepCard} variants={fadeUp}>
                <div className={classes.stepNumber}>{i + 1}</div>
                <div className={classes.stepIconWrap}>
                  <step.icon size={24} />
                </div>
                <h3>{step.title}</h3>
                <p>{step.desc}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* Lead Source */}
      <section id="lead-source" className={classes.section}>
        <motion.div
          className={classes.sectionInner}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          variants={stagger}
        >
          <motion.div className={classes.sectionHeader} variants={fadeUp}>
            <span className={classes.sectionTag}>Lead Source</span>
            <h2 className={classes.sectionTitle}>How inbound calls are generated</h2>
            <p className={classes.sectionSubtitle}>
              You should know exactly where calls come from before you spend. Here is the end-to-end funnel.
            </p>
          </motion.div>

          <div className={classes.leadFlowGrid}>
            {LEAD_FLOW.map((step, i) => (
              <motion.div key={step.title} className={classes.leadFlowCard} variants={fadeUp}>
                <div className={classes.leadFlowTop}>
                  <span className={classes.leadFlowIndex}>0{i + 1}</span>
                  {i < LEAD_FLOW.length - 1 ? <ArrowRight size={16} className={classes.leadFlowArrow} /> : null}
                </div>
                <h3>{step.title}</h3>
                <p>{step.desc}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* Features */}
      <section id="features" className={classes.section}>
        <motion.div
          className={classes.sectionInner}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          variants={stagger}
        >
          <motion.div className={classes.sectionHeader} variants={fadeUp}>
            <span className={classes.sectionTag}>Features</span>
            <h2 className={classes.sectionTitle}>Everything you need to succeed</h2>
            <p className={classes.sectionSubtitle}>
              A complete platform built for insurance agents who want to scale their business with inbound calls.
            </p>
          </motion.div>

          <div className={classes.featuresGrid}>
            {FEATURES.map((feat) => (
              <motion.div key={feat.title} className={classes.featureCard} variants={fadeUp}>
                <div className={classes.featureIconWrap}>
                  <feat.icon size={22} />
                </div>
                <h3>{feat.title}</h3>
                <p>{feat.desc}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* Verticals */}
      <section id="verticals" className={classes.section}>
        <motion.div
          className={classes.sectionInner}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          variants={stagger}
        >
          <motion.div className={classes.sectionHeader} variants={fadeUp}>
            <span className={classes.sectionTag}>Verticals</span>
            <h2 className={classes.sectionTitle}>Choose your specialty</h2>
            <p className={classes.sectionSubtitle}>
              We support multiple insurance verticals so you can work in the areas where you are licensed and experienced.
            </p>
          </motion.div>

          <div className={classes.verticalsGrid}>
            {VERTICALS.map((v) => (
              <motion.div key={v.name} className={classes.verticalCard} variants={fadeUp}>
                <h3>{v.name}</h3>
                <p>{v.desc}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* FAQ */}
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
            <h2 className={classes.sectionTitle}>Common questions</h2>
          </motion.div>

          <motion.div className={classes.faqList} variants={fadeUp}>
            {FAQ_ITEMS.map((item, i) => (
              <FAQItem
                key={i}
                item={item}
                isOpen={openFaq === i}
                onToggle={() => setOpenFaq(openFaq === i ? null : i)}
              />
            ))}
          </motion.div>
        </motion.div>
      </section>

      {/* Book a Call */}
      <section id="book-call" className={classes.section}>
        <motion.div
          className={classes.sectionInner}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          variants={stagger}
        >
          <div className={classes.bookingGrid}>
            <motion.div className={classes.bookingText} variants={fadeUp}>
              <h2 className={classes.bookingHeading}>
                See If You're a Fit for{' '}
                <span className={classes.bookingHighlight}>Inbound Calls</span>
              </h2>
              <p className={classes.bookingSubtitle}>
                Book a quick call with our team. We'll walk you through exactly
                how it works and see if you're a good match for our network.
              </p>
              <p className={classes.bookingUrgency}>
                Spots fill fast each week. Next onboarding window closes soon.
              </p>

              <div className={classes.bookingBullets}>
                <div className={classes.bookingBullet}>
                  <div className={classes.bookingBulletIcon}><Phone size={18} /></div>
                  <span>Live inbound calls transferred in real-time</span>
                </div>
                <div className={classes.bookingBullet}>
                  <div className={classes.bookingBulletIcon}><MapPin size={18} /></div>
                  <span>Choose which states you want to receive calls from</span>
                </div>
                <div className={classes.bookingBullet}>
                  <div className={classes.bookingBulletIcon}><Zap size={18} /></div>
                  <span>Simple onboarding — start receiving calls fast</span>
                </div>
              </div>

              <p className={classes.bookingDisclaimer}>
                Limited capacity. We only work with agents who are serious about growth.
              </p>
            </motion.div>

            <motion.div className={classes.bookingCard} variants={fadeUp}>
              <div className={classes.bookingCardHeader}>
                <Video size={20} className={classes.bookingCardIcon} />
                <div>
                  <h3>10-Min Onboarding Call</h3>
                  <p>Book directly on our calendar</p>
                </div>
              </div>

              <div className={classes.bookingCardDetails}>
                <div className={classes.bookingCardDetail}>
                  <Clock size={15} />
                  <span>10 Minutes</span>
                </div>
                <div className={classes.bookingCardDetail}>
                  <Calendar size={15} />
                  <span>Pick a time that works for you</span>
                </div>
              </div>

              <div className={classes.bookingCalendarEmbed}>
                <iframe
                  title="AgentCalls Onboarding Calendar"
                  src={calendlyEmbedUrl}
                  className={classes.bookingIframe}
                  frameBorder="0"
                  loading="lazy"
                />
              </div>

              <p className={classes.bookingCardNote}>
                If the calendar does not load,{" "}
                <a
                  href={baseCalendlyUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  book your slot here
                </a>
                .
              </p>
            </motion.div>
          </div>
        </motion.div>
      </section>

      {/* Final CTA */}
      <section className={classes.finalCta}>
        <div className={classes.finalCtaGlow} />
        <motion.div
          className={classes.finalCtaContent}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          variants={stagger}
        >
          <motion.h2 variants={fadeUp}>Ready to start closing this week?</motion.h2>
          <motion.p variants={fadeUp}>
            Do not wait on stale leads. Secure your onboarding spot and start taking inbound calls now.
          </motion.p>
          <motion.div variants={fadeUp}>
            <Link to="/signup" className={classes.ctaPrimary}>
              Claim My Spot <ArrowRight size={18} />
            </Link>
          </motion.div>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className={classes.footer}>
        <div className={classes.footerInner}>
          <div className={classes.footerBrand}>
            <div className={classes.navLogo}>
              <div className={classes.logoIcon}>
                <span className={classes.logoTriangle} />
              </div>
              <span className={classes.logoText}>AGENTCALLS</span>
            </div>
            <p className={classes.footerTagline}>Inbound insurance calls for agents.</p>
          </div>

          <div className={classes.footerColumns}>
            <div className={classes.footerCol}>
              <h4>Product</h4>
              <a href="#how-it-works">How It Works</a>
              <a href="#lead-source">Lead Source</a>
              <a href="#features">Features</a>
              <a href="#verticals">Verticals</a>
              <a href="#faq">FAQ</a>
              <a href="#book-call">Book a Call</a>
            </div>
            <div className={classes.footerCol}>
              <h4>Account</h4>
              <Link to="/login">Log In</Link>
              <Link to="/signup">Sign Up</Link>
            </div>
            <div className={classes.footerCol}>
              <h4>Legal</h4>
              <a href="#">Privacy Policy</a>
              <a href="#">Terms of Service</a>
            </div>
          </div>
        </div>

        <div className={classes.footerBottom}>
          <p>&copy; {new Date().getFullYear()} AgentCalls. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
