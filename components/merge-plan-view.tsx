"use client";

import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MergeDecision, MergePlan } from "@/lib/merge-planner";

type MergePlanViewProps = {
  plan: MergePlan;
  onApprove: () => void;
  analysisComplete?: boolean;
  isApproving?: boolean;
};

const SECTION_STYLES: Record<MergeDecision["decision"], { title: string; className: string; empty: string }> = {
  keep: {
    title: "Keep",
    className: "border-emerald-200 bg-emerald-50 text-emerald-950",
    empty: "No features are marked to keep as-is.",
  },
  adapt: {
    title: "Adapt",
    className: "border-green-200 bg-green-50 text-green-950",
    empty: "No features are marked for adaptation.",
  },
  rewrite: {
    title: "Rewrite",
    className: "border-amber-200 bg-amber-50 text-amber-950",
    empty: "No features are marked for rewrite.",
  },
  discard: {
    title: "Discard",
    className: "border-slate-200 bg-slate-50 text-slate-950",
    empty: "No features are marked for discard.",
  },
  create_new: {
    title: "Create New",
    className: "border-sky-200 bg-sky-50 text-sky-950",
    empty: "No new features are required.",
  },
};

const DECISION_ORDER: MergeDecision["decision"][] = ["keep", "adapt", "rewrite", "discard", "create_new"];

export function MergePlanView({
  plan,
  onApprove,
  analysisComplete = true,
  isApproving = false,
}: MergePlanViewProps) {
  return (
    <section className="space-y-6">
      <div className="rounded-lg border bg-card p-5 text-card-foreground shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Selected base repository</p>
            <h2 className="text-2xl font-semibold tracking-normal">{plan.selectedBaseRepo}</h2>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{plan.baseRepoReason}</p>
          </div>
          <Button type="button" onClick={onApprove} disabled={!analysisComplete || isApproving}>
            <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden="true" />
            {isApproving ? "Approving..." : "Approve Plan"}
          </Button>
        </div>
        {!analysisComplete ? (
          <p className="mt-4 text-sm text-amber-700">Approval unlocks after all AI analysis artifacts are available.</p>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {DECISION_ORDER.map((decision) => (
          <DecisionSection
            key={decision}
            decision={decision}
            decisions={plan.decisions.filter((item) => item.decision === decision)}
          />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <WarningList title="Conflicts" items={plan.conflicts} />
        <WarningList title="Risks" items={plan.risks} />
      </div>
    </section>
  );
}

function DecisionSection({
  decision,
  decisions,
}: {
  decision: MergeDecision["decision"];
  decisions: MergeDecision[];
}) {
  const style = SECTION_STYLES[decision];

  return (
    <section className={cn("rounded-lg border p-4 shadow-sm", style.className)}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold tracking-normal">{style.title}</h3>
        <span className="rounded-md bg-background/70 px-2 py-1 text-xs font-medium">{decisions.length}</span>
      </div>
      {decisions.length ? (
        <div className="space-y-3">
          {decisions.map((item) => (
            <DecisionCard key={`${item.decision}-${item.featureName}-${item.sourceRepo}`} decision={item} />
          ))}
        </div>
      ) : (
        <p className="text-sm opacity-80">{style.empty}</p>
      )}
    </section>
  );
}

function DecisionCard({ decision }: { decision: MergeDecision }) {
  return (
    <article className="rounded-md border border-black/10 bg-background/80 p-4 text-foreground">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h4 className="font-medium">{decision.featureName}</h4>
          <p className="text-sm text-muted-foreground">Source: {decision.sourceRepo}</p>
        </div>
        <span className="w-fit rounded-md bg-muted px-2 py-1 text-xs font-medium">
          {Math.round(decision.confidence * 100)}%
        </span>
      </div>
      <dl className="mt-3 space-y-2 text-sm">
        <div>
          <dt className="font-medium">Target path</dt>
          <dd className="break-words text-muted-foreground">{formatPaths(decision.targetPaths)}</dd>
        </div>
        <div>
          <dt className="font-medium">Reason</dt>
          <dd className="leading-6 text-muted-foreground">{decision.reason}</dd>
        </div>
      </dl>
    </article>
  );
}

function WarningList({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-950 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
        <h3 className="text-lg font-semibold tracking-normal">{title}</h3>
      </div>
      {items.length ? (
        <ul className="space-y-2 text-sm">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="text-sm">No {title.toLowerCase()} reported.</p>
      )}
    </section>
  );
}

function formatPaths(paths: string[]): string {
  return paths.length ? paths.join(", ") : "To be determined";
}
