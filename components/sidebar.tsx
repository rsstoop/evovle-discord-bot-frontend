"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Lightbulb, Settings, Menu, X, LogOut, BookOpen, Map, ChevronDown, ChevronRight, FileText, Loader2, MessageSquare } from "lucide-react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

const navigation = [
  { name: "Content Analytics", href: "/", icon: Lightbulb },
  { name: "Content Chat", href: "/chat", icon: MessageSquare },
  { name: "Knowledge Base", href: "/knowledge-base", icon: BookOpen },
  { name: "Settings", href: "/settings", icon: Settings },
];

interface FileItem {
  name: string;
  id?: string;
  updated_at?: string;
  metadata?: {
    size?: number;
    mimetype?: string;
  } | null;
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isContentExplorerOpen, setIsContentExplorerOpen] = useState(false);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  
  useEffect(() => {
    if (isContentExplorerOpen && files.length === 0) {
      fetchFiles();
    }
  }, [isContentExplorerOpen]);

  const fetchFiles = async () => {
    try {
      setIsLoadingFiles(true);
      const response = await fetch('/api/content-explorer/list');
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch files');
      }

      const { files: fetchedFiles } = await response.json();
      setFiles(fetchedFiles as FileItem[]);
    } catch (err: any) {
      console.error("Failed to fetch files:", err);
    } finally {
      setIsLoadingFiles(false);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  return (
    <>
      {/* Mobile menu button */}
      <Button
        variant="ghost"
        size="icon"
        className="fixed top-4 left-4 z-50 lg:hidden"
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
      </Button>

      {/* Sidebar */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-56 bg-black border-r border-border transform transition-transform duration-300 ease-in-out lg:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex flex-col items-center gap-2 px-6 py-8">
            <img
              src="/evolve_logo.png"
              alt="Evolve Logo"
              className="object-contain w-full h-auto px-2"
            />
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 space-y-1.5 overflow-y-auto">
            {/* Content Explorer - Expandable */}
            <div>
              <button
                onClick={() => {
                  setIsContentExplorerOpen(!isContentExplorerOpen);
                  setIsOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-2.5 px-4 py-2.5 rounded-sm text-xs font-medium transition-colors",
                  isContentExplorerOpen
                    ? "text-white"
                    : "text-muted-foreground hover:text-foreground"
                )}
                style={isContentExplorerOpen ? { backgroundColor: '#121212' } : {}}
              >
                {isContentExplorerOpen ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                <Map className="h-4 w-4" />
                Content Explorer
              </button>
              
              {/* File List */}
              {isContentExplorerOpen && (
                <div className="ml-4 mt-1 mb-2">
                  {isLoadingFiles ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                    </div>
                  ) : files.length === 0 ? (
                    <div className="px-4 py-2 text-xs text-muted-foreground">
                      No files found
                    </div>
                  ) : (
                    <>
                      <ScrollArea className="h-[350px] max-h-[350px]">
                        <div className="space-y-0.5 pr-2">
                          {files.map((file, index) => {
                            // Strip .html extension from display name
                            const displayName = file.name.endsWith('.html') 
                              ? file.name.slice(0, -5) 
                              : file.name;
                            return (
                              <button
                                key={file.id || file.name || index}
                                onClick={() => {
                                  router.push(`/content-explorer/view?file=${encodeURIComponent(file.name)}`);
                                  setIsOpen(false);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-1.5 rounded-sm text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors group text-left"
                              >
                                <FileText className="h-3 w-3 shrink-0" />
                                <span className="truncate flex-1">{displayName}</span>
                              </button>
                            );
                          })}
                        </div>
                      </ScrollArea>
                      <div className="px-4 pt-2 pb-1 mt-1 border-t border-border/50">
                        <p className="text-[10px] text-muted-foreground leading-relaxed">
                          New heatmaps are generated weekly and monthly.
                        </p>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Other Navigation Items */}
            {navigation.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setIsOpen(false)}
                  className={cn(
                    "flex items-center gap-2.5 px-4 py-2.5 rounded-sm text-xs font-medium transition-colors",
                    isActive
                      ? "text-white"
                      : "text-muted-foreground"
                  )}
                  style={isActive ? { backgroundColor: '#121212' } : {}}
                >
                  <item.icon className="h-4 w-4" />
                  {item.name}
                </Link>
              );
            })}
          </nav>

          {/* Footer */}
          <div className="p-4 space-y-2 border-t border-border">
            <a
              href="https://stoopdynamics.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground text-center block transition-colors"
            >
              stoopdynamics.com
            </a>
            <Button
              variant="ghost"
              className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>
      </div>

      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  );
}



