import {
  ThreadPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
} from "@assistant-ui/react";
import { SendHorizonal } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useEffect, useState } from "react";

function Timestamp() {
  const [time, setTime] = useState("");

  useEffect(() => {
    const now = new Date();
    setTime(now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
  }, []);

  if (!time) return null;

  return (
    <span className="mt-1 block text-[10px] text-muted-foreground opacity-60">
      {time}
    </span>
  );
}

function UserMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-end px-4 py-2">
      <div className="max-w-[80%]">
        <div className="rounded-2xl rounded-br-md bg-[hsl(var(--chat-user-bg))] px-4 py-3 text-[hsl(var(--chat-user-fg))] text-sm leading-relaxed shadow-sm">
          <MessagePrimitive.Content />
        </div>
        <div className="flex justify-end">
          <Timestamp />
        </div>
      </div>
    </MessagePrimitive.Root>
  );
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-start px-4 py-2">
      <div className="flex gap-3 max-w-[85%]">
        <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground text-xs font-bold">
          IA
        </div>
        <div className="flex-1">
          <div className="rounded-2xl rounded-bl-md bg-[hsl(var(--chat-assistant-bg))] px-4 py-3 text-[hsl(var(--chat-assistant-fg))] text-sm leading-relaxed shadow-sm border border-border">
            <div className="prose prose-sm max-w-none prose-p:my-1 prose-headings:my-2 prose-pre:my-2 prose-ul:my-1 prose-li:my-0">
              <MessagePrimitive.Content
                components={{
                  Text: ({ text }) => <ReactMarkdown>{text}</ReactMarkdown>,
                }}
              />
            </div>
          </div>
          <Timestamp />
        </div>
      </div>
    </MessagePrimitive.Root>
  );
}

function Composer() {
  return (
    <ComposerPrimitive.Root className="flex items-end gap-2 border-t border-border bg-card p-4">
      <ComposerPrimitive.Input
        placeholder="Type a message..."
        className="flex-1 resize-none rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        autoFocus
      />
      <ComposerPrimitive.Send className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40">
        <SendHorizonal className="h-4 w-4" />
      </ComposerPrimitive.Send>
    </ComposerPrimitive.Root>
  );
}

export function Thread() {
  return (
    <ThreadPrimitive.Root className="flex h-full flex-col">
      <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto">
        <ThreadPrimitive.Empty>
          <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <SendHorizonal className="h-7 w-7" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                How can I help you?
              </h2>
              <p className="mt-1 text-sm text-muted-foreground max-w-sm">
                Ask me about your data — I can query, filter, and help you
                understand what's in your database.
              </p>
            </div>
          </div>
        </ThreadPrimitive.Empty>
        <ThreadPrimitive.Messages
          components={{
            UserMessage,
            AssistantMessage,
          }}
        />
      </ThreadPrimitive.Viewport>
      <Composer />
    </ThreadPrimitive.Root>
  );
}
