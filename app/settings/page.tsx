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
  const [greetingReplyGuidelines, setGreetingReplyGuidelines] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingGuidelines, setIsSavingGuidelines] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    fetchChannelIds();
  }, []);

  const fetchChannelIds = async () => {
    try {
      const res = await fetch("/api/dashboard");
      if (res.ok) {
        const data = await res.json();
        setChannelIds(data.included_channel_ids || []);
        setGreetingReplyGuidelines(data.greeting_reply_guidelines || "");
      }
    } catch (error) {
      console.error("Failed to fetch dashboard data:", error);
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
    setErrorMessage("");
    
    if (!trimmed) {
      setErrorMessage("Please enter a channel ID");
      return;
    }
    
    if (channelIds.includes(trimmed)) {
      setErrorMessage("This channel ID is already added");
      return;
    }
    
    setChannelIds([...channelIds, trimmed]);
    setNewChannelId("");
    setErrorMessage("");
  };

  const handleRemove = (index: number) => {
    setChannelIds(channelIds.filter((_, i) => i !== index));
  };

  const handleSaveGuidelines = async () => {
    setIsSavingGuidelines(true);
    try {
      const res = await fetch("/api/dashboard", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ greeting_reply_guidelines: greetingReplyGuidelines }),
      });
      if (res.ok) {
        alert("Greeting reply guidelines saved successfully!");
      } else {
        const error = await res.json();
        alert(error.error || "Failed to save greeting reply guidelines");
      }
    } catch (error) {
      console.error("Failed to save greeting reply guidelines:", error);
      alert("Failed to save greeting reply guidelines");
    } finally {
      setIsSavingGuidelines(false);
    }
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
            {/* Greeting Reply Guidelines */}
            <Card>
              <CardHeader>
                <CardTitle>Greeting Reply Guidelines</CardTitle>
                <CardDescription>
                  Configure guidelines for how Chad should respond to greetings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label htmlFor="guidelines" className="text-sm font-medium">
                      Guidelines
                    </label>
                    <span className={`text-xs ${
                      greetingReplyGuidelines.length > 750 
                        ? 'text-destructive' 
                        : greetingReplyGuidelines.length > 600 
                        ? 'text-yellow-500' 
                        : 'text-muted-foreground'
                    }`}>
                      {greetingReplyGuidelines.length} / 750
                    </span>
                  </div>
                  <textarea
                    id="guidelines"
                    maxLength={750}
                    className="flex min-h-[200px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y"
                    placeholder="Enter guidelines for greeting replies..."
                    value={greetingReplyGuidelines}
                    onChange={(e) => {
                      if (e.target.value.length <= 750) {
                        setGreetingReplyGuidelines(e.target.value);
                      }
                    }}
                  />
                  {greetingReplyGuidelines.length >= 750 && (
                    <p className="text-xs text-destructive">
                      Maximum character limit reached
                    </p>
                  )}
                </div>

                <div className="flex justify-end pt-2">
                  <Button 
                    onClick={handleSaveGuidelines} 
                    disabled={isSavingGuidelines || greetingReplyGuidelines.length > 750}
                  >
                    {isSavingGuidelines ? "Saving..." : "Save Guidelines"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Active Channels */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Active Channels</CardTitle>
                    <CardDescription>
                      Manage which Discord channels Chad is enabled in
                    </CardDescription>
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
                  <div className="bg-muted/50 border border-border rounded-lg p-4 space-y-2 text-sm">
                    <p className="font-medium text-foreground">How to get a Discord Channel ID:</p>
                    <ol className="list-decimal list-inside space-y-1.5 text-muted-foreground ml-2">
                      <li>Open Discord and go to your server</li>
                      <li>Right-click on the channel you want to include</li>
                      <li>Click &quot;Copy Channel ID&quot; (you may need to enable Developer Mode first)</li>
                      <li>If &quot;Copy Channel ID&quot; is not visible, go to User Settings → Advanced → Enable Developer Mode</li>
                      <li>Paste the channel ID in the field below and click Add</li>
                    </ol>
                  </div>
                )}
                
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <Input
                          placeholder="Paste Discord channel ID here..."
                          value={newChannelId}
                          onChange={(e) => {
                            setNewChannelId(e.target.value);
                            setErrorMessage("");
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleAdd();
                            }
                          }}
                          className={`font-mono text-sm ${errorMessage ? 'border-destructive' : ''}`}
                        />
                      </div>
                      <Button 
                        onClick={handleAdd} 
                        disabled={!newChannelId.trim()}
                        className="shrink-0"
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add
                      </Button>
                    </div>
                    {errorMessage && (
                      <p className="text-xs text-destructive flex items-center gap-1">
                        {errorMessage}
                      </p>
                    )}
                  </div>

                  {isLoading ? (
                    <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                      Loading channels...
                    </div>
                  ) : channelIds.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed border-border rounded-lg bg-muted/20">
                      <p className="text-sm font-medium text-foreground mb-1">No channels added yet</p>
                      <p className="text-xs text-muted-foreground">Add your first channel ID above to get started</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-medium text-foreground">
                          {channelIds.length} {channelIds.length === 1 ? 'channel' : 'channels'} enabled
                        </p>
                        {channelIds.length > 0 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (confirm('Are you sure you want to remove all channels?')) {
                                setChannelIds([]);
                              }
                            }}
                            className="text-xs text-muted-foreground hover:text-destructive h-7"
                          >
                            Clear all
                          </Button>
                        )}
                      </div>
                      <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                        {channelIds.map((id, index) => (
                          <div
                            key={index}
                            className="flex items-center justify-between p-3 bg-accent/50 hover:bg-accent rounded-lg border border-border transition-colors group"
                          >
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <div className="flex-shrink-0 w-2 h-2 rounded-full bg-primary" />
                              <code className="text-sm font-mono text-foreground break-all">{id}</code>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0 ml-2"
                              onClick={() => handleRemove(index)}
                              title="Remove channel"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-border">
                  <p className="text-xs text-muted-foreground">
                    Changes are saved automatically when you click Save
                  </p>
                  <Button onClick={handleSave} disabled={isSaving || isLoading}>
                    {isSaving ? (
                      <>
                        <span className="mr-2">Saving...</span>
                      </>
                    ) : (
                      "Save Channels"
                    )}
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



