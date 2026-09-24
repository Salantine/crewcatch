/**
 * Legal page content.
 *
 * ⚠ These are STRUCTURAL PLACEHOLDERS, not legal advice and not a finished
 * policy. They describe the product's actual data behaviour so counsel has an
 * accurate starting point, and every section that requires a legal decision
 * is explicitly marked `requiresLegalReview`.
 *
 * Do not ship these to production customers without review. The placeholders
 * are deliberately visible rather than plausible-sounding: an unmarked but
 * incomplete privacy policy is worse than an obviously incomplete one, because
 * it gets relied on.
 */

export interface LegalSection {
  id: string;
  heading: string;
  body: string[];
  /** Rendered as a visible review marker, not hidden. */
  requiresLegalReview?: boolean;
}

export const PRIVACY_SECTIONS: LegalSection[] = [
  {
    id: "what-we-collect",
    heading: "What we collect",
    body: [
      "CrewCatch records calls that reach your CrewCatch answering line. For each call we store the caller phone number, the call recording and its transcript, the caller-provided name, address, and the issue they described, plus the urgency and intent our systems derived from that conversation.",
      "Contractor account data — business name, trade, dispatch preferences, billing details — is also held.",
    ],
  },
  {
    id: "call-recording",
    heading: "Call recording and notice",
    body: [
      "Where recording is enabled, the voice agent states at the start of the call that the call may be recorded and transcribed. Call transcripts are the primary input to lead qualification and prompt tuning.",
      "The legal basis for recording differs by jurisdiction. This is a contractual and regulatory question, not a technical one.",
    ],
    requiresLegalReview: true,
  },
  {
    id: "how-we-use",
    heading: "How we use it",
    body: [
      "To qualify inbound calls and deliver leads to the contractor. To improve the voice agent's prompts from call transcripts, which is included in the monthly retainer. To operate, secure, and bill the service.",
      "We do not sell personal information, and we do not use captured caller details for outbound marketing.",
    ],
  },
  {
    id: "processors",
    heading: "Processors and sub-processors",
    body: [
      "The service relies on third-party processors to operate: telephony (Twilio), conversational AI (voice agent processing, Retell AI), workflow automation (Make.com), and database hosting (Supabase). Each processes caller data on our behalf under contract.",
      "The current list of sub-processors, their locations, and their transfer terms must be confirmed and maintained here.",
    ],
    requiresLegalReview: true,
  },
  {
    id: "retention",
    heading: "Retention",
    body: [
      "Call recordings and transcripts are retained per contractor contract. Retention periods differ by jurisdiction, and deleting contractor data on request is supported operationally.",
      "Specific retention schedules must be set here.",
    ],
    requiresLegalReview: true,
  },
  {
    id: "rights",
    heading: "Caller rights",
    body: [
      "Callers may ask not to be contacted again. The voice agent honours this during the call and flags the lead as do-not-contact so it is not re-dialled. Requests received through a contractor are forwarded to us and answered.",
      "Applicable rights (access, deletion, objection) vary by US state and Canadian province.",
    ],
    requiresLegalReview: true,
  },
];

export const TERMS_SECTIONS: LegalSection[] = [
  {
    id: "service",
    heading: "The service",
    body: [
      "CrewCatch answers inbound calls that the contractor's line does not, qualifies them, and dispatches the resulting lead. The contractor retains control of how leads are followed up.",
      "The service supplements a contractor's own availability. It is not a live answering service and does not provide human operators.",
    ],
  },
  {
    id: "no-revenue-guarantee",
    heading: "No revenue guarantee",
    body: [
      "The marketing calculator and any quoted figures are estimates based on the inputs provided. They are not a promise of revenue. Results depend on call volume, close rate, pricing, capacity, and how quickly the contractor follows up — none of which CrewCatch controls.",
      "Contractors acknowledge that a captured lead is not a sale.",
    ],
  },
  {
    id: "fees",
    heading: "Fees",
    body: [
      "A one-time setup fee covers provisioning, prompt engineering, and integration. A monthly retainer covers routing, uptime, and ongoing prompt optimisation. Overage tiers apply to seasonal volume spikes.",
      "Billing terms, cancellation notice, and the overage schedule must be stated here.",
    ],
    requiresLegalReview: true,
  },
  {
    id: "client-obligations",
    heading: "Client obligations",
    body: [
      "The contractor is responsible for the accuracy of their business information, the lawfulness of recording in their jurisdictions, the content of their dispatch recipients, and the handling of captured personal information once delivered.",
    ],
  },
  {
    id: "liability",
    heading: "Limitation of liability",
    body: [
      "CrewCatch's aggregate liability is bounded by fees paid. Neither party is liable for indirect or consequential loss, including lost profits arising from a missed dispatch or a failed integration.",
      "Jurisdiction-specific enforceability must be reviewed by counsel.",
    ],
    requiresLegalReview: true,
  },
  {
    id: "termination",
    heading: "Termination",
    body: [
      "Either party may terminate with notice. On termination, provisioned numbers are released, prompt profiles and transcripts are retained or deleted per the contractor's instruction, and the data export path is documented.",
    ],
  },
];

export const DPA_SECTIONS: LegalSection[] = [
  {
    id: "roles",
    heading: "Roles of the parties",
    body: [
      "For personal information in caller recordings and transcripts, the contractor is generally the controller and CrewCatch acts as a processor. For contractor account data, CrewCatch is the controller.",
      "This characterisation must be confirmed against how each party actually uses the data.",
    ],
    requiresLegalReview: true,
  },
  {
    id: "processing",
    heading: "Processing details",
    body: [
      "Subject matter: inbound call recordings, transcripts, and derived lead details. Duration: retained for the term of the contractor agreement. Categories of data subject: household customers and prospective customers of the contractor.",
    ],
  },
  {
    id: "sub-processors",
    heading: "Sub-processors",
    body: [
      "CrewCatch uses third-party sub-processors to deliver the service. A current list, with notice of changes, must be maintained and provided to contractors.",
    ],
    requiresLegalReview: true,
  },
  {
    id: "security",
    heading: "Security measures",
    body: [
      "Tenant data is isolated at the database level by row-level security; every request resolves the caller's tenant from their authenticated session rather than from client-supplied input. Administrative access uses a separate privileged credential restricted to onboarding and call ingestion, and importing it into a customer-facing page is a build error.",
      "Transport encryption, storage encryption, and backup retention specifics must be documented here.",
    ],
    requiresLegalReview: true,
  },
];
