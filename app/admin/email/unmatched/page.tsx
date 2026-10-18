import { EmailAiInbox } from "@/components/admin/email-ai-inbox";
import { UnmatchedEmailInbox } from "@/components/admin/unmatched-email-inbox";

export default function UnmatchedEmailPage() {
  return <div className="space-y-6"><EmailAiInbox /><UnmatchedEmailInbox /></div>;
}
