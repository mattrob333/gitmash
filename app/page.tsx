import { ProjectCreateForm } from "@/components/project-create-form";

export default function Home() {
  return (
    <main className="min-h-screen">
      <section className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center px-6 py-12">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div className="space-y-5">
            <p className="text-sm font-semibold uppercase tracking-wide text-primary">GitMash</p>
            <h1 className="max-w-xl text-4xl font-semibold leading-tight text-foreground sm:text-5xl">
              Combine the best parts of multiple GitHub repos.
            </h1>
            <p className="max-w-lg text-base leading-7 text-muted-foreground">
              Start a project by supplying two or three repositories and a plain-language brief.
              GitMash will validate the inputs and prepare isolated local workspaces for analysis.
            </p>
          </div>

          <div className="rounded-lg border bg-card p-6 shadow-sm">
            <ProjectCreateForm />
          </div>
        </div>
      </section>
    </main>
  );
}
