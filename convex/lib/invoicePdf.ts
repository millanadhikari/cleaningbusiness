import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from 'pdf-lib';

export type InvoiceLineItem = {
  description: string;
  quantity: number;
  unitAmountCents: number;
  amountCents: number;
};

export type InvoicePdfInput = {
  invoiceNumber: string;
  generatedAt: number;
  customerName: string;
  customerEmail?: string;
  customerAddress: string;
  serviceName: string;
  scheduledDate: string;
  items: InvoiceLineItem[];
  totalCents: number;
  paidCents: number;
  balanceDueCents: number;
  refundDueCents: number;
};

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BRAND = rgb(0, 0.486, 0.439);
const DARK = rgb(0.078, 0.184, 0.212);
const TEXT = rgb(0.137, 0.239, 0.227);
const MUTED = rgb(0.39, 0.48, 0.455);
const BORDER = rgb(0.855, 0.91, 0.886);
const PALE = rgb(0.953, 0.976, 0.965);
const WHITE = rgb(1, 1, 1);
const BRAND_MARK_PNG =
  'data:image/png;base64,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';

function money(cents: number) {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
  }).format(cents / 100);
}

function date(value: number | string) {
  const parsed =
    typeof value === 'number'
      ? new Date(value)
      : new Date(`${value}T12:00:00.000Z`);
  return new Intl.DateTimeFormat('en-AU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Australia/Sydney',
  }).format(parsed);
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

function drawRight(
  page: PDFPage,
  value: string,
  x: number,
  y: number,
  width: number,
  font: PDFFont,
  size: number,
  color = TEXT,
) {
  page.drawText(value, {
    x: x + width - font.widthOfTextAtSize(value, size),
    y,
    size,
    font,
    color,
  });
}

function drawBrand(page: PDFPage, mark: PDFImage, bold: PDFFont) {
  page.drawImage(mark, { x: MARGIN, y: 750, width: 48, height: 51.2 });
  const wordmarkX = 104;
  const wordmarkY = 777;
  page.drawText('We', {
    x: wordmarkX,
    y: wordmarkY,
    size: 20,
    font: bold,
    color: DARK,
  });
  page.drawText('Do', {
    x: wordmarkX + bold.widthOfTextAtSize('We', 20),
    y: wordmarkY,
    size: 20,
    font: bold,
    color: BRAND,
  });
  page.drawText('CLEANING SERVICES', {
    x: wordmarkX,
    y: 764,
    size: 6.2,
    font: bold,
    color: MUTED,
  });
}

function drawFooter(page: PDFPage, regular: PDFFont, pageNumber: number) {
  page.drawLine({
    start: { x: MARGIN, y: 42 },
    end: { x: PAGE_WIDTH - MARGIN, y: 42 },
    thickness: 0.7,
    color: BORDER,
  });
  page.drawText('www.wedocleaning.com.au  |  +61 401356937  |  ABN 92 299 193 092', {
    x: MARGIN,
    y: 25,
    size: 7.5,
    font: regular,
    color: MUTED,
  });
  drawRight(page, `Page ${pageNumber}`, MARGIN, 25, CONTENT_WIDTH, regular, 7.5, MUTED);
}

function drawTableHeader(page: PDFPage, bold: PDFFont, y: number) {
  page.drawRectangle({
    x: MARGIN,
    y: y - 24,
    width: CONTENT_WIDTH,
    height: 24,
    color: DARK,
  });
  const labels = [
    { value: 'QTY', x: 58 },
    { value: 'ITEM', x: 95 },
    { value: 'PRICE', x: 385 },
    { value: 'AMOUNT', x: 472 },
  ];
  for (const label of labels) {
    page.drawText(label.value, {
      x: label.x,
      y: y - 16,
      size: 8.5,
      font: bold,
      color: WHITE,
    });
  }
  return y - 24;
}

export async function createInvoicePdf(input: InvoicePdfInput) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const brandMark = await pdf.embedPng(BRAND_MARK_PNG);
  let pageNumber = 1;
  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  drawBrand(page, brandMark, bold);

  page.drawText('INVOICE', { x: MARGIN, y: 707, size: 30, font: bold, color: DARK });
  const status =
    input.refundDueCents > 0
      ? 'OVERPAID'
      : input.balanceDueCents === 0
        ? 'PAID'
        : input.paidCents > 0
          ? 'PART PAID'
          : 'UNPAID';
  const statusWidth = bold.widthOfTextAtSize(status, 8.5) + 20;
  page.drawRectangle({
    x: PAGE_WIDTH - MARGIN - statusWidth,
    y: 714,
    width: statusWidth,
    height: 22,
    color: PALE,
    borderColor: BORDER,
    borderWidth: 0.7,
  });
  page.drawText(status, {
    x: PAGE_WIDTH - MARGIN - statusWidth + 10,
    y: 721,
    size: 8.5,
    font: bold,
    color: BRAND,
  });

  page.drawText('FROM', { x: MARGIN, y: 670, size: 8, font: bold, color: BRAND });
  const companyLines = [
    'WeDo Cleaning Services',
    'www.wedocleaning.com.au',
    'wedocleaning99@gmail.com',
    '+61 401356937',
    'ABN 92 299 193 092',
  ];
  companyLines.forEach((line, index) =>
    page.drawText(line, {
      x: MARGIN,
      y: 650 - index * 15,
      size: index === 0 ? 10.5 : 9,
      font: index === 0 ? bold : regular,
      color: TEXT,
    }),
  );

  page.drawText('INVOICE DETAILS', { x: 340, y: 670, size: 8, font: bold, color: BRAND });
  const meta = [
    ['Invoice #', input.invoiceNumber],
    ['Invoice date', date(input.generatedAt)],
    ['Service date', date(input.scheduledDate)],
  ];
  meta.forEach(([label, value], index) => {
    const y = 650 - index * 18;
    page.drawText(label, { x: 340, y, size: 9, font: regular, color: MUTED });
    drawRight(page, value, 415, y, 132, bold, 9, TEXT);
  });

  page.drawRectangle({ x: MARGIN, y: 500, width: CONTENT_WIDTH, height: 78, color: PALE });
  page.drawText('BILL TO', { x: 62, y: 556, size: 8, font: bold, color: BRAND });
  page.drawText(input.customerName, { x: 62, y: 536, size: 11, font: bold, color: DARK });
  const addressLines = wrapText(input.customerAddress, regular, 9, 285).slice(0, 2);
  addressLines.forEach((line, index) =>
    page.drawText(line, { x: 62, y: 520 - index * 12, size: 9, font: regular, color: TEXT }),
  );
  if (input.customerEmail) {
    drawRight(page, input.customerEmail, 340, 536, 193, regular, 9, MUTED);
  }
  drawRight(page, input.serviceName, 340, 518, 193, bold, 9, TEXT);

  let y = drawTableHeader(page, bold, 478);
  const columns = { qtyX: 58, itemX: 95, itemWidth: 270, priceX: 375, priceWidth: 75, amountX: 458, amountWidth: 77 };

  for (const item of input.items) {
    const descriptionLines = wrapText(item.description, regular, 9, columns.itemWidth);
    const rowHeight = Math.max(34, descriptionLines.length * 12 + 16);
    if (y - rowHeight < 150) {
      drawFooter(page, regular, pageNumber);
      pageNumber += 1;
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      drawBrand(page, brandMark, bold);
      page.drawText(`Invoice ${input.invoiceNumber} - continued`, {
        x: MARGIN,
        y: 720,
        size: 14,
        font: bold,
        color: DARK,
      });
      y = drawTableHeader(page, bold, 690);
    }
    page.drawRectangle({
      x: MARGIN,
      y: y - rowHeight,
      width: CONTENT_WIDTH,
      height: rowHeight,
      borderColor: BORDER,
      borderWidth: 0.7,
    });
    page.drawText(String(item.quantity), {
      x: columns.qtyX,
      y: y - 21,
      size: 9,
      font: regular,
      color: TEXT,
    });
    descriptionLines.forEach((line, index) =>
      page.drawText(line, {
        x: columns.itemX,
        y: y - 21 - index * 12,
        size: 9,
        font: regular,
        color: TEXT,
      }),
    );
    drawRight(page, money(item.unitAmountCents), columns.priceX, y - 21, columns.priceWidth, regular, 9);
    drawRight(page, money(item.amountCents), columns.amountX, y - 21, columns.amountWidth, bold, 9);
    y -= rowHeight;
  }

  if (y < 205) {
    drawFooter(page, regular, pageNumber);
    pageNumber += 1;
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    drawBrand(page, brandMark, bold);
    y = 690;
  }

  const totalRows: Array<[string, string, boolean]> = [
    ['Total', money(input.totalCents), true],
    ['Paid', money(input.paidCents), false],
    ['Balance due', money(input.balanceDueCents), true],
  ];
  if (input.refundDueCents > 0) {
    totalRows.push(['Refund due', money(input.refundDueCents), true]);
  }
  const totalX = 342;
  totalRows.forEach(([label, value, strong], index) => {
    const rowY = y - 30 - index * 27;
    if (index === 0) {
      page.drawLine({
        start: { x: totalX, y: y - 5 },
        end: { x: PAGE_WIDTH - MARGIN, y: y - 5 },
        thickness: 1,
        color: DARK,
      });
    }
    page.drawText(label, {
      x: totalX,
      y: rowY,
      size: strong ? 10 : 9.5,
      font: strong ? bold : regular,
      color: strong ? DARK : MUTED,
    });
    drawRight(page, value, 435, rowY, 112, strong ? bold : regular, strong ? 10 : 9.5, strong ? DARK : TEXT);
  });

  const thankYouY = Math.max(78, y - totalRows.length * 27 - 52);
  page.drawText('Thank you for your business.', {
    x: MARGIN,
    y: thankYouY,
    size: 11,
    font: bold,
    color: DARK,
  });
  page.drawText('Please keep this invoice for your records.', {
    x: MARGIN,
    y: thankYouY - 16,
    size: 8.5,
    font: regular,
    color: MUTED,
  });
  drawFooter(page, regular, pageNumber);

  pdf.setTitle(`Invoice ${input.invoiceNumber}`);
  pdf.setAuthor('WeDo Cleaning Services');
  pdf.setSubject(`${input.serviceName} invoice`);
  pdf.setCreationDate(new Date(input.generatedAt));
  return pdf.save();
}
