import type { ReactNode } from "react";
import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  useAui,
  Tools,
  type Toolkit,
} from "@assistant-ui/react";
import { createIAModelAdapter } from "./ChatModelAdapter";
import { executeTool } from "./supabase";
import toolsJson from "./tools.json";

interface MyRuntimeProviderProps {
  children: ReactNode;
  personality: string;
}

function buildToolkit(): Toolkit {
  const toolkit: Toolkit = {};
  for (const tool of toolsJson as any[]) {
    if (tool.name === "list_tables") continue;
    const match = tool.name.match(/^(query|create|update|delete)_(.+)$/);
    if (!match) continue;
    toolkit[tool.name] = {
      description: tool.description,
      parameters: tool.input_schema,
      execute: async (args: Record<string, unknown>) => {
        console.log("[IA] executing tool:", tool.name, args);
        const result = await executeTool(tool.name, args);
        return JSON.parse(result);
      },
    };
  }
  return toolkit;
}

const toolkit = buildToolkit();

function RuntimeInner({ children }: { children: ReactNode }) {
  useAui({ tools: Tools({ toolkit }) });
  return <>{children}</>;
}

export function MyRuntimeProvider({
  children,
  personality,
}: MyRuntimeProviderProps) {
  const runtime = useLocalRuntime(createIAModelAdapter(personality));

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <RuntimeInner>{children}</RuntimeInner>
    </AssistantRuntimeProvider>
  );
}
