"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, format, parseISO } from "date-fns";
import { useAction, useConvex, useMutation, useQuery } from "convex/react";
import {
  AppWindow,
  Armchair,
  ArrowLeft,
  ArrowRight,
  Bath,
  BedDouble,
  Blinds,
  CalendarCheck,
  CalendarDays,
  Check,
  ChevronDown,
  CookingPot,
  CreditCard,
  DoorOpen,
  Fence,
  LoaderCircle,
  Microwave,
  Minus,
  Paintbrush,
  PhoneCall,
  Plus,
  Refrigerator,
  ShieldCheck,
  Sparkles,
  WashingMachine,
  Waves,
  X,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import styles from "./quote-modal.module.css";

type AnswerValue = number | boolean | string | string[];
type Answers = Record<string, AnswerValue>;
type PublicQuestion = {
  key: string;
  label: string;
  type: "NUMBER" | "BOOLEAN" | "SELECT" | "MULTI_SELECT" | "TEXT";
  required: boolean;
  options?: string[];
  sortOrder: number;
};
type PaymentRequirement =
  "FULL" | "DEPOSIT_OR_FULL" | "DEPOSIT_ONLY" | "PAY_LATER";
type PaymentOption = "DEPOSIT" | "FULL" | "PAY_LATER";
type FlowIntent = "BOOKING" | "CALLBACK_REQUEST" | "CUSTOM_QUOTE";
type EstimateResult =
  | { type: "CUSTOM_QUOTE_REQUIRED" }
  | {
      type: "HOURLY_CONFIGURATION";
      currency: "AUD";
      hourlyRateCents: number | null;
      minimumHours?: number;
      maximumHours?: number;
    }
  | {
      type: "ESTIMATE";
      currency: "AUD";
      subtotal: number;
      total: number;
      breakdown: Array<{ label: string; amount: number }>;
      paymentRequirement: PaymentRequirement;
      depositAmountCents?: number;
    };

const australianStates = ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"];
const bookingTimes = [
  "08:00",
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
];
const addonPresentation = {
  oven: {
    category: "Kitchen & appliances",
    description: "Interior, racks, trays, glass and filters",
    icon: CookingPot,
  },
  carpetSteam: {
    category: "Carpet & upholstery",
    description: "Professional carpet steam cleaning",
    icon: Waves,
  },
  upholsteryItems: {
    category: "Carpet & upholstery",
    description: "Sofa or armchair fabric refresh",
    icon: Armchair,
  },
  microwaveInterior: {
    category: "Kitchen & appliances",
    description: "Inside racks, turntable and door glass",
    icon: Microwave,
  },
  fridgeInterior: {
    category: "Kitchen & appliances",
    description: "Must be empty and switched off",
    icon: Refrigerator,
  },
  slidingGlassDoors: {
    category: "Glass & windows",
    description: "Interior glass, edges and door tracks",
    icon: DoorOpen,
  },
  outsideWindows: {
    category: "Glass & windows",
    description: "Reachable ground-floor exterior glass",
    icon: AppWindow,
  },
  windowBlinds: {
    category: "Glass & windows",
    description: "Venetian or roller blind detail clean",
    icon: Blinds,
  },
  smallBalcony: {
    category: "Walls & outdoor",
    description: "Small outdoor area sweep, mop and glass",
    icon: Fence,
  },
  wallSpotCleaning: {
    category: "Walls & outdoor",
    description: "Targeted treatment for visible wall marks",
    icon: Paintbrush,
  },
} as const;
const limitedOfferKeys = new Set(["oven", "slidingGlassDoors", "smallBalcony"]);
function isAddonQuestion(question: PublicQuestion) {
  return question.key in addonPresentation || question.key === "carpetRooms";
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(cents / 100);
}
function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-AU", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(`2026-01-01T${value}:00`));
}
function answerLabel(value: AnswerValue) {
  return typeof value === "boolean"
    ? value
      ? "Yes"
      : "No"
    : Array.isArray(value)
      ? value.join(", ")
      : String(value);
}
function isAnswered(question: PublicQuestion, answer: AnswerValue | undefined) {
  if (!question.required) return true;
  if (answer === undefined) return false;
  if (typeof answer === "string") return answer.trim().length > 0;
  if (Array.isArray(answer)) return answer.length > 0;
  return true;
}

export function QuoteModal({
  open,
  onClose,
  defaultService = "End of Lease Cleaning",
}: {
  open: boolean;
  onClose: () => void;
  defaultService?: string;
}) {
  const convex = useConvex();
  const submitQuote = useMutation(api.quoteRequests.submit);
  const createBooking = useMutation(api.bookings.createWebsiteBooking);
  const createCheckoutSession = useAction(
    api.stripePayments.createBookingCheckoutSession,
  );
  const services = useQuery(api.services.listActiveServices);
  const [step, setStep] = useState(1);
  const [serviceId, setServiceId] = useState<Id<"services"> | undefined>();
  const [answers, setAnswers] = useState<Answers>({});
  const [estimate, setEstimate] = useState<EstimateResult | null>(null);
  const [intent, setIntent] = useState<FlowIntent | null>(null);
  const [paymentOption, setPaymentOption] = useState<PaymentOption | null>(
    null,
  );
  const [isCalculating, setIsCalculating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(() =>
    format(addDays(new Date(), 1), "yyyy-MM-dd"),
  );
  const [scheduledTime, setScheduledTime] = useState("09:00");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [suburb, setSuburb] = useState("");
  const [state, setState] = useState("NSW");
  const [postcode, setPostcode] = useState("");
  const [notes, setNotes] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [complete, setComplete] = useState(false);
  const [bookingId, setBookingId] = useState<Id<"bookings"> | null>(null);
  const bookingSubmissionKey = useRef<string | null>(null);
  const quoteSubmissionKey = useRef<string | null>(null);

  const preferredService = services?.find(
    (service) => service.name.toLowerCase() === defaultService.toLowerCase(),
  );
  const resolvedServiceId = services?.some(
    (service) => service._id === serviceId,
  )
    ? serviceId
    : (preferredService ?? services?.[0])?._id;
  const questions = useQuery(
    api.services.getActiveServiceQuestions,
    resolvedServiceId ? { serviceId: resolvedServiceId } : "skip",
  );
  const selectedService = services?.find(
    (service) => service._id === resolvedServiceId,
  );

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) =>
      event.key === "Escape" && onClose();
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open, onClose]);

  const upcomingDates = useMemo(() => {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    return Array.from({ length: 14 }, (_, index) => {
      const value = addDays(today, index + 1);
      return {
        value: format(value, "yyyy-MM-dd"),
        weekday: format(value, "EEE"),
        day: format(value, "d"),
        month: format(value, "MMM"),
      };
    });
  }, []);
  const tomorrow = upcomingDates[0]?.value;
  const formattedDate = date
    ? format(parseISO(date), "EEE d MMM yyyy")
    : "Choose a date";
  const carpetRoomsComplete =
    answers.carpetSteam !== true ||
    (typeof answers.carpetRooms === "number" && answers.carpetRooms >= 1);
  const baseAnswersComplete = Boolean(
    questions &&
    questions
      .filter((question) => !isAddonQuestion(question))
      .every((question) => isAnswered(question, answers[question.key])),
  );
  const requiredAnswersComplete = Boolean(
    questions &&
    questions.every((question) =>
      isAnswered(question, answers[question.key]),
    ) &&
    carpetRoomsComplete,
  );
  const detailsComplete = Boolean(
    name.trim() &&
    phone.trim() &&
    address.trim() &&
    suburb.trim() &&
    /^\d{4}$/.test(postcode) &&
    agreed,
  );
  const progressLabels =
    intent === "BOOKING"
      ? ["Service", "Extras", "Estimate", "Details", "Review", "Payment"]
      : ["Service", "Extras", "Estimate", "Details"];

  function changeService(nextId: Id<"services">) {
    setServiceId(nextId);
    setAnswers({});
    setEstimate(null);
    setIntent(null);
    setPaymentOption(null);
    setError(null);
    setStep(1);
  }
  function setAnswer(key: string, value: AnswerValue | undefined) {
    setAnswers((current) => {
      const next = { ...current };
      if (value !== undefined) next[key] = value;
      else delete next[key];
      if (key === "carpetSteam" && value !== true) delete next.carpetRooms;
      return next;
    });
    setEstimate(null);
    setIntent(null);
    setPaymentOption(null);
    setError(null);
  }
  async function calculateEstimate() {
    if (
      !resolvedServiceId ||
      !questions ||
      !requiredAnswersComplete ||
      isCalculating
    )
      return;
    setIsCalculating(true);
    setError(null);
    try {
      setEstimate(
        await convex.query(api.services.calculateServiceEstimate, {
          serviceId: resolvedServiceId,
          answers,
        }),
      );
      setStep(3);
    } catch {
      setError(
        "We couldn’t calculate your estimate right now. Please try again.",
      );
    } finally {
      setIsCalculating(false);
    }
  }
  function beginFlow(nextIntent: FlowIntent) {
    if (!estimate) return;
    setIntent(nextIntent);
    if (nextIntent === "BOOKING" && estimate.type === "ESTIMATE")
      setPaymentOption(
        estimate.paymentRequirement === "PAY_LATER"
          ? "PAY_LATER"
          : estimate.paymentRequirement === "FULL"
            ? "FULL"
            : "DEPOSIT",
      );
    setError(null);
    setStep(4);
  }
  function validateDetails() {
    if (detailsComplete) return true;
    setError("Please complete the required contact and address details.");
    return false;
  }
  function requestPayload() {
    if (!resolvedServiceId || !selectedService)
      throw new Error("Select a service.");
    const nameParts = name.trim().split(/\s+/);
    return {
      firstName: nameParts[0],
      lastName: nameParts.slice(1).join(" ") || undefined,
      email: email.trim() || undefined,
      phone,
      serviceId: resolvedServiceId,
      answers,
      serviceType: selectedService.name,
      addressLine1: address,
      suburb,
      state,
      postcode,
      preferredDate: date,
      preferredTime: scheduledTime,
      propertyType:
        typeof answers.propertyType === "string"
          ? answers.propertyType
          : undefined,
      bedrooms:
        typeof answers.bedrooms === "number" ? answers.bedrooms : undefined,
      bathrooms:
        typeof answers.bathrooms === "number" ? answers.bathrooms : undefined,
      notes: notes.trim() || undefined,
    };
  }
  async function submitQuoteRequest() {
    if (
      !intent ||
      intent === "BOOKING" ||
      !estimate ||
      !validateDetails() ||
      isSubmitting
    )
      return;
    setIsSubmitting(true);
    setError(null);
    try {
      quoteSubmissionKey.current ??= crypto.randomUUID();
      await submitQuote({
        ...requestPayload(),
        submissionKey: quoteSubmissionKey.current,
        requestType: intent,
      });
      setComplete(true);
    } catch {
      setError(
        "We couldn’t submit your request. Please check your details and try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }
  async function confirmBooking() {
    if (
      !estimate ||
      estimate.type !== "ESTIMATE" ||
      !paymentOption ||
      !validateDetails() ||
      isSubmitting
    )
      return;
    setIsSubmitting(true);
    setError(null);
    try {
      const payload = requestPayload();
      let createdId = bookingId;
      if (!createdId) {
        bookingSubmissionKey.current ??= crypto.randomUUID();
        createdId = await createBooking({
          submissionKey: bookingSubmissionKey.current,
          firstName: payload.firstName,
          lastName: payload.lastName,
          email: payload.email,
          phone: payload.phone,
          serviceId: payload.serviceId,
          answers,
          addressLine1: payload.addressLine1,
          suburb: payload.suburb,
          state: payload.state,
          postcode: payload.postcode,
          scheduledDate: date,
          scheduledTime,
          paymentOption,
          notes: payload.notes,
        });
        setBookingId(createdId);
      }
      if (paymentOption === "PAY_LATER") {
        setComplete(true);
        return;
      }
      const { checkoutUrl } = await createCheckoutSession({
        bookingId: createdId,
      });
      window.location.assign(checkoutUrl);
    } catch {
      setError(
        paymentOption === "PAY_LATER"
          ? "We couldn’t confirm this booking. Please review the details and try again."
          : "We couldn’t open secure checkout. Your booking is saved—please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!open) return null;
  return (
    <div
      className={styles.backdrop}
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="quote-title"
      >
        <header className={styles.header}>
          <div>
            <span className={styles.spark}>
              <Sparkles />
            </span>
            <div>
              <strong id="quote-title">Your instant estimate</strong>
              <small>Tailored to your space</small>
            </div>
          </div>
          <div className={styles.headerActions}>
            <span className={styles.time}>
              <span />
              Takes about 30 seconds
            </span>
            <button
              type="button"
              autoFocus
              onClick={onClose}
              aria-label="Close quote"
            >
              <X />
            </button>
          </div>
        </header>
        {!complete ? (
          <>
            <div
              className={styles.progress}
              style={{
                gridTemplateColumns: `repeat(${progressLabels.length}, 1fr)`,
              }}
              aria-label={`Step ${step} of ${progressLabels.length}`}
            >
              {progressLabels.map((label, index) => {
                const number = index + 1;
                const done = number < step;
                const active = number === step;
                return (
                  <div
                    className={`${styles.progressStep} ${active ? styles.active : ""} ${done ? styles.done : ""}`}
                    key={label}
                  >
                    <span>{done ? <Check /> : number}</span>
                    <strong>{label}</strong>
                    <small>
                      {active
                        ? `Step ${number} of ${progressLabels.length}`
                        : done
                          ? "Complete"
                          : ""}
                    </small>
                  </div>
                );
              })}
            </div>
            <div className={styles.content}>
              {step === 1 ? (
                <div className={styles.stepPanel}>
                  <Intro
                    number="01"
                    title="Let’s start with your space"
                    copy="A few quick details gives us a more accurate estimate."
                  />
                  <div className={styles.sectionLabel}>What do you need?</div>
                  {services === undefined ? (
                    <Loading text="Loading services…" />
                  ) : services.length === 0 ? (
                    <div className={styles.errorBox}>
                      Our services are temporarily unavailable. Please try again
                      shortly.
                    </div>
                  ) : (
                    <label className={styles.field}>
                      <span>
                        Service <small>Choose one</small>
                      </span>
                      <div className={styles.selectWrap}>
                        <select
                          value={resolvedServiceId ?? ""}
                          onChange={(event) =>
                            changeService(event.target.value as Id<"services">)
                          }
                        >
                          {services.map((item) => (
                            <option key={item._id} value={item._id}>
                              {item.name}
                            </option>
                          ))}
                        </select>
                        <ChevronDown />
                      </div>
                    </label>
                  )}
                  <div className={styles.sectionLabel}>
                    Tell us about your clean
                  </div>
                  {resolvedServiceId && questions === undefined ? (
                    <Loading text="Loading questions…" />
                  ) : questions?.length ? (
                    <DynamicQuestions
                      mode="base"
                      questions={questions}
                      answers={answers}
                      setAnswer={setAnswer}
                    />
                  ) : resolvedServiceId ? (
                    <p className={styles.emptyQuestions}>
                      No extra details are needed for this service. Continue to
                      see the quote outcome.
                    </p>
                  ) : null}
                </div>
              ) : null}
              {step === 2 ? (
                <div className={styles.stepPanel}>
                  <Intro
                    number="02"
                    title="Add the finishing touches"
                    copy="Choose only what your property needs. You can leave everything else at zero."
                  />
                  {questions === undefined ? (
                    <Loading text="Loading extras…" />
                  ) : (
                    <DynamicQuestions
                      mode="extras"
                      questions={questions}
                      answers={answers}
                      setAnswer={setAnswer}
                    />
                  )}
                </div>
              ) : null}
              {step === 3 ? (
                <div className={styles.stepPanel}>
                  <Intro
                    number="03"
                    title="Your quote outcome"
                    copy="Your estimate has been calculated securely from the service configuration."
                  />
                  {estimate ? (
                    <EstimatePanel
                      estimate={estimate}
                      questions={questions ?? []}
                      answers={answers}
                    />
                  ) : (
                    <Loading text="Calculating your estimate…" />
                  )}
                  {estimate ? (
                    <div className={styles.outcomeActions}>
                      {estimate.type === "ESTIMATE" ? (
                        <button
                          type="button"
                          className={styles.primaryAction}
                          onClick={() => beginFlow("BOOKING")}
                        >
                          <CalendarCheck />
                          Book this cleaning
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={styles.primaryAction}
                          onClick={() => beginFlow("CUSTOM_QUOTE")}
                        >
                          <ArrowRight />
                          Submit quote request
                        </button>
                      )}
                      <button
                        type="button"
                        className={styles.secondaryAction}
                        onClick={() => beginFlow("CALLBACK_REQUEST")}
                      >
                        <PhoneCall />
                        Request a call
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {step === 4 ? (
                <DetailsStep
                  intent={intent}
                  name={name}
                  setName={setName}
                  phone={phone}
                  setPhone={setPhone}
                  email={email}
                  setEmail={setEmail}
                  address={address}
                  setAddress={setAddress}
                  suburb={suburb}
                  setSuburb={setSuburb}
                  state={state}
                  setState={setState}
                  postcode={postcode}
                  setPostcode={setPostcode}
                  scheduledTime={scheduledTime}
                  setScheduledTime={setScheduledTime}
                  date={date}
                  setDate={setDate}
                  tomorrow={tomorrow}
                  upcomingDates={upcomingDates}
                  notes={notes}
                  setNotes={setNotes}
                  agreed={agreed}
                  setAgreed={setAgreed}
                />
              ) : null}
              {step === 5 &&
              intent === "BOOKING" &&
              estimate?.type === "ESTIMATE" ? (
                <BookingReview
                  estimate={estimate}
                  serviceName={selectedService?.name ?? "Cleaning service"}
                  questions={questions ?? []}
                  answers={answers}
                  address={`${address}, ${suburb} ${state} ${postcode}`}
                  date={formattedDate}
                  time={formatTime(scheduledTime)}
                  paymentOption={paymentOption}
                  setPaymentOption={(value) => {
                    setPaymentOption(value);
                    setBookingId(null);
                  }}
                />
              ) : null}
              {step === 6 &&
              intent === "BOOKING" &&
              estimate?.type === "ESTIMATE" ? (
                <StripePayment
                  estimate={estimate}
                  paymentOption={paymentOption}
                />
              ) : null}
              <Summary
                selectedService={selectedService?.name}
                questions={questions}
                answers={answers}
                estimate={estimate}
                intent={intent}
                step={step}
                date={formattedDate}
                time={scheduledTime}
              />
            </div>
            {error ? (
              <div className={styles.formError} role="alert">
                {error}
              </div>
            ) : null}
            <footer className={styles.footer}>
              {step > 1 && !(step === 6 && bookingId) ? (
                <button
                  type="button"
                  className={styles.back}
                  onClick={() => {
                    setError(null);
                    setStep(step - 1);
                  }}
                >
                  <ArrowLeft />
                  Back
                </button>
              ) : (
                <span />
              )}
              {step === 1 ? (
                <button
                  type="button"
                  className={styles.continue}
                  disabled={!baseAnswersComplete || questions === undefined}
                  onClick={() => setStep(2)}
                >
                  Choose extras
                  <ArrowRight />
                </button>
              ) : null}
              {step === 2 ? (
                <button
                  type="button"
                  className={styles.continue}
                  disabled={
                    !requiredAnswersComplete ||
                    questions === undefined ||
                    isCalculating
                  }
                  onClick={calculateEstimate}
                >
                  {isCalculating ? (
                    <LoaderCircle className={styles.spin} />
                  ) : null}
                  {isCalculating ? "Calculating…" : "Calculate estimate"}
                  <ArrowRight />
                </button>
              ) : null}
              {step === 4 && intent === "BOOKING" ? (
                <button
                  type="button"
                  className={styles.continue}
                  disabled={!detailsComplete}
                  onClick={() => {
                    if (validateDetails()) {
                      setError(null);
                      setStep(5);
                    }
                  }}
                >
                  Review booking
                  <ArrowRight />
                </button>
              ) : null}
              {step === 4 && intent && intent !== "BOOKING" ? (
                <button
                  type="button"
                  className={styles.continue}
                  disabled={!detailsComplete || isSubmitting}
                  onClick={submitQuoteRequest}
                >
                  {isSubmitting ? (
                    <LoaderCircle className={styles.spin} />
                  ) : null}
                  {intent === "CALLBACK_REQUEST"
                    ? "Request callback"
                    : "Submit quote request"}
                  <ArrowRight />
                </button>
              ) : null}
              {step === 5 && estimate?.type === "ESTIMATE" ? (
                <button
                  type="button"
                  className={styles.continue}
                  disabled={!paymentOption || isSubmitting}
                  onClick={() =>
                    paymentOption === "PAY_LATER"
                      ? confirmBooking()
                      : setStep(6)
                  }
                >
                  {isSubmitting ? (
                    <LoaderCircle className={styles.spin} />
                  ) : null}
                  {paymentOption === "PAY_LATER"
                    ? "Confirm booking"
                    : "Continue to secure payment"}
                  <ArrowRight />
                </button>
              ) : null}
              {step === 6 && estimate?.type === "ESTIMATE" ? (
                <button
                  type="button"
                  className={styles.continue}
                  disabled={isSubmitting}
                  onClick={confirmBooking}
                >
                  {isSubmitting ? (
                    <LoaderCircle className={styles.spin} />
                  ) : null}
                  {isSubmitting ? "Opening Stripe…" : "Pay securely with Stripe"}
                  <ArrowRight />
                </button>
              ) : null}
            </footer>
          </>
        ) : (
          <Confirmation
            intent={intent}
            estimate={estimate}
            bookingId={bookingId}
            serviceName={selectedService?.name ?? "Cleaning service"}
            date={formattedDate}
            time={formatTime(scheduledTime)}
            address={`${address}, ${suburb} ${state} ${postcode}`}
            onClose={onClose}
          />
        )}
      </section>
    </div>
  );
}

function Intro({
  number,
  title,
  copy,
}: {
  number: string;
  title: string;
  copy: string;
}) {
  return (
    <div className={styles.intro}>
      <span>{number}</span>
      <div>
        <h2>{title}</h2>
        <p>{copy}</p>
      </div>
    </div>
  );
}
function Loading({ text }: { text: string }) {
  return (
    <div className={styles.loading}>
      <LoaderCircle />
      {text}
    </div>
  );
}

function DynamicQuestions({
  mode,
  questions,
  answers,
  setAnswer,
}: {
  mode: "base" | "extras";
  questions: PublicQuestion[];
  answers: Answers;
  setAnswer: (key: string, value: AnswerValue | undefined) => void;
}) {
  const addonQuestions = questions.filter(
    (question) => question.key in addonPresentation,
  );
  const baseQuestions = questions.filter(
    (question) =>
      !(question.key in addonPresentation) && question.key !== "carpetRooms",
  );
  const carpetRooms = questions.find(
    (question) => question.key === "carpetRooms",
  );
  const groupedKeys = new Set(["bedrooms", "bathrooms"]);
  if (mode === "base")
    return (
      <div className={styles.questionList}>
        {baseQuestions.map((question, index) => {
          if (groupedKeys.has(question.key)) {
            if (index > 0 && groupedKeys.has(baseQuestions[index - 1].key))
              return null;
            return (
              <div className={styles.roomGrid} key="rooms">
                {baseQuestions
                  .filter((candidate) => groupedKeys.has(candidate.key))
                  .map((candidate) => (
                    <DynamicQuestion
                      key={candidate.key}
                      question={candidate}
                      answer={answers[candidate.key]}
                      setAnswer={(value) => setAnswer(candidate.key, value)}
                    />
                  ))}
              </div>
            );
          }
          return (
            <DynamicQuestion
              key={question.key}
              question={question}
              answer={answers[question.key]}
              setAnswer={(value) => setAnswer(question.key, value)}
            />
          );
        })}
      </div>
    );

  if (!addonQuestions.length)
    return (
      <div className={styles.emptyQuestions}>
        No optional extras are configured for this service. Continue to
        calculate your estimate.
      </div>
    );
  const limitedQuestions = addonQuestions.filter((question) =>
    limitedOfferKeys.has(question.key),
  );
  const regularQuestions = addonQuestions.filter(
    (question) => !limitedOfferKeys.has(question.key),
  );
  const categories = [
    ...new Set(
      regularQuestions.map(
        (question) =>
          addonPresentation[question.key as keyof typeof addonPresentation]
            .category,
      ),
    ),
  ];
  return (
    <div className={styles.finishingTouches}>
      {limitedQuestions.length ? (
        <section className={styles.limitedOffer}>
          <div className={styles.offerEyebrow}>Limited offer</div>
          <div className={styles.offerHeading}>
            <div>
              <h3>End of Lease Special</h3>
              <p>
                Make your move simpler with our most-requested finishing
                touches.
              </p>
            </div>
          </div>
          <div className={styles.offerIncluded}>
            <strong>One of each is included</strong>
            <span>
              <Check />
              Included in your estimate
            </span>
          </div>
          {limitedQuestions.map((question) => (
            <AddonQuestion
              key={question.key}
              question={question}
              answer={answers[question.key]}
              setAnswer={(value) => setAnswer(question.key, value)}
              included
            />
          ))}
        </section>
      ) : null}
      {categories.map((category) => (
        <section className={styles.addonGroup} key={category}>
          <div className={styles.addonGroupTitle}>
            <span>{category}</span>
            <small>Optional</small>
          </div>
          {regularQuestions
            .filter(
              (question) =>
                addonPresentation[
                  question.key as keyof typeof addonPresentation
                ].category === category,
            )
            .map((question) => (
              <div key={question.key}>
                <AddonQuestion
                  question={question}
                  answer={answers[question.key]}
                  setAnswer={(value) => setAnswer(question.key, value)}
                />
                {question.key === "carpetSteam" &&
                answers.carpetSteam === true &&
                carpetRooms ? (
                  <AddonQuestion
                    question={carpetRooms}
                    answer={answers.carpetRooms}
                    setAnswer={(value) => setAnswer("carpetRooms", value)}
                    nested
                  />
                ) : null}
              </div>
            ))}
        </section>
      ))}
      <div className={styles.includedClean}>
        <span>
          <Check />
        </span>
        <div>
          <strong>Already in your end of lease clean</strong>
          <p>
            Wardrobes · Dishwasher interior · Laundry room · Standard interior
            glass
          </p>
        </div>
      </div>
    </div>
  );
}

function AddonQuestion({
  question,
  answer,
  setAnswer,
  nested = false,
  included = false,
}: {
  question: PublicQuestion;
  answer: AnswerValue | undefined;
  setAnswer: (value: AnswerValue | undefined) => void;
  nested?: boolean;
  included?: boolean;
}) {
  const presentation =
    question.key === "carpetRooms"
      ? {
          description: "Select how many carpeted rooms need steam cleaning",
          icon: Waves,
        }
      : addonPresentation[question.key as keyof typeof addonPresentation];
  const Icon = presentation.icon;
  const isBoolean = question.type === "BOOLEAN";
  const value = isBoolean
    ? answer === true
      ? 1
      : 0
    : typeof answer === "number"
      ? answer
      : 0;
  return (
    <div className={`${styles.addonRow} ${nested ? styles.addonNested : ""}`}>
      <span className={styles.addonIcon}>
        <Icon />
      </span>
      <div className={styles.addonCopy}>
        <strong>
          {question.key === "carpetSteam" ? "Carpet steam" : question.label}
          {included ? <em>1 included</em> : null}
        </strong>
        <small>{presentation.description}</small>
      </div>
      <div className={styles.quantity}>
        <button
          type="button"
          disabled={value <= 0}
          onClick={() =>
            setAnswer(isBoolean || value <= 1 ? undefined : value - 1)
          }
          aria-label={`Decrease ${question.label.toLowerCase()}`}
        >
          <Minus />
        </button>
        <span>{value}</span>
        <button
          type="button"
          disabled={isBoolean && value === 1}
          onClick={() => setAnswer(isBoolean ? true : Math.min(30, value + 1))}
          aria-label={`Increase ${question.label.toLowerCase()}`}
        >
          <Plus />
        </button>
      </div>
    </div>
  );
}

function DynamicQuestion({
  question,
  answer,
  setAnswer,
}: {
  question: PublicQuestion;
  answer: AnswerValue | undefined;
  setAnswer: (value: AnswerValue | undefined) => void;
}) {
  const label = (
    <span>
      {question.label}
      {question.required ? " *" : ""}
    </span>
  );
  if (question.type === "BOOLEAN")
    return (
      <fieldset className={styles.dynamicField}>
        <legend>{label}</legend>
        <div className={styles.booleanChoices}>
          <button
            type="button"
            className={answer === true ? styles.choiceSelected : ""}
            onClick={() => setAnswer(true)}
          >
            <Check />
            Yes
          </button>
          <button
            type="button"
            className={answer === false ? styles.choiceSelected : ""}
            onClick={() => setAnswer(false)}
          >
            <X />
            No
          </button>
        </div>
      </fieldset>
    );
  if (question.type === "MULTI_SELECT")
    return (
      <fieldset className={styles.dynamicField}>
        <legend>{label}</legend>
        <div className={styles.multiOptions}>
          {(question.options ?? []).map((option) => {
            const selected = Array.isArray(answer) && answer.includes(option);
            return (
              <label key={option}>
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => {
                    const current = Array.isArray(answer) ? answer : [];
                    setAnswer(
                      selected
                        ? current.filter((item) => item !== option)
                        : [...current, option],
                    );
                  }}
                />
                {option}
              </label>
            );
          })}
        </div>
      </fieldset>
    );
  if (question.type === "SELECT")
    return (
      <label className={styles.field}>
        {label}
        <div className={styles.selectWrap}>
          <select
            value={typeof answer === "string" ? answer : ""}
            onChange={(event) => setAnswer(event.target.value || undefined)}
          >
            <option value="">Choose one</option>
            {(question.options ?? []).map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
          <ChevronDown />
        </div>
      </label>
    );
  if (question.type === "TEXT")
    return (
      <label className={styles.field}>
        {label}
        <textarea
          value={typeof answer === "string" ? answer : ""}
          onChange={(event) => setAnswer(event.target.value || undefined)}
        />
      </label>
    );
  if (["bedrooms", "bathrooms", "carpetRooms"].includes(question.key)) {
    const value = typeof answer === "number" ? answer : 0;
    const Icon =
      question.key === "bedrooms"
        ? BedDouble
        : question.key === "bathrooms"
          ? Bath
          : Waves;
    const helper =
      question.key === "bedrooms"
        ? "Sleeping rooms"
        : question.key === "bathrooms"
          ? "Full & half baths"
          : "Rooms to steam clean";
    return (
      <div
        className={`${styles.room} ${question.key === "carpetRooms" ? styles.carpetRoom : ""}`}
      >
        <span className={styles.roomIcon}>
          <Icon />
        </span>
        <div>
          <strong>
            {question.label}
            {question.required ? " *" : ""}
          </strong>
          <small>{helper}</small>
        </div>
        <div className={styles.quantity}>
          <button
            type="button"
            disabled={value <= 0}
            onClick={() => setAnswer(Math.max(0, value - 1))}
            aria-label={`Decrease ${question.label.toLowerCase()}`}
          >
            <Minus />
          </button>
          <span>{value}</span>
          <button
            type="button"
            onClick={() => setAnswer(Math.min(30, value + 1))}
            aria-label={`Increase ${question.label.toLowerCase()}`}
          >
            <Plus />
          </button>
        </div>
      </div>
    );
  }
  return (
    <label className={styles.field}>
      {label}
      <input
        type="number"
        min="0"
        step="1"
        value={typeof answer === "number" ? answer : ""}
        onChange={(event) =>
          setAnswer(
            event.target.value === "" ? undefined : Number(event.target.value),
          )
        }
      />
    </label>
  );
}

function DetailsStep(props: {
  intent: FlowIntent | null;
  name: string;
  setName: (v: string) => void;
  phone: string;
  setPhone: (v: string) => void;
  email: string;
  setEmail: (v: string) => void;
  address: string;
  setAddress: (v: string) => void;
  suburb: string;
  setSuburb: (v: string) => void;
  state: string;
  setState: (v: string) => void;
  postcode: string;
  setPostcode: (v: string) => void;
  scheduledTime: string;
  setScheduledTime: (v: string) => void;
  date: string;
  setDate: (v: string) => void;
  tomorrow?: string;
  upcomingDates: Array<{
    value: string;
    weekday: string;
    day: string;
    month: string;
  }>;
  notes: string;
  setNotes: (v: string) => void;
  agreed: boolean;
  setAgreed: (v: boolean) => void;
}) {
  return (
    <div className={styles.stepPanel}>
      <Intro
        number="04"
        title={
          props.intent === "BOOKING"
            ? "Choose your requested time"
            : "Tell us how to reach you"
        }
        copy={
          props.intent === "BOOKING"
            ? "We’ll confirm availability after your booking is received."
            : "We’ll use these details to follow up on your request."
        }
      />
      <p className={styles.required}>* Required</p>
      <div className={styles.formGrid}>
        <label className={`${styles.field} ${styles.full}`}>
          <span>Your name *</span>
          <input
            autoFocus
            value={props.name}
            onChange={(event) => props.setName(event.target.value)}
            placeholder="e.g. Sam Taylor"
          />
        </label>
        <label className={styles.field}>
          <span>Phone number *</span>
          <input
            type="tel"
            value={props.phone}
            onChange={(event) => props.setPhone(event.target.value)}
            placeholder="e.g. 0412 345 678"
          />
        </label>
        <label className={styles.field}>
          <span>
            Email <small>(optional)</small>
          </span>
          <input
            type="email"
            value={props.email}
            onChange={(event) => props.setEmail(event.target.value)}
            placeholder="you@example.com"
          />
        </label>
        <label className={`${styles.field} ${styles.full}`}>
          <span>Street address *</span>
          <input
            value={props.address}
            onChange={(event) => props.setAddress(event.target.value)}
            placeholder="12 Example Street"
          />
        </label>
        <label className={styles.field}>
          <span>Suburb *</span>
          <input
            value={props.suburb}
            onChange={(event) => props.setSuburb(event.target.value)}
            placeholder="e.g. Parramatta"
          />
        </label>
        <label className={styles.field}>
          <span>State *</span>
          <div className={styles.selectWrap}>
            <select
              value={props.state}
              onChange={(event) => props.setState(event.target.value)}
            >
              {australianStates.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
            <ChevronDown />
          </div>
        </label>
        <label className={styles.field}>
          <span>Postcode *</span>
          <input
            inputMode="numeric"
            maxLength={4}
            value={props.postcode}
            onChange={(event) =>
              props.setPostcode(
                event.target.value.replace(/\D/g, "").slice(0, 4),
              )
            }
            placeholder="e.g. 2150"
          />
        </label>
        <label className={styles.field}>
          <span>Requested time *</span>
          <div className={styles.selectWrap}>
            <select
              value={props.scheduledTime}
              onChange={(event) => props.setScheduledTime(event.target.value)}
            >
              {bookingTimes.map((item) => (
                <option key={item} value={item}>
                  {formatTime(item)}
                </option>
              ))}
            </select>
            <ChevronDown />
          </div>
        </label>
      </div>
      <div className={styles.dateLabel}>
        <span>
          <CalendarDays />
          Requested date
        </span>
        <small>Availability will be confirmed</small>
      </div>
      <div className={styles.dates}>
        {props.upcomingDates.map((item) => (
          <button
            type="button"
            className={props.date === item.value ? styles.selectedDate : ""}
            onClick={() => props.setDate(item.value)}
            key={item.value}
          >
            <small>{item.weekday}</small>
            <strong>{item.day}</strong>
            <span>{item.month}</span>
          </button>
        ))}
      </div>
      <label className={styles.calendarPicker}>
        <span>
          <CalendarDays />
          <span>
            <strong>Need a later date?</strong>
            <small>Select a future requested date</small>
          </span>
        </span>
        <input
          type="date"
          min={props.tomorrow}
          value={props.date}
          onChange={(event) =>
            event.target.value && props.setDate(event.target.value)
          }
        />
      </label>
      <label className={styles.field}>
        <span>
          Additional notes <small>(optional)</small>
        </span>
        <textarea
          value={props.notes}
          onChange={(event) => props.setNotes(event.target.value)}
          placeholder="Pets, parking, access details, or anything else we should know…"
        />
      </label>
      <label className={styles.terms}>
        <input
          type="checkbox"
          checked={props.agreed}
          onChange={(event) => props.setAgreed(event.target.checked)}
        />
        <span>
          I have read and agree to the <u>Terms & Conditions</u>.
        </span>
      </label>
    </div>
  );
}

function EstimatePanel({
  estimate,
  questions,
  answers,
}: {
  estimate: EstimateResult;
  questions: PublicQuestion[];
  answers: Answers;
}) {
  if (estimate.type === "CUSTOM_QUOTE_REQUIRED")
    return (
      <div className={styles.outcome}>
        <Sparkles />
        <div>
          <strong>Custom quote required</strong>
          <p>We’ll review your requirements before confirming your price.</p>
        </div>
      </div>
    );
  if (estimate.type === "HOURLY_CONFIGURATION")
    return (
      <div className={styles.outcome}>
        <Sparkles />
        <div>
          <strong>Hourly service</strong>
          <p>
            {estimate.hourlyRateCents === null
              ? "We’ll confirm the hourly rate with you."
              : `${formatMoney(estimate.hourlyRateCents)} per hour`}
            {estimate.minimumHours
              ? ` · Minimum ${estimate.minimumHours} hours`
              : ""}
          </p>
        </div>
      </div>
    );
  return (
    <div className={styles.estimateResult}>
      <div className={styles.estimateServicesLabel}>Your cleaning includes</div>
      <div className={styles.breakdown}>
        {questions
          .filter((question) => answers[question.key] !== undefined)
          .map((question) => (
            <div key={question.key}>
              <Check />
              <span>{question.label}</span>
              <strong>{answerLabel(answers[question.key])}</strong>
            </div>
          ))}
      </div>
      <div className={styles.totalRow}>
        <span>Estimated total</span>
        <strong>{formatMoney(estimate.total)}</strong>
      </div>
      <p>Final price is confirmed from this server-calculated snapshot.</p>
    </div>
  );
}
function EstimateSummary({ estimate }: { estimate: EstimateResult }) {
  if (estimate.type === "ESTIMATE")
    return (
      <>
        <div className={styles.estimate}>
          <span>
            <small>Your estimate</small>
            <em>AUD</em>
          </span>
          <strong>{formatMoney(estimate.total)}</strong>
        </div>
        <p>Server-calculated price snapshot.</p>
      </>
    );
  if (estimate.type === "HOURLY_CONFIGURATION")
    return (
      <>
        <div className={styles.estimate}>
          <span>
            <small>Hourly rate</small>
            <em>AUD</em>
          </span>
          <strong>
            {estimate.hourlyRateCents === null
              ? "To confirm"
              : formatMoney(estimate.hourlyRateCents)}
          </strong>
        </div>
        <p>
          {estimate.minimumHours
            ? `Minimum ${estimate.minimumHours} hours. `
            : ""}
          Duration will be confirmed.
        </p>
      </>
    );
  return (
    <>
      <div className={styles.customSummary}>
        <small>Quote outcome</small>
        <strong>Custom quote required</strong>
      </div>
      <p>We’ll confirm the price.</p>
    </>
  );
}

function BookingReview({
  estimate,
  serviceName,
  questions,
  answers,
  address,
  date,
  time,
  paymentOption,
  setPaymentOption,
}: {
  estimate: Extract<EstimateResult, { type: "ESTIMATE" }>;
  serviceName: string;
  questions: PublicQuestion[];
  answers: Answers;
  address: string;
  date: string;
  time: string;
  paymentOption: PaymentOption | null;
  setPaymentOption: (value: PaymentOption) => void;
}) {
  const deposit = estimate.depositAmountCents ?? 0;
  const options: Array<{
    value: PaymentOption;
    title: string;
    detail: string;
  }> =
    estimate.paymentRequirement === "FULL"
      ? [
          {
            value: "FULL",
            title: `Pay full amount · ${formatMoney(estimate.total)}`,
            detail: "Secure online payment with Stripe",
          },
        ]
      : estimate.paymentRequirement === "PAY_LATER"
        ? [
            {
              value: "PAY_LATER",
              title: "Pay later",
              detail: "No payment required today",
            },
          ]
        : estimate.paymentRequirement === "DEPOSIT_ONLY"
          ? [
              {
                value: "DEPOSIT",
                title: `Pay deposit · ${formatMoney(deposit)}`,
                detail: `Remaining balance ${formatMoney(estimate.total - deposit)}`,
              },
            ]
          : [
              {
                value: "DEPOSIT",
                title: `Pay deposit · ${formatMoney(deposit)}`,
                detail: `Remaining balance ${formatMoney(estimate.total - deposit)}`,
              },
              {
                value: "FULL",
                title: `Pay full amount · ${formatMoney(estimate.total)}`,
                detail: "Nothing remaining after payment",
              },
            ];
  return (
    <div className={styles.stepPanel}>
      <Intro
        number="05"
        title="Review your booking"
        copy="Check the requested schedule, address and payment option."
      />
      <div className={styles.reviewCard}>
        <div>
          <span>Service</span>
          <strong>{serviceName}</strong>
        </div>
        <div>
          <span>Requested time</span>
          <strong>
            {date} · {time}
          </strong>
        </div>
        <div>
          <span>Address</span>
          <strong>{address}</strong>
        </div>
        {questions
          .filter((q) => answers[q.key] !== undefined)
          .map((q) => (
            <div key={q.key}>
              <span>{q.label}</span>
              <strong>{answerLabel(answers[q.key])}</strong>
            </div>
          ))}
        <div className={styles.reviewTotal}>
          <span>Total</span>
          <strong>{formatMoney(estimate.total)}</strong>
        </div>
      </div>
      <div className={styles.sectionLabel}>Payment option</div>
      <div className={styles.paymentOptions}>
        {options.map((option) => (
          <button
            type="button"
            key={option.value}
            className={
              paymentOption === option.value ? styles.paymentSelected : ""
            }
            onClick={() => setPaymentOption(option.value)}
          >
            <span>
              {paymentOption === option.value ? <Check /> : <CreditCard />}
            </span>
            <div>
              <strong>{option.title}</strong>
              <small>{option.detail}</small>
            </div>
          </button>
        ))}
      </div>
      <p className={styles.devDisclaimer}>
        Online payments are processed securely by Stripe.
      </p>
    </div>
  );
}

function StripePayment({
  estimate,
  paymentOption,
}: {
  estimate: Extract<EstimateResult, { type: "ESTIMATE" }>;
  paymentOption: PaymentOption | null;
}) {
  return (
    <div className={styles.stepPanel}>
      <Intro
        number="06"
        title="Secure payment"
        copy="You’ll continue to Stripe to enter your payment details securely."
      />
      <div className={styles.mockNotice}>
        <ShieldCheck />
        <div>
          <strong>Secure checkout powered by Stripe</strong>
          <p>
            We Do Cleaning does not receive or store your card details.
          </p>
        </div>
      </div>
      <div className={styles.paymentDue}>
        <span>Amount due now</span>
        <strong>
          {formatMoney(
            paymentOption === "DEPOSIT"
              ? (estimate.depositAmountCents ?? 0)
              : estimate.total,
          )}
        </strong>
      </div>
    </div>
  );
}

function Summary({
  selectedService,
  questions,
  answers,
  estimate,
  intent,
  step,
  date,
  time,
}: {
  selectedService?: string;
  questions: PublicQuestion[] | undefined;
  answers: Answers;
  estimate: EstimateResult | null;
  intent: FlowIntent | null;
  step: number;
  date: string;
  time: string;
}) {
  return (
    <aside className={styles.summary}>
      <div className={styles.summaryHeading}>
        <span className={styles.summaryIcon}>
          <WashingMachine />
        </span>
        <div>
          <strong>
            {intent === "BOOKING" ? "Booking summary" : "Quote summary"}
          </strong>
          <small>Updates as you provide details</small>
        </div>
      </div>
      <dl>
        <div>
          <dt>Service</dt>
          <dd>{selectedService ?? "Choose a service"}</dd>
        </div>
        {questions
          ?.filter((q) => answers[q.key] !== undefined)
          .map((q) => (
            <div key={q.key}>
              <dt>{q.label}</dt>
              <dd>{answerLabel(answers[q.key])}</dd>
            </div>
          ))}
        {step >= 4 ? (
          <>
            <div>
              <dt>Requested</dt>
              <dd>{date}</dd>
            </div>
            <div>
              <dt>Time</dt>
              <dd>{formatTime(time)}</dd>
            </div>
          </>
        ) : null}
      </dl>
      {estimate ? (
        <EstimateSummary estimate={estimate} />
      ) : (
        <div className={styles.estimatePending}>
          Complete the service questions to calculate your quote.
        </div>
      )}
    </aside>
  );
}

function Confirmation({
  intent,
  estimate,
  bookingId,
  serviceName,
  date,
  time,
  address,
  onClose,
}: {
  intent: FlowIntent | null;
  estimate: EstimateResult | null;
  bookingId: Id<"bookings"> | null;
  serviceName: string;
  date: string;
  time: string;
  address: string;
  onClose: () => void;
}) {
  const isBooking =
    intent === "BOOKING" && estimate?.type === "ESTIMATE" && bookingId;
  return (
    <div className={styles.success}>
      <span>{isBooking ? <CalendarCheck /> : <Check />}</span>
      <div className={styles.eyebrow}>
        {isBooking
          ? "Booking confirmed"
          : intent === "CALLBACK_REQUEST"
            ? "Callback requested"
            : "Quote request received"}
      </div>
      <h2>
        {isBooking
          ? "Your requested clean is booked."
          : "Thanks—your request is with us."}
      </h2>
      {isBooking ? (
        <div className={styles.confirmationDetails}>
          <p>
            <strong>{serviceName}</strong>
          </p>
          <p>
            {date} · {time}
          </p>
          <p>{address}</p>
          <p>
            Total: <strong>{formatMoney(estimate.total)}</strong>
          </p>
          <p>
            Payment: <strong>Due later</strong>
          </p>
          <p className={styles.bookingReference}>Reference: {bookingId}</p>
          <small>We’ll contact you if any further booking details are needed.</small>
        </div>
      ) : (
        <p>
          {intent === "CALLBACK_REQUEST"
            ? "We’ll call you using the phone number provided."
            : "We’ll review your requirements and confirm the next step."}
        </p>
      )}
      <button type="button" onClick={onClose}>
        Done
      </button>
    </div>
  );
}
