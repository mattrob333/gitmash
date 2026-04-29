"use client";

import { useState, type FormEvent } from "react";
import { GitMerge, AlertCircle, Key } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getStoredApiKey } from "@/components/settings-dialog";
import type { Project } from "@/types/project";

type SubmitState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; project: Project }
  | { status: "error"; message: string };

export function ProjectCreateForm() {
  const [state, setState] = useState<SubmitState>({ status: "idle" });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ status: "loading" });

    const formData = new FormData(event.currentTarget);
    const repoUrls = ["repoUrl1", "repoUrl2", "repoUrl3"].map((key) =>
      String(formData.get(key) ?? ""),
    );
    const brief = String(formData.get("brief") ?? "");
    const apiKey = getStoredApiKey();

    const response = await fetch("/api/projects", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { "x-api-key": apiKey } : {}),
      },
      body: JSON.stringify({ repoUrls, brief }),
    });
    const body = (await response.json()) as {
      project?: Project;
      error?: string;
    };

    if (!response.ok || !body.project) {
      setState({ status: "error", message: body.error ?? "Unable to create project." });
      return;
    }

    setState({ status: "success", project: body.project });
  }

  const apiKey = getStoredApiKey();

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      {!apiKey && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Add your OpenAI API key in{" "}
            <span className="font-medium">Settings</span> (gear icon above) to
            enable AI analysis.
          </span>
        </div>
      )}

      <RepoInput id="repoUrl1" label="Repository 1" required />
      <RepoInput id="repoUrl2" label="Repository 2" required />
      <RepoInput id="repoUrl3" label="Repository 3" />

      <div className="space-y-2">
        <Label htmlFor="brief">Build brief</Label>
        <Textarea
          id="brief"
          name="brief"
          placeholder='Example: "Keep repo A auth + dashboard, take repo B billing, merge into repo C layout."'
          required
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button type="submit" disabled={state.status === "loading"}>
          <GitMerge className="mr-2 h-4 w-4" aria-hidden="true" />
          {state.status === "loading" ? "Creating..." : "Create project"}
        </Button>
        <StatusMessage state={state} />
      </div>
    </form>
  );
}

function RepoInput({
  id,
  label,
  required = false,
}: {
  id: string;
  label: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={id}
        type="text"
        placeholder="https://github.com/owner/repo"
        required={required}
      />
    </div>
  );
}

function StatusMessage({ state }: { state: SubmitState }) {
  if (state.status === "error") {
    return <p className="text-sm text-destructive">{state.message}</p>;
  }

  if (state.status === "success") {
    return (
      <p className="text-sm text-muted-foreground">
        Project {state.project.id} created with {state.project.sourceRepos.length} repos.
      </p>
    );
  }

  return (
    <p className="text-sm text-muted-foreground">Public GitHub repositories only.</p>
  );
}
