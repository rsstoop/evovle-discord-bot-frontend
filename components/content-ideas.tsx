"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, TrendingUp, MessageSquare, Flame } from "lucide-react";

const trendingTopics = [
  { topic: "Dropshipping vs. Private Label", count: 47, trend: "up" },
  { topic: "TikTok Shop strategies", count: 38, trend: "up" },
  { topic: "Product research tools", count: 31, trend: "stable" },
  { topic: "Facebook Ads optimization", count: 28, trend: "up" },
  { topic: "Supplier communication", count: 22, trend: "down" },
];

const faqs = [
  { question: "How to start with $500?", mentions: 15 },
  { question: "Best product categories Q4?", mentions: 12 },
  { question: "Shopify vs WooCommerce?", mentions: 9 },
  { question: "CPA vs ROAS tracking?", mentions: 8 },
];

export function ContentIdeas() {
  const [messages, setMessages] = useState<Array<{ role: "user" | "bot"; content: string }>>([
    {
      role: "bot",
      content: "Hey! I've analyzed your community discussions. What content ideas would you like to explore? I can help you understand trending topics and member needs.",
    },
  ]);
  const [input, setInput] = useState("");

  const handleSend = () => {
    if (!input.trim()) return;

    setMessages([...messages, { role: "user", content: input }]);
    
    // Simulate bot response
    setTimeout(() => {
      const responses = [
        "Based on recent discussions, your members are highly interested in TikTok Shop strategies. A post about '5 TikTok Shop mistakes to avoid' could perform well.",
        "I notice dropshipping vs private label is trending. Consider creating content comparing both models with real ROI examples.",
        "Facebook Ads optimization is hot right now. Your audience would love a breakdown of testing strategies that actually work.",
        "Product research is a constant pain point. A free tool comparison guide would provide massive value to your community.",
      ];
      const randomResponse = responses[Math.floor(Math.random() * responses.length)];
      setMessages((prev) => [...prev, { role: "bot", content: randomResponse }]);
    }, 1000);

    setInput("");
  };

  return (
    <div className="p-4 lg:p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl lg:text-4xl font-bold tracking-tight">Content Ideas</h1>
        <p className="text-muted-foreground mt-2">
          Discover what your community needs and transform insights into engaging content
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Chat Interface */}
        <Card className="lg:col-span-2 flex flex-col h-[600px]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              Community Insights Chat
            </CardTitle>
            <CardDescription>
              Chat with the bot to brainstorm content based on community trends
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col p-0">
            <ScrollArea className="flex-1 px-6">
              <div className="space-y-4 pb-4">
                {messages.map((message, i) => (
                  <div
                    key={i}
                    className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg px-4 py-3 ${
                        message.role === "user"
                          ? "bg-primary text-white"
                          : "bg-muted text-foreground"
                      }`}
                    >
                      <p className="text-sm">{message.content}</p>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
            <div className="p-4 border-t border-border">
              <div className="flex gap-2">
                <Input
                  placeholder="Ask about trending topics or content ideas..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && handleSend()}
                  className="flex-1"
                />
                <Button onClick={handleSend} size="icon" className="shrink-0">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Trending Topics */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Flame className="h-5 w-5 text-primary" />
                Hot Topics
              </CardTitle>
              <CardDescription>Most discussed this week</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {trendingTopics.map((item, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-accent/50 hover:bg-accent transition-colors">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{item.topic}</p>
                    <p className="text-xs text-muted-foreground">{item.count} mentions</p>
                  </div>
                  <TrendingUp
                    className={`h-4 w-4 ${
                      item.trend === "up"
                        ? "text-primary"
                        : item.trend === "down"
                        ? "text-muted-foreground rotate-180"
                        : "text-muted-foreground rotate-90"
                    }`}
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-primary" />
                Common Questions
              </CardTitle>
              <CardDescription>Top FAQs from members</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {faqs.map((item, i) => (
                <div key={i} className="p-3 rounded-lg bg-accent/50 hover:bg-accent transition-colors">
                  <p className="text-sm font-medium">{item.question}</p>
                  <p className="text-xs text-muted-foreground mt-1">{item.mentions} times asked</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}



