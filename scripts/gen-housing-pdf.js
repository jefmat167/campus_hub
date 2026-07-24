const PDFDocument = require('pdfkit');
const fs = require('fs');

const doc = new PDFDocument({ size: 'A4', margin: 56 });
doc.pipe(fs.createWriteStream('housing_flow_proposal.pdf'));

const COLORS = {
  title: '#1a1a1a',
  h1: '#0b4a8a',
  h2: '#14532d',
  body: '#222',
  muted: '#555',
  accent: '#b45309',
  rule: '#bbb',
};

function h1(text) {
  doc.moveDown(0.6);
  doc.fillColor(COLORS.h1).font('Helvetica-Bold').fontSize(16).text(text);
  doc.moveTo(doc.x, doc.y + 2).lineTo(doc.page.width - doc.page.margins.right, doc.y + 2).strokeColor(COLORS.rule).lineWidth(0.5).stroke();
  doc.moveDown(0.4);
}
function h2(text) {
  doc.moveDown(0.4);
  doc.fillColor(COLORS.h2).font('Helvetica-Bold').fontSize(12.5).text(text);
  doc.moveDown(0.2);
}
function p(text) {
  doc.fillColor(COLORS.body).font('Helvetica').fontSize(10.5).text(text, { align: 'left', lineGap: 2 });
  doc.moveDown(0.3);
}
function bullets(items) {
  doc.fillColor(COLORS.body).font('Helvetica').fontSize(10.5);
  for (const item of items) {
    doc.text('• ' + item, { indent: 10, lineGap: 2 });
  }
  doc.moveDown(0.3);
}
function code(text) {
  doc.moveDown(0.1);
  const startY = doc.y;
  doc.font('Courier').fontSize(10).fillColor(COLORS.body);
  const opts = { indent: 10, lineGap: 2 };
  const h = doc.heightOfString(text, opts) + 8;
  doc.rect(doc.page.margins.left, startY - 2, doc.page.width - doc.page.margins.left - doc.page.margins.right, h).fillAndStroke('#f4f4f4', '#e0e0e0');
  doc.fillColor(COLORS.body).text(text, doc.page.margins.left + 6, startY + 2, opts);
  doc.moveDown(0.6);
}
function table(headers, rows) {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const width = right - left;
  const colW = headers.map((_, i) => i === 0 ? width * 0.32 : width * (0.68 / (headers.length - 1)));

  doc.font('Helvetica-Bold').fontSize(10).fillColor('#fff');
  let y = doc.y;
  doc.rect(left, y, width, 18).fill(COLORS.h1);
  let x = left;
  headers.forEach((hd, i) => {
    doc.fillColor('#fff').text(hd, x + 6, y + 4, { width: colW[i] - 12 });
    x += colW[i];
  });
  y += 18;

  doc.font('Helvetica').fontSize(9.5).fillColor(COLORS.body);
  rows.forEach((row, rIdx) => {
    const heights = row.map((cell, i) => doc.heightOfString(cell, { width: colW[i] - 12 }));
    const rowH = Math.max(...heights) + 8;
    if (y + rowH > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      y = doc.y;
    }
    if (rIdx % 2 === 0) {
      doc.rect(left, y, width, rowH).fill('#f9f9f9');
    }
    doc.fillColor(COLORS.body);
    x = left;
    row.forEach((cell, i) => {
      doc.text(cell, x + 6, y + 4, { width: colW[i] - 12 });
      x += colW[i];
    });
    doc.rect(left, y, width, rowH).strokeColor('#e0e0e0').lineWidth(0.5).stroke();
    y += rowH;
  });
  doc.y = y + 6;
}

// ---------- Title ----------
doc.fillColor(COLORS.title).font('Helvetica-Bold').fontSize(22).text('Housing Module — Flow Proposal');
doc.fillColor(COLORS.muted).font('Helvetica').fontSize(11).text('Peer-to-peer apartment handoff listings for Campus Hub');
doc.moveDown(0.2);
doc.fillColor(COLORS.muted).fontSize(9.5).text('Draft for team review');
doc.moveDown(0.6);

// ---------- Context ----------
h1('Context & Intent');
p('This is NOT a rental marketplace. It is a peer-to-peer listings board where outgoing students (packing out) post awareness of available apartments so other students at the same university can check them out and contact the actual landlord directly.');
bullets([
  'No payments on the platform.',
  'No applications, no escrow, no bookings.',
  'The platform adds value through discovery, peer trust signals, and a clean way to connect an interested student with the landlord\u2019s contact.',
  'The poster is the outgoing student, NOT the landlord.',
]);

// ---------- 1. Mental model ----------
h1('1. Rename the Mental Model');
p('The current entity is landlord-flavored (landlordId, landlordName, landlordPhone). That does not match reality — the user posting is a peer, not the landlord. Landlord details are NEVER exposed on the platform; the poster bridges the tenant to the landlord offline.');
h2('Proposed fields');
bullets([
  'landlordId  \u2192  posterId  (the student packing out)',
  'REMOVE landlordName, landlordPhone, landlordWhatsapp from the listing — not stored, not displayed',
  'Add posterRelationship enum: CURRENT_TENANT / PAST_TENANT / KNOWS_LANDLORD — signals how credible the poster\u2019s landlord access is',
]);

// ---------- 2. Lifecycle ----------
h1('2. Simpler Lifecycle');
p('No RESERVED or platform-confirmed RENTED. We never see the money.');
code('DRAFT \u2192 AVAILABLE \u2192 (PAUSED) \u2192 TAKEN / EXPIRED / DELETED');
bullets([
  'TAKEN — poster marks it when someone got the place (self-reported, fine, no money involved).',
  'EXPIRED — auto-flip after N days (30\u201360) with a "still available?" nudge to the poster. Stale listings are the #1 killer of this kind of board.',
]);

// ---------- 3. Inquiry flow ----------
h1('3. Inquiry = Chat With the Poster');
p('Do not force structured applications — they don\u2019t fit a peer handoff. The poster is the single point of contact; landlord details are never shared on the platform.');
bullets([
  'Browse — photos, price, area, description are visible within the university. No landlord info anywhere.',
  '"I\u2019m interested" button — opens a HOUSING_INQUIRY chat with the poster. The poster decides how and whether to bridge the tenant to the landlord offline.',
  'Bumps inquiryCount on inquiry creation (fixes the currently-dead counter).',
]);
h2('Why keep landlord contact fully off-platform?');
bullets([
  'Reduces the platform\u2019s exposure to scams and landlord-impersonation issues.',
  'Puts social accountability on the poster — they are the gatekeeper for a place they claim to know.',
  'Nothing sensitive to scrape; no reveal-gating logic to build or maintain.',
  'Simpler mental model for students: "talk to the student who posted it."',
]);

// ---------- 4. Trust ----------
h1('4. Trust Signals Instead of Verification');
p('Since no money moves and landlord details are off-platform, the main abuse risk is fake listings from a poster with no real landlord access. Defenses are peer signals + reactive moderation.');
bullets([
  'University scoping (already in place) — only same-uni students see it.',
  'Poster badge — show poster\u2019s verificationTier, year of study, faculty.',
  'posterRelationship disclosure — shown prominently so tenants know if the poster is the current tenant, a past tenant, or just knows the landlord.',
  'Report button — tenants flag suspicious listings; auto-hide after N reports pending mod review.',
  'Drop isVerified entirely, OR repurpose it as "mod-reviewed after report".',
]);

// ---------- 5. Code changes ----------
h1('5. Concrete Code Changes');
table(
  ['Change', 'Why'],
  [
    ['Rename landlordId \u2192 posterId (migration + entity + DTOs + services)', 'Accurate semantics'],
    ['REMOVE landlord contact fields from the listing entity and DTOs', 'Landlord details never exposed on the platform'],
    ['Add posterRelationship enum field', 'Credibility signal for tenants'],
    ['Wire incrementInquiry on inquiry creation (or first message in a HOUSING_INQUIRY convo)', 'Fix dead counter'],
    ['Add expiresAt + background job to auto-expire and ping poster', 'Stale-listing killer'],
    ['Rename mark-rented \u2192 mark-taken; optional "who got it" free-text', 'Honest about self-report'],
    ['getMyListings includes all statuses; getListing shows non-AVAILABLE to owner', 'Existing bugs'],
    ['videoUrl column: jsonb \u2192 varchar', 'Existing schema bug'],
    ['Drop admin verification plans; add report endpoint instead', 'Matches trust model'],
    ['Drop TierAmountLimit thoughts on housing', 'No money flows'],
  ],
);

// ---------- 6. Tier ----------
h1('6. Tier Requirements (Simplified)');
table(
  ['Action', 'Proposed Tier', 'Current'],
  [
    ['Post a housing listing', 'TIER_0 (phone + email)', 'TIER_1 — overkill for peer info-sharing'],
    ['Browse housing', 'TIER_0', 'TIER_0'],
    ['Start inquiry chat with poster', 'TIER_0', 'n/a'],
  ],
);

// ---------- Open questions ----------
h1('Open Questions for the Team');
bullets([
  'Poster tier to list — drop to TIER_0, or keep at TIER_1 for friction against spam?',
  'Expiry window — fixed 30 days, fixed 60 days, or let the poster pick?',
  'Report thresholds — how many reports auto-hide a listing before a mod reviews it?',
  'Should we cap the number of active listings per poster to further reduce fake-listing spam?',
]);

// ---------- Out of scope ----------
h1('Explicitly Out of Scope');
bullets([
  'Online rent payment / deposit / escrow.',
  'Structured rental applications.',
  'Viewing scheduling through the platform.',
  'Landlord accounts on the platform.',
  'Sharing landlord contact details with interested students in any form.',
  'Roommate matching (separate sub-module; not covered by this proposal).',
]);

doc.end();
console.log('PDF written: housing_flow_proposal.pdf');
