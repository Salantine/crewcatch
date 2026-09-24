import {
  type CallCompletedEvent,
  type DeliveryReceipt,
  type DispatchChannel,
  type DispatchNotification,
  type Lead,
  type PhoneNumber,
  type PromptProfile,
} from "@/lib/domain/schemas";

/**
 * The adapter seam. Every external system CrewCatch touches is reached through
 * one of these four interfaces, so a live provider is a drop-in replacement
 * that no caller has to change.
 */

export interface TelephonyProvider {
  readonly name: string;
  /** Provision a local or toll-free number in a given region. */
  provisionNumber(input: {
    region: string;
    label: string;
  }): Promise<PhoneNumber>;
  /** Current status for an external call id. */
  getCallStatus(externalCallId: string): Promise<{
    status: "queued" | "in_progress" | "completed" | "busy" | "failed" | "no_answer";
    durationSeconds?: number;
  }>;
}

export interface VoiceAgentProvider {
  readonly name: string;
  /** Create a voice agent bound to a contractor's prompt profile. */
  createAgent(profile: PromptProfile): Promise<{ agentId: string }>;
  /** Push prompt changes without recreating the agent. */
  updateAgent(agentId: string, profile: PromptProfile): Promise<void>;
  /** Fetch the completed-call event the agent recorded. */
  getCallTranscript(externalCallId: string): Promise<CallCompletedEvent>;
}

export interface WorkflowProvider {
  readonly name: string;
  /** Hand a captured lead to the automation layer (Make.com in production). */
  dispatchLead(
    lead: Lead,
    channels: DispatchChannel[],
  ): Promise<DeliveryReceipt[]>;
}

export interface NotificationChannel {
  readonly channel: DispatchChannel;
  send(notification: DispatchNotification): Promise<DeliveryReceipt>;
}

/** A provider that records what it would have sent, for demos and tests. */
export interface RecordingProvider {
  readonly calls: RecordedCall[];
}

export interface RecordedCall {
  provider: string;
  at: string;
  payload: unknown;
}
