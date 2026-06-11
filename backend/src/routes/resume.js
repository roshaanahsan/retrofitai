const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// ── Extract text from uploaded PDF / DOCX ────────────────────────────────────
router.post('/extract', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const { mimetype, originalname, buffer } = req.file;
  const ext = (originalname || '').split('.').pop()?.toLowerCase();

  try {
    let text = '';

    if (mimetype === 'application/pdf' || ext === 'pdf') {
      const data = await pdfParse(buffer);
      text = data.text || '';
    } else if (
      mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      ext === 'docx'
    ) {
      const result = await mammoth.extractRawText({ buffer });
      text = result.value || '';
    } else if (mimetype === 'application/msword' || ext === 'doc') {
      return res.status(422).json({ error: 'Legacy .doc format is not supported. Please convert to PDF or DOCX.' });
    } else {
      return res.status(422).json({ error: 'Unsupported file format. Please upload a PDF or DOCX.' });
    }

    text = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    res.json({ text });
  } catch (err) {
    console.error('Resume extraction error:', err);
    res.status(500).json({ error: 'Failed to extract text from file' });
  }
});

// ── Generate a professional PDF resume ───────────────────────────────────────
router.post('/generate', (req, res) => {
  const { name, role, experience, education, skills, workHistory, certifications, summary } = req.body;

  if (!name) return res.status(400).json({ error: 'Name is required' });

  const doc = new PDFDocument({ margin: 0, size: 'A4' });
  const safeName = (name || 'resume').replace(/[^a-zA-Z0-9_\- ]/g, '').replace(/\s+/g, '_');

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}_resume.pdf"`);
  doc.pipe(res);

  // ── Palette ────────────────────────────────────────────────────────────────
  const GREEN      = '#16A34A';
  const DARK_GREEN = '#15803D';
  const INK        = '#0F172A';
  const MUTED      = '#64748B';
  const RULE       = '#E2E8F0';
  const SIDEBAR_BG = '#F0FDF4';
  const PAGE_W     = 595.28;
  const PAGE_H     = 841.89;
  const SIDE_W     = 175;
  const MAIN_X     = SIDE_W + 24;
  const MAIN_W     = PAGE_W - MAIN_X - 32;

  // ── Sidebar background ─────────────────────────────────────────────────────
  doc.rect(0, 0, SIDE_W, PAGE_H).fill(SIDEBAR_BG);

  // ── Header accent strip ────────────────────────────────────────────────────
  doc.rect(0, 0, PAGE_W, 6).fill(GREEN);

  // ── Name block (main area, top) ────────────────────────────────────────────
  let mainY = 32;

  doc
    .fontSize(24)
    .font('Helvetica-Bold')
    .fillColor(INK)
    .text(name.toUpperCase(), MAIN_X, mainY, { width: MAIN_W, lineBreak: false });

  mainY += 30;

  if (role) {
    doc
      .fontSize(11)
      .font('Helvetica')
      .fillColor(GREEN)
      .text(role, MAIN_X, mainY, { width: MAIN_W });
    mainY += 16;
  }

  // thin rule under name
  mainY += 4;
  doc.moveTo(MAIN_X, mainY).lineTo(PAGE_W - 32, mainY).lineWidth(1).strokeColor(GREEN).stroke();
  mainY += 14;

  // ── Section helper (main column) ──────────────────────────────────────────
  function mainSection(title, content) {
    if (!content || !content.trim()) return;

    // Section heading
    doc
      .fontSize(8)
      .font('Helvetica-Bold')
      .fillColor(GREEN)
      .text(title.toUpperCase(), MAIN_X, mainY, { width: MAIN_W, characterSpacing: 1.2 });
    mainY += 12;
    doc.moveTo(MAIN_X, mainY).lineTo(PAGE_W - 32, mainY).lineWidth(0.5).strokeColor(RULE).stroke();
    mainY += 8;

    // Parse work-history blocks separated by blank lines
    const blocks = content.trim().split(/\n\n+/);
    blocks.forEach((block, bi) => {
      const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length === 0) return;

      // First line: detect "Company · Role · Period" pattern
      const header = lines[0];
      const isJobEntry = /·|—|-/.test(header) && lines.length > 1;

      if (isJobEntry) {
        // Split on · or — to get parts
        const parts = header.split(/\s*[·—]\s*/);
        const company = parts[0] || '';
        const jobRole = parts[1] || '';
        const period  = parts[2] || '';

        // Company + period on the same line
        doc.fontSize(10).font('Helvetica-Bold').fillColor(INK)
          .text(company, MAIN_X, mainY, { continued: !!period, width: MAIN_W });
        if (period) {
          doc.fontSize(9).font('Helvetica').fillColor(MUTED)
            .text(`  ${period}`, { align: 'right' });
        }
        mainY += 14;

        if (jobRole) {
          doc.fontSize(9.5).font('Helvetica-Oblique').fillColor(DARK_GREEN)
            .text(jobRole, MAIN_X, mainY, { width: MAIN_W });
          mainY += 13;
        }

        // Body lines as bullet points
        lines.slice(1).forEach(line => {
          const bullet = `•  ${line}`;
          const textH = doc.heightOfString(bullet, { width: MAIN_W - 8, fontSize: 9.5 });
          doc.fontSize(9.5).font('Helvetica').fillColor(INK)
            .text(bullet, MAIN_X + 4, mainY, { width: MAIN_W - 8, lineGap: 1.5 });
          mainY += textH + 3;
        });
      } else {
        // Plain paragraph
        const textH = doc.heightOfString(block.trim(), { width: MAIN_W, fontSize: 9.5 });
        doc.fontSize(9.5).font('Helvetica').fillColor(INK)
          .text(block.trim(), MAIN_X, mainY, { width: MAIN_W, lineGap: 2 });
        mainY += textH + 4;
      }

      if (bi < blocks.length - 1) mainY += 8;
    });

    mainY += 14;
  }

  // ── Sidebar section helper ─────────────────────────────────────────────────
  let sideY = 38;
  const SIDE_X  = 18;
  const SIDE_TW = SIDE_W - SIDE_X - 12;

  function sideSection(title, content) {
    if (!content || !content.trim()) return;

    doc.fontSize(7.5).font('Helvetica-Bold').fillColor(GREEN)
      .text(title.toUpperCase(), SIDE_X, sideY, { width: SIDE_TW, characterSpacing: 1 });
    sideY += 11;
    doc.moveTo(SIDE_X, sideY).lineTo(SIDE_W - 12, sideY).lineWidth(0.4).strokeColor('#BBF7D0').stroke();
    sideY += 7;

    const items = content.split(/[,·\n]/).map(s => s.trim()).filter(Boolean);
    items.forEach(item => {
      doc.fontSize(9).font('Helvetica').fillColor(INK)
        .text(`• ${item}`, SIDE_X, sideY, { width: SIDE_TW, lineGap: 1 });
      sideY += doc.heightOfString(`• ${item}`, { width: SIDE_TW, fontSize: 9 }) + 3;
    });

    sideY += 12;
  }

  // ── Sidebar: photo placeholder + name initial ──────────────────────────────
  const initials = name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const avatarCX = SIDE_W / 2;
  const avatarCY = 104;
  const avatarR  = 38;

  doc.circle(avatarCX, avatarCY, avatarR).fill(GREEN);
  doc.circle(avatarCX, avatarCY, avatarR - 2).fill(DARK_GREEN);
  doc.fontSize(20).font('Helvetica-Bold').fillColor('#FFFFFF')
    .text(initials, avatarCX - 14, avatarCY - 12, { width: 28, align: 'center' });

  sideY = avatarCY + avatarR + 20;

  // Sidebar content
  if (experience) sideSection('Experience', experience);
  if (education)  sideSection('Education', education);
  if (skills)     sideSection('Skills', skills);
  if (certifications) sideSection('Certifications', certifications);

  // ── Main column content ────────────────────────────────────────────────────
  if (summary)     mainSection('Professional Summary', summary);
  if (workHistory) mainSection('Work History', workHistory);

  // ── Footer ─────────────────────────────────────────────────────────────────
  doc.rect(0, PAGE_H - 22, PAGE_W, 22).fill(GREEN);
  doc.fontSize(7).font('Helvetica').fillColor('#FFFFFF')
    .text(
      'Generated by RetrofitAI · Career Strategy Agent · retrofitai.app',
      0, PAGE_H - 14,
      { align: 'center', width: PAGE_W }
    );

  doc.end();
});

module.exports = router;
