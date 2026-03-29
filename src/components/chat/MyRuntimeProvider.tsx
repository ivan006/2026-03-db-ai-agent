import { useEffect, type ReactNode } from "react";
import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  useAssistantTool,
} from "@assistant-ui/react";
import { createIAModelAdapter } from "./ChatModelAdapter";
import { executeTool, buildToolsFromSchema } from "./supabase";

interface MyRuntimeProviderProps {
  children: ReactNode;
  personality: string;
}

// Registers all DB tools with the assistant-ui runtime so it can
// execute them and handle the agentic loop automatically.
function DynamicTools() {
  const tools = buildToolsFromSchema();

  for (const tool of tools) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useAssistantTool({
      toolName: tool.name,
      execute: async (args: Record<string, unknown>) => {
        const result = await executeTool(tool.name, args);
        return JSON.parse(result);
      },
    });
  }

  return null;
}

export function MyRuntimeProvider({
  children,
  personality,
}: MyRuntimeProviderProps) {
  const runtime = useLocalRuntime(createIAModelAdapter(personality));

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <DynamicTools />
      {children}
    </AssistantRuntimeProvider>
  );
}
