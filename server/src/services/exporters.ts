import { TranscriptionJob } from '../models/types.js';
import { Document, Packer, Paragraph, HeadingLevel, TextRun, AlignmentType, Table, TableRow, TableCell, WidthType, BorderStyle } from 'docx';
import ExcelJS from 'exceljs';

function pad(n: number, width = 2) {
  const s = String(n);
  return s.length >= width ? s : '0'.repeat(width - s.length) + s;
}

function msToTag(ms: number, showHours: boolean) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (showHours || h > 0) return `[${pad(h)}:${pad(m)}:${pad(s)}]`;
  return `[${pad(m)}:${pad(s)}]`;
}

function msToSrt(ms: number) {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const millis = Math.floor(ms % 1000);
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(millis, 3)}`;
}

export function buildJson(job: TranscriptionJob) {
  const res = job.result!;
  return {
    id: job.id,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    audio: {
      originalName: job.file.originalName,
      size: job.file.size,
      mimetype: job.file.mimetype,
      url: job.file.webUrl || null,
      durationMs: res.durationMs,
    },
    language: res.language,
    speakers: res.speakers,
    segments: res.segments.map((s) => ({
      id: s.id,
      start: s.start,
      end: s.end,
      speaker: s.speaker,
      text: s.text,
      words: s.words,
    })),
    provider: res.provider,
  };
}

export function buildTxtText(job: TranscriptionJob) {
  const res = job.result!;
  const showHours = res.durationMs >= 3600000;
  const lines: string[] = [];
  lines.push('TRANSKRIP WAWANCARA');
  lines.push('=====================================');
  lines.push(`Judul: ${job.file.originalName}`);
  lines.push(`Tanggal: ${new Date(job.createdAt).toLocaleDateString('id-ID')}`);
  const totalSec = Math.floor(res.durationMs / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  lines.push(`Durasi: ${pad(h)}:${pad(m)}:${pad(s)}`);
  lines.push(`Jumlah Pembicara: ${res.speakers.length}`);
  lines.push('');
  for (const seg of res.segments) {
    const ts = msToTag(seg.start, showHours);
    lines.push(`${ts} ${seg.speaker}: ${seg.text}`);
    lines.push('');
  }
  return lines.join('\n');
}

export function buildSrtText(job: TranscriptionJob) {
  const res = job.result!;
  let idx = 1;
  const parts: string[] = [];
  for (const seg of res.segments) {
    const start = msToSrt(seg.start);
    const end = msToSrt(seg.end);
    parts.push(String(idx++));
    parts.push(`${start} --> ${end}`);
    parts.push(`${seg.speaker}: ${seg.text}`);
    parts.push('');
  }
  return parts.join('\n');
}

export async function buildDocxBuffer(job: TranscriptionJob): Promise<Buffer> {
  const res = job.result!;
  const totalSec = Math.floor(res.durationMs / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const showHours = res.durationMs >= 3600000;

  const headerParas = [
    new Paragraph({
      text: 'TRANSKRIP WAWANCARA',
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({ text: ' ' }),
    new Paragraph({ text: `Judul: ${job.file.originalName}` }),
    new Paragraph({ text: `Tanggal: ${new Date(job.createdAt).toLocaleDateString('id-ID')}` }),
    new Paragraph({ text: `Durasi: ${pad(h)}:${pad(m)}:${pad(s)}` }),
    new Paragraph({ text: `Jumlah Pembicara: ${res.speakers.length}` }),
    new Paragraph({ text: ' ' }),
  ];

  const tableRows: TableRow[] = [];
  tableRows.push(
    new TableRow({
      children: [
        new TableCell({ children: [new Paragraph({ text: 'Waktu', bold: true })] }),
        new TableCell({ children: [new Paragraph({ text: 'Pembicara', bold: true })] }),
        new TableCell({ children: [new Paragraph({ text: 'Teks', bold: true })] }),
      ],
    })
  );

  for (const seg of res.segments) {
    tableRows.push(
      new TableRow({
        children: [
          new TableCell({ children: [new Paragraph(msToTag(seg.start, showHours))] }),
          new TableCell({ children: [new Paragraph(seg.speaker)] }),
          new TableCell({ children: [new Paragraph(seg.text)] }),
        ],
      })
    );
  }

  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: tableRows,
  });

  const doc = new Document({
    sections: [
      {
        children: [...headerParas, table],
      },
    ],
  });

  const buf = await Packer.toBuffer(doc);
  return Buffer.from(buf);
}

export async function buildXlsxBuffer(job: TranscriptionJob): Promise<Buffer> {
  const res = job.result!;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Transcript');
  ws.columns = [
    { header: 'Waktu', key: 'time', width: 12 },
    { header: 'Pembicara', key: 'speaker', width: 20 },
    { header: 'Teks', key: 'text', width: 100 },
  ];
  const showHours = res.durationMs >= 3600000;
  for (const seg of res.segments) {
    ws.addRow({ time: msToTag(seg.start, showHours), speaker: seg.speaker, text: seg.text });
  }
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

// PDF Export (A4, simple academic formatting). Password protection not yet implemented.
export async function buildPdfBuffer(job: TranscriptionJob): Promise<Buffer> {
  const PDFDocument = (await import('pdfkit')).default;
  const res = job.result!;
  const showHours = res.durationMs >= 3600000;

  const doc = new PDFDocument({ size: 'A4', margins: { top: 72, bottom: 72, left: 72, right: 72 } });
  const chunks: Buffer[] = [];
  return await new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header
    doc.fontSize(16).text('TRANSKRIP WAWANCARA', { align: 'center' });
    doc.moveDown(1);
    doc.fontSize(12);
    const totalSec = Math.floor(res.durationMs / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    doc.text(`Judul: ${job.file.originalName}`);
    doc.text(`Tanggal: ${new Date(job.createdAt).toLocaleDateString('id-ID')}`);
    doc.text(`Durasi: ${pad(h)}:${pad(m)}:${pad(s)}`);
    doc.text(`Jumlah Pembicara: ${res.speakers.length}`);
    doc.moveDown(1);

    // Body
    for (const seg of res.segments) {
      const ts = msToTag(seg.start, showHours);
      doc.font('Times-Roman').fontSize(12).text(`${ts} ${seg.speaker}:`, { continued: true, underline: false, bold: false });
      doc.text(` ${seg.text}`);
      doc.moveDown(0.5);
    }

    // Footer page numbers
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(i);
      doc.fontSize(9).text(`${i + 1} / ${range.count}`, 0, doc.page.height - 50, { align: 'center' });
    }

    doc.end();
  });
}