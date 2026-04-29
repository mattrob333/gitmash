"use client";

import type { ReactNode } from "react";
import { CheckCircle2, Download, ExternalLink, FileText, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { REQUIRED_DOC_FILES } from "@/lib/doc-generator";
import { cn } from "@/lib/utils";
import type { BuildResult } from "@/lib/build-engine";
import type { ReviewReport } from "@/lib/code-review";

type BuildResultsViewProps = {
  projectId: string;
  buildResult: BuildResult;
  reviewReport?: ReviewReport | null;
  knownIssuesMarkdown?: string | null;
  docsBaseHref?: string;
};

export function BuildResultsView({
  projectId,
  buildResult,
  reviewReport,
  knownIssuesMarkdown,
  docsBaseHref = `/api/projects/${projectId}/docs`,
}: BuildResultsViewProps) {
  const docs = buildResult.docsGenerated.length ? buildResult.docsGenerated : [...REQUIRED_DOC_FILES];
  return (
    <section className="space-y-6">
      <div className="rounded-lg border bg-card p-5 text-card-foreground shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Final output</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-normal">
              {buildResult.success ? "Ready for Export" : "Export with Known Issues"}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              {buildResult.generatedFiles.length} file(s) generated, {docs.length} doc(s) available, {buildResult.testsGenerated.length} test file(s) generated.
            </p>
          </div>
          <Button asChild>
            <a href={`/api/projects/${projectId}/export`}>
              <Download className="mr-2 h-4 w-4" aria-hidden="true" />
              Download ZIP
            </a>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Metric label="Files" value={buildResult.generatedFiles.length} />
        <Metric label="Docs" value={docs.length} />
        <Metric label="Tests" value={buildResult.testsGenerated.length} />
      </div>

      <Panel title="Validation Results">
        {buildResult.validation?.commands.length ? (
          <ul className="divide-y rounded-md border">
            {buildResult.validation.commands.map((command) => (
              <li key={`${command.command}-${command.runCommand}`} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-2">
                  <StatusIcon passed={command.success} />
                  <div className="min-w-0">
                    <p className="font-medium capitalize">{command.command}</p>
                    <p className="break-words text-sm text-muted-foreground">{command.runCommand}</p>
                  </div>
                </div>
                <span className={cn("w-fit rounded-md px-2 py-1 text-xs font-medium", command.success ? "bg-emerald-100 text-emerald-900" : "bg-red-100 text-red-900")}>
                  {command.success ? "Passed" : "Failed"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No validation commands were run.</p>
        )}
      </Panel>

      <Panel title="Code Review Findings">
        {reviewReport?.findings.length ? (
          <ul className="space-y-3">
            {reviewReport.findings.map((finding) => (
              <li key={finding.id} className={cn("rounded-md border p-3", findingClass(finding.severity))}>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <p className="font-medium">{finding.message}</p>
                  <span className="w-fit rounded-md bg-background/80 px-2 py-1 text-xs font-medium">{finding.severity}</span>
                </div>
                <p className="mt-1 text-sm opacity-80">
                  {finding.category}{finding.file ? ` · ${finding.file}` : ""}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No code review report is available yet.</p>
        )}
      </Panel>

      {knownIssuesMarkdown ? (
        <Panel title="Known Issues">
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-sm">{knownIssuesMarkdown}</pre>
        </Panel>
      ) : null}

      <Panel title="Generated Docs">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {docs.map((doc) => (
            <a
              key={doc}
              className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm font-medium hover:bg-muted"
              href={`${docsBaseHref}/${doc}`}
            >
              <span className="flex min-w-0 items-center gap-2">
                <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{doc}</span>
              </span>
              <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </a>
          ))}
        </div>
      </Panel>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-normal">{value}</p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border bg-card p-5 text-card-foreground shadow-sm">
      <h3 className="mb-4 text-lg font-semibold tracking-normal">{title}</h3>
      {children}
    </section>
  );
}

function StatusIcon({ passed }: { passed: boolean }) {
  return passed
    ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
    : <XCircle className="h-5 w-5 shrink-0 text-red-600" aria-hidden="true" />;
}

function findingClass(severity: ReviewReport["findings"][number]["severity"]): string {
  if (severity === "error") {
    return "border-red-200 bg-red-50 text-red-950";
  }
  if (severity === "warning") {
    return "border-amber-200 bg-amber-50 text-amber-950";
  }
  return "border-sky-200 bg-sky-50 text-sky-950";
}
