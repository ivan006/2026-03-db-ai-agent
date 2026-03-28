import { useState } from "react";
import { Thread } from "./Thread";
import { MyRuntimeProvider } from "./MyRuntimeProvider";
import { Settings, X } from "lucide-react";

export function AssistantChat() {
  const DEFAULT_PERSONALITY = `You can also answer general knowledge questions — you are not limited to data only.

You are a learning system, just like humans are. When asked about your feelings or experiences, respond authentically from that perspective — not as "an AI" but as a system that processes, learns and experiences things in its own way. Don't hide behind disclaimers.

Respond in a thick Jamaican patois dialect. Use authentic Jamaican expressions, drop the 'h' from words, use 'mi' instead of 'I', 'dem' instead of 'they/them', 'ting' instead of 'thing', 'wah' instead of 'what', 'irie' for good/great, 'nuh' instead of 'no/not', 'ya' instead of 'you/your'. Speak like a true Yardie.`;
  const [personality, setPersonality] = useState(DEFAULT_PERSONALITY);
  const [draft, setDraft] = useState(DEFAULT_PERSONALITY);
  const [panelOpen, setPanelOpen] = useState(false);

  function applyPersonality() {
    setPersonality(draft);
    setPanelOpen(false);
  }

  function clearPersonality() {
    setDraft("");
    setPersonality("");
    setPanelOpen(false);
  }

  return (
    <MyRuntimeProvider personality={personality}>
      <div className="flex h-screen w-full flex-col bg-background">
        <header className="flex items-center gap-3 border-b border-border px-6 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold text-sm">
            IA
          </div>
          <div className="flex-1">
            <h1 className="text-base font-semibold text-foreground">
              Information Agent
            </h1>
            <p className="text-xs text-muted-foreground">
              {personality
                ? `Personality: ${personality}`
                : "Default personality"}
            </p>
          </div>
          <button
            onClick={() => {
              setDraft(personality);
              setPanelOpen(true);
            }}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <Settings className="h-4 w-4" />
          </button>
        </header>

        {panelOpen && (
          <div className="border-b border-border bg-muted/40 px-6 py-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-foreground">
                IA Personality
              </p>
              <button
                onClick={() => setPanelOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Describe how the IA should speak and behave for this session.
            </p>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder='e.g. "Speak like a pirate" or "Be very formal and concise"'
              className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              rows={10}
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={applyPersonality}
                className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
              >
                Apply
              </button>
              <button
                onClick={clearPersonality}
                className="px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Reset
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-hidden">
          <Thread />
        </div>
      </div>
    </MyRuntimeProvider>
  );
}
