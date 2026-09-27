import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
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

function drawBrand(page: PDFPage, bold: PDFFont, regular: PDFFont) {
  page.drawRectangle({ x: MARGIN, y: 755, width: 42, height: 42, color: BRAND });
  page.drawText('W', { x: 57, y: 766, size: 20, font: bold, color: WHITE });
  page.drawCircle({ x: 86, y: 794, size: 3, color: rgb(0.835, 0.953, 0.573) });
  page.drawText('WeDo Cleaning Services', {
    x: 102,
    y: 779,
    size: 17,
    font: bold,
    color: DARK,
  });
  page.drawText('Professional cleaning, thoughtfully done.', {
    x: 102,
    y: 763,
    size: 8.5,
    font: regular,
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
  let pageNumber = 1;
  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  drawBrand(page, bold, regular);

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
      drawBrand(page, bold, regular);
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
    drawBrand(page, bold, regular);
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
