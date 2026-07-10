import {
  Card,
  Input,
  MultipleFileUpload,
  SingleFileUpload,
  useForm,
} from "@/components/ui";
import { Form, FormItem } from "@/components/ui/form";
import type { DemoFormValues } from "@/components/demo/types";
import { useDemoFormSubmit } from "@/components/demo/use-demo-form-submit";
import {
  Alert,
  Input as AntInput,
  Select,
  Typography,
  type UploadFile,
  type UploadProps,
} from "antd";

import { ActionGroup, Button, Stack } from "@/components/ui";

const { Text } = Typography;

const initialValues: Partial<DemoFormValues> = {
  priority: "normal",
  requestType: "analysis",
};

// CREATOR_AGENT_OPTIONAL: This component is an example form-composition pattern
// for future POCs. Do not wire it into the app unless the backend route exists.
export function DemoFormCard() {
  const [form] = useForm<DemoFormValues>();
  const { error, isSubmitting, lastPayload, submit } = useDemoFormSubmit();

  return (
    <Card title="Typical Form">
      <Stack>
        <Form<DemoFormValues>
          form={form}
          initialValues={initialValues}
          onFinish={(values) => void submit(values)}
        >
          <FormItem
            label="Request title"
            name="title"
            rules={[{ message: "Enter a request title.", required: true }]}
          >
            <Input placeholder="Quarterly supplier analysis" />
          </FormItem>

          <FormItem
            label="Requester"
            name="requester"
            rules={[
              { message: "Enter a requester email.", required: true },
              { message: "Use a valid email address.", type: "email" },
            ]}
          >
            <Input placeholder="name@example.com" />
          </FormItem>

          <div className="ui-form__row">
            <FormItem
              label="Request type"
              name="requestType"
              rules={[{ message: "Select a request type.", required: true }]}
            >
              <Select
                options={[
                  { label: "Analysis", value: "analysis" },
                  { label: "Automation", value: "automation" },
                  { label: "Reporting", value: "reporting" },
                ]}
              />
            </FormItem>

            <FormItem
              label="Priority"
              name="priority"
              rules={[{ message: "Select a priority.", required: true }]}
            >
              <Select
                options={[
                  { label: "Low", value: "low" },
                  { label: "Normal", value: "normal" },
                  { label: "High", value: "high" },
                ]}
              />
            </FormItem>
          </div>

          <FormItem label="Description" name="description">
            <AntInput.TextArea
              className="ui-input"
              placeholder="Add the goal, relevant constraints, and expected output."
              rows={4}
            />
          </FormItem>

          <div className="ui-form__row">
            <FormItem
              getValueFromEvent={normalizeUploadEvent}
              label="Reference file"
              name="referenceFile"
              valuePropName="fileList"
            >
              <SingleFileUpload actionLabel="Select reference" />
            </FormItem>

            <FormItem
              getValueFromEvent={normalizeUploadEvent}
              label="Supporting files"
              name="supportingFiles"
              valuePropName="fileList"
            >
              <MultipleFileUpload actionLabel="Select supporting files" />
            </FormItem>
          </div>

          <ActionGroup>
            <Button htmlType="submit" loading={isSubmitting} type="primary">
              Submit JSON
            </Button>
            <Button htmlType="button" onClick={() => form.resetFields()}>
              Reset
            </Button>
          </ActionGroup>
        </Form>

        {error ? (
          <Alert message={error} showIcon type="warning" />
        ) : lastPayload ? (
          <pre className="ui-json-preview">
            {JSON.stringify(lastPayload, null, 2)}
          </pre>
        ) : (
          <Text className="ui-form__hint">
            The form serializes field values and selected file metadata to JSON.
          </Text>
        )}
      </Stack>
    </Card>
  );
}

function normalizeUploadEvent(event: UploadProps | UploadFile[]): UploadFile[] {
  if (Array.isArray(event)) {
    return event;
  }

  return event.fileList ?? [];
}
