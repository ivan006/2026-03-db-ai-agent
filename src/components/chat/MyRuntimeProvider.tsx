import type { ReactNode } from "react";
import { AssistantRuntimeProvider, useLocalRuntime } from "@assistant-ui/react";
import { createIAModelAdapter } from "./ChatModelAdapter";

interface MyRuntimeProviderProps {
  children: ReactNode;
  personality: string;
}

export function MyRuntimeProvider({
  children,
  personality,
}: MyRuntimeProviderProps) {
  const runtime = useLocalRuntime(createIAModelAdapter(personality));

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
}
