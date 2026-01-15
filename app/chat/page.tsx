import { Sidebar } from "@/components/sidebar";
import { Chat } from "@/components/chat";

export default function ChatPage() {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 lg:pl-56 overflow-hidden">
        <Chat />
      </main>
    </div>
  );
}

