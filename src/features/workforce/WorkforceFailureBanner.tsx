import { classifyCommandFailure } from "../events/CommandFailure";
import { FailureBanner } from "../events/FailureBanner";

export function WorkforceFailureBanner({ error }: { error: unknown }) {
  return <FailureBanner failure={classifyCommandFailure(error)} />;
}
