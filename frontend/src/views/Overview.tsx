import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  BankOutlined,
  CalendarOutlined,
  CloudUploadOutlined,
  EnvironmentOutlined,
  ExclamationCircleOutlined,
  LoadingOutlined,
  PieChartOutlined,
  RiseOutlined,
  SafetyCertificateOutlined,
  TrophyOutlined,
  UnorderedListOutlined,
} from "@ant-design/icons";
import { Button, Card, Col, Progress, Row, Select, Spin, Statistic, Tag, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { Stack } from "@/components/ui";
import { api } from "@/lib/api";
import { lifecyclePhaseColor } from "@/lib/conference-visuals";
import type { Conference, ConferenceSummary } from "@/types/conference";

const STATUS_COLORS: Record<string, string> = {
  "on track": "#28a000",
  "attention needed": "#ff9000",
  "at risk": "#ff7a45",
  critical: "#ff4d4f",
  blocked: "#ff4d4f",
  "not started": "#696969",
  "in progress": "#0091ff",
  complete: "#28a000",
  closed: "#696969",
  cancelled: "#696969",
  active: "#28a000",
  planning: "#0091ff",
  completed: "#696969",
  pending: "#ff9000",
  risk: "#ff4d4f",
  proposed: "#5500b4",
  inactive: "#c8c6c6",
};

const SPONSORSHIP_COLORS: Record<string, string> = {
  "financially sponsored": "#0091ff",
  "financially co-sponsored": "#28a000",
  "technically co-sponsored": "#dc46f3",
};

const CARD_WINDOW_SIZE = 4;
const DEFAULT_EVENT_YEAR = 2026;
const FLAGSHIP_SERIES = [
  { key: "IV", label: "IV" },
  { key: "ITSC", label: "ITSC" },
];

type ChartDatum = { name: string; value: number };

function statusColor(value?: string | null) {
  return STATUS_COLORS[String(value ?? "").toLowerCase()] ?? "#0091ff";
}

function sponsorshipColor(value?: string | null) {
  return SPONSORSHIP_COLORS[String(value ?? "").toLowerCase()] ?? "#696969";
}

function chartTotal(data: ChartDatum[]) {
  return data.reduce((sum, item) => sum + Number(item.value ?? 0), 0);
}

function humanizeLabel(value: string) {
  return value
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function percentLabel(value: number, total: number) {
  if (!total) return "0%";
  return `${Math.round((Number(value) / total) * 100)}%`;
}

function renderChartLegend(
  data: ChartDatum[],
  total: number,
  colorFor: (entry: ChartDatum, index: number) => string,
  onSelect?: (entry: ChartDatum) => void,
) {
  return (
    <div className="overview-chart-legend">
      {data.map((entry, index) => {
        const content = (
          <>
          <span className="overview-chart-legend-dot" style={{ backgroundColor: colorFor(entry, index) }} />
          <span className="overview-chart-legend-label">{humanizeLabel(entry.name)}</span>
          <span className="overview-chart-legend-value">
            {entry.value} ({percentLabel(entry.value, total)})
          </span>
          </>
        );
        return onSelect ? (
          <button
            type="button"
            className="overview-chart-legend-item is-clickable"
            key={entry.name}
            onClick={() => onSelect(entry)}
            title={`View ${entry.name} conferences`}
          >
            {content}
          </button>
        ) : (
          <div className="overview-chart-legend-item" key={entry.name}>
            {content}
          </div>
        );
      })}
    </div>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatDateRange(card: any) {
  if (!card.start_date && !card.end_date) return "Dates not set";
  if (card.start_date && card.end_date) return `${formatDate(card.start_date)} – ${formatDate(card.end_date)}`;
  return formatDate(card.start_date ?? card.end_date);
}

function formatRecordNumber(value?: string | number | null) {
  if (value === null || value === undefined || value === "") return "Not assigned";
  const parsed = Number(value);
  if (Number.isFinite(parsed)) return String(Math.trunc(parsed));
  return String(value).replace(/\.0+$/, "");
}

function locationLabel(card: any) {
  return [card.city, card.country].filter(Boolean).join(", ") || "Location not set";
}

function conferenceTitle(card: any) {
  return card.canonical_name || card.official_title || `${card.acronym ?? "Conference"} ${card.year ?? ""}`;
}

function scoreLabel(value?: number | null) {
  return Number.isFinite(Number(value)) ? Math.round(Number(value)) : 0;
}

function dateSortValue(card: any) {
  const value = card.start_date ?? card.end_date;
  return value ? new Date(value).getTime() || 0 : 0;
}

function flagshipSeriesKey(card: any) {
  const acronym = String(card.acronym ?? "").toUpperCase();
  const series = String(card.conference_series ?? "").toUpperCase();
  if (acronym === "IV" || series === "IV" || series.includes("INTELLIGENT VEHICLES")) return "IV";
  if (acronym === "ITSC" || series === "ITSC" || series.includes("INTELLIGENT TRANSPORTATION SYSTEMS")) return "ITSC";
  return "";
}

function laneWindow(cards: any[], start: number) {
  if (cards.length <= CARD_WINDOW_SIZE) return cards;
  return Array.from({ length: CARD_WINDOW_SIZE }, (_, index) => cards[(start + index) % cards.length]);
}

function ConferenceCarouselCard({ card, onOpen }: { card: any; onOpen: () => void }) {
  const status = card.conference_status ?? card.status ?? "Status pending";
  const health = card.status_band ?? "Health pending";
  const showHealth = String(health).trim().toLowerCase() !== String(status).trim().toLowerCase();
  const sponsorship = card.sponsorship_type || "Sponsorship not set";
  const borderColor = sponsorshipColor(sponsorship);

  return (
    <button
      className="flagship-modern-card"
      style={{ borderLeftColor: borderColor }}
      onClick={onOpen}
    >
      <div className="flagship-modern-head">
        <div className="flagship-status-stack">
          <Tag className="status-tag-wrap" color={statusColor(status)}>{status}</Tag>
          {showHealth && <Tag className="status-tag-wrap" color={statusColor(health)}>{health}</Tag>}
        </div>
        <Progress
          type="circle"
          percent={scoreLabel(card.score)}
          size={42}
          strokeWidth={8}
          format={(value) => `${value ?? 0}`}
          strokeColor={statusColor(status)}
        />
      </div>
      <div className="flagship-modern-title">
        <strong>{card.acronym ? `${card.acronym} ${card.year}` : conferenceTitle(card)}</strong>
        <span>Record {formatRecordNumber(card.conference_number)}</span>
      </div>
      <div className="flagship-modern-meta">
        <span>
          <SafetyCertificateOutlined /> {card.lifecycle_phase || "Lifecycle not set"}
        </span>
        <span>
          <CalendarOutlined /> {formatDateRange(card)}
        </span>
        <span>
          <EnvironmentOutlined /> {locationLabel(card)}
        </span>
      </div>
    </button>
  );
}

export default function Overview() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<ConferenceSummary | null>(null);
  const [conferences, setConferences] = useState<Conference[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flagshipStarts, setFlagshipStarts] = useState<Record<string, number>>({});
  const [financialStart, setFinancialStart] = useState<number | undefined>(undefined);
  const [financialYear, setFinancialYear] = useState<number | "all">(DEFAULT_EVENT_YEAR);
  const [technicalStart, setTechnicalStart] = useState<number | undefined>(undefined);
  const [technicalYear, setTechnicalYear] = useState<number | "all">(DEFAULT_EVENT_YEAR);

  useEffect(() => {
    Promise.all([
      api<ConferenceSummary>("/dashboard/summary"),
      api<{ items: Conference[] }>("/conferences"),
    ])
      .then(([summaryData, conferenceData]) => {
        setSummary(summaryData);
        setConferences(conferenceData.items ?? []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load dashboard summary");
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    setFinancialStart(undefined);
  }, [financialYear]);

  useEffect(() => {
    setTechnicalStart(undefined);
  }, [technicalYear]);

  const flagshipCards = useMemo(() => {
    const cards = summary?.flagship_cards ?? [];
    return cards
      .filter((card: any) => card.conference_number)
      .sort((a: any, b: any) => {
        const seriesCompare = flagshipSeriesKey(a).localeCompare(flagshipSeriesKey(b));
        if (seriesCompare !== 0) return seriesCompare;
        return Number(a.year ?? 0) - Number(b.year ?? 0);
      });
  }, [summary]);

  const flagshipLanes = useMemo(() => {
    const grouped = new Map<string, any[]>();
    FLAGSHIP_SERIES.forEach((series) => grouped.set(series.key, []));
    flagshipCards.forEach((card: any) => {
      const key = flagshipSeriesKey(card);
      if (grouped.has(key)) grouped.get(key)?.push(card);
    });
    return FLAGSHIP_SERIES.map((series) => ({
      ...series,
      cards: grouped.get(series.key) ?? [],
    }));
  }, [flagshipCards]);

  const statusData = Object.entries(summary?.status_counts ?? {}).map(([name, value]) => ({ name, value }));
  const phaseData = Object.entries(summary?.phase_counts ?? {}).map(([name, value]) => ({ name, value }));
  const healthCounts = summary?.health_counts ?? {};
  const watchlistCount =
    (healthCounts["Attention Needed"] ?? 0) +
    (healthCounts["At Risk"] ?? 0) +
    (healthCounts.Critical ?? 0) +
    (healthCounts.Blocked ?? 0);
  const financiallySponsoredEvents = useMemo(
    () =>
      conferences
        .filter((conference) => {
          const sponsorship = String(conference.sponsorship_type ?? "").toLowerCase();
          return (
            conference.conference_number &&
            flagshipSeriesKey(conference) === "" &&
            sponsorship.includes("financially") &&
            !sponsorship.includes("technically")
          );
        })
        .sort((a, b) => dateSortValue(a) - dateSortValue(b)),
    [conferences],
  );
  const financialYearOptions = useMemo(() => {
    const years = Array.from(new Set(financiallySponsoredEvents.map((event) => event.year))).sort((a, b) => b - a);
    return [
      { label: "All years", value: "all" as const },
      ...years.map((year) => ({ label: String(year), value: year })),
    ];
  }, [financiallySponsoredEvents]);
  const filteredFinancialEvents = useMemo(
    () =>
      financialYear === "all"
        ? financiallySponsoredEvents
        : financiallySponsoredEvents.filter((event) => event.year === financialYear),
    [financialYear, financiallySponsoredEvents],
  );
  const technicallyCoSponsoredEvents = useMemo(
    () =>
      conferences
        .filter((conference) => {
          const sponsorship = String(conference.sponsorship_type ?? "").toLowerCase();
          return (
            conference.conference_number &&
            flagshipSeriesKey(conference) === "" &&
            sponsorship.includes("technically") &&
            sponsorship.includes("co-sponsored")
          );
        })
        .sort((a, b) => dateSortValue(a) - dateSortValue(b)),
    [conferences],
  );
  const technicalYearOptions = useMemo(() => {
    const years = Array.from(new Set(technicallyCoSponsoredEvents.map((event) => event.year))).sort((a, b) => b - a);
    return [
      { label: "All years", value: "all" as const },
      ...years.map((year) => ({ label: String(year), value: year })),
    ];
  }, [technicallyCoSponsoredEvents]);
  const filteredTechnicalEvents = useMemo(
    () =>
      technicalYear === "all"
        ? technicallyCoSponsoredEvents
        : technicallyCoSponsoredEvents.filter((event) => event.year === technicalYear),
    [technicalYear, technicallyCoSponsoredEvents],
  );

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "80px 0" }}>
        <Spin indicator={<LoadingOutlined style={{ fontSize: 36 }} spin />} />
        <p style={{ marginTop: 16, color: "#8c8c8c" }}>Loading dashboard...</p>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <div style={{ textAlign: "center", padding: 40 }}>
          <ExclamationCircleOutlined style={{ fontSize: 48, color: "#ff4d4f" }} />
          <Typography.Text type="danger" style={{ display: "block", marginTop: 16 }}>
            {error}
          </Typography.Text>
        </div>
      </Card>
    );
  }

  if (!summary) return null;

  const statusTotal = chartTotal(statusData);
  const phaseTotal = chartTotal(phaseData);

  const moveFlagshipLane = (seriesKey: string, direction: -1 | 1) => {
    const lane = flagshipLanes.find((item) => item.key === seriesKey);
    const count = lane?.cards.length ?? 0;
    const maxStart = Math.max(0, count - CARD_WINDOW_SIZE);
    if (count <= CARD_WINDOW_SIZE) return;
    setFlagshipStarts((current) => {
      const currentStart = current[seriesKey] ?? maxStart;
      const next = currentStart + direction;
      return {
        ...current,
        [seriesKey]: Math.min(Math.max(next, 0), maxStart),
      };
    });
  };

  const moveFinancialEvents = (direction: -1 | 1) => {
    const count = filteredFinancialEvents.length;
    const maxStart = Math.max(0, count - CARD_WINDOW_SIZE);
    if (count <= CARD_WINDOW_SIZE) return;
    setFinancialStart((current) => {
      const currentStart = current ?? maxStart;
      const next = currentStart + direction;
      return Math.min(Math.max(next, 0), maxStart);
    });
  };

  const moveTechnicalEvents = (direction: -1 | 1) => {
    const count = filteredTechnicalEvents.length;
    const maxStart = Math.max(0, count - CARD_WINDOW_SIZE);
    if (count <= CARD_WINDOW_SIZE) return;
    setTechnicalStart((current) => {
      const currentStart = current ?? maxStart;
      const next = currentStart + direction;
      return Math.min(Math.max(next, 0), maxStart);
    });
  };

  const financialMaxStart = Math.max(0, filteredFinancialEvents.length - CARD_WINDOW_SIZE);
  const currentFinancialStart = Math.min(financialStart ?? financialMaxStart, financialMaxStart);
  const visibleFinancialEvents = laneWindow(filteredFinancialEvents, currentFinancialStart);
  const technicalMaxStart = Math.max(0, filteredTechnicalEvents.length - CARD_WINDOW_SIZE);
  const currentTechnicalStart = Math.min(technicalStart ?? technicalMaxStart, technicalMaxStart);
  const visibleTechnicalEvents = laneWindow(filteredTechnicalEvents, currentTechnicalStart);

  return (
    <Stack className="overview-stack">
      <section className="overview-landing-hero">
        <div className="overview-landing-copy">
          <Typography.Text className="hero-kicker">IEEE ITSS Conferences</Typography.Text>
          <h1>Portfolio command center</h1>
          <p>
            Track readiness, sponsorship, financial closure, publication progress, and operational risk across the ITSS conferences.
          </p>
        </div>
        <div className="overview-landing-actions">
          <Link to="/imports">
            <Button type="primary" size="large" icon={<CloudUploadOutlined />}>
              Import Center
            </Button>
          </Link>
          <Link to="/status">
            <Button size="large" icon={<UnorderedListOutlined />}>
              System Status
            </Button>
          </Link>
        </div>
      </section>

      <Row gutter={[16, 16]} className="overview-metric-row">
        <Col xs={24} sm={12} xl={6}>
          <Card className="overview-metric-card is-records">
            <Statistic title="Portfolio Records" value={summary.conference_count} prefix={<BankOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card className="overview-metric-card is-alert">
            <Statistic title="Watchlist Conferences" value={watchlistCount} prefix={<ExclamationCircleOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card className="overview-metric-card is-score">
            <Statistic title="Average Progress Score" value={summary.average_score} precision={1} prefix={<TrophyOutlined />} suffix="/100" />
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card className="overview-metric-card is-surplus">
            <Statistic
              title="Average Actual Surplus"
              value={summary.average_surplus_percentage ?? "N/A"}
              precision={summary.average_surplus_percentage === null ? undefined : 1}
              prefix={<RiseOutlined />}
              suffix={summary.average_surplus_percentage === null ? undefined : "%"}
            />
            <Typography.Text type="secondary" className="overview-metric-note">
              {summary.actual_surplus_conference_count} conferences with actual financials
            </Typography.Text>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card className="overview-chart-card" title={<><PieChartOutlined /> Conference Status</>}>
            {statusData.length > 0 ? (
              <div className="overview-chart-shell">
                <div className="overview-donut-wrap">
                  <ResponsiveContainer width="100%" height={252}>
                    <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                      <Pie
                        data={statusData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={64}
                        outerRadius={96}
                        paddingAngle={3}
                        cornerRadius={7}
                        stroke="#ffffff"
                        strokeWidth={3}
                      >
                        {statusData.map((entry) => (
                          <Cell key={entry.name} fill={statusColor(entry.name)} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value, name) => [`${value} conferences`, humanizeLabel(String(name))]}
                        contentStyle={{
                          border: "1px solid rgba(0, 26, 84, 0.12)",
                          borderRadius: 8,
                          boxShadow: "0 10px 24px rgba(0, 26, 84, 0.12)",
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="overview-donut-center">
                    <strong>{statusTotal}</strong>
                    <span>Conferences</span>
                  </div>
                </div>
                {renderChartLegend(
                  statusData,
                  statusTotal,
                  (entry) => statusColor(entry.name),
                  (entry) => navigate(`/conferences?status=${encodeURIComponent(entry.name)}`),
                )}
              </div>
            ) : (
              <Typography.Text type="secondary">No status data available</Typography.Text>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card className="overview-chart-card" title={<><PieChartOutlined /> Conference Lifecycle</>}>
            {phaseData.length > 0 ? (
              <div className="overview-chart-shell">
                <div className="overview-donut-wrap">
                  <ResponsiveContainer width="100%" height={252}>
                    <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                      <Pie
                        data={phaseData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={64}
                        outerRadius={96}
                        paddingAngle={3}
                        cornerRadius={7}
                        stroke="#ffffff"
                        strokeWidth={3}
                      >
                        {phaseData.map((entry) => (
                          <Cell key={entry.name} fill={lifecyclePhaseColor(entry.name)} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value, name) => [`${value} conferences`, humanizeLabel(String(name))]}
                        contentStyle={{
                          border: "1px solid rgba(0, 26, 84, 0.12)",
                          borderRadius: 8,
                          boxShadow: "0 10px 24px rgba(0, 26, 84, 0.12)",
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="overview-donut-center">
                    <strong>{phaseTotal}</strong>
                    <span>Conferences</span>
                  </div>
                </div>
                {renderChartLegend(
                  phaseData,
                  phaseTotal,
                  (entry) => lifecyclePhaseColor(entry.name),
                  (entry) => navigate(`/conferences?phase=${encodeURIComponent(entry.name)}`),
                )}
              </div>
            ) : (
              <Typography.Text type="secondary">No phase data available</Typography.Text>
            )}
          </Card>
        </Col>
      </Row>

      {flagshipCards.length > 0 && (
        <Card
          className="overview-flagship-panel"
          title={
            <span>
              <TrophyOutlined /> Flagship Conferences
            </span>
          }
        >
          <div className="flagship-swimlanes">
            {flagshipLanes.map((lane) => {
              const maxStart = Math.max(0, lane.cards.length - CARD_WINDOW_SIZE);
              const start = flagshipStarts[lane.key] ?? maxStart;
              const visibleCards = laneWindow(lane.cards, start);
              return (
                <section className="flagship-swimlane" key={lane.key}>
                  <div className="flagship-swimlane-head">
                    <div>
                      <Typography.Title level={5}>{lane.label}</Typography.Title>
                      <Typography.Text type="secondary">{lane.cards.length} conference records</Typography.Text>
                    </div>
                    <div className="flagship-carousel-controls">
                      <Button
                        className="flagship-nav-button"
                        shape="circle"
                        icon={<ArrowLeftOutlined />}
                        disabled={lane.cards.length <= CARD_WINDOW_SIZE || start <= 0}
                        onClick={() => moveFlagshipLane(lane.key, -1)}
                      />
                      <span>
                        {lane.cards.length
                          ? `${Math.min(start + 1, lane.cards.length)}-${Math.min(start + CARD_WINDOW_SIZE, lane.cards.length)} of ${lane.cards.length}`
                          : "0 of 0"}
                      </span>
                      <Button
                        className="flagship-nav-button"
                        shape="circle"
                        icon={<ArrowRightOutlined />}
                        disabled={lane.cards.length <= CARD_WINDOW_SIZE || start >= maxStart}
                        onClick={() => moveFlagshipLane(lane.key, 1)}
                      />
                    </div>
                  </div>

                  <div className="flagship-carousel-grid">
                    {visibleCards.map((card: any) => (
                      <ConferenceCarouselCard
                        key={card.id ?? `${card.acronym}-${card.year}`}
                        card={card}
                        onOpen={() => card.id && navigate(`/conferences/${card.id}`)}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </Card>
      )}

      <Card
        className="overview-flagship-panel"
        title={
          <span>
            <BankOutlined /> Financially Sponsored Events
          </span>
        }
        extra={
          <div className="financial-events-toolbar">
            <Select
              className="year-select"
              value={financialYear}
              options={financialYearOptions}
              onChange={setFinancialYear}
            />
            <div className="flagship-carousel-controls">
              <Button
                className="flagship-nav-button"
                shape="circle"
                icon={<ArrowLeftOutlined />}
                disabled={filteredFinancialEvents.length <= CARD_WINDOW_SIZE || currentFinancialStart <= 0}
                onClick={() => moveFinancialEvents(-1)}
              />
              <span>
                {filteredFinancialEvents.length
                  ? `${Math.min(currentFinancialStart + 1, filteredFinancialEvents.length)}-${Math.min(currentFinancialStart + CARD_WINDOW_SIZE, filteredFinancialEvents.length)} of ${filteredFinancialEvents.length}`
                  : "0 of 0"}
              </span>
              <Button
                className="flagship-nav-button"
                shape="circle"
                icon={<ArrowRightOutlined />}
                disabled={filteredFinancialEvents.length <= CARD_WINDOW_SIZE || currentFinancialStart >= financialMaxStart}
                onClick={() => moveFinancialEvents(1)}
              />
            </div>
          </div>
        }
      >
        {visibleFinancialEvents.length ? (
          <div className="flagship-carousel-grid">
            {visibleFinancialEvents.map((card: Conference) => (
              <ConferenceCarouselCard
                key={card.id}
                card={card}
                onOpen={() => navigate(`/conferences/${card.id}`)}
              />
            ))}
          </div>
        ) : (
          <Typography.Text type="secondary">No financially sponsored non-flagship events found for this year.</Typography.Text>
        )}
      </Card>

      <Card
        className="overview-flagship-panel"
        title={
          <span>
            <SafetyCertificateOutlined /> Technically Co-Sponsored Events
          </span>
        }
        extra={
          <div className="financial-events-toolbar">
            <Select
              className="year-select"
              value={technicalYear}
              options={technicalYearOptions}
              onChange={setTechnicalYear}
            />
            <div className="flagship-carousel-controls">
              <Button
                className="flagship-nav-button"
                shape="circle"
                icon={<ArrowLeftOutlined />}
                disabled={filteredTechnicalEvents.length <= CARD_WINDOW_SIZE || currentTechnicalStart <= 0}
                onClick={() => moveTechnicalEvents(-1)}
              />
              <span>
                {filteredTechnicalEvents.length
                  ? `${Math.min(currentTechnicalStart + 1, filteredTechnicalEvents.length)}-${Math.min(currentTechnicalStart + CARD_WINDOW_SIZE, filteredTechnicalEvents.length)} of ${filteredTechnicalEvents.length}`
                  : "0 of 0"}
              </span>
              <Button
                className="flagship-nav-button"
                shape="circle"
                icon={<ArrowRightOutlined />}
                disabled={filteredTechnicalEvents.length <= CARD_WINDOW_SIZE || currentTechnicalStart >= technicalMaxStart}
                onClick={() => moveTechnicalEvents(1)}
              />
            </div>
          </div>
        }
      >
        {visibleTechnicalEvents.length ? (
          <div className="flagship-carousel-grid">
            {visibleTechnicalEvents.map((card: Conference) => (
              <ConferenceCarouselCard
                key={card.id}
                card={card}
                onOpen={() => navigate(`/conferences/${card.id}`)}
              />
            ))}
          </div>
        ) : (
          <Typography.Text type="secondary">No technically co-sponsored non-flagship events found for this year.</Typography.Text>
        )}
      </Card>
    </Stack>
  );
}
