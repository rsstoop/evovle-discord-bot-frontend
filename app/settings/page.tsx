"use client";

import { Sidebar } from "@/components/sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useEffect } from "react";
import { Trash2, Plus, ExternalLink } from "lucide-react";

export default function Settings() {
  const [channelIds, setChannelIds] = useState<string[]>([]);
  const [newChannelId, setNewChannelId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);

  useEffect(() => {
    fetchChannelIds();
  }, []);

  const fetchChannelIds = async () => {
    try {
      const res = await fetch("/api/dashboard");
      if (res.ok) {
        const data = await res.json();
        setChannelIds(data.included_channel_ids || []);
      }
    } catch (error) {
      console.error("Failed to fetch channel IDs:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch("/api/dashboard", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ included_channel_ids: channelIds }),
      });
      if (res.ok) {
        alert("Channel IDs saved successfully!");
      } else {
        const error = await res.json();
        alert(error.error || "Failed to save channel IDs");
      }
    } catch (error) {
      console.error("Failed to save channel IDs:", error);
      alert("Failed to save channel IDs");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAdd = () => {
    const trimmed = newChannelId.trim();
    if (trimmed && !channelIds.includes(trimmed)) {
      setChannelIds([...channelIds, trimmed]);
      setNewChannelId("");
    }
  };

  const handleRemove = (index: number) => {
    setChannelIds(channelIds.filter((_, i) => i !== index));
  };
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 lg:pl-56">
        <div className="p-4 lg:p-8 space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-3xl lg:text-4xl font-bold tracking-tight">Settings</h1>
            <p className="text-muted-foreground mt-2">
              Manage Discord channel configuration
            </p>
          </div>

          <div className="max-w-3xl space-y-6">
            {/* Discord Channel IDs */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Discord Channel IDs</CardTitle>
                    <CardDescription>Manage which Discord channels are included in the dashboard</CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowInstructions(!showInstructions)}
                    className="text-xs"
                  >
                    <ExternalLink className="h-3 w-3 mr-1" />
                    {showInstructions ? "Hide" : "Show"} Instructions
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {showInstructions && (
                  <div className="bg-muted/50 border border-border rounded-md p-4 space-y-2 text-sm">
                    <p className="font-medium">How to get a Discord Channel ID:</p>
                    <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                      <li>Open Discord and go to your server</li>
                      <li>Right-click on the channel you want to include</li>
                      <li>Click "Copy Channel ID" (you may need to enable Developer Mode first)</li>
                      <li>If "Copy Channel ID" is not visible, go to User Settings → Advanced → Enable Developer Mode</li>
                      <li>Paste the channel ID in the field below and click Add</li>
                    </ol>
                  </div>
                )}
                
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Enter Discord channel ID"
                      value={newChannelId}
                      onChange={(e) => setNewChannelId(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAdd();
                        }
                      }}
                    />
                    <Button onClick={handleAdd} disabled={!newChannelId.trim()}>
                      <Plus className="h-4 w-4 mr-1" />
                      Add
                    </Button>
                  </div>

                  {isLoading ? (
                    <p className="text-sm text-muted-foreground">Loading channel IDs...</p>
                  ) : channelIds.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No channel IDs added yet</p>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {channelIds.map((id, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-2 bg-muted/30 rounded border border-border"
                        >
                          <code className="text-xs font-mono">{id}</code>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => handleRemove(index)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex justify-end pt-2">
                  <Button onClick={handleSave} disabled={isSaving}>
                    {isSaving ? "Saving..." : "Save Channel IDs"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}



