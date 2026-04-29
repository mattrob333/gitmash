"use client";

import { useState, useEffect } from "react";
import { Settings, Key, Eye, EyeOff, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const API_KEY_STORAGE_KEY = "gitmash-api-key";

export function getStoredApiKey(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(API_KEY_STORAGE_KEY) ?? "";
}

export function SettingsDialog() {
  const [open, setOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [hasKey, setHasKey] = useState(false);

  useEffect(() => {
    const stored = getStoredApiKey();
    setApiKey(stored);
    setHasKey(!!stored);
  }, []);

  function handleOpen() {
    setApiKey(getStoredApiKey());
    setSaved(false);
    setOpen(true);
  }

  function handleSave() {
    const trimmed = apiKey.trim();
    if (trimmed) {
      localStorage.setItem(API_KEY_STORAGE_KEY, trimmed);
      setHasKey(true);
    } else {
      localStorage.removeItem(API_KEY_STORAGE_KEY);
      setHasKey(false);
    }
    setSaved(true);
    setTimeout(() => setOpen(false), 800);
  }

  function handleClear() {
    setApiKey("");
    localStorage.removeItem(API_KEY_STORAGE_KEY);
    setHasKey(false);
    setSaved(true);
    setTimeout(() => setOpen(false), 600);
  }

  return (
    <>
      <button
        onClick={handleOpen}
        className="relative inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        aria-label="Settings"
      >
        <Settings className="h-4 w-4" />
        {hasKey && (
          <span className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="relative z-10 w-full max-w-md rounded-xl border bg-card p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Key className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold">API Settings</h2>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="api-key">OpenAI API Key</Label>
                <div className="relative">
                  <Input
                    id="api-key"
                    type={showKey ? "text" : "password"}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-..."
                    className="pr-20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={showKey ? "Hide key" : "Show key"}
                  >
                    {showKey ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Your key is stored locally in your browser. It is only sent
                  to our server to make AI analysis calls and is never logged.
                </p>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <Button onClick={handleSave} disabled={saved}>
                  {saved ? (
                    <>
                      <Check className="mr-1.5 h-4 w-4" />
                      Saved
                    </>
                  ) : (
                    "Save key"
                  )}
                </Button>
                <Button variant="secondary" onClick={handleClear}>
                  Clear
                </Button>
              </div>

              {hasKey && (
                <p className="flex items-center gap-1.5 text-xs text-green-600">
                  <Check className="h-3.5 w-3.5" />
                  API key is configured
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
