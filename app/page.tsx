import { ProjectCreateForm } from "@/components/project-create-form";
import { SettingsDialog } from "@/components/settings-dialog";

export default function Home() {
  return (
    <main className="min-h-screen">
      <section className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center px-6 py-12">
        <div className="mb-2 flex items-center justify-end gap-2">
          <SettingsDialog />
        </div>
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div className="space-y-5">
            <p className="text-sm font-semibold uppercase tracking-wide text-primary">
              GitMash
            </p>
            <h1 className="max-w-xl text-4xl font-semibold leading-tight text-foreground sm:text-5xl">
              Mash multiple repos into one custom app.
            </h1>
            <p className="max-w-lg text-base leading-7 text-muted-foreground">
              GitMash is like git merge + git rebase, but for entire
              repositories. Pick 2–3 GitHub repos, tell it what you want, and
              it analyzes, plans, and blends the best parts into a single
              working codebase.
            </p>

            <div className="space-y-3 rounded-lg border bg-card/50 p-4">
              <p className="text-sm font-medium text-foreground">
                Good for:
              </p>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex gap-2">
                  <span className="mt-0.5 shrink-0 text-primary">•</span>
                  <span>
                    <strong>Chop shop merges</strong> — grab features from cool
                    repos and Frankenstein them into your own super app
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="mt-0.5 shrink-0 text-primary">•</span>
                  <span>
                    <strong>Personal project fusion</strong> — combine your own
                    scattered GitHub projects into one polished app
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="mt-0.5 shrink-0 text-primary">•</span>
                  <span>
                    <strong>Vibe coding remixes</strong> — found a sick repo on
                    X or Product Hunt? Mash it with your starter template and
                    ship your own take
                  </span>
                </li>
              </ul>
            </div>
          </div>

          <div className="rounded-lg border bg-card p-6 shadow-sm">
            <ProjectCreateForm />
          </div>
        </div>
      </section>
    </main>
  );
}
