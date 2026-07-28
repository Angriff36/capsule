import { classifyCommandFailure } from "../events/CommandFailure";
import { FailureBanner } from "../events/FailureBanner";

export function ReportsFailureBanner({ error }: { error: unknown }) {
  return <FailureBanner failure={classifyCommandFailure(error)} />;
}
