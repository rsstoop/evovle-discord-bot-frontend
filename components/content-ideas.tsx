"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Activity } from "lucide-react";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { DateRange } from "react-day-picker";
import { subDays, formatISO, format } from "date-fns";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";

const otherStats = [
  {
    title: "Bot Interactions",
    value: "847",
    change: "+15% from last week",
    icon: Activity,
  },
];

export function ContentIdeas() {
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 7),
    to: new Date(),
  });
  const [activeMembers, setActiveMembers] = useState<{ value: string; change: string } | null>(null);
  const [loadingActiveMembers, setLoadingActiveMembers] = useState(false);
  const [botInteractions, setBotInteractions] = useState<{ value: string; change: string } | null>(null);
  const [loadingBotInteractions, setLoadingBotInteractions] = useState(false);
  const [dailyMessages, setDailyMessages] = useState<Array<{ date: string; count: number }>>([]);
  const [loadingDailyMessages, setLoadingDailyMessages] = useState(false);
  const [topContributors, setTopContributors] = useState<Array<{ name: string; messages: number }>>([]);
  const [loadingTopContributors, setLoadingTopContributors] = useState(false);
  const [channelActivity, setChannelActivity] = useState<Array<{ channel: string; messages: number; percentage: number }>>([]);
  const [loadingChannelActivity, setLoadingChannelActivity] = useState(false);

  // Fetch active members when date range changes
  useEffect(() => {
    if (!dateRange?.from || !dateRange?.to) {
      setActiveMembers(null);
      return;
    }

    const fetchActiveMembers = async () => {
      setLoadingActiveMembers(true);
      try {
        // Send full ISO timestamps with proper day boundaries
        const fromDateISO = new Date(dateRange.from!);
        fromDateISO.setUTCHours(0, 0, 0, 0);
        const fromDateISOString = fromDateISO.toISOString();
        
        const toDateWithTime = new Date(dateRange.to!);
        toDateWithTime.setUTCHours(23, 59, 59, 999);
        const toDateISO = toDateWithTime.toISOString();
        
        const response = await fetch(
          `/api/analytics/active-members?from=${encodeURIComponent(fromDateISOString)}&to=${encodeURIComponent(toDateISO)}`
        );

        if (!response.ok) {
          throw new Error('Failed to fetch active members');
        }

        const data = await response.json();
        setActiveMembers({
          value: data.count.toLocaleString(),
          change: data.change,
        });
      } catch (error) {
        console.error('Error fetching active members:', error);
        setActiveMembers({ value: "—", change: "Error loading data" });
      } finally {
        setLoadingActiveMembers(false);
      }
    };

    fetchActiveMembers();
  }, [dateRange]);

  // Fetch bot interactions when date range changes
  useEffect(() => {
    if (!dateRange?.from || !dateRange?.to) {
      setBotInteractions(null);
      return;
    }

    const fetchBotInteractions = async () => {
      setLoadingBotInteractions(true);
      try {
        const fromDate = formatISO(dateRange.from!, { representation: 'date' });
        const toDate = formatISO(dateRange.to!, { representation: 'date' });
        
        // Add time to make it end of day for 'to' date
        const toDateWithTime = new Date(dateRange.to!);
        toDateWithTime.setHours(23, 59, 59, 999);
        const toDateISO = toDateWithTime.toISOString();
        
        const fromDateISO = new Date(dateRange.from!);
        fromDateISO.setHours(0, 0, 0, 0);
        const fromDateISOString = fromDateISO.toISOString();

        const response = await fetch(
          `/api/analytics/bot-interactions?from=${encodeURIComponent(fromDateISOString)}&to=${encodeURIComponent(toDateISO)}`
        );

        if (!response.ok) {
          throw new Error('Failed to fetch bot interactions');
        }

        const data = await response.json();
        setBotInteractions({
          value: data.count.toLocaleString(),
          change: data.change,
        });
      } catch (error) {
        console.error('Error fetching bot interactions:', error);
        setBotInteractions({ value: "—", change: "Error loading data" });
      } finally {
        setLoadingBotInteractions(false);
      }
    };

    fetchBotInteractions();
  }, [dateRange]);

  // Fetch daily messages when date range changes
  useEffect(() => {
    if (!dateRange?.from || !dateRange?.to) {
      setDailyMessages([]);
      return;
    }

    const fetchDailyMessages = async () => {
      setLoadingDailyMessages(true);
      try {
        // Send plain YYYY-MM-DD strings. The API will handle UTC conversion and full-day padding.
        const fromDate = format(dateRange.from!, "yyyy-MM-dd");
        const toDate = format(dateRange.to!, "yyyy-MM-dd");

        const response = await fetch(
          `/api/analytics/daily-messages?from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(toDate)}`
        );

        if (!response.ok) {
          throw new Error('Failed to fetch daily messages');
        }

        const data = await response.json();
        setDailyMessages(Array.isArray(data.data) ? data.data : []);
      } catch (error) {
        console.error('Error fetching daily messages:', error);
        setDailyMessages([]);
      } finally {
        setLoadingDailyMessages(false);
      }
    };

    fetchDailyMessages();
  }, [dateRange]);

  // Fetch top contributors when date range changes
  useEffect(() => {
    if (!dateRange?.from || !dateRange?.to) {
      setTopContributors([]);
      return;
    }

    const fetchTopContributors = async () => {
      setLoadingTopContributors(true);
      try {
        // Send full ISO timestamps with proper day boundaries
        const fromDateISO = new Date(dateRange.from!);
        fromDateISO.setUTCHours(0, 0, 0, 0);
        const fromDateISOString = fromDateISO.toISOString();
        
        const toDateWithTime = new Date(dateRange.to!);
        toDateWithTime.setUTCHours(23, 59, 59, 999);
        const toDateISO = toDateWithTime.toISOString();

        const response = await fetch(
          `/api/analytics/top-contributors?from=${encodeURIComponent(fromDateISOString)}&to=${encodeURIComponent(toDateISO)}`
        );

        if (!response.ok) {
          throw new Error('Failed to fetch top contributors');
        }

        const data = await response.json();
        setTopContributors(Array.isArray(data.data) ? data.data : []);
      } catch (error) {
        console.error('Error fetching top contributors:', error);
        setTopContributors([]);
      } finally {
        setLoadingTopContributors(false);
      }
    };

    fetchTopContributors();
  }, [dateRange]);

  // Fetch channel activity when date range changes
  useEffect(() => {
    if (!dateRange?.from || !dateRange?.to) {
      setChannelActivity([]);
      return;
    }

    const fetchChannelActivity = async () => {
      setLoadingChannelActivity(true);
      try {
        // Send full ISO timestamps with proper day boundaries
        const fromDateISO = new Date(dateRange.from!);
        fromDateISO.setUTCHours(0, 0, 0, 0);
        const fromDateISOString = fromDateISO.toISOString();
        
        const toDateWithTime = new Date(dateRange.to!);
        toDateWithTime.setUTCHours(23, 59, 59, 999);
        const toDateISO = toDateWithTime.toISOString();

        const response = await fetch(
          `/api/analytics/channel-activity?from=${encodeURIComponent(fromDateISOString)}&to=${encodeURIComponent(toDateISO)}`
        );

        if (!response.ok) {
          throw new Error('Failed to fetch channel activity');
        }

        const data = await response.json();
        setChannelActivity(Array.isArray(data.data) ? data.data : []);
      } catch (error) {
        console.error('Error fetching channel activity:', error);
        setChannelActivity([]);
      } finally {
        setLoadingChannelActivity(false);
      }
    };

    fetchChannelActivity();
  }, [dateRange]);


  const stats = [
    {
      title: "Active Members",
      value: loadingActiveMembers ? "Loading..." : (activeMembers?.value || "—"),
      change: activeMembers?.change || "—",
      icon: Users,
    },
    {
      title: "Bot Interactions",
      value: loadingBotInteractions ? "Loading..." : (botInteractions?.value || "—"),
      change: botInteractions?.change || "—",
      icon: Activity,
    },
  ];

  return (
    <div className="p-4 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl lg:text-4xl font-bold tracking-tight">Content Analytics</h1>
          <p className="text-muted-foreground mt-2">
            Track your community growth and engagement metrics for channels where Chad is enabled
          </p>
        </div>
        <div className="flex-shrink-0">
          <DateRangePicker date={dateRange} onDateChange={setDateRange} />
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2">
        {stats.map((stat, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-primary mt-1">{stat.change}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts and Analytics Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Daily Messages Chart - Takes 2 columns on large screens */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Daily Messages</CardTitle>
            <CardDescription>
              Messages sent per day in the selected range
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingDailyMessages ? (
              <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
                Loading daily messages...
              </div>
            ) : dailyMessages.length === 0 ? (
              <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
                No messages in this range
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart
                  data={dailyMessages.map((d) => ({
                    date: d.date,
                    messages: d.count,
                  }))}
                  margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="colorMessages" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tickFormatter={(value) => {
                      // value is YYYY-MM-DD, format to MM/DD
                      // We treat the string as a local date component by replacing hyphens with slashes
                      // or using date-fns parseISO, but simple string splitting is safest for display
                      const [y, m, d] = value.split('-');
                      return `${m}/${d}`;
                    }}
                    style={{ fontSize: "12px", fill: "hsl(var(--muted-foreground))" }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    style={{ fontSize: "12px", fill: "hsl(var(--muted-foreground))" }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "6px",
                    }}
                    // Display full date in tooltip
                    labelFormatter={(value) => {
                      const [y, m, d] = value.split('-');
                      return `${new Date(Number(y), Number(m)-1, Number(d)).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
                    }}
                    formatter={(value: any) => [value, "Messages"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="messages"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    fill="url(#colorMessages)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Top Contributors - Takes 1 column on large screens */}
        <Card>
          <CardHeader>
            <CardTitle>Top Contributors</CardTitle>
            <CardDescription>Most active community members in the selected range</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadingTopContributors ? (
              <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                Loading contributors...
              </div>
            ) : topContributors.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                No contributors in this range
              </div>
            ) : (
              topContributors.map((user, i) => {
                const maxMessages = topContributors[0]?.messages || 1
                const percentage = (user.messages / maxMessages) * 100
                return (
                  <div key={i} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-sm">{user.name}</p>
                      <p className="text-sm text-muted-foreground">{user.messages.toLocaleString()}</p>
                    </div>
                    <div className="w-full bg-secondary rounded-full h-2">
                      <div
                        className="bg-primary h-2 rounded-full transition-all"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* Channel Activity - Full width on large screens */}
      <Card>
        <CardHeader>
          <CardTitle>Channel Activity</CardTitle>
          <CardDescription>Messages by channel in the selected range</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingChannelActivity ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              Loading channel activity...
            </div>
          ) : channelActivity.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              No channel activity in this range
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {channelActivity.map((channel, i) => (
                <div key={i} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-sm">{channel.channel}</p>
                    <p className="text-sm text-muted-foreground">{channel.messages.toLocaleString()}</p>
                  </div>
                  <div className="w-full bg-secondary rounded-full h-2">
                    <div
                      className="bg-primary h-2 rounded-full transition-all"
                      style={{ width: `${channel.percentage}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
