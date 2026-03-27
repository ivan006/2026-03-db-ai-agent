import { Thread } from "./Thread";
import { MyRuntimeProvider } from "./MyRuntimeProvider";

export function AssistantChat() {
  return (
    <MyRuntimeProvider>
      <div className="flex h-screen w-full flex-col bg-background">
        <header className="flex items-center gap-3 border-b border-border px-6 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold text-sm">
            AI
          </div>
          <div>
            <h1 className="text-base font-semibold text-foreground">
              AI Assistant
            </h1>
            <p className="text-xs text-muted-foreground">
              Powered by AWS · assistant-ui
            </p>
          </div>
        </header>

        <div className="flex-1 overflow-hidden">
          <Thread />
        </div>
      </div>
    </MyRuntimeProvider>
  );
}
