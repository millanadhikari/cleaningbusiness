type BookingConfirmationInput = {
  customerFirstName: string;
  bookingReference: string;
  serviceName: string;
  scheduledDate: string;
  scheduledTime: string;
  address: string;
  totalAmountCents: number;
  amountPaidCents: number;
  paymentStatus: "UNPAID" | "DEPOSIT_PAID" | "PAID";
  developmentPayment: boolean;
};

type QuoteRequestReceivedInput = {
  customerFirstName: string;
  quoteReference: string;
  serviceName: string;
  requestType: "CUSTOM_QUOTE" | "CALLBACK_REQUEST";
};

type BookingPaymentLinkInput = {
  customerFirstName: string;
  bookingReference: string;
  serviceName: string;
  scheduledDate: string;
  address: string;
  revisedTotalCents: number;
  amountPaidCents: number;
  balanceDueCents: number;
  checkoutUrl: string;
};

type QuotePaymentLinkInput = {
  customerFirstName: string;
  quoteReference: string;
  serviceName: string;
  scheduledDate: string;
  address: string;
  totalAmountCents: number;
  paymentAmountCents: number;
  paymentOption: "DEPOSIT" | "FULL";
  checkoutUrl: string;
};

type CleanerJobAssignedInput = {
  cleanerFirstName: string;
  bookingReference: string;
  serviceName: string;
  customerName: string;
  customerPhone: string;
  scheduledDate: string;
  scheduledTime: string;
  address: string;
  jobUrl: string;
};

type EmailTemplate = {
  subject: string;
  html: string;
  text: string;
};

function escapeHtml(value: string) {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      })[character]!,
  );
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(cents / 100);
}

function formatDate(value: string) {
  const parsed = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

function formatTime(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return value;
  const hours = Number(match[1]);
  const suffix = hours >= 12 ? "pm" : "am";
  return `${hours % 12 || 12}:${match[2]} ${suffix}`;
}

export function emailBrandLockup() {
  return `<table role="presentation" cellspacing="0" cellpadding="0"><tr>
    <td style="padding-right:10px;vertical-align:middle;"><img src="https://wedocleaning.com.au/wedo-mark.png" width="54" height="57" alt="" style="display:block;width:54px;height:57px;object-fit:contain;"></td>
    <td style="vertical-align:middle;"><div style="font-size:25px;font-weight:800;line-height:1;color:#16363b;letter-spacing:-1.2px;">We<span style="color:#008575;">Do</span></div><div style="margin-top:6px;font-size:7px;font-weight:700;line-height:1;letter-spacing:1.35px;color:#455e61;white-space:nowrap;">CLEANING SERVICES</div></td>
  </tr></table>`;
}

function layout(preheader: string, content: string) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
    <title>${escapeHtml(preheader)}</title>
  </head>
  <body style="margin:0;background:#f3f7f6;font-family:Arial,sans-serif;color:#183837;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f7f6;padding:24px 12px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #dce8e5;">
          <tr><td style="background:#ffffff;padding:22px 32px;border-bottom:1px solid #dce8e5;">
            ${emailBrandLockup()}
          </td></tr>
          <tr><td style="padding:32px;">${content}</td></tr>
          <tr><td style="padding:22px 32px;background:#eef5f3;color:#54716e;font-size:12px;line-height:1.6;">
            Questions? Reply to this email and our team will be happy to help.
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

function detailRow(label: string, value: string) {
  return `<tr>
    <td style="padding:9px 12px 9px 0;color:#67817e;font-size:13px;vertical-align:top;">${escapeHtml(label)}</td>
    <td style="padding:9px 0;color:#183837;font-size:14px;font-weight:600;text-align:right;vertical-align:top;">${escapeHtml(value)}</td>
  </tr>`;
}

export function cleanerJobAssignedEmail(
  input: CleanerJobAssignedInput,
): EmailTemplate {
  const subject = `New cleaning job assigned — ${input.bookingReference}`;
  const content = `
    <h1 style="margin:0 0 14px;font-size:26px;line-height:1.25;color:#123f3b;">A new job has been assigned to you</h1>
    <p style="margin:0 0 22px;font-size:15px;line-height:1.7;color:#496663;">Hi ${escapeHtml(input.cleanerFirstName)}, a new cleaning job is waiting for you in the cleaner portal. Review the details and accept or decline the job.</p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border-top:1px solid #dce8e5;border-bottom:1px solid #dce8e5;">
      ${detailRow("Booking reference", input.bookingReference)}
      ${detailRow("Service", input.serviceName)}
      ${detailRow("Customer", input.customerName)}
      ${detailRow("Customer phone", input.customerPhone)}
      ${detailRow("Date", formatDate(input.scheduledDate))}
      ${detailRow("Time", formatTime(input.scheduledTime))}
      ${detailRow("Address", input.address)}
    </table>
    <p style="margin:24px 0;text-align:center;"><a href="${escapeHtml(input.jobUrl)}" style="display:inline-block;border-radius:10px;background:#174c48;padding:14px 24px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;">Review assigned job</a></p>
    <p style="margin:0;font-size:13px;line-height:1.6;color:#67817e;">Please open the cleaner portal to respond to this job assignment.</p>`;

  return {
    subject,
    html: layout(subject, content),
    text: `Hi ${input.cleanerFirstName},\n\nA new cleaning job has been assigned to you. Review it in the cleaner portal and accept or decline the job.\n\nBooking reference: ${input.bookingReference}\nService: ${input.serviceName}\nCustomer: ${input.customerName}\nCustomer phone: ${input.customerPhone}\nDate: ${formatDate(input.scheduledDate)}\nTime: ${formatTime(input.scheduledTime)}\nAddress: ${input.address}\n\nReview assigned job: ${input.jobUrl}`,
  };
}

export function bookingConfirmationEmail(
  input: BookingConfirmationInput,
): EmailTemplate {
  const subject = "Your We Do Cleaning booking is confirmed";
  const total = formatMoney(input.totalAmountCents);
  const paid = formatMoney(input.amountPaidCents);
  const balance = formatMoney(
    Math.max(0, input.totalAmountCents - input.amountPaidCents),
  );
  const paymentStatus = input.paymentStatus.replaceAll("_", " ");
  const developmentNotice = input.developmentPayment
    ? `<div style="margin:20px 0 0;padding:14px 16px;border-radius:10px;background:#fff8e6;color:#72510a;font-size:13px;line-height:1.5;"><strong>Development booking:</strong> the payment information below is a test status only and does not represent a real card charge.</div>`
    : "";
  const content = `
    <h1 style="margin:0 0 14px;font-size:26px;line-height:1.25;color:#123f3b;">Your booking is confirmed</h1>
    <p style="margin:0 0 22px;font-size:15px;line-height:1.7;color:#496663;">Hi ${escapeHtml(input.customerFirstName)}, your cleaning booking has been confirmed. Here are the details for your records.</p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border-top:1px solid #dce8e5;border-bottom:1px solid #dce8e5;">
      ${detailRow("Booking reference", input.bookingReference)}
      ${detailRow("Service", input.serviceName)}
      ${detailRow("Date", formatDate(input.scheduledDate))}
      ${detailRow("Time", formatTime(input.scheduledTime))}
      ${detailRow("Address", input.address)}
      ${detailRow("Total", total)}
      ${detailRow("Amount paid", paid)}
      ${detailRow("Remaining balance", balance)}
      ${detailRow(input.developmentPayment ? "Development payment status" : "Payment status", paymentStatus)}
    </table>
    ${developmentNotice}
    <p style="margin:22px 0 0;font-size:15px;line-height:1.7;color:#496663;">We look forward to helping you enjoy a cleaner space.</p>`;
  const developmentText = input.developmentPayment
    ? "\nDevelopment booking: the payment information is a test status only and does not represent a real card charge.\n"
    : "";

  return {
    subject,
    html: layout(subject, content),
    text: `Hi ${input.customerFirstName},\n\nYour We Do Cleaning booking is confirmed.\n\nBooking reference: ${input.bookingReference}\nService: ${input.serviceName}\nDate: ${formatDate(input.scheduledDate)}\nTime: ${formatTime(input.scheduledTime)}\nAddress: ${input.address}\nTotal: ${total}\nAmount paid: ${paid}\nRemaining balance: ${balance}\n${input.developmentPayment ? "Development payment status" : "Payment status"}: ${paymentStatus}${developmentText}\nReply to this email if you have any questions.`,
  };
}

export function quoteRequestReceivedEmail(
  input: QuoteRequestReceivedInput,
): EmailTemplate {
  const isCallback = input.requestType === "CALLBACK_REQUEST";
  const subject = isCallback
    ? "We've received your callback request"
    : "We've received your cleaning quote request";
  const nextStep = isCallback
    ? "A member of the We Do Cleaning team will contact you to discuss what you need."
    : "Our team will review your request and contact you about the next steps.";
  const heading = isCallback
    ? "Your callback request is with us"
    : "Your quote request is with us";
  const content = `
    <h1 style="margin:0 0 14px;font-size:26px;line-height:1.25;color:#123f3b;">${escapeHtml(heading)}</h1>
    <p style="margin:0 0 22px;font-size:15px;line-height:1.7;color:#496663;">Hi ${escapeHtml(input.customerFirstName)}, thanks for getting in touch. ${escapeHtml(nextStep)}</p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border-top:1px solid #dce8e5;border-bottom:1px solid #dce8e5;">
      ${detailRow("Reference", input.quoteReference)}
      ${detailRow("Service", input.serviceName)}
    </table>
    <p style="margin:22px 0 0;font-size:15px;line-height:1.7;color:#496663;">You can reply to this email if there is anything else you would like us to know.</p>`;

  return {
    subject,
    html: layout(subject, content),
    text: `Hi ${input.customerFirstName},\n\nThanks for getting in touch. ${nextStep}\n\nReference: ${input.quoteReference}\nService: ${input.serviceName}\n\nYou can reply to this email if there is anything else you would like us to know.`,
  };
}

export function quotePaymentLinkEmail(
  input: QuotePaymentLinkInput,
): EmailTemplate {
  const isDeposit = input.paymentOption === "DEPOSIT";
  const subject = isDeposit
    ? "Secure your We Do Cleaning booking"
    : "Pay your We Do Cleaning quote";
  const total = formatMoney(input.totalAmountCents);
  const payment = formatMoney(input.paymentAmountCents);
  const paymentLabel = isDeposit ? "Deposit due" : "Full amount due";
  const content = `
    <h1 style="margin:0 0 14px;font-size:26px;line-height:1.25;color:#123f3b;">Your quote is ready for payment</h1>
    <p style="margin:0 0 22px;font-size:15px;line-height:1.7;color:#496663;">Hi ${escapeHtml(input.customerFirstName)}, please use the secure link below to ${isDeposit ? "pay your deposit and confirm" : "pay and confirm"} your cleaning booking.</p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border-top:1px solid #dce8e5;border-bottom:1px solid #dce8e5;">
      ${detailRow("Quote reference", input.quoteReference)}
      ${detailRow("Service", input.serviceName)}
      ${detailRow("Date", formatDate(input.scheduledDate))}
      ${detailRow("Address", input.address)}
      ${detailRow("Quote total", total)}
      ${detailRow(paymentLabel, payment)}
    </table>
    <p style="margin:24px 0;text-align:center;"><a href="${escapeHtml(input.checkoutUrl)}" style="display:inline-block;border-radius:10px;background:#174c48;padding:14px 24px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;">${isDeposit ? "Pay deposit" : "Pay securely"}</a></p>
    <p style="margin:0;font-size:13px;line-height:1.6;color:#67817e;">Your booking will be created automatically after Stripe confirms the payment.</p>`;

  return {
    subject,
    html: layout(subject, content),
    text: `Hi ${input.customerFirstName},\n\nPlease pay your accepted cleaning quote securely.\n\nQuote reference: ${input.quoteReference}\nService: ${input.serviceName}\nDate: ${formatDate(input.scheduledDate)}\nAddress: ${input.address}\nQuote total: ${total}\n${paymentLabel}: ${payment}\n\nPay securely: ${input.checkoutUrl}\n\nYour booking will be created automatically after Stripe confirms the payment.`,
  };
}

export function bookingPaymentLinkEmail(
  input: BookingPaymentLinkInput,
): EmailTemplate {
  const subject = "Your updated We Do Cleaning balance";
  const revisedTotal = formatMoney(input.revisedTotalCents);
  const paid = formatMoney(input.amountPaidCents);
  const balance = formatMoney(input.balanceDueCents);
  const content = `
    <h1 style="margin:0 0 14px;font-size:26px;line-height:1.25;color:#123f3b;">Your booking has been updated</h1>
    <p style="margin:0 0 22px;font-size:15px;line-height:1.7;color:#496663;">Hi ${escapeHtml(input.customerFirstName)}, we’ve updated your cleaning booking. Please review the refreshed balance below.</p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border-top:1px solid #dce8e5;border-bottom:1px solid #dce8e5;">
      ${detailRow("Booking reference", input.bookingReference)}
      ${detailRow("Service", input.serviceName)}
      ${detailRow("Date", formatDate(input.scheduledDate))}
      ${detailRow("Address", input.address)}
      ${detailRow("Revised total", revisedTotal)}
      ${detailRow("Already paid", paid)}
      ${detailRow("Balance due", balance)}
    </table>
    <p style="margin:24px 0;text-align:center;"><a href="${escapeHtml(input.checkoutUrl)}" style="display:inline-block;border-radius:10px;background:#174c48;padding:14px 24px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;">Pay remaining balance</a></p>
    <p style="margin:0;font-size:13px;line-height:1.6;color:#67817e;">This secure checkout link is for this booking only. Reply to this email if you have questions about the updated details.</p>`;

  return {
    subject,
    html: layout(subject, content),
    text: `Hi ${input.customerFirstName},\n\nYour cleaning booking has been updated.\n\nBooking reference: ${input.bookingReference}\nService: ${input.serviceName}\nDate: ${formatDate(input.scheduledDate)}\nAddress: ${input.address}\nRevised total: ${revisedTotal}\nAlready paid: ${paid}\nBalance due: ${balance}\n\nPay securely: ${input.checkoutUrl}\n\nReply to this email if you have any questions.`,
  };
}
