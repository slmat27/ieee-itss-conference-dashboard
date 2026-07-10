import { useState } from "react";
import type { UploadFile } from "antd";

import { submitDemoForm } from "./demo-form-api";
import type { DemoFilePayload, DemoFormPayload, DemoFormValues } from "./types";

export type DemoFormSubmitState = Readonly<{
  error: string | null;
  isSubmitting: boolean;
  lastPayload: DemoFormPayload | null;
  submit: (values: DemoFormValues) => Promise<void>;
}>;

export function useDemoFormSubmit(
  endpoint = "/api/demo/forms",
): DemoFormSubmitState {
  // CREATOR_AGENT_OPTIONAL: Sample submit hook for custom forms. Generated
  // POCs should replace the payload mapping with domain-specific fields.
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastPayload, setLastPayload] = useState<DemoFormPayload | null>(null);

  const submit = async (values: DemoFormValues) => {
    const payload = toDemoFormPayload(values);
    setIsSubmitting(true);
    setLastPayload(payload);
    setError(null);

    try {
      await submitDemoForm(endpoint, payload);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to submit the demo form.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return { error, isSubmitting, lastPayload, submit };
}

function toDemoFormPayload(values: DemoFormValues): DemoFormPayload {
  const referenceFile = values.referenceFile?.[0];

  return {
    form: {
      description: values.description?.trim() ?? "",
      priority: values.priority,
      referenceFile: referenceFile ? toFilePayload(referenceFile) : null,
      requestType: values.requestType,
      requester: values.requester,
      supportingFiles: (values.supportingFiles ?? []).map(toFilePayload),
      title: values.title,
    },
  };
}

function toFilePayload(file: UploadFile): DemoFilePayload {
  return {
    name: file.name,
    size: file.size,
    type: file.type,
  };
}
