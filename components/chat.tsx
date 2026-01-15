"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, MessageSquare, Bot, User, Loader2, Wrench, ChevronDown, ChevronUp } from "lucide-react";
import { format } from "date-fns";

export function Chat() {
  const [messages, setMessages] = useState<Array<{ role: "user" | "bot"; content: string; timestamp: Date; toolCalls?: Array<{ tool: string; timestamp: number }> }>>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [toolCalls, setToolCalls] = useState<Array<{ tool: string; timestamp: number }>>([]);
  const [expandedToolCalls, setExpandedToolCalls] = useState<Set<number>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Use a ref to track toolCalls to avoid stale closure in polling callbacks
  const toolCallsRef = useRef<Array<{ tool: string; timestamp: number }>>([]);
  const currentRequestIdRef = useRef<string | null>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [messages, isLoading]);

  // Auto-focus input when component mounts or when loading finishes
  useEffect(() => {
    if (!isLoading && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isLoading]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput("");
    
    // Add user message
    const newUserMessage = {
      role: "user" as const,
      content: userMessage,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, newUserMessage]);
    setIsLoading(true);
    setToolCalls([]); // Clear previous tool calls
    toolCallsRef.current = []; // Clear ref too

    // Generate a new request ID for this message
    const requestId = crypto.randomUUID();
    currentRequestIdRef.current = requestId;
    
    // Record the start time - only look for tool calls/responses created after this
    const requestStartTime = new Date().toISOString();

    // Clear ALL old logs from server before starting (prevents showing old data)
    try {
      await fetch('/api/chat/tool-log?all=true', { method: 'DELETE' }).catch(() => {});
      await fetch('/api/chat/response-log?all=true', { method: 'DELETE' }).catch(() => {});
      console.log('[chat] Cleared old logs');
    } catch (error) {
      console.error('Error clearing logs:', error);
    }

    let pollToolCalls: NodeJS.Timeout | null = null;
    let pollResponse: NodeJS.Timeout | null = null;
    let timeoutId: NodeJS.Timeout | null = null;
    let responseReceived = false;

    const cleanup = () => {
      if (pollToolCalls) clearInterval(pollToolCalls);
      if (pollResponse) clearInterval(pollResponse);
      if (timeoutId) clearTimeout(timeoutId);
    };

    try {
      // Start polling for tool calls (only ones created after request started)
      pollToolCalls = setInterval(async () => {
        try {
          const url = `/api/chat/tool-log?requestId=${encodeURIComponent(requestId)}&since=${encodeURIComponent(requestStartTime)}`;
          const res = await fetch(url);
          if (res.ok) {
            const data = await res.json();
            if (data.toolCalls && data.toolCalls.length > 0) {
              console.log('[chat] Polling found tool calls:', data.toolCalls.length);
              setToolCalls(data.toolCalls);
              toolCallsRef.current = data.toolCalls;
            }
          }
        } catch (error) {
          console.error('Error polling tool calls:', error);
        }
      }, 500); // Poll every 500ms

      // Start polling for response (only ones created after request started)
      pollResponse = setInterval(async () => {
        try {
          const url = `/api/chat/response-log?requestId=${encodeURIComponent(requestId)}&since=${encodeURIComponent(requestStartTime)}`;
          const res = await fetch(url);
          if (res.ok) {
            const data = await res.json();
            if (data.response && data.response.content && !responseReceived) {
              responseReceived = true;
              console.log('[chat] Response received!');
              
              // Clear intervals and timeout
              cleanup();
              
              // Get tool calls - either from response or from the current toolCallsRef
              let finalToolCalls: Array<{ tool: string; timestamp: number }> = [];
              
              // First priority: tool calls included with the response
              if (data.response.toolCalls && data.response.toolCalls.length > 0) {
                finalToolCalls = data.response.toolCalls;
                console.log('[chat] Got tool calls from response:', finalToolCalls.length);
              } else {
                // Use the tool calls we've been collecting via polling
                finalToolCalls = [...toolCallsRef.current];
                console.log('[chat] Using collected tool calls:', finalToolCalls.length);
              }
              
              console.log('[chat] Final tool calls:', finalToolCalls.map(tc => tc.tool));
              
              // Clear all logs after we're done
              await fetch('/api/chat/response-log?all=true', { method: 'DELETE' }).catch(() => {});
              await fetch('/api/chat/tool-log?all=true', { method: 'DELETE' }).catch(() => {});
              
              // Add bot response with tool calls
              const newBotMessage = {
                role: "bot" as const,
                content: data.response.content,
                timestamp: new Date(),
                toolCalls: finalToolCalls.length > 0 ? [...finalToolCalls] : undefined,
              };
              setMessages((prev) => [...prev, newBotMessage]);
              setToolCalls([]); // Clear tool calls state
              toolCallsRef.current = []; // Clear ref too
              currentRequestIdRef.current = null; // Clear request ID
              setIsLoading(false);
            }
          }
        } catch (error) {
          console.error('Error polling response:', error);
        }
      }, 500); // Poll every 500ms

      // Set timeout for response (8 minutes)
      timeoutId = setTimeout(() => {
        if (!responseReceived) {
          responseReceived = true;
          cleanup();
          
          // Add timeout error message
          const timeoutMessage = {
            role: "bot" as const,
            content: 'Sorry, the response took too long. Please try again.',
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, timeoutMessage]);
          setIsLoading(false);
        }
      }, 480000); // 8 minutes timeout (480 seconds)

      // Prepare messages array for API (include conversation history)
      const messagesForAPI = [
        ...messages.map(m => ({ role: m.role, content: m.content })),
        { role: "user" as const, content: userMessage }
      ];

      // Send message to N8N webhook (async, fire and forget)
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          messages: messagesForAPI,
          requestId: requestId, // Pass requestId so N8N can use it when logging
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to send message to chat service');
      }

      // Message sent successfully, now wait for response via polling
      // Response will be handled in the pollResponse interval above
      
    } catch (error: any) {
      console.error('Error sending message:', error);
      
      // Clear intervals and timeout on error
      cleanup();
      
      // Add error message
      const errorMessage = {
        role: "bot" as const,
        content: `Error: ${error?.message || 'Failed to send message. Please try again.'}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
      setIsLoading(false);
    }
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden">
        <Card className="flex flex-col flex-1 rounded-none border-0 border-b min-h-0">
          <CardHeader className="border-b border-border pb-4">
            <CardTitle className="flex items-center gap-2 text-xl">
              <MessageSquare className="h-5 w-5 text-primary" />
              Content Ideas Agent
            </CardTitle>
            <CardDescription className="mt-1">
              Has the following tools: View latest content map, Search X/Twitter and Search Discord. Conversations can be reset by refreshing the page.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col p-0 overflow-hidden min-h-0">
            <ScrollArea className="flex-1 h-0">
              <div className="px-4 sm:px-6 py-6 space-y-4">
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center min-h-[calc(100vh-20rem)] text-center py-12 px-4">
                    <div className="rounded-full bg-primary/10 p-5 mb-5">
                      <Bot className="h-10 w-10 text-primary" />
                    </div>
                    <h3 className="text-xl font-semibold mb-3">Start a conversation</h3>
                    <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
                      Conversations can be reset by refreshing the page.
                    </p>
                  </div>
                ) : (
                  <>
                    {messages.map((message, i) => (
                      <div
                        key={i}
                        className={`flex gap-3 items-start ${
                          message.role === "user" ? "justify-end" : "justify-start"
                        }`}
                      >
                        {message.role === "bot" && (
                          <div className="flex-shrink-0 w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center mt-1">
                            <Bot className="h-4 w-4 text-primary" />
                          </div>
                        )}
                        <div className={`flex flex-col gap-1.5 ${message.role === "user" ? "items-end" : "items-start"} max-w-[80%] sm:max-w-[75%]`}>
                          {/* Tool Calls Dropdown for Bot Messages */}
                          {message.role === "bot" && message.toolCalls && message.toolCalls.length > 0 && (
                            <div className="mb-1 w-full">
                              <button
                                onClick={() => {
                                  setExpandedToolCalls((prev) => {
                                    const newSet = new Set(prev);
                                    if (newSet.has(i)) {
                                      newSet.delete(i);
                                    } else {
                                      newSet.add(i);
                                    }
                                    return newSet;
                                  });
                                }}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-accent/30 border border-primary/10 hover:bg-accent/40 transition-colors w-full text-left"
                              >
                                {expandedToolCalls.has(i) ? (
                                  <ChevronUp className="h-3 w-3 text-primary flex-shrink-0" />
                                ) : (
                                  <ChevronDown className="h-3 w-3 text-primary flex-shrink-0" />
                                )}
                                <Wrench className="h-3 w-3 text-primary flex-shrink-0" />
                                <span className="text-xs font-medium text-muted-foreground">
                                  {message.toolCalls.length} tool{message.toolCalls.length !== 1 ? 's' : ''} used
                                </span>
                              </button>
                              {expandedToolCalls.has(i) && (
                                <div className="mt-1.5 space-y-1 px-3 py-2 rounded-lg bg-accent/20 border border-primary/5">
                                  {message.toolCalls.map((toolCall, idx) => (
                                    <div key={idx} className="flex items-center gap-2 text-xs text-muted-foreground">
                                      <Wrench className="h-3 w-3 text-primary flex-shrink-0" />
                                      <span className="font-medium">{toolCall.tool}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                          <div
                            className={`rounded-2xl px-4 py-2.5 shadow-sm ${
                              message.role === "user"
                                ? "bg-primary text-primary-foreground rounded-br-sm"
                                : "bg-muted text-foreground rounded-bl-sm"
                            }`}
                          >
                            <div 
                              className={`text-sm whitespace-pre-wrap break-words leading-relaxed ${
                                message.role === "user" ? "text-primary-foreground" : ""
                              }`}
                              dangerouslySetInnerHTML={{
                                __html: message.content
                                  .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold">$1</strong>')
                                  .replace(/\n/g, '<br />')
                              }}
                            />
                          </div>
                          <span
                            className={`text-xs text-muted-foreground px-1 ${
                              message.role === "user" ? "text-right" : "text-left"
                            }`}
                          >
                            {format(message.timestamp, "h:mm a")}
                          </span>
                        </div>
                        {message.role === "user" && (
                          <div className="flex-shrink-0 w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center mt-1">
                            <User className="h-4 w-4 text-primary" />
                          </div>
                        )}
                      </div>
                    ))}
                    {isLoading && (
                      <div className="flex gap-3 justify-start items-start">
                        <div className="flex-shrink-0 w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center mt-1">
                          <Bot className="h-4 w-4 text-primary" />
                        </div>
                        <div className="flex flex-col gap-2 max-w-[80%] sm:max-w-[75%]">
                          {/* Tool Calls */}
                          {toolCalls.length > 0 && (
                            <div className="space-y-1.5 mb-1 px-3 py-2 rounded-lg bg-accent/30 border border-primary/10">
                              {toolCalls.map((toolCall, idx) => (
                                <div key={idx} className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <Wrench className="h-3 w-3 text-primary flex-shrink-0" />
                                  <span className="font-medium">{toolCall.tool}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          <div className="rounded-2xl rounded-bl-sm px-4 py-3 bg-muted shadow-sm">
                            <div className="flex items-center gap-2.5">
                              <Loader2 className="h-4 w-4 animate-spin text-primary" />
                              <span className="text-sm text-muted-foreground">Thinking...</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>
            <div className="p-4 sm:p-5 border-t border-border bg-background/50 backdrop-blur-sm">
              <div className="flex gap-2 items-end">
                <div className="flex-1 relative">
                  <Input
                    ref={inputRef}
                    placeholder="Ask about trending topics or content ideas..."
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey && !isLoading && input.trim()) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    className="pr-12 min-h-[44px] text-sm"
                    autoFocus
                  />
                </div>
                <Button 
                  onClick={handleSend} 
                  size="icon" 
                  className="shrink-0 h-[44px] w-[44px]"
                  disabled={isLoading || !input.trim()}
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2.5 text-center">
                {isLoading ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Waiting for response... (you can type but can&apos;t send yet)
                  </span>
                ) : (
                  "Press Enter to send, Shift+Enter for new line"
                )}
              </p>
            </div>
          </CardContent>
        </Card>
    </div>
  );
}

