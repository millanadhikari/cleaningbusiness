import type { AITool } from "./types";

export const PUBLIC_AI_TOOLS: AITool[] = [
  {
    type: "function",
    function: {
      name: "getServices",
      description: "List the currently active cleaning services. Use before answering what services are offered.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "getServiceDetails",
      description: "Get authoritative details and estimate questions for one active service.",
      parameters: {
        type: "object",
        properties: { service: { type: "string", description: "Active service slug, name or ID." } },
        required: ["service"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getBusinessInfo",
      description: "Get safe configured contact and service-area information.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "calculateEstimate",
      description: "Calculate an estimate with the server-authoritative estimator. Returns missing required inputs instead of guessing.",
      parameters: {
        type: "object",
        properties: {
          service: { type: "string", description: "Active service slug, name or ID." },
          answers: { type: "object", description: "Answers keyed by the exact service question key.", additionalProperties: true },
        },
        required: ["service", "answers"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "previewQuoteRequest",
      description: "Validate all collected quote details, recompute the estimate, and prepare the confirmation summary. This does not submit the quote.",
      parameters: {
        type: "object",
        properties: {
          service: { type: "string", description: "Active service slug, name or ID." },
          answers: { type: "object", description: "Complete answers keyed by exact service question key.", additionalProperties: true },
          name: { type: "string" }, email: { type: "string" }, phone: { type: "string" },
          addressLine1: { type: "string" }, addressLine2: { type: "string" }, suburb: { type: "string" }, state: { type: "string" }, postcode: { type: "string" },
          preferredDate: { type: "string", description: "YYYY-MM-DD when supplied." }, preferredTime: { type: "string" }, notes: { type: "string" },
        },
        required: ["service", "answers", "name", "phone", "addressLine1", "suburb", "state", "postcode"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "createQuoteRequest",
      description: "Submit the pending quote after the customer explicitly confirms it. Takes no quote details because the server uses the pending validated summary.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "previewCallbackRequest",
      description: "Validate callback details and prepare a confirmation summary. This does not submit the callback request.",
      parameters: {
        type: "object",
        properties: {
          service: { type: "string", description: "Related active service slug, name or ID." },
          answers: { type: "object", description: "Known estimate answers; use an empty object if none.", additionalProperties: true },
          name: { type: "string" }, email: { type: "string" }, phone: { type: "string" }, reason: { type: "string" },
          addressLine1: { type: "string" }, addressLine2: { type: "string" }, suburb: { type: "string" }, state: { type: "string" }, postcode: { type: "string" },
          preferredDate: { type: "string" }, preferredTime: { type: "string" },
        },
        required: ["service", "answers", "name", "phone", "reason", "addressLine1", "suburb", "state", "postcode"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "createCallbackRequest",
      description: "Submit the pending callback after the customer explicitly confirms it. Takes no request details because the server uses the pending validated summary.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "checkAvailability",
      description: "Check current, unreserved booking slots from the authoritative scheduler for one date.",
      parameters: {
        type: "object",
        properties: {
          service: { type: "string", description: "Active service slug, name or ID." },
          preferredDate: { type: "string", description: "Date in YYYY-MM-DD format." },
          preferredTimeWindow: { type: "string", enum: ["MORNING", "AFTERNOON", "ANY"] },
          postcode: { type: "string", description: "Four-digit service postcode." },
        },
        required: ["service", "preferredDate", "preferredTimeWindow", "postcode"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "verifyBookingIdentity",
      description: "Verify a booking using its reference plus the email address or Australian phone number used on the booking. Returns verification state only.",
      parameters: {
        type: "object",
        properties: { bookingReference: { type: "string" }, contact: { type: "string", description: "Booking email or phone number." } },
        required: ["bookingReference", "contact"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getVerifiedBookingSummary",
      description: "Get the customer-safe summary for the booking already verified in this chat session.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "createBookingChangeRequest",
      description: "After a verified customer explicitly confirms the displayed request summary, submit a reschedule or supported details-change request for admin review. Never edits the booking directly.",
      parameters: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["RESCHEDULE", "DETAILS_CHANGE"] },
          changes: {
            type: "object",
            properties: {
              scheduledDate: { type: "string" }, scheduledTime: { type: "string" },
              firstName: { type: "string" }, lastName: { type: "string" }, email: { type: "string" }, phone: { type: "string" }, notes: { type: "string" },
            },
            additionalProperties: false,
          },
          reason: { type: "string" },
        },
        required: ["type", "changes"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "createCancellationRequest",
      description: "After a verified customer explicitly confirms the displayed cancellation summary, submit a cancellation request for admin review. Never cancels the booking directly.",
      parameters: {
        type: "object",
        properties: { reason: { type: "string" } },
        additionalProperties: false,
      },
    },
  },
];
