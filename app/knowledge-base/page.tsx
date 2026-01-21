"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BookOpen, Search, Plus, Menu, X, Download, Edit, Save, XCircle, RefreshCw, FileText, Tag, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Sidebar } from "@/components/sidebar";
import { cn } from "@/lib/utils";

interface KnowledgeBaseItem {
  id: string;  // UUID primary key
  doc_id: number;  // Integer display ID
  source_filename: string;
  title: string;
  html: string;
  parent: string | null;
  summary?: string | null;
  created_at?: string;
  updated_at?: string;
}

function KnowledgeBaseContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [items, setItems] = useState<KnowledgeBaseItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<KnowledgeBaseItem | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isPublicDomain, setIsPublicDomain] = useState<boolean | null>(null); // null = not determined yet
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionStatus, setSubmissionStatus] = useState<{
    step: 'uploading' | 'transcribing' | 'generating' | 'saving' | null;
    message: string;
  }>({ step: null, message: '' });
  const [fileInputKey, setFileInputKey] = useState(0); // reset file input after use
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [parentInput, setParentInput] = useState("");
  const [showVideoDialog, setShowVideoDialog] = useState(false);
  const [pendingVideo, setPendingVideo] = useState<File | null>(null);
  const [videoTitle, setVideoTitle] = useState("");
  const [videoParent, setVideoParent] = useState("");
  const [showTranscriptDialog, setShowTranscriptDialog] = useState(false);
  const [pendingTranscript, setPendingTranscript] = useState<File | null>(null);
  const [transcriptParent, setTranscriptParent] = useState("");
  const [showPasteTranscriptDialog, setShowPasteTranscriptDialog] = useState(false);
  const [pastedTranscript, setPastedTranscript] = useState("");
  const [pasteTranscriptParent, setPasteTranscriptParent] = useState("");
  const [pendingTranscripts, setPendingTranscripts] = useState<File[]>([]);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);
  const [showPublicNav, setShowPublicNav] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedHtml, setEditedHtml] = useState("");
  const [editedParent, setEditedParent] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isRegeneratingSummary, setIsRegeneratingSummary] = useState(false);
  const [summaryFeedback, setSummaryFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Check if we're on the public docs domain - set on mount to prevent flash
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isPublic = window.location.hostname === 'docs-evolve.stoopdynamics.com' ||
        window.location.hostname.includes('docs-evolve.stoopdynamics.com');
      setIsPublicDomain(isPublic);
    }
  }, []);

  // Update browser tab title when on public docs domain
  useEffect(() => {
    if (isPublicDomain) {
      document.title = "Evolve Docs";
    }
  }, [isPublicDomain]);

  useEffect(() => {
    fetchKnowledgeBase();
  }, []);

  useEffect(() => {
    if (items.length > 0 && !isLoading) {
      // Check if there's a doc_id in the URL
      const docId = searchParams.get('id');
      if (docId) {
        const item = items.find(i => String(i.doc_id) === String(docId));
        if (item) {
          setSelectedItem((prev) => {
            // Only update if different to avoid unnecessary renders
            return prev?.id === item.id ? prev : item;
          });
          return;
        }
      }
      // If no URL param or doc_id not found, default to first item
      // Only set if selectedItem is not already set or doesn't match
      setSelectedItem((prev) => {
        if (!prev || (docId && String(prev.doc_id) !== String(docId))) {
          return items[0];
        }
        return prev;
      });
    }
  }, [items, searchParams, isLoading]);


  const fetchKnowledgeBase = async () => {
    try {
      setIsLoading(true);
      console.log('[fetchKnowledgeBase] Fetching documents...');

      const { data, error } = await supabase
        .from("dashboard_knowledge_base")
        .select("id, doc_id, source_filename, title, html, parent, summary, created_at, updated_at")
        .order("parent", { ascending: true })
        .order("title", { ascending: true });

      if (error) {
        console.error("Error fetching knowledge base:", error);
      } else {
        console.log('[fetchKnowledgeBase] Fetched', data?.length || 0, 'documents');
        setItems(data || []);
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getNextDocId = (): number => {
    const existing = items
      .map((i) => i.doc_id)
      .filter((n) => Number.isFinite(n));
    if (existing.length === 0) return 1;
    return Math.max(...existing) + 1;
  };

  const extractTitleFromHtml = (html: string, fallback: string): string => {
    const match = html.match(/<h1[^>]*>(.*?)<\/h1>/i);
    if (match && match[1]) return match[1].trim();
    // Fallback: filename without extension, title-cased
    const base = fallback.replace(/\.[^.]+$/, "");
    return base.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const handleFileSelected = async (file: File) => {
    if (!file) return;
    const isHtml = file.type === "text/html" || file.name.toLowerCase().endsWith(".html");
    if (!isHtml) {
      alert("Please select an .html file.");
      return;
    }
    setPendingFile(file);
    setParentInput("");
    setShowUploadDialog(true);
  };

  const performUpload = async () => {
    if (!pendingFile) return;
    try {
      setIsSubmitting(true);
      const text = await pendingFile.text();
      const res = await fetch('/api/knowledge-base/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_filename: pendingFile.name,
          html: text,
          parent: parentInput.trim() || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        console.error(body);
        alert(body?.error || 'Failed to upload HTML to knowledge base.');
        return;
      }
      await fetchKnowledgeBase();
      setShowUploadDialog(false);
      setPendingFile(null);
      setParentInput("");
      setFileInputKey((k) => k + 1);
    } finally {
      setIsSubmitting(false);
    }
  };


  const handleDownload = (item: KnowledgeBaseItem) => {
    const blob = new Blob([item.html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    // Ensure filename always ends with .html
    let filename = item.source_filename || `${item.title || 'document'}.html`;
    if (!filename.toLowerCase().endsWith('.html')) {
      filename = `${filename}.html`;
    }
    
    a.download = filename;
    a.setAttribute('type', 'text/html');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleEdit = () => {
    if (selectedItem) {
      setEditedHtml(selectedItem.html);
      setEditedParent(selectedItem.parent || "");
      setIsEditing(true);
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditedHtml("");
    setEditedParent("");
  };

  const handleSaveEdit = async () => {
    if (!selectedItem) return;
    try {
      setIsSaving(true);
      const res = await fetch(`/api/knowledge-base/${selectedItem.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          html: editedHtml,
          parent: editedParent.trim() || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        console.error(body);
        alert(body?.error || 'Failed to save changes.');
        return;
      }
      await fetchKnowledgeBase();
      // Update selectedItem with the new HTML and parent
      setSelectedItem((prev) => {
        if (prev && prev.id === selectedItem.id) {
          return { ...prev, html: editedHtml, parent: editedParent.trim() || null };
        }
        return prev;
      });
      setIsEditing(false);
      setEditedHtml("");
      setEditedParent("");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRegenerateSummary = async () => {
    if (!selectedItem) return;
    try {
      setIsRegeneratingSummary(true);
      setSummaryFeedback(null);
      const res = await fetch(`/api/knowledge-base/${selectedItem.id}/regenerate-summary`, {
        method: 'POST',
      });
      
      // Check content type before parsing JSON
      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await res.text();
        console.error('[regenerate-summary] Non-JSON response', { 
          status: res.status, 
          contentType,
          textPreview: text.substring(0, 200),
        });
        setSummaryFeedback({ type: 'error', message: `Server error: ${res.status} ${res.statusText}` });
        setTimeout(() => setSummaryFeedback(null), 5000);
        return;
      }
      
      if (!res.ok) {
        const body = await res.json().catch((err) => {
          console.error('[regenerate-summary] Failed to parse error response', err);
          return { error: `Failed to regenerate summary: ${res.status} ${res.statusText}` };
        });
        console.error('[regenerate-summary] Error response', body);
        setSummaryFeedback({ type: 'error', message: body?.error || 'Failed to regenerate summary' });
        setTimeout(() => setSummaryFeedback(null), 5000);
        return;
      }
      
      const data = await res.json().catch((err) => {
        console.error('[regenerate-summary] Failed to parse success response', err);
        throw new Error('Invalid JSON response from server');
      });
      await fetchKnowledgeBase();
      // Update selectedItem with the new summary
      setSelectedItem((prev) => {
        if (prev && prev.id === selectedItem.id) {
          return { ...prev, summary: data.summary };
        }
        return prev;
      });
      // Show success feedback
      setSummaryFeedback({ type: 'success', message: 'Summary regenerated successfully!' });
      setTimeout(() => setSummaryFeedback(null), 3000);
    } catch (error: any) {
      console.error('Error regenerating summary:', error);
      setSummaryFeedback({ type: 'error', message: error?.message || 'Failed to regenerate summary' });
      setTimeout(() => setSummaryFeedback(null), 5000);
    } finally {
      setIsRegeneratingSummary(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedItem) return;

    if (!window.confirm('Are you sure you want to delete this document? This action cannot be undone.')) {
      return;
    }

    try {
      setIsDeleting(true);
      console.log('[handleDelete] Deleting document:', selectedItem.id);

      const res = await fetch(`/api/knowledge-base/${selectedItem.id}`, {
        method: 'DELETE'
      });

      console.log('[handleDelete] Response status:', res.status);

      if (!res.ok) {
        const body = await res.json().catch((err) => {
          console.error('[handleDelete] Failed to parse error response:', err);
          return {};
        });
        console.error('[handleDelete] Delete failed:', body);
        alert(body?.error || `Failed to delete document (${res.status} ${res.statusText}). Check console for details.`);
        return;
      }

      console.log('[handleDelete] Delete successful');

      // Success: clear selection and URL parameter
      setSelectedItem(null);
      router.push('/knowledge-base');

      // Force a re-fetch with a slight delay to ensure database is updated
      console.log('[handleDelete] Refreshing knowledge base...');
      await new Promise(resolve => setTimeout(resolve, 500));
      await fetchKnowledgeBase();
      console.log('[handleDelete] Knowledge base refreshed');
    } catch (error: any) {
      console.error('[handleDelete] Error:', error);
      alert(error?.message || 'An error occurred while deleting. Check console for details.');
    } finally {
      setIsDeleting(false);
    }
  };

  const getTitleFromHtml = (html: string): string => {
    const match = html.match(/<h1>(.*?)<\/h1>/);
    return match ? match[1] : "Untitled";
  };

  const filteredItems = items.filter((item) => {
    const articleTitle = getTitleFromHtml(item.html).toLowerCase();
    return articleTitle.includes(searchQuery.toLowerCase());
  });

  // Group items by parent
  const parentDisplayMap: Record<string, string> = {};
  const groupedByParent = filteredItems.reduce((acc, item) => {
    const raw = (item.parent || 'Other').trim();
    const key = raw.toLowerCase();
    if (!parentDisplayMap[key]) parentDisplayMap[key] = raw;
    if (!acc[key]) {
      acc[key] = [] as KnowledgeBaseItem[];
    }
    (acc[key] as KnowledgeBaseItem[]).push(item);
    return acc;
  }, {} as Record<string, KnowledgeBaseItem[]>);

  // Get the most recent date for each parent (for sorting)
  const parentDates: Record<string, Date> = {};
  Object.keys(groupedByParent).forEach((parentKey) => {
    const items = groupedByParent[parentKey];
    const dates = items
      .map(item => item.created_at || item.updated_at)
      .filter(Boolean)
      .map(date => new Date(date!));
    
    // Use the most recent date for the parent
    parentDates[parentKey] = dates.length > 0 
      ? new Date(Math.max(...dates.map(d => d.getTime())))
      : new Date(0);
  });

  // Sort parents by most recent date (oldest first)
  const sortedParents = Object.keys(groupedByParent).sort((a, b) => {
    return parentDates[a].getTime() - parentDates[b].getTime();
  });

  // Don't render until domain is determined to prevent flash
  if (isPublicDomain === null) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {!isPublicDomain && <Sidebar />}
      <main className={`flex-1 ${!isPublicDomain ? 'lg:pl-56' : ''} flex overflow-hidden`}>
        {/* Main Content Area */}
        <div className={cn(
          "flex-1 overflow-y-auto overscroll-none hide-scrollbar",
          isPublicDomain ? "p-6 pb-16 lg:p-8" : "p-4 lg:p-8"
        )}>
          {isLoading ? (
            <div className="max-w-4xl mx-auto text-center py-12">
              <p className="text-muted-foreground">Loading knowledge base...</p>
            </div>
          ) : selectedItem ? (
            <div className="max-w-4xl mx-auto">
              <div className="flex items-center justify-between gap-2 mb-6">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-primary" />
                  <h1 className="text-base font-normal">Knowledge Base</h1>
                </div>
                {!isPublicDomain && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleDownload(selectedItem)}
                      className="inline-flex items-center text-xs px-2 py-1 rounded border border-border hover:bg-muted/20"
                      title="Download this document"
                      disabled={isEditing}
                    >
                      <Download className="h-3.5 w-3.5 mr-1" /> Download
                    </button>
                    <button
                      onClick={handleEdit}
                      className="inline-flex items-center text-xs px-2 py-1 rounded border border-border hover:bg-muted/20"
                      title="Edit this document"
                      disabled={isEditing}
                    >
                      <Edit className="h-3.5 w-3.5 mr-1" /> Edit
                    </button>
                    <button
                      onClick={handleDelete}
                      className="inline-flex items-center text-xs px-2 py-1 rounded border border-border hover:bg-muted/20"
                      title="Delete this document"
                      disabled={isEditing || isDeleting}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> {isDeleting ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                )}
              </div>
              
              {isEditing ? (
                <div className="space-y-6">
                  {/* Header with action buttons */}
                  <div className="flex items-center justify-between pb-4 border-b border-border">
                    <div>
                      <h2 className="text-lg font-medium">Edit Document</h2>
                      <p className="text-xs text-muted-foreground mt-1">Make changes to the document content, category, and summary</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleCancelEdit}
                        disabled={isSaving}
                      >
                        <XCircle className="h-3.5 w-3.5 mr-1.5" /> Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleSaveEdit}
                        disabled={isSaving}
                      >
                        <Save className="h-3.5 w-3.5 mr-1.5" /> {isSaving ? 'Saving...' : 'Save Changes'}
                      </Button>
                    </div>
                  </div>

                  {/* Category Section */}
                  <div className="p-4 border border-border rounded-lg bg-muted/30">
                    <div className="flex items-center gap-2 mb-3">
                      <Tag className="h-4 w-4 text-muted-foreground" />
                      <label className="text-sm font-medium">Category</label>
                    </div>
                    <Input
                      value={editedParent}
                      onChange={(e) => setEditedParent(e.target.value)}
                      placeholder="e.g. Onboarding, Setup, Troubleshooting"
                      className="max-w-md"
                    />
                    <p className="mt-2 text-xs text-muted-foreground">Groups this document in the sidebar navigation. Leave empty for no category.</p>
                  </div>

                  {/* HTML Content Section */}
                  <div className="p-4 border border-border rounded-lg bg-muted/30">
                    <div className="flex items-center gap-2 mb-3">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <label className="text-sm font-medium">HTML Content</label>
                    </div>
                    <textarea
                      value={editedHtml}
                      onChange={(e) => setEditedHtml(e.target.value)}
                      className="w-full h-[calc(100vh-450px)] min-h-[500px] p-4 font-mono text-sm border border-border rounded-md bg-background text-foreground resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      placeholder="Edit HTML content..."
                    />
                    <div className="mt-3 p-3 rounded-md bg-muted/50 border border-border">
                      <p className="text-xs font-medium text-muted-foreground mb-1.5">Semantic HTML structure:</p>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Use <code className="px-1.5 py-0.5 bg-background rounded text-xs font-mono">&lt;article&gt;</code> as the root container, 
                        <code className="px-1.5 py-0.5 bg-background rounded text-xs font-mono mx-1">&lt;header&gt;</code> for the title section, 
                        <code className="px-1.5 py-0.5 bg-background rounded text-xs font-mono mx-1">&lt;h1&gt;</code> for the main title, 
                        <code className="px-1.5 py-0.5 bg-background rounded text-xs font-mono mx-1">&lt;h2&gt;</code> and 
                        <code className="px-1.5 py-0.5 bg-background rounded text-xs font-mono mx-1">&lt;h3&gt;</code> for sections, 
                        <code className="px-1.5 py-0.5 bg-background rounded text-xs font-mono mx-1">&lt;p&gt;</code> for paragraphs, and 
                        <code className="px-1.5 py-0.5 bg-background rounded text-xs font-mono mx-1">&lt;ul&gt;</code>/<code className="px-1.5 py-0.5 bg-background rounded text-xs font-mono mx-1">&lt;li&gt;</code> for lists.
                      </p>
                    </div>
                  </div>

                  {/* Summary Section */}
                  <div className="p-4 border border-border rounded-lg bg-muted/30">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <RefreshCw className="h-4 w-4 text-muted-foreground" />
                        <label className="text-sm font-medium">Summary</label>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        disabled={isSaving || isRegeneratingSummary}
                        onClick={handleRegenerateSummary}
                      >
                        <RefreshCw className={`h-3 w-3 mr-1.5 ${isRegeneratingSummary ? 'animate-spin' : ''}`} /> 
                        {isRegeneratingSummary ? 'Regenerating...' : selectedItem?.summary ? 'Regenerate' : 'Generate'}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3">This summary is only visible to the bot and is used by the system to select relevant documents based on user queries.</p>
                    {summaryFeedback && (
                      <div className={`mb-3 px-3 py-2 rounded-md text-xs border ${
                        summaryFeedback.type === 'success' 
                          ? 'bg-primary/10 text-primary border-primary/20' 
                          : 'bg-destructive/10 text-destructive border-destructive/20'
                      }`}>
                        {summaryFeedback.message}
                      </div>
                    )}
                    <textarea
                      value={selectedItem?.summary || ''}
                      readOnly
                      disabled
                      placeholder={selectedItem?.summary ? '' : 'No summary yet. Click "Generate" to create one.'}
                      className="w-full h-32 min-h-[128px] p-4 text-sm border border-border rounded-md bg-muted/50 text-foreground resize-none cursor-not-allowed"
                    />
                  </div>
                </div>
              ) : (
              <div className="prose prose-invert max-w-none">
                <article
                  dangerouslySetInnerHTML={{ __html: selectedItem.html }}
                />
              </div>
              )}
            </div>
          ) : (
            <div className="max-w-4xl mx-auto text-center py-12">
              <p className="text-muted-foreground">
                {searchQuery ? "No presentations found matching your search." : "No presentations available."}
              </p>
            </div>
          )}
        </div>

        {/* Sidebar with title list */}
        {isPublicDomain ? (
          <>
            {/* Public mobile floating burger */}
            <button
              className="sm:hidden fixed top-3 right-3 z-50 inline-flex items-center justify-center h-9 w-9 rounded-md border border-border bg-background/90 backdrop-blur shadow"
              aria-label={showPublicNav ? 'Close docs menu' : 'Open docs menu'}
              onClick={() => setShowPublicNav((v) => !v)}
            >
              {showPublicNav ? (
                <X className="h-4 w-4" />
              ) : (
                <Menu className="h-4 w-4" />
              )}
            </button>

            {/* Overlay for mobile nav */}
            {showPublicNav && (
              <div
                className="sm:hidden fixed inset-0 z-40 bg-black/60"
                onClick={() => setShowPublicNav(false)}
              />
            )}

            {/* Desktop sidebar - sticky */}
            <div className="hidden sm:block w-80 bg-background">
              <div className="sticky top-0 flex flex-col h-screen">            
              {/* Header - only on public domain */}
              {isPublicDomain && (
                <div className="flex-shrink-0 p-4 border-b border-border">
                  <div className="flex flex-col items-center gap-4">
                    <img
                      src="/evolve_logo.png"
                      alt="Evolve Logo"
                      className="object-contain w-full h-auto px-2"
                    />
                    <a
                      href="https://stoopdynamics.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block"
                    >
                      <img
                        src="/stoopdynamicslogo.png"
                        alt="Stoop Dynamics"
                        className="object-contain h-5 w-auto px-2"
                      />
                    </a>
                  </div>
                </div>
              )}
              {/* Search */}
              <div className="flex-shrink-0 p-4">
                {!isPublicDomain && (
                  <div className="flex flex-col items-stretch mb-3 gap-2">
                    <div className="text-xs text-muted-foreground">Manage</div>
                    {/* Manage buttons rendered only in dashboard; omitted on public */}
                  </div>
                )}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search articles..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              {/* Title List */}
              <ScrollArea className="flex-1 min-h-0">
                <div className="px-2 py-4">
                  {filteredItems.length === 0 ? (
                    <div className="text-sm text-muted-foreground text-center py-8">
                      No results found
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {sortedParents.map((parentKey) => (
                        <div key={parentKey}>
                          {/* Parent Header */}
                          <div className="px-3 pt-4 pb-1 text-[10px] font-medium text-muted-foreground/70 uppercase tracking-widest">
                            {parentDisplayMap[parentKey]}
                          </div>
                          {/* Articles in this parent group */}
                          <div className="space-y-1">
                            {groupedByParent[parentKey].map((item) => {
                              const title = getTitleFromHtml(item.html);
                              const isSelected = selectedItem?.id === item.id;
                              return (
                                <button
                                  key={item.id}
                                  onClick={() => {
                                    if (isEditing && selectedItem?.id !== item.id) {
                                      setIsEditing(false);
                                      setEditedHtml("");
                                    }
                                    setSelectedItem(item);
                                    if (isPublicDomain) {
                                      router.push(`/?id=${item.doc_id}`, { scroll: false });
                                    } else {
                                      router.push(`/knowledge-base?id=${item.doc_id}`, { scroll: false });
                                    }
                                  }}
                                  className={cn(
                                    "w-full text-left px-3 py-2 text-xs transition-colors",
                                    "text-muted-foreground hover:text-foreground",
                                    isSelected && "text-foreground"
                                  )}
                                >
                                  <div className="line-clamp-2">{title}</div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </ScrollArea>
              </div>
            </div>

            {/* Mobile sidebar - fixed when shown */}
            {showPublicNav && (
              <div className="sm:hidden fixed z-50 inset-y-0 right-0 w-72 bg-background">
                <div className="flex flex-col h-full">
                  {/* Header - only on public domain */}
                  {isPublicDomain && (
                    <div className="flex-shrink-0 p-4 border-b border-border">
                      <div className="flex flex-col items-center gap-4">
                        <img
                          src="/evolve_logo.png"
                          alt="Evolve Logo"
                          className="object-contain w-full h-auto px-2"
                        />
                        <a
                          href="https://stoopdynamics.com"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block"
                        >
                          <img
                            src="/stoopdynamicslogo.png"
                            alt="Stoop Dynamics"
                            className="object-contain h-4 w-auto px-2"
                          />
                        </a>
                      </div>
                    </div>
                  )}
                  {/* Search */}
                  <div className="flex-shrink-0 p-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search articles..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>

                  {/* Title List */}
                  <ScrollArea className="flex-1 min-h-0">
                    <div className="px-2 py-4">
                      {filteredItems.length === 0 ? (
                        <div className="text-sm text-muted-foreground text-center py-8">
                          No results found
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {sortedParents.map((parentKey) => (
                            <div key={parentKey}>
                              {/* Parent Header */}
                              <div className="px-3 pt-4 pb-1 text-[10px] font-medium text-muted-foreground/70 uppercase tracking-widest">
                                {parentDisplayMap[parentKey]}
                              </div>
                              {/* Articles in this parent group */}
                              <div className="space-y-1">
                                {groupedByParent[parentKey].map((item) => {
                                  const title = getTitleFromHtml(item.html);
                                  const isSelected = selectedItem?.id === item.id;
                                  return (
                                    <button
                                      key={item.id}
                                      onClick={() => {
                                    if (isEditing && selectedItem?.id !== item.id) {
                                      setIsEditing(false);
                                      setEditedHtml("");
                                    }
                                        setSelectedItem(item);
                                        if (isPublicDomain) {
                                          router.push(`/?id=${item.doc_id}`, { scroll: false });
                                        } else {
                                          router.push(`/knowledge-base?id=${item.doc_id}`, { scroll: false });
                                        }
                                        setShowPublicNav(false);
                                      }}
                                      className={cn(
                                        "w-full text-left px-3 py-2 text-xs transition-colors",
                                        "text-muted-foreground hover:text-foreground",
                                        isSelected && "text-foreground"
                                      )}
                                    >
                                      <div className="line-clamp-2">{title}</div>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="hidden lg:block w-80 bg-background">
          <div className="sticky top-0 flex flex-col h-screen">
            {/* Header - only on public domain */}
            {isPublicDomain && (
              <div className="p-4 border-b border-border">
                <div className="flex flex-col items-center gap-3">
                  <img
                    src="/evolve_logo.png"
                    alt="Evolve Logo"
                    className="object-contain w-full h-auto px-2"
                  />
                </div>
              </div>
            )}
            {/* Search */}
            <div className="p-4">
              {!isPublicDomain && (
                <div className="flex flex-col items-stretch mb-3 gap-2">
                  <div className="text-xs text-muted-foreground">Manage</div>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="file"
                      accept="video/mp4,video/quicktime,video/x-msvideo,video/webm,video/x-matroska,video/x-flv,.mp4,.mov,.avi,.webm,.mkv,.flv,audio/mpeg,.mp3"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;

                        const fileSizeMB = (f.size / 1024 / 1024).toFixed(0);
                        const fileExtension = f.name.split('.').pop()?.toLowerCase() || '';
                        const isVideo = ['mp4', 'mov', 'avi', 'webm', 'mkv', 'flv'].includes(fileExtension);

                        // Different limits for video vs audio
                        const maxSizeMB = isVideo ? 100 : 50; // Cloudinary free tier: 100MB, Supabase: ~50MB

                        if (f.size > maxSizeMB * 1024 * 1024) {
                          alert(`This ${isVideo ? 'video' : 'audio file'} is ${fileSizeMB}MB. Maximum supported size is ${maxSizeMB}MB.\n\nQuick fix: Re-export your video in low quality (720p or lower) to reduce file size.\n\nOr use HandBrake or similar tools to compress it.`);
                          return;
                        }

                        setPendingVideo(f);
                        setVideoTitle("");
                        setVideoParent("");
                        setShowVideoDialog(true);
                      }}
                      disabled={isSubmitting}
                    />
                    <span className="inline-flex items-center px-3 py-2 rounded-md border border-border hover:bg-muted/50 font-medium text-sm transition-colors">
                      <Plus className="h-4 w-4 mr-1.5" />
                      {isSubmitting ? "Processing..." : "Transcribe Video to Doc"}
                    </span>
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="file"
                      accept=".txt,.srt,.vtt,text/plain"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        if (files.length === 0) return;

                        if (files.length === 1) {
                          // Single file - use existing dialog
                          setPendingTranscript(files[0]);
                          setTranscriptParent("");
                          setShowTranscriptDialog(true);
                        } else {
                          // Multiple files - batch process
                          setPendingTranscripts(files);
                          setTranscriptParent("");
                          setShowTranscriptDialog(true);
                        }
                      }}
                      disabled={isSubmitting}
                    />
                    <span className="inline-flex items-center px-3 py-2 rounded-md border border-border hover:bg-muted/50 font-medium text-sm transition-colors">
                      <Plus className="h-4 w-4 mr-1.5" />
                      {isSubmitting ? "Processing..." : "Upload Transcript to Doc"}
                    </span>
                  </label>
                  <p className="text-[11px] text-muted-foreground/70 -mt-1 ml-1">Supports multiple files for batch upload</p>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setPastedTranscript("");
                      setPasteTranscriptParent("");
                      setShowPasteTranscriptDialog(true);
                    }}
                    disabled={isSubmitting}
                    className="w-full justify-start px-3 py-2 font-medium text-sm"
                  >
                    <FileText className="h-4 w-4 mr-1.5" />
                    {isSubmitting ? "Processing..." : "Paste Transcript to Doc"}
                  </Button>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      key={fileInputKey}
                      type="file"
                      accept=".html,text/html"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleFileSelected(f);
                      }}
                      disabled={isSubmitting}
                    />
                    <span className="inline-flex items-center px-3 py-2 rounded-md border border-border hover:bg-muted/50 font-medium text-sm transition-colors">
                      <Plus className="h-4 w-4 mr-1.5" />
                      {isSubmitting ? "Uploading..." : "Add HTML Doc"}
                    </span>
                  </label>
                </div>
              )}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search articles..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Title List */}
            <ScrollArea className="flex-1">
              <div className="px-2 py-4">
                {filteredItems.length === 0 ? (
                  <div className="text-sm text-muted-foreground text-center py-8">
                    No results found
                  </div>
                ) : (
                  <div className="space-y-4">
                     {sortedParents.map((parentKey) => (
                       <div key={parentKey}>
                        {/* Parent Header */}
                        <div className="px-3 pt-4 pb-1 text-[10px] font-medium text-muted-foreground/70 uppercase tracking-widest">
                           {parentDisplayMap[parentKey]}
                        </div>
                        {/* Articles in this parent group */}
                        <div className="space-y-1">
                           {groupedByParent[parentKey].map((item) => {
                            const title = getTitleFromHtml(item.html);
                            const isSelected = selectedItem?.id === item.id;
                            return (
                              <button
                                key={item.id}
                                onClick={() => {
                                  if (isEditing && selectedItem?.id !== item.id) {
                                    setIsEditing(false);
                                    setEditedHtml("");
                                  }
                                  setSelectedItem(item);
                                  if (isPublicDomain) {
                                    router.push(`/?id=${item.doc_id}`, { scroll: false });
                                  } else {
                                    router.push(`/knowledge-base?id=${item.doc_id}`, { scroll: false });
                                  }
                                }}
                                className={cn(
                                  "w-full text-left px-3 py-2 text-xs transition-colors",
                                  "text-muted-foreground hover:text-foreground",
                                  isSelected && "text-foreground"
                                )}
                              >
                                <div className="line-clamp-2">{title}</div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
          </div>
        )}
      </main>

      {showUploadDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => {
              setShowUploadDialog(false);
              setPendingFile(null);
              setParentInput("");
              setFileInputKey((k) => k + 1);
            }}
          />
          <div className="relative bg-background border border-border rounded-md shadow-lg w-full max-w-md mx-4 p-4">
            <h2 className="text-sm font-medium">Upload HTML doc</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Reminder: include an <code>&lt;h1&gt;</code> in your HTML to set the document title.
            </p>
            <div className="mt-4">
              <label className="text-xs text-muted-foreground block mb-1">Category (parent, optional)</label>
              <Input
                placeholder="e.g. Onboarding"
                value={parentInput}
                onChange={(e) => setParentInput(e.target.value)}
              />
              <p className="mt-1 text-[11px] text-muted-foreground/70">This only groups docs in the docs navbar.</p>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setShowUploadDialog(false);
                  setPendingFile(null);
                  setParentInput("");
                  setFileInputKey((k) => k + 1);
                }}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                onClick={performUpload}
                disabled={isSubmitting || !pendingFile}
              >
                {isSubmitting ? 'Uploading...' : 'Upload'}
              </Button>
            </div>
          </div>
        </div>
      )}


      {showVideoDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => {
              setShowVideoDialog(false);
              setPendingVideo(null);
              setVideoTitle("");
              setVideoParent("");
            }}
          />
          <div className="relative bg-background border border-border rounded-md shadow-lg w-full max-w-md mx-4 p-4">
            <h2 className="text-sm font-medium">Transcribe Video to Doc</h2>
            <p className="text-xs text-muted-foreground mt-1">
              The generated HTML will include your title as an <code>&lt;h1&gt;</code> and paragraphs based on the transcription.
            </p>
            {isSubmitting && submissionStatus.step && (
              <div className="mt-3 p-2 bg-muted/50 rounded text-xs">
                <div className="flex items-center gap-2">
                  <RefreshCw className="h-3 w-3 animate-spin text-primary" />
                  <span className="text-muted-foreground">{submissionStatus.message}</span>
                </div>
                <div className="mt-2 flex gap-1">
                  <div className={cn("h-1 flex-1 rounded", submissionStatus.step === 'uploading' ? 'bg-primary' : 'bg-primary/30')} />
                  <div className={cn("h-1 flex-1 rounded", submissionStatus.step === 'transcribing' ? 'bg-primary' : submissionStatus.step === 'generating' || submissionStatus.step === 'saving' ? 'bg-primary/30' : 'bg-muted')} />
                  <div className={cn("h-1 flex-1 rounded", submissionStatus.step === 'generating' ? 'bg-primary' : submissionStatus.step === 'saving' ? 'bg-primary/30' : 'bg-muted')} />
                  <div className={cn("h-1 flex-1 rounded", submissionStatus.step === 'saving' ? 'bg-primary' : 'bg-muted')} />
                </div>
              </div>
            )}
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Category (parent, optional)</label>
                <Input
                  placeholder="e.g. Onboarding"
                  value={videoParent}
                  onChange={(e) => setVideoParent(e.target.value)}
                />
                <p className="mt-1 text-[11px] text-muted-foreground/70">This only groups docs in the docs navbar.</p>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setShowVideoDialog(false);
                  setPendingVideo(null);
                  setVideoTitle("");
                  setVideoParent("");
                }}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  if (!pendingVideo) return;
                  try {
                    setIsSubmitting(true);

                    // Get file extension
                    const fileExtension = pendingVideo.name.split('.').pop()?.toLowerCase() || 'mp4';
                    const isVideo = ['mp4', 'mov', 'avi', 'webm', 'mkv', 'flv'].includes(fileExtension);

                    let text: string;
                    let bucket: string | undefined;
                    let path: string | undefined;

                    if (isVideo) {
                      // For videos: Upload directly to Cloudinary (bypasses all size limits)
                      setSubmissionStatus({ step: 'uploading', message: 'Uploading video...' });

                      console.log('[Video upload] Getting Cloudinary upload parameters', {
                        fileName: pendingVideo.name,
                        fileSize: pendingVideo.size,
                        fileSizeMB: (pendingVideo.size / 1024 / 1024).toFixed(2),
                      });

                      // Get upload parameters from API
                      const paramsRes = await fetch('/api/cloudinary/upload-params', {
                        method: 'POST',
                      });

                      if (!paramsRes.ok) {
                        const body = await paramsRes.json().catch(() => ({}));
                        alert(body?.error || 'Failed to prepare upload.');
                        return;
                      }

                      const { uploadUrl, apiKey, timestamp, signature, folder } = await paramsRes.json();

                      // Upload directly to Cloudinary from browser
                      const formData = new FormData();
                      formData.append('file', pendingVideo);
                      formData.append('api_key', apiKey);
                      formData.append('timestamp', timestamp.toString());
                      formData.append('signature', signature);
                      formData.append('folder', folder);

                      console.log('[Video upload] Uploading to Cloudinary...');

                      const cloudinaryUploadRes = await fetch(uploadUrl, {
                        method: 'POST',
                        body: formData,
                      });

                      if (!cloudinaryUploadRes.ok) {
                        console.error('[Video upload] Cloudinary upload failed', {
                          status: cloudinaryUploadRes.status,
                        });
                        alert('Failed to upload video to Cloudinary.');
                        return;
                      }

                      const { public_id: publicId } = await cloudinaryUploadRes.json();
                      console.log('[Video upload] Video uploaded to Cloudinary', { publicId });

                      // Process video on server (extract audio and transcribe)
                      setSubmissionStatus({ step: 'transcribing', message: 'Processing video...' });

                      let currentBitrate = '64k';

                      // Try different bitrates if needed
                      while (true) {
                        const processRes = await fetch('/api/cloudinary/process-video', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ publicId, bitrate: currentBitrate }),
                        });

                        if (!processRes.ok) {
                          const body = await processRes.json().catch(() => ({}));
                          alert(body?.error || 'Failed to process video.');
                          return;
                        }

                        const processResult = await processRes.json();

                        if (processResult.needsRecompression) {
                          console.log('[Video upload] Audio too large, trying lower bitrate:', processResult.nextBitrate);
                          currentBitrate = processResult.nextBitrate;
                          continue;
                        }

                        text = processResult.transcript;
                        console.log('[Video upload] Processing complete', {
                          transcriptLength: text.length,
                          audioSizeMB: processResult.audioSizeMB,
                        });
                        break;
                      }
                    } else {
                      // For audio files: Upload to Supabase Storage (small files, no issue)
                      setSubmissionStatus({ step: 'uploading', message: 'Uploading audio...' });

                      const signedRes = await fetch('/api/storage/signed-upload', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          fileExtension,
                          fileSize: pendingVideo.size,
                        }),
                      });

                      if (!signedRes.ok) {
                        const body = await signedRes.json().catch(() => ({}));
                        alert(body?.error || 'Failed to prepare upload.');
                        return;
                      }

                      const uploadData = await signedRes.json();
                      bucket = uploadData.bucket;
                      path = uploadData.path;
                      const uploadUrl = uploadData.signedUrl || uploadData.url;

                      const uploadResponse = await fetch(uploadUrl, {
                        method: 'PUT',
                        body: pendingVideo,
                        headers: {
                          'Content-Type': pendingVideo.type || 'application/octet-stream',
                        },
                      });

                      if (!uploadResponse.ok) {
                        alert('Failed to upload audio file.');
                        return;
                      }

                      // Transcribe from Supabase Storage
                      setSubmissionStatus({ step: 'transcribing', message: 'Transcribing...' });
                      const transcribeRes = await fetch('/api/transcribe-from-storage', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ bucket, path }),
                      });

                      if (!transcribeRes.ok) {
                        const body = await transcribeRes.json().catch(() => ({}));
                        alert(body?.error || 'Failed to transcribe.');
                        return;
                      }

                      const transcribeResult = await transcribeRes.json();
                      text = transcribeResult.text;
                    }

                    // Generate HTML from transcript
                    setSubmissionStatus({ step: 'generating', message: 'Generating HTML...' });
                    // 3) Generate structured HTML from transcript using OpenRouter
                    const htmlRes = await fetch('/api/generate-html-from-transcript', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ transcript: text }),
                    });
                    if (!htmlRes.ok) {
                      const body = await htmlRes.json().catch(() => ({}));
                      console.error(body);
                      alert(body?.error || 'Failed to generate HTML from transcript.');
                      return;
                    }
                    const { html } = await htmlRes.json();

                    setSubmissionStatus({ step: 'saving', message: 'Saving document...' });
                    // 4) Store via HTML upload endpoint (server will generate summary and save)
                    const ures = await fetch('/api/knowledge-base/upload', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        source_filename: pendingVideo.name,
                        html,
                        parent: videoParent,
                        transcript: text,
                        video_storage_path: path,
                        video_storage_bucket: bucket,
                      }),
                    });
                    const uploadResult = await ures.json();

                    if (!ures.ok) {
                      console.error(uploadResult);
                      alert(uploadResult?.error || 'Failed to save document.');
                      return;
                    }

                    const newDocId = uploadResult.doc_id;
                    console.log('[Upload] Document created successfully', { newDocId });

                    // Clean up audio file from Supabase Storage if it was stored there
                    if (typeof bucket !== 'undefined' && typeof path !== 'undefined') {
                      try {
                        console.log('[Upload] Deleting audio/video file from Supabase Storage', { bucket, path });
                        const deleteRes = await fetch('/api/storage/delete-file', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ bucket, path }),
                        });
                        if (deleteRes.ok) {
                          console.log('[Upload] File deleted successfully from Supabase Storage');
                        } else {
                          console.warn('[Upload] Failed to delete file from storage (non-fatal)');
                        }
                      } catch (deleteErr) {
                        console.warn('[Upload] Error deleting file (non-fatal):', deleteErr);
                      }
                    }

                    // Close dialog and navigate to new doc
                    setShowVideoDialog(false);
                    setPendingVideo(null);
                    setVideoTitle("");
                    setVideoParent("");
                    await fetchKnowledgeBase();

                    // Navigate to the newly created document
                    if (newDocId) {
                      router.push(`/knowledge-base?id=${newDocId}`, { scroll: false });
                    }
                  } catch (error: any) {
                    console.error('[Video upload] Error:', error);
                    alert(error?.message || 'An error occurred during processing.');
                  } finally {
                    setIsSubmitting(false);
                    setSubmissionStatus({ step: null, message: '' });
                  }
                }}
                disabled={isSubmitting || !pendingVideo}
              >
                {isSubmitting ? (submissionStatus.message || 'Processing...') : 'Create doc'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Transcript Upload Dialog */}
      {showTranscriptDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div
            className="fixed inset-0"
            onClick={() => {
              if (!isSubmitting) {
                setShowTranscriptDialog(false);
                setPendingTranscript(null);
                setPendingTranscripts([]);
                setTranscriptParent("");
                setBatchProgress(null);
              }
            }}
          />
          <div className="relative bg-background border border-border rounded-md shadow-lg w-full max-w-md mx-4 p-4">
            <h2 className="text-sm font-medium">
              {pendingTranscripts.length > 0
                ? `Upload ${pendingTranscripts.length} Transcripts to Docs`
                : "Upload Transcript to Doc"}
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              {pendingTranscripts.length > 0
                ? `Upload ${pendingTranscripts.length} transcript files to generate structured HTML documents.`
                : "Upload a transcript file (.txt, .srt, .vtt) to generate a structured HTML document."}
            </p>
            {isSubmitting && submissionStatus.step && (
              <div className="mt-3 p-2 bg-muted/50 rounded text-xs">
                <div className="flex items-center gap-2">
                  <RefreshCw className="h-3 w-3 animate-spin text-primary" />
                  <span className="text-muted-foreground">
                    {batchProgress
                      ? `Processing ${batchProgress.current}/${batchProgress.total}: ${submissionStatus.message}`
                      : submissionStatus.message}
                  </span>
                </div>
                <div className="mt-2 flex gap-1">
                  <div className={cn("h-1 flex-1 rounded", submissionStatus.step === 'uploading' ? 'bg-primary' : 'bg-primary/30')} />
                  <div className={cn("h-1 flex-1 rounded", submissionStatus.step === 'generating' ? 'bg-primary' : submissionStatus.step === 'saving' ? 'bg-primary/30' : 'bg-muted')} />
                  <div className={cn("h-1 flex-1 rounded", submissionStatus.step === 'saving' ? 'bg-primary' : 'bg-muted')} />
                </div>
              </div>
            )}
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Category (parent, optional)</label>
                <Input
                  placeholder="e.g. Onboarding"
                  value={transcriptParent}
                  onChange={(e) => setTranscriptParent(e.target.value)}
                />
                <p className="mt-1 text-[11px] text-muted-foreground/70">This only groups docs in the docs navbar.</p>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setShowTranscriptDialog(false);
                  setPendingTranscript(null);
                  setPendingTranscripts([]);
                  setTranscriptParent("");
                  setBatchProgress(null);
                }}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  const isBatch = pendingTranscripts.length > 0;
                  const filesToProcess = isBatch ? pendingTranscripts : (pendingTranscript ? [pendingTranscript] : []);

                  if (filesToProcess.length === 0) return;

                  try {
                    setIsSubmitting(true);
                    const createdDocIds: number[] = [];

                    // Process each file
                    for (let i = 0; i < filesToProcess.length; i++) {
                      const file = filesToProcess[i];

                      if (isBatch) {
                        setBatchProgress({ current: i + 1, total: filesToProcess.length });
                      }

                      // Read the transcript file
                      setSubmissionStatus({ step: 'uploading', message: 'Reading transcript...' });
                      const transcriptText = await file.text();

                      console.log('[Transcript upload] File read', {
                        fileName: file.name,
                        length: transcriptText.length,
                        batch: isBatch ? `${i + 1}/${filesToProcess.length}` : 'single',
                      });

                      // Generate HTML from transcript
                      setSubmissionStatus({ step: 'generating', message: 'Generating HTML...' });
                      const htmlRes = await fetch('/api/generate-html-from-transcript', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ transcript: transcriptText }),
                      });
                      if (!htmlRes.ok) {
                        const body = await htmlRes.json().catch(() => ({}));
                        console.error(body);
                        alert(`Failed to generate HTML from ${file.name}: ${body?.error || 'Unknown error'}`);
                        continue; // Skip to next file
                      }
                      const { html } = await htmlRes.json();

                      // Save document
                      setSubmissionStatus({ step: 'saving', message: 'Saving document...' });
                      const ures = await fetch('/api/knowledge-base/upload', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          source_filename: file.name,
                          html,
                          parent: transcriptParent,
                          transcript: transcriptText,
                        }),
                      });

                      const uploadResult = await ures.json();

                      if (!ures.ok) {
                        console.error(uploadResult);
                        alert(`Failed to save ${file.name}: ${uploadResult?.error || 'Unknown error'}`);
                        continue; // Skip to next file
                      }

                      const newDocId = uploadResult.doc_id;
                      if (newDocId) {
                        createdDocIds.push(newDocId);
                      }
                      console.log('[Transcript upload] Document created successfully', {
                        newDocId,
                        fileName: file.name,
                        batch: isBatch ? `${i + 1}/${filesToProcess.length}` : 'single',
                      });
                    }

                    // Close dialog and navigate
                    setShowTranscriptDialog(false);
                    setPendingTranscript(null);
                    setPendingTranscripts([]);
                    setTranscriptParent("");
                    setBatchProgress(null);
                    await fetchKnowledgeBase();

                    // Navigate to the first created document
                    if (createdDocIds.length > 0) {
                      router.push(`/knowledge-base?id=${createdDocIds[0]}`, { scroll: false });
                    }

                    // Show success message for batch uploads
                    if (isBatch) {
                      alert(`Successfully created ${createdDocIds.length} of ${filesToProcess.length} documents.`);
                    }
                  } catch (error: any) {
                    console.error('[Transcript upload] Error:', error);
                    alert(error?.message || 'An error occurred during processing.');
                  } finally {
                    setIsSubmitting(false);
                    setSubmissionStatus({ step: null, message: '' });
                    setBatchProgress(null);
                  }
                }}
                disabled={isSubmitting || (pendingTranscripts.length === 0 && !pendingTranscript)}
              >
                {isSubmitting
                  ? (submissionStatus.message || 'Processing...')
                  : (pendingTranscripts.length > 0
                      ? `Create ${pendingTranscripts.length} docs`
                      : 'Create doc')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Paste Transcript Dialog */}
      {showPasteTranscriptDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div
            className="fixed inset-0"
            onClick={() => {
              if (!isSubmitting) {
                setShowPasteTranscriptDialog(false);
                setPastedTranscript("");
                setPasteTranscriptParent("");
              }
            }}
          />
          <div className="relative bg-background border border-border rounded-md shadow-lg w-full max-w-2xl mx-4 p-4">
            <h2 className="text-sm font-medium">Paste Transcript to Doc</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Paste your transcript text below to generate a structured HTML document.
            </p>
            {isSubmitting && submissionStatus.step && (
              <div className="mt-3 p-2 bg-muted/50 rounded text-xs">
                <div className="flex items-center gap-2">
                  <RefreshCw className="h-3 w-3 animate-spin text-primary" />
                  <span className="text-muted-foreground">{submissionStatus.message}</span>
                </div>
                <div className="mt-2 flex gap-1">
                  <div className={cn("h-1 flex-1 rounded", submissionStatus.step === 'uploading' ? 'bg-primary' : 'bg-primary/30')} />
                  <div className={cn("h-1 flex-1 rounded", submissionStatus.step === 'generating' ? 'bg-primary' : submissionStatus.step === 'saving' ? 'bg-primary/30' : 'bg-muted')} />
                  <div className={cn("h-1 flex-1 rounded", submissionStatus.step === 'saving' ? 'bg-primary' : 'bg-muted')} />
                </div>
              </div>
            )}
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Transcript Text</label>
                <textarea
                  placeholder="Paste your transcript here..."
                  value={pastedTranscript}
                  onChange={(e) => setPastedTranscript(e.target.value)}
                  className="w-full min-h-[200px] p-3 rounded-md border border-border bg-background text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-primary"
                  disabled={isSubmitting}
                />
                <p className="mt-1 text-[11px] text-muted-foreground/70">
                  {pastedTranscript.length} characters
                </p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Category (parent, optional)</label>
                <Input
                  placeholder="e.g. Onboarding"
                  value={pasteTranscriptParent}
                  onChange={(e) => setPasteTranscriptParent(e.target.value)}
                  disabled={isSubmitting}
                />
                <p className="mt-1 text-[11px] text-muted-foreground/70">This only groups docs in the docs navbar.</p>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setShowPasteTranscriptDialog(false);
                  setPastedTranscript("");
                  setPasteTranscriptParent("");
                }}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  if (!pastedTranscript.trim()) {
                    alert('Please paste some transcript text first.');
                    return;
                  }

                  try {
                    setIsSubmitting(true);

                    // Generate HTML from transcript
                    setSubmissionStatus({ step: 'generating', message: 'Generating HTML...' });
                    const htmlRes = await fetch('/api/generate-html-from-transcript', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ transcript: pastedTranscript.trim() }),
                    });
                    if (!htmlRes.ok) {
                      const body = await htmlRes.json().catch(() => ({}));
                      console.error(body);
                      alert(body?.error || 'Failed to generate HTML from transcript.');
                      return;
                    }
                    const { html } = await htmlRes.json();

                    // Save document
                    setSubmissionStatus({ step: 'saving', message: 'Saving document...' });
                    const ures = await fetch('/api/knowledge-base/upload', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        source_filename: 'pasted-transcript.txt',
                        html,
                        parent: pasteTranscriptParent,
                        transcript: pastedTranscript.trim(),
                      }),
                    });

                    const uploadResult = await ures.json();

                    if (!ures.ok) {
                      console.error(uploadResult);
                      alert(uploadResult?.error || 'Failed to save document.');
                      return;
                    }

                    const newDocId = uploadResult.doc_id;
                    console.log('[Paste transcript] Document created successfully', { newDocId });

                    // Close dialog and navigate to new doc
                    setShowPasteTranscriptDialog(false);
                    setPastedTranscript("");
                    setPasteTranscriptParent("");
                    await fetchKnowledgeBase();

                    // Navigate to the newly created document
                    if (newDocId) {
                      router.push(`/knowledge-base?id=${newDocId}`, { scroll: false });
                    }
                  } catch (error: any) {
                    console.error('[Paste transcript] Error:', error);
                    alert(error?.message || 'An error occurred during processing.');
                  } finally {
                    setIsSubmitting(false);
                    setSubmissionStatus({ step: null, message: '' });
                  }
                }}
                disabled={isSubmitting || !pastedTranscript.trim()}
              >
                {isSubmitting ? (submissionStatus.message || 'Processing...') : 'Create doc'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function KnowledgeBasePage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    }>
      <KnowledgeBaseContent />
    </Suspense>
  );
}
