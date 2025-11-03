import { Sidebar } from "@/components/sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, MessageSquare, TrendingUp, Activity } from "lucide-react";

const stats = [
  {
    title: "Active Members",
    value: "2,847",
    change: "+12% from last week",
    icon: Users,
  },
  {
    title: "Daily Messages",
    value: "1,234",
    change: "+8% from yesterday",
    icon: MessageSquare,
  },
  {
    title: "Engagement Rate",
    value: "68%",
    change: "+3% from last week",
    icon: TrendingUp,
  },
  {
    title: "Bot Interactions",
    value: "847",
    change: "+15% from last week",
    icon: Activity,
  },
];

export default function Analytics() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 lg:pl-56">
        <div className="p-4 lg:p-8 space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-3xl lg:text-4xl font-bold tracking-tight">Analytics</h1>
            <p className="text-muted-foreground mt-2">
              Track your community growth and engagement metrics
            </p>
          </div>

          {/* Stats Grid */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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

          {/* Additional Analytics */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Top Contributors</CardTitle>
                <CardDescription>Most active community members this week</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { name: "Sarah M.", messages: 142, helpful: 38 },
                  { name: "Mike Chen", messages: 128, helpful: 31 },
                  { name: "Alex K.", messages: 97, helpful: 24 },
                  { name: "Jordan P.", messages: 85, helpful: 19 },
                ].map((user, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-accent/50">
                    <div>
                      <p className="font-medium">{user.name}</p>
                      <p className="text-sm text-muted-foreground">{user.messages} messages</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-primary">{user.helpful} helpful</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Channel Activity</CardTitle>
                <CardDescription>Messages by channel this week</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { channel: "#general", messages: 1847, percentage: 35 },
                  { channel: "#product-research", messages: 1234, percentage: 23 },
                  { channel: "#marketing", messages: 982, percentage: 19 },
                  { channel: "#tech-support", messages: 743, percentage: 14 },
                ].map((channel, i) => (
                  <div key={i} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-sm">{channel.channel}</p>
                      <p className="text-sm text-muted-foreground">{channel.messages}</p>
                    </div>
                    <div className="w-full bg-secondary rounded-full h-2">
                      <div
                        className="bg-primary h-2 rounded-full transition-all"
                        style={{ width: `${channel.percentage}%` }}
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}



