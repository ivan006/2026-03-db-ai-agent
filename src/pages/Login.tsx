import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/components/chat/supabase";

type Step = "idle" | "loading" | "success" | "error";

export default function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [supabaseStep, setSupabaseStep] = useState<Step>("idle");
  const [awsStep] = useState<Step>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setSupabaseStep("loading");
    setErrorMsg("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setSupabaseStep("error");
      setErrorMsg(error.message);
      return;
    }

    setSupabaseStep("success");

    // AWS gateway is placeholder — bypass for now
    setTimeout(() => {
      navigate("/chat");
    }, 800);
  }

  function StepIndicator({ step, label }: { step: Step; label: string }) {
    return (
      <div
        className={`flex items-center gap-2 text-sm ${
          step === "success"
            ? "text-green-600"
            : step === "error"
              ? "text-destructive"
              : step === "loading"
                ? "text-muted-foreground"
                : "text-muted-foreground"
        }`}
      >
        <div
          className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold border ${
            step === "success"
              ? "bg-green-600 border-green-600 text-white"
              : step === "error"
                ? "bg-destructive border-destructive text-white"
                : step === "loading"
                  ? "border-muted-foreground animate-pulse"
                  : "border-muted-foreground"
          }`}
        >
          {step === "success"
            ? "✓"
            : step === "error"
              ? "✗"
              : step === "loading"
                ? "..."
                : "○"}
        </div>
        {label}
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground font-bold text-lg">
            IA
          </div>
          <h1 className="text-2xl font-semibold text-foreground">
            Information Agent
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Two-layer authentication required to proceed
          </p>
        </div>

        {/* Status indicators */}
        <div className="mb-6 flex items-center justify-center gap-8">
          <StepIndicator step={supabaseStep} label="Data access" />
          <div className="h-px w-8 bg-border" />
          <StepIndicator step={awsStep} label="AI access" />
        </div>

        {/* Supabase login form */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="mb-4">
            <p className="text-sm font-medium text-foreground">
              Step 1 — Data access
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Sign in with your Supabase credentials
            </p>
          </div>

          <form onSubmit={handleLogin} className="flex flex-col gap-3">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {errorMsg && <p className="text-xs text-destructive">{errorMsg}</p>}
            <button
              type="submit"
              disabled={
                supabaseStep === "loading" || supabaseStep === "success"
              }
              className="mt-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {supabaseStep === "loading"
                ? "Signing in..."
                : supabaseStep === "success"
                  ? "Signed in ✓"
                  : "Sign in"}
            </button>
          </form>
        </div>

        {/* AWS Gateway placeholder */}
        <div className="mt-4 rounded-xl border border-border bg-muted/40 p-6">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Step 2 — AI access
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                AWS AI Gateway authentication
              </p>
            </div>
            <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
              Coming soon
            </span>
          </div>
          <div className="rounded-lg border border-dashed border-border bg-background/50 px-3 py-2 text-xs text-muted-foreground">
            🔒 AWS Gateway credentials will be required here
          </div>
        </div>
      </div>
    </div>
  );
}
