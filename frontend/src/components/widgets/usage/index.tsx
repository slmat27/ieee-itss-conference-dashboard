import {
  CheckCircleOutlined,
  DollarOutlined,
  FieldTimeOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { Skeleton } from "antd";
import type { CSSProperties, ReactNode } from "react";

import { Card } from "@/components/ui";
import { cn } from "@/lib/utils";

import { useUsageSummary } from "./use-usage-summary";
import "./usage-dashboard-widget.css";

export type UsageDashboardWidgetProps = Readonly<{
  endpoint?: string;
  refreshIntervalMs?: number;
  className?: string;
  style?: CSSProperties;
}>;

type UsageMetric = Readonly<{
  key: string;
  label: string;
  value: number;
  icon: ReactNode;
  formatter: (value: number) => string;
}>;

/**
 * Compact dashboard widget for the boilerplate usage contract: runs,
 * completed runs, consumed tokens, and accumulated cost.
 */
export function UsageDashboardWidget({
  endpoint = "/api/usage",
  refreshIntervalMs,
  className,
  style,
}: UsageDashboardWidgetProps) {
  const { data, isLoading } = useUsageSummary({
    endpoint,
    refreshIntervalMs,
  });
  const metrics: UsageMetric[] = [
    {
      key: "runs",
      label: "Runs",
      value: data.runs,
      icon: <FieldTimeOutlined aria-hidden="true" />,
      formatter: formatInteger,
    },
    {
      key: "completed",
      label: "Completed",
      value: data.completed,
      icon: <CheckCircleOutlined aria-hidden="true" />,
      formatter: formatInteger,
    },
    {
      key: "tokens",
      label: "Tokens",
      value: data.tokens,
      icon: <ThunderboltOutlined aria-hidden="true" />,
      formatter: formatCompactInteger,
    },
    {
      key: "cost",
      label: "Cost",
      value: data.cost,
      icon: <DollarOutlined aria-hidden="true" />,
      formatter: formatCost,
    },
  ];

  return (
    <section
      aria-label="Usage summary"
      className={cn("usage-widget", className)}
      style={style}
    >
      {metrics.map((metric) => (
        <Card className="usage-widget__card" key={metric.key} compact>
          {isLoading ? (
            <Skeleton active paragraph={false} title={{ width: "64%" }} />
          ) : (
            <>
              <div className="usage-widget__metric-row">
                <strong className="usage-widget__value">
                  {metric.formatter(metric.value)}
                </strong>
                <span className="usage-widget__icon">{metric.icon}</span>
              </div>
              <span className="usage-widget__label">{metric.label}</span>
            </>
          )}
        </Card>
      ))}
    </section>
  );
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);
}

function formatCompactInteger(value: number): string {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 1,
    notation: "compact",
  }).format(value);
}

function formatCost(value: number): string {
  const fractionDigits = value > 0 && value < 1 ? 4 : 2;

  return new Intl.NumberFormat(undefined, {
    currency: "USD",
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
    style: "currency",
  }).format(value);
}
