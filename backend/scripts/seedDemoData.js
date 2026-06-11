/**
 * Seed script — inserts realistic demo data for 'demo-user'.
 * Safe to re-run: every document uses replaceOne + upsert.
 *
 * Usage:
 *   node backend/scripts/seedDemoData.js
 *   (run from repo root, or: cd backend && node scripts/seedDemoData.js)
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');

const CareerProfile  = require('../src/models/CareerProfile');
const Application    = require('../src/models/Application');
const JobAnalysis    = require('../src/models/JobAnalysis');
const RejectionPattern = require('../src/models/RejectionPattern');
const WeeklyBriefing = require('../src/models/WeeklyBriefing');

const USER_ID = 'demo-user';

// ─── Dates relative to June 9 2026 ───────────────────────────────────────────
function daysAgo(n) {
  const d = new Date('2026-06-09');
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// ─── Career Profile ───────────────────────────────────────────────────────────
const careerProfile = {
  _id: USER_ID,
  createdAt: new Date('2026-04-28'),
  lastActive: new Date('2026-06-08'),
  currentRole: 'Senior Software Engineer',
  targetRole: 'Staff Engineer',
  targetIndustry: 'Fintech',
  yearsExperience: 7,
  resumeText: `Jordan Lee — Senior Software Engineer
7 years building distributed payment infrastructure at scale.

EXPERIENCE
Senior Software Engineer — PayPal (2021–present)
  • Led rewrite of fraud detection pipeline processing $4B/day in transactions
  • Reduced P99 latency from 380ms to 42ms via async event sourcing (Kafka + Redis)
  • Mentored team of 6 engineers across 3 time zones

Software Engineer — Capital One (2019–2021)
  • Built real-time credit decisioning API (Node.js + PostgreSQL), 50k req/sec
  • Designed multi-tenant data isolation layer for white-label card product

Software Engineer — Finix (2017–2019)
  • Core contributor to payment facilitation SDK used by 200+ ISVs
  • Shipped PCI-DSS Level 1 compliance across entire data pipeline

SKILLS
Node.js, TypeScript, Python, Go, PostgreSQL, MongoDB, Redis, Kafka,
Kubernetes, AWS (ECS, RDS, Lambda), Terraform, GraphQL, REST APIs,
System Design, Distributed Systems, PCI-DSS, SOC 2

EDUCATION
B.S. Computer Science — UC San Diego, 2017`,
  skills: [
    'Node.js', 'TypeScript', 'Python', 'Go',
    'PostgreSQL', 'MongoDB', 'Redis', 'Kafka',
    'Kubernetes', 'AWS', 'Terraform', 'GraphQL',
    'System Design', 'Distributed Systems', 'PCI-DSS',
  ],
  salaryMin: 220000,
  salaryMax: 280000,
  location: 'Remote',
  urgency: 'immediate',
  searchStartDate: '2026-04-28',
  agentMode: 'ACTIVE_SEARCH',
  intakeStep: 5,
  conversationHistory: [
    {
      role: 'agent',
      text: "Welcome back, Jordan. I've reviewed your pipeline. Two applications have gone cold and need attention.\n\nAffirm is now 34 days in — a follow-up was sent 14 days ago with no reply. Chime is 25 days in, applied via LinkedIn, zero acknowledgement. Both fit the ATS-filter signature: sub-7-day silence with no recruiter contact.\n\nOn the upside: Stripe came in with an offer — $265k base, decision deadline June 13. Plaid's final panel is scheduled for June 12. You're in a strong position at the top of the funnel but still losing 5 of 8 applications before a single phone screen. Want me to run the full rejection pattern analysis?",
      timestamp: new Date('2026-06-08T09:00:00Z'),
    },
    {
      role: 'user',
      text: "Yes — run it. Why am I getting filtered before the phone screen?",
      timestamp: new Date('2026-06-08T09:00:45Z'),
    },
    {
      role: 'agent',
      text: "Pattern confirmed: PRE_INTERVIEW filtering, HIGH confidence.\n\n5 of your 8 applications never reached a phone screen. Of your 3 formal rejections, 2 (Brex, Mercury) were auto-rejected within 7 days and 1 (Coinbase) was cut after a recruiter screen. This is a resume-framing problem, not a skills problem.\n\nThe common thread: 'technical strategy', 'architecture ownership', and 'RFC process' appear in every target JD and in none of your current resume bullets. Staff Engineer roles at this tier use those phrases as ATS hard filters.\n\nTop fix: reframe 3 PayPal bullets to show org-level impact and add explicit mentions of RFC authorship. That should move your ATS pass rate from ~35% to 65%+. Want me to draft the rewrites?",
      timestamp: new Date('2026-06-08T09:01:30Z'),
    },
  ],
};

// ─── Job Applications (8 total) ───────────────────────────────────────────────
const applications = [
  // OFFER
  {
    _id: 'app_stripe_001',
    userId: USER_ID,
    jobAnalysisId: 'ja_stripe_001',
    company: 'Stripe',
    role: 'Staff Engineer — Payments Infrastructure',
    appliedDate: daysAgo(38),
    status: 'OFFER',
    statusHistory: [
      { status: 'APPLIED',       date: daysAgo(38) },
      { status: 'PHONE_SCREEN',  date: daysAgo(30) },
      { status: 'INTERVIEW',     date: daysAgo(21) },
      { status: 'OFFER',         date: daysAgo(4)  },
    ],
    rejectionStage: null,
    followUpSent: false,
    followUpDate: null,
    daysSinceApply: 38,
    notes: 'Offer: $265k base + equity. Decision deadline June 13.',
  },
  // INTERVIEW
  {
    _id: 'app_plaid_001',
    userId: USER_ID,
    jobAnalysisId: 'ja_plaid_001',
    company: 'Plaid',
    role: 'Senior Backend Engineer — Core API',
    appliedDate: daysAgo(29),
    status: 'INTERVIEW',
    statusHistory: [
      { status: 'APPLIED',       date: daysAgo(29) },
      { status: 'PHONE_SCREEN',  date: daysAgo(20) },
      { status: 'INTERVIEW',     date: daysAgo(10) },
    ],
    rejectionStage: null,
    followUpSent: true,
    followUpDate: daysAgo(3),
    daysSinceApply: 29,
    notes: 'System design round went well. Final panel scheduled June 12.',
  },
  // PHONE_SCREEN
  {
    _id: 'app_robinhood_001',
    userId: USER_ID,
    jobAnalysisId: 'ja_robinhood_001',
    company: 'Robinhood',
    role: 'Senior Software Engineer — Clearing Systems',
    appliedDate: daysAgo(22),
    status: 'PHONE_SCREEN',
    statusHistory: [
      { status: 'APPLIED',       date: daysAgo(22) },
      { status: 'PHONE_SCREEN',  date: daysAgo(9)  },
    ],
    rejectionStage: null,
    followUpSent: false,
    followUpDate: null,
    daysSinceApply: 22,
    notes: 'Recruiter screen done. Waiting on technical screen scheduling.',
  },
  // APPLIED × 2 (freshly submitted)
  {
    _id: 'app_square_001',
    userId: USER_ID,
    jobAnalysisId: null,
    company: 'Square',
    role: 'Staff Engineer — Financial Services Platform',
    appliedDate: daysAgo(3),
    status: 'APPLIED',
    statusHistory: [
      { status: 'APPLIED', date: daysAgo(3) },
    ],
    rejectionStage: null,
    followUpSent: false,
    followUpDate: null,
    daysSinceApply: 3,
    notes: 'Applied via company portal. Strong match on payments experience.',
  },
  {
    _id: 'app_nerdwallet_001',
    userId: USER_ID,
    jobAnalysisId: null,
    company: 'NerdWallet',
    role: 'Senior Software Engineer — Data Platform',
    appliedDate: daysAgo(5),
    status: 'APPLIED',
    statusHistory: [
      { status: 'APPLIED', date: daysAgo(5) },
    ],
    rejectionStage: null,
    followUpSent: false,
    followUpDate: null,
    daysSinceApply: 5,
    notes: 'Referred by former colleague. Awaiting recruiter outreach.',
  },
  // NO_RESPONSE × 2
  {
    _id: 'app_affirm_001',
    userId: USER_ID,
    jobAnalysisId: 'ja_affirm_001',
    company: 'Affirm',
    role: 'Lead Engineer — Underwriting Platform',
    appliedDate: daysAgo(34),
    status: 'NO_RESPONSE',
    statusHistory: [
      { status: 'APPLIED',      date: daysAgo(34) },
      { status: 'NO_RESPONSE',  date: daysAgo(21) },
    ],
    rejectionStage: null,
    followUpSent: true,
    followUpDate: daysAgo(14),
    daysSinceApply: 34,
    notes: 'Follow-up sent. No reply. Likely ATS filtered.',
  },
  {
    _id: 'app_chime_001',
    userId: USER_ID,
    jobAnalysisId: null,
    company: 'Chime',
    role: 'Senior Engineer — Member Experience',
    appliedDate: daysAgo(25),
    status: 'NO_RESPONSE',
    statusHistory: [
      { status: 'APPLIED',      date: daysAgo(25) },
      { status: 'NO_RESPONSE',  date: daysAgo(14) },
    ],
    rejectionStage: null,
    followUpSent: false,
    followUpDate: null,
    daysSinceApply: 25,
    notes: 'Applied via LinkedIn. No acknowledgement received.',
  },
  // REJECTED × 3
  {
    _id: 'app_brex_001',
    userId: USER_ID,
    jobAnalysisId: 'ja_brex_001',
    company: 'Brex',
    role: 'Staff Engineer — Platform',
    appliedDate: daysAgo(41),
    status: 'REJECTED',
    statusHistory: [
      { status: 'APPLIED',    date: daysAgo(41) },
      { status: 'REJECTED',   date: daysAgo(34) },
    ],
    rejectionStage: 'NO_RESPONSE',
    followUpSent: false,
    followUpDate: null,
    daysSinceApply: 41,
    notes: 'Auto-rejection after 7 days. No human contact.',
  },
  {
    _id: 'app_coinbase_001',
    userId: USER_ID,
    jobAnalysisId: 'ja_coinbase_001',
    company: 'Coinbase',
    role: 'Senior Software Engineer — Blockchain Infrastructure',
    appliedDate: daysAgo(36),
    status: 'REJECTED',
    statusHistory: [
      { status: 'APPLIED',       date: daysAgo(36) },
      { status: 'PHONE_SCREEN',  date: daysAgo(28) },
      { status: 'REJECTED',      date: daysAgo(25) },
    ],
    rejectionStage: 'PHONE_SCREEN',
    followUpSent: false,
    followUpDate: null,
    daysSinceApply: 36,
    notes: 'Recruiter said "not a fit at this time." No specific feedback.',
  },
  {
    _id: 'app_mercury_001',
    userId: USER_ID,
    jobAnalysisId: null,
    company: 'Mercury',
    role: 'Senior Engineer — Platform Infrastructure',
    appliedDate: daysAgo(44),
    status: 'REJECTED',
    statusHistory: [
      { status: 'APPLIED',    date: daysAgo(44) },
      { status: 'REJECTED',   date: daysAgo(37) },
    ],
    rejectionStage: 'NO_RESPONSE',
    followUpSent: false,
    followUpDate: null,
    daysSinceApply: 44,
    notes: 'Rejection email within one week of applying. No screen.',
  },
];

// ─── Job Analyses (6 total) ───────────────────────────────────────────────────
const jobAnalyses = [
  {
    _id: 'ja_stripe_001',
    userId: USER_ID,
    analyzedAt: new Date(Date.now() - 38 * 86400000),
    jobTitle: 'Staff Engineer — Payments Infrastructure',
    company: 'Stripe',
    jobDescriptionRaw: `Stripe is looking for a Staff Engineer to join our Payments Infrastructure team.

You will own the technical direction of systems that process hundreds of billions of dollars annually. You will drive architecture decisions across multiple teams, mentor senior engineers, and partner with Product and Finance to define the long-term technical strategy for payment processing globally.

Requirements:
- 8+ years of software engineering experience
- Experience with high-throughput distributed systems (10k+ TPS)
- Deep knowledge of payment processing, acquiring, or issuing
- Proven track record of technical leadership across multiple teams
- Experience with Kafka, event sourcing, or CQRS patterns
- Strong system design and architecture skills
- PCI-DSS or SOC 2 compliance experience a plus

Keywords: technical strategy, architecture review, RFC process, distributed systems, payments, Kafka, Go, Ruby, API design`,
    matchScore: 91,
    strongMatches: ['Distributed Systems', 'Kafka', 'PCI-DSS', 'Node.js', 'System Design', 'Payments Infrastructure'],
    gaps: ['Go proficiency (they use Go heavily)', 'RFC authorship experience not explicit on resume'],
    missingKeywords: ['technical strategy', 'architecture review', 'RFC process', 'technical roadmap'],
    postingAge: 5,
    verdict: 'APPLY_NOW',
    coverLetterGenerated: true,
    coverLetterText: `Dear Stripe Hiring Team,

The intersection of high-throughput distributed systems and payment infrastructure has defined my engineering career. At PayPal, I led the rewrite of a fraud detection pipeline processing $4B in daily transaction volume, cutting P99 latency from 380ms to 42ms through async event sourcing with Kafka — the exact architecture patterns your team relies on at scale.

What draws me specifically to this Staff Engineer role is the scope of technical ownership. I've spent the last two years operating at the intersection of engineering execution and cross-team technical strategy, including driving our shift to event-driven architecture across four platform teams. I understand that Staff-level impact isn't measured in features shipped but in systems built to last and teams made stronger.

I'd welcome the opportunity to discuss how my experience in payment infrastructure and distributed systems design translates to what you're building at Stripe.`,
    coverLetterStrategy: 'Led with the most directly matching technical achievement (fraud pipeline / Kafka at scale), then addressed the Staff-level scope gap by naming cross-team architectural work explicitly.',
  },
  {
    _id: 'ja_plaid_001',
    userId: USER_ID,
    analyzedAt: new Date(Date.now() - 29 * 86400000),
    jobTitle: 'Senior Backend Engineer — Core API',
    company: 'Plaid',
    jobDescriptionRaw: `Plaid connects millions of people to their financial accounts. Our Core API team builds the foundational systems that power every Plaid product.

We're looking for a Senior Backend Engineer who can design and own critical API infrastructure, work closely with financial institution partners, and ensure reliability at scale.

Requirements:
- 5+ years backend engineering
- REST API design and GraphQL experience
- PostgreSQL or similar relational DB at scale
- Experience with financial data or open banking
- Node.js or Python preferred
- Reliability engineering mindset (SLOs, error budgets)

Keywords: API reliability, financial data, open banking, PostgreSQL, Node.js, GraphQL, SLOs`,
    matchScore: 78,
    strongMatches: ['Node.js', 'PostgreSQL', 'GraphQL', 'REST APIs', 'Financial Domain'],
    gaps: ['Open banking / data aggregation experience not on resume', 'SLO/error budget ownership not mentioned'],
    missingKeywords: ['open banking', 'data aggregation', 'SLOs', 'error budgets', 'reliability engineering'],
    postingAge: 3,
    verdict: 'APPLY_NOW',
    coverLetterGenerated: true,
    coverLetterText: `Dear Plaid Engineering Team,

Building reliable API infrastructure for financial data is a problem I know well. At Capital One, I designed and shipped a real-time credit decisioning API handling 50,000 requests per second with 99.98% uptime — an environment where every reliability gap has direct regulatory and customer consequences.

My backend experience maps closely to your Core API stack: Node.js, PostgreSQL at scale, GraphQL, and deep familiarity with financial data flows including PCI-DSS scoped systems. What I'm most eager to contribute is a reliability-first engineering mindset — I've owned SLO definitions and error budget policies for production services, and I understand the tradeoffs between velocity and financial-grade stability.

I'm excited about Plaid's mission to democratize access to financial data, and I'd love to discuss how I can contribute to the reliability of systems that millions of people depend on daily.`,
    coverLetterStrategy: 'Matched the reliability and financial data requirements directly, surfaced Capital One experience as the most relevant signal, added SLO ownership to address the explicit gap.',
  },
  {
    _id: 'ja_robinhood_001',
    userId: USER_ID,
    analyzedAt: new Date(Date.now() - 22 * 86400000),
    jobTitle: 'Senior Software Engineer — Clearing Systems',
    company: 'Robinhood',
    jobDescriptionRaw: `Robinhood is democratizing finance for all. Our Clearing Systems team owns the infrastructure that settles trades and manages positions across millions of accounts.

We need a Senior Software Engineer who can work in a high-stakes, regulated environment and build systems that are correct by design.

Requirements:
- 5+ years software engineering
- Experience with financial transaction processing
- Strong understanding of consistency and atomicity in distributed systems
- Python or Java preferred
- Experience with DTCC, NSCC, or brokerage clearing a plus

Keywords: clearing, settlement, trade processing, DTCC, atomicity, distributed transactions, Python`,
    matchScore: 69,
    strongMatches: ['Financial Transaction Processing', 'Distributed Systems', 'Node.js'],
    gaps: ['No brokerage/clearing domain experience', 'Python is preferred — Go and Node.js on resume but not Python'],
    missingKeywords: ['clearing', 'settlement', 'DTCC', 'trade processing', 'Python', 'atomicity'],
    postingAge: 8,
    verdict: 'APPLY_WITH_EDITS',
    coverLetterGenerated: false,
    coverLetterText: '',
    coverLetterStrategy: '',
  },
  {
    _id: 'ja_affirm_001',
    userId: USER_ID,
    analyzedAt: new Date(Date.now() - 34 * 86400000),
    jobTitle: 'Lead Engineer — Underwriting Platform',
    company: 'Affirm',
    jobDescriptionRaw: `Affirm is reinventing credit with buy-now-pay-later products trusted by 17 million consumers. Our Underwriting Platform team builds the decisioning systems that evaluate creditworthiness in real time.

We're looking for a Lead Engineer to own the technical direction of our credit decisioning pipeline.

Requirements:
- 6+ years engineering, 2+ years tech lead
- Experience with real-time decisioning systems
- ML pipeline integration experience
- Python, Scala, or Java
- Kafka or Flink for stream processing
- Financial services or consumer credit background preferred

Keywords: underwriting, credit decisioning, ML pipeline, Kafka, Flink, Python, Scala, real-time scoring`,
    matchScore: 65,
    strongMatches: ['Kafka', 'Real-time Systems', 'Financial Domain', 'Tech Lead Experience'],
    gaps: ['No ML pipeline experience on resume', 'Python and Scala not listed as primary skills', 'No consumer credit / underwriting domain'],
    missingKeywords: ['underwriting', 'credit decisioning', 'ML pipeline', 'Flink', 'Scala', 'real-time scoring'],
    postingAge: 6,
    verdict: 'APPLY_WITH_EDITS',
    coverLetterGenerated: false,
    coverLetterText: '',
    coverLetterStrategy: '',
  },
  {
    _id: 'ja_brex_001',
    userId: USER_ID,
    analyzedAt: new Date(Date.now() - 41 * 86400000),
    jobTitle: 'Staff Engineer — Platform',
    company: 'Brex',
    jobDescriptionRaw: `Brex builds financial products for startups and enterprises. Our Platform team owns the foundational infrastructure that all Brex products are built on.

Staff Engineers at Brex are technical leaders who drive the architecture of systems used by thousands of businesses managing billions in spend.

Requirements:
- 10+ years engineering experience
- Demonstrated technical strategy and architecture ownership
- Experience leading platform or infrastructure teams
- Elixir, Go, or Ruby
- Strong RFC and design doc culture
- Cross-functional influence with Product, Data, and Finance orgs

Keywords: technical strategy, platform architecture, RFC, Elixir, Go, cross-functional, staff engineer`,
    matchScore: 72,
    strongMatches: ['Platform Infrastructure', 'System Design', 'Financial Domain', 'Senior Leadership'],
    gaps: ['No Elixir experience', 'RFC authorship not mentioned', '"Technical strategy" not in resume', 'Cross-functional influence not demonstrated explicitly'],
    missingKeywords: ['technical strategy', 'architecture ownership', 'RFC', 'Elixir', 'cross-functional influence', 'platform strategy'],
    postingAge: 4,
    verdict: 'APPLY_WITH_EDITS',
    coverLetterGenerated: false,
    coverLetterText: '',
    coverLetterStrategy: '',
  },
  {
    _id: 'ja_coinbase_001',
    userId: USER_ID,
    analyzedAt: new Date(Date.now() - 36 * 86400000),
    jobTitle: 'Senior Software Engineer — Blockchain Infrastructure',
    company: 'Coinbase',
    jobDescriptionRaw: `Coinbase is building the world's most trusted crypto exchange. Our Blockchain Infrastructure team maintains integrations with 200+ blockchain networks and builds the node infrastructure powering Coinbase's trading products.

Requirements:
- 5+ years backend engineering
- Experience with blockchain protocols or node operations
- Go preferred
- Distributed systems at scale
- Deep understanding of consensus mechanisms, mempool, and transaction lifecycles

Keywords: blockchain, Go, consensus, mempool, node operations, crypto, distributed ledger`,
    matchScore: 54,
    strongMatches: ['Go', 'Distributed Systems', 'Node.js'],
    gaps: ['No blockchain or crypto domain experience', 'No consensus mechanism knowledge demonstrated', 'Mempool / transaction lifecycle gap'],
    missingKeywords: ['blockchain', 'consensus', 'mempool', 'node operations', 'distributed ledger', 'crypto'],
    postingAge: 12,
    verdict: 'APPLY_WITH_EDITS',
    coverLetterGenerated: false,
    coverLetterText: '',
    coverLetterStrategy: '',
  },
];

// ─── Rejection Pattern ────────────────────────────────────────────────────────
const rejectionPattern = {
  _id: `pattern_${USER_ID}`,
  userId: USER_ID,
  lastCalculated: new Date('2026-06-08T09:02:00Z'),
  totalApplications: 8,
  totalRejections: 5,
  rejectionBreakdown: {
    noResponse: 4,
    phoneScreen: 1,
    firstInterview: 0,
    finalRound: 0,
  },
  dominantPattern: 'PRE_INTERVIEW',
  patternConfidence: 'HIGH',
  insight: "5 of your 8 applications have not reached a phone screen. Of your 3 rejections, 2 were auto-rejected within 7 days (Brex, Mercury) and 1 was cut after a recruiter screen (Coinbase). This is a classic ATS and resume-framing problem — not a skills problem. Your background is strong, but the keywords 'technical strategy', 'architecture ownership', and 'RFC process' appear in every job description you've targeted and in none of your current resume bullets. Staff Engineer roles at this tier use these phrases as mandatory ATS filters.",
  recommendedActions: [
    "Add 'technical strategy' and 'architecture ownership' to at least 2 resume bullets in your PayPal section",
    "Add an RFC or design doc example: 'Authored RFC for async event pipeline adopted across 4 teams'",
    "Replace 'reduced latency by X%' framing with 'owned architecture decision that...' framing in 3 bullets",
    'Reorder skills section to lead with System Design, Distributed Systems, and Kafka — these appear first in every target JD',
    "Apply to Brex and Mercury again after resume update — their ATS re-evaluates new applications independently",
  ],
  missingKeywordsAcrossRejections: [
    'technical strategy',
    'architecture ownership',
    'RFC process',
    'cross-functional influence',
    'technical roadmap',
    'platform strategy',
    'Elixir',
    'Scala',
  ],
};

// ─── Weekly Briefing ──────────────────────────────────────────────────────────
const weeklyBriefing = {
  _id: `briefing_${USER_ID}_24`,
  userId: USER_ID,
  weekNumber: 24,
  generatedAt: new Date('2026-06-11T09:00:00Z'),
  applicationsSentThisWeek: 2,
  responseRate: 0.375,
  interviewRate: 0.25,
  industryAvgResponseRate: 0.15,
  momentumScore: 68,
  momentumTrend: 'UP',
  bestPerformingCategory: 'Stripe / Plaid tier (top-quartile fintech)',
  worstPerformingCategory: 'Crypto / Web3 adjacent roles',
  priorityActions: [
    {
      action: 'Update resume with RFC authorship and technical strategy framing before applying to any new Staff roles',
      impact: 'HIGH',
      dueDate: '2026-06-12',
    },
    {
      action: 'Send follow-up to Plaid recruiter — final panel is tomorrow, confirm logistics and panel format',
      impact: 'HIGH',
      dueDate: '2026-06-11',
    },
    {
      action: 'Evaluate Stripe offer — $265k base, decision deadline June 13. Request comp breakdown before deciding',
      impact: 'HIGH',
      dueDate: '2026-06-13',
    },
  ],
  pdfGenerated: false,
  pdfPath: null,
};

// ─── Seed ─────────────────────────────────────────────────────────────────────
async function seed() {
  await mongoose.connect(process.env.MONGODB_URI, { dbName: 'retrofitai' });
  console.log('Connected to MongoDB — retrofitai');

  // Career profile
  await CareerProfile.replaceOne({ _id: USER_ID }, careerProfile, { upsert: true });
  console.log('✓ career_profiles — demo-user');

  // Applications — delete all demo apps first so test-created extras don't linger
  await Application.deleteMany({ userId: USER_ID });
  await Application.insertMany(applications);
  console.log(`✓ applications — ${applications.length} documents`);

  // Job analyses — delete all demo analyses first
  await JobAnalysis.deleteMany({ userId: USER_ID });
  await JobAnalysis.insertMany(jobAnalyses);
  console.log(`✓ job_analyses — ${jobAnalyses.length} documents`);

  // Rejection pattern
  await RejectionPattern.replaceOne({ _id: rejectionPattern._id }, rejectionPattern, { upsert: true });
  console.log('✓ rejection_patterns — PRE_INTERVIEW / HIGH confidence');

  // Weekly briefing — delete ALL demo briefings first so stale week numbers don't shadow the seed
  await WeeklyBriefing.deleteMany({ userId: USER_ID });
  await WeeklyBriefing.create(weeklyBriefing);
  console.log(`✓ weekly_briefings — week ${weeklyBriefing.weekNumber}, momentum ${weeklyBriefing.momentumScore}`);

  console.log('\nSeed complete. Demo user ID: demo-user');
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
