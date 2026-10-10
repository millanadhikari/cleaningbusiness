import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";
import { BRAND_MARK_PNG } from "./invoicePdf";

export type QuotePdfInput = {
  reference: string;
  generatedAt: number;
  createdAt: number;
  customerName: string;
  customerEmail?: string;
  customerPhone: string;
  customerAddress: string;
  serviceName: string;
  preferredDate?: string;
  preferredTime?: string;
  propertyType?: string;
  bedrooms?: number;
  bathrooms?: number;
  answers: Array<{
    key: string;
    label: string;
    value: number | boolean | string | string[];
  }>;
  notes?: string;
  items: Array<{ description: string; amountCents: number }>;
  totalCents: number;
};

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 42;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BRAND = rgb(0, 0.486, 0.439);
const DARK = rgb(0.078, 0.184, 0.212);
const TEXT = rgb(0.137, 0.239, 0.227);
const MUTED = rgb(0.39, 0.48, 0.455);
const BORDER = rgb(0.855, 0.91, 0.886);
const PALE = rgb(0.953, 0.976, 0.965);
const WHITE = rgb(1, 1, 1);
const DAY_MS = 24 * 60 * 60 * 1000;

function safeText(value: string) {
  return value
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^ -~]/g, "?");
}

function money(cents: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(cents / 100);
}

function date(value: number | string) {
  const parsed =
    typeof value === "number"
      ? new Date(value)
      : new Date(`${value}T12:00:00.000Z`);
  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Australia/Sydney",
  }).format(parsed);
}

function time(value?: string) {
  if (!value) return "To be arranged";
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return value;
  const suffix = hours >= 12 ? "pm" : "am";
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function answer(value: number | boolean | string | string[]) {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

export function calculateQuoteExpiry(generatedAt: number, preferredDate?: string) {
  const sevenDaysAfterGeneration = generatedAt + 7 * DAY_MS;
  if (!preferredDate || !/^\d{4}-\d{2}-\d{2}$/.test(preferredDate)) {
    return sevenDaysAfterGeneration;
  }
  const preferredAtNoonUtc = new Date(`${preferredDate}T12:00:00.000Z`).getTime();
  if (Number.isNaN(preferredAtNoonUtc)) return sevenDaysAfterGeneration;
  const threeDaysBeforeService = preferredAtNoonUtc - 3 * DAY_MS;
  return Math.max(
    generatedAt,
    Math.min(sevenDaysAfterGeneration, threeDaysBeforeService),
  );
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const words = safeText(text).trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
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
  return lines.length ? lines : [""];
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
  const safeValue = safeText(value);
  page.drawText(safeValue, {
    x: x + width - font.widthOfTextAtSize(safeValue, size),
    y,
    size,
    font,
    color,
  });
}

function drawBrand(page: PDFPage, mark: PDFImage, bold: PDFFont) {
  page.drawImage(mark, { x: MARGIN, y: 756, width: 42, height: 44.8 });
  const wordmarkX = 91;
  page.drawText("We", { x: wordmarkX, y: 780, size: 19, font: bold, color: DARK });
  page.drawText("Do", {
    x: wordmarkX + bold.widthOfTextAtSize("We", 19),
    y: 780,
    size: 19,
    font: bold,
    color: BRAND,
  });
  page.drawText("CLEANING SERVICES", {
    x: wordmarkX,
    y: 768,
    size: 6,
    font: bold,
    color: MUTED,
  });
}

function drawFooter(page: PDFPage, regular: PDFFont) {
  page.drawLine({
    start: { x: MARGIN, y: 39 },
    end: { x: PAGE_WIDTH - MARGIN, y: 39 },
    thickness: 0.7,
    color: BORDER,
  });
  page.drawText(
    "www.wedocleaning.com.au  |  +61 401 356 937  |  ABN 92 299 193 092",
    { x: MARGIN, y: 23, size: 7.2, font: regular, color: MUTED },
  );
  drawRight(page, "Quote", MARGIN, 23, CONTENT_WIDTH, regular, 7.2, MUTED);
}

type Density = {
  scale: number;
  itemRows: Array<{ lines: string[]; height: number }>;
  answerRows: Array<{ left: string[]; right: string[]; height: number }>;
  noteLines: string[];
  requiredHeight: number;
};

function layoutDensity(
  input: QuotePdfInput,
  regular: PDFFont,
  scale: number,
): Density {
  const itemSize = Math.max(6, 8.2 * scale);
  const itemLineHeight = Math.max(7.2, 9.5 * scale);
  const itemRows = input.items.map((item) => {
    const lines = wrapText(item.description, regular, itemSize, 350);
    return { lines, height: Math.max(16, lines.length * itemLineHeight + 7) };
  });
  const answerSize = Math.max(5.8, 7.6 * scale);
  const answerLineHeight = Math.max(7, 9 * scale);
  const formattedAnswers = input.answers.map((item) =>
    wrapText(
      `${item.label}: ${answer(item.value)}`,
      regular,
      answerSize,
      CONTENT_WIDTH / 2 - 19,
    ),
  );
  const answerRows: Density["answerRows"] = [];
  for (let index = 0; index < formattedAnswers.length; index += 2) {
    const left = formattedAnswers[index];
    const right = formattedAnswers[index + 1] ?? [];
    answerRows.push({
      left,
      right,
      height: Math.max(
        13,
        Math.max(left.length, right.length) * answerLineHeight + 4,
      ),
    });
  }
  const noteLines = input.notes
    ? wrapText(
        input.notes,
        regular,
        Math.max(5.8, 7.5 * scale),
        CONTENT_WIDTH - 18,
      )
    : [];
  const fixedHeight =
    20 +
    20 +
    32 +
    (input.answers.length ? 18 : 0) +
    (noteLines.length ? 17 : 0) +
    48;
  const requiredHeight =
    fixedHeight +
    itemRows.reduce((sum, row) => sum + row.height, 0) +
    answerRows.reduce((sum, row) => sum + row.height, 0) +
    noteLines.length * Math.max(7, 8.8 * scale) +
    (noteLines.length ? 9 : 0);
  return { scale, itemRows, answerRows, noteLines, requiredHeight };
}

export async function createQuotePdf(input: QuotePdfInput) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const brandMark = await pdf.embedPng(BRAND_MARK_PNG);
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const expiresAt = calculateQuoteExpiry(input.generatedAt, input.preferredDate);

  drawBrand(page, brandMark, bold);
  page.drawText("QUOTE", { x: 338, y: 776, size: 24, font: bold, color: DARK });
  const meta = [
    ["Reference", input.reference],
    ["Quote date", date(input.generatedAt)],
    ["Valid until", date(expiresAt)],
  ];
  meta.forEach(([label, value], index) => {
    const metaY = 758 - index * 15;
    page.drawText(label, {
      x: 338,
      y: metaY,
      size: 7.8,
      font: regular,
      color: MUTED,
    });
    drawRight(page, value, 410, metaY, 143, bold, 8, TEXT);
  });

  const panelY = 614;
  const panelHeight = 100;
  page.drawRectangle({
    x: MARGIN,
    y: panelY,
    width: CONTENT_WIDTH,
    height: panelHeight,
    color: PALE,
  });
  page.drawLine({
    start: { x: 296, y: panelY + 12 },
    end: { x: 296, y: panelY + panelHeight - 12 },
    thickness: 0.7,
    color: BORDER,
  });
  page.drawText("QUOTE FOR", {
    x: 55,
    y: 695,
    size: 7.5,
    font: bold,
    color: BRAND,
  });
  page.drawText(safeText(input.customerName), {
    x: 55,
    y: 678,
    size: 10,
    font: bold,
    color: DARK,
  });
  const customerLines = [
    ...wrapText(input.customerAddress, regular, 7.5, 220).slice(0, 2),
    input.customerPhone,
    ...(input.customerEmail ? [input.customerEmail] : []),
  ].slice(0, 5);
  customerLines.forEach((line, index) =>
    page.drawText(safeText(line), {
      x: 55,
      y: 663 - index * 10.5,
      size: 7.5,
      font: regular,
      color: index >= 3 ? MUTED : TEXT,
    }),
  );

  page.drawText("SERVICE & SCHEDULE", {
    x: 310,
    y: 695,
    size: 7.5,
    font: bold,
    color: BRAND,
  });
  const propertySummary = [
    input.propertyType || "Property not specified",
    input.bedrooms !== undefined
      ? `${input.bedrooms} bedroom${input.bedrooms === 1 ? "" : "s"}`
      : "",
    input.bathrooms !== undefined
      ? `${input.bathrooms} bathroom${input.bathrooms === 1 ? "" : "s"}`
      : "",
  ]
    .filter(Boolean)
    .join(" | ");
  const serviceLines = [
    ...wrapText(input.serviceName, bold, 8.5, 230).slice(0, 2),
    `${input.preferredDate ? date(input.preferredDate) : "To be arranged"} at ${time(input.preferredTime)}`,
    propertySummary,
  ];
  serviceLines.forEach((line, index) =>
    page.drawText(safeText(line), {
      x: 310,
      y: 676 - index * 14,
      size: index < 2 ? 8.5 : 7.5,
      font: index < 2 ? bold : regular,
      color: index < 2 ? DARK : TEXT,
    }),
  );

  const availableHeight = 535 - 57;
  const density =
    [1, 0.9, 0.8, 0.7, 0.6, 0.5]
      .map((scale) => layoutDensity(input, regular, scale))
      .find((candidate) => candidate.requiredHeight <= availableHeight) ??
    layoutDensity(input, regular, 0.45);
  const itemSize = Math.max(6, 8.2 * density.scale);
  const itemLineHeight = Math.max(7.2, 9.5 * density.scale);
  const answerSize = Math.max(5.8, 7.6 * density.scale);
  const answerLineHeight = Math.max(7, 9 * density.scale);
  const noteSize = Math.max(5.8, 7.5 * density.scale);
  const noteLineHeight = Math.max(7, 8.8 * density.scale);
  let y = 590;

  page.drawText("PRICE BREAKDOWN", {
    x: MARGIN,
    y,
    size: 7.8,
    font: bold,
    color: BRAND,
  });
  y -= 14;
  page.drawRectangle({
    x: MARGIN,
    y: y - 20,
    width: CONTENT_WIDTH,
    height: 20,
    color: DARK,
  });
  page.drawText("ITEM", {
    x: MARGIN + 10,
    y: y - 13.5,
    size: 7.5,
    font: bold,
    color: WHITE,
  });
  page.drawText("AMOUNT", {
    x: PAGE_WIDTH - MARGIN - 52,
    y: y - 13.5,
    size: 7.5,
    font: bold,
    color: WHITE,
  });
  y -= 20;
  input.items.forEach((item, index) => {
    const row = density.itemRows[index];
    page.drawRectangle({
      x: MARGIN,
      y: y - row.height,
      width: CONTENT_WIDTH,
      height: row.height,
      borderColor: BORDER,
      borderWidth: 0.6,
    });
    row.lines.forEach((line, lineIndex) =>
      page.drawText(line, {
        x: MARGIN + 10,
        y: y - 11 - lineIndex * itemLineHeight,
        size: itemSize,
        font: regular,
        color: TEXT,
      }),
    );
    drawRight(
      page,
      money(item.amountCents),
      PAGE_WIDTH - MARGIN - 105,
      y - 11,
      95,
      bold,
      itemSize,
      TEXT,
    );
    y -= row.height;
  });

  page.drawLine({
    start: { x: 330, y: y - 7 },
    end: { x: PAGE_WIDTH - MARGIN, y: y - 7 },
    thickness: 1,
    color: DARK,
  });
  page.drawText("QUOTED TOTAL", {
    x: 330,
    y: y - 25,
    size: 9.5,
    font: bold,
    color: DARK,
  });
  drawRight(page, money(input.totalCents), 430, y - 25, 123, bold, 11, DARK);
  y -= 39;

  if (density.answerRows.length) {
    page.drawText("SERVICE DETAILS", {
      x: MARGIN,
      y,
      size: 7.8,
      font: bold,
      color: BRAND,
    });
    y -= 14;
    density.answerRows.forEach((row) => {
      row.left.forEach((line, index) =>
        page.drawText(line, {
          x: MARGIN,
          y: y - index * answerLineHeight,
          size: answerSize,
          font: regular,
          color: TEXT,
        }),
      );
      row.right.forEach((line, index) =>
        page.drawText(line, {
          x: 303,
          y: y - index * answerLineHeight,
          size: answerSize,
          font: regular,
          color: TEXT,
        }),
      );
      y -= row.height;
    });
    y -= 3;
  }

  if (density.noteLines.length) {
    page.drawText("NOTES", {
      x: MARGIN,
      y,
      size: 7.8,
      font: bold,
      color: BRAND,
    });
    y -= 12;
    const noteHeight = density.noteLines.length * noteLineHeight + 8;
    page.drawRectangle({
      x: MARGIN,
      y: y - noteHeight + 3,
      width: CONTENT_WIDTH,
      height: noteHeight,
      color: PALE,
    });
    density.noteLines.forEach((line, index) =>
      page.drawText(line, {
        x: MARGIN + 9,
        y: y - 7 - index * noteLineHeight,
        size: noteSize,
        font: regular,
        color: TEXT,
      }),
    );
    y -= noteHeight + 3;
  }

  const bookingMessage = `Ready to book? Call +61 401 356 937 and quote reference ${input.reference}.`;
  const bookingLines = wrapText(
    bookingMessage,
    bold,
    8.7,
    CONTENT_WIDTH - 20,
  );
  const bookingHeight = Math.max(34, bookingLines.length * 11 + 16);
  const bookingY = Math.max(50, y - bookingHeight);
  page.drawRectangle({
    x: MARGIN,
    y: bookingY,
    width: CONTENT_WIDTH,
    height: bookingHeight,
    color: PALE,
    borderColor: BORDER,
    borderWidth: 0.7,
  });
  bookingLines.forEach((line, index) =>
    page.drawText(line, {
      x: MARGIN + 10,
      y: bookingY + bookingHeight - 20 - index * 11,
      size: 8.7,
      font: bold,
      color: DARK,
    }),
  );

  drawFooter(page, regular);
  pdf.setTitle(`Quote ${input.reference}`);
  pdf.setAuthor("WeDo Cleaning Services");
  pdf.setSubject(`${input.serviceName} quote`);
  pdf.setCreationDate(new Date(input.generatedAt));
  return pdf.save();
}
