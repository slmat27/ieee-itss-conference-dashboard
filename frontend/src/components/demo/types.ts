import type { UploadFile } from "@/components/ui";

export type DemoFormValues = Readonly<{
  title: string;
  requester: string;
  requestType: "analysis" | "automation" | "reporting";
  priority: "low" | "normal" | "high";
  description?: string;
  referenceFile?: UploadFile[];
  supportingFiles?: UploadFile[];
}>;

export type DemoFilePayload = Readonly<{
  name: string;
  size?: number;
  type?: string;
}>;

export type DemoFormPayload = Readonly<{
  form: {
    title: string;
    requester: string;
    requestType: DemoFormValues["requestType"];
    priority: DemoFormValues["priority"];
    description: string;
    referenceFile: DemoFilePayload | null;
    supportingFiles: DemoFilePayload[];
  };
}>;

export type DemoFormResponse = Readonly<{
  id: string;
  status: "accepted" | "queued";
}>;
