"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  OWNER_KEY_STORAGE,
  authorizationHeaders,
} from "@/lib/access/client";
import type {
  DashboardOutcomes,
  DashboardSummary,
  UsageDashboard,
} from "@/lib/usage/dashboard";

type ViewState = "checking" | "locked" | "open" | "misconfigured" | "error";

const integer = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 1,
});
const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

function formatCost(cents: number | null) {
  return cents == null ? "Unpriced" : usd.format(cents / 100);
}

function formatRate(value: number | null) {
  return value == null ? "—" : percent.format(value);
}

function formatDuration(ms: number) {
  return ms < 1000 ? `${integer.format(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-xl shadow-black/10">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-white">{value}</p>
      <p className="mt-1 text-xs text-slate-400">{detail}</p>
    </div>
  );
}

const OUTCOME_LABELS: { key: keyof DashboardOutcomes; label: string; color: string }[] = [
  { key: "success", label: "Success", color: "bg-emerald-400" },
  { key: "retry-success", label: "Retry success", color: "bg-sky-400" },
  { key: "invalid", label: "Invalid", color: "bg-amber-400" },
  { key: "cancelled", label: "Cancelled", color: "bg-slate-400" },
  { key: "api-error", label: "API error", color: "bg-rose-400" },
];

function OutcomeMix({ summary }: { summary: DashboardSummary }) {
  return (
    <div className="flex flex-wrap gap-2">
      {OUTCOME_LABELS.map(({ key, label, color }) => (
        <span
          key={key}
          className="inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-950/70 px-3 py-1.5 text-xs text-slate-300"
        >
          <span className={`h-2 w-2 rounded-full ${color}`} />
          {label} <strong className="font-mono text-white">{summary.outcomes[key]}</strong>
        </span>
      ))}
    </div>
  );
}

export function OwnerUsageDashboard() {
  const [state, setState] = useState<ViewState>("checking");
  const [ownerKey, setOwnerKey] = useState("");
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState("");
  const [dashboard, setDashboard] = useState<UsageDashboard | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadDashboard = useCallback(async (candidate: string) => {
    setOwnerKey(candidate);
    setRefreshing(true);
    setMessage("");
    try {
      const response = await fetch("/api/owner/usage", {
        headers: authorizationHeaders(candidate),
        cache: "no-store",
      });
      const body = (await response.json().catch(() => null)) as
        | UsageDashboard
        | { error?: string }
        | null;

      if (response.status === 401) {
        window.localStorage.removeItem(OWNER_KEY_STORAGE);
        setOwnerKey("");
        setDashboard(null);
        setState("locked");
        setMessage(candidate ? "That owner key is not valid." : "Enter the owner key.");
        return;
      }
      if (response.status === 503) {
        setDashboard(null);
        setState("misconfigured");
        setMessage((body as { error?: string } | null)?.error ?? "Owner reporting is not configured.");
        return;
      }
      if (!response.ok || !body || !("totals" in body)) {
        setState("error");
        setMessage((body as { error?: string } | null)?.error ?? "Could not load usage data.");
        return;
      }

      window.localStorage.setItem(OWNER_KEY_STORAGE, candidate);
      setOwnerKey(candidate);
      setDraft("");
      setDashboard(body);
      setState("open");
    } catch {
      setState("error");
      setMessage("Could not reach the usage service. Check your connection and try again.");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadDashboard(window.localStorage.getItem(OWNER_KEY_STORAGE) ?? "");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadDashboard]);

  const lock = () => {
    window.localStorage.removeItem(OWNER_KEY_STORAGE);
    setOwnerKey("");
    setDashboard(null);
    setState("locked");
    setMessage("Enter the owner key.");
  };

  if (state !== "open" || !dashboard) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100">
        <section className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-7 shadow-2xl shadow-black/30">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-400">
            Workbench owner
          </p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">Usage dashboard</h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Private request, token, cost, reliability, and activity reporting.
          </p>

          {state === "checking" ? (
            <p role="status" aria-live="polite" className="mt-6 text-sm text-slate-300">
              Checking owner access…
            </p>
          ) : (
            <form
              className="mt-6 space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                void loadDashboard(draft);
              }}
            >
              {state !== "misconfigured" && (
                <>
                  <label className="block text-xs font-medium text-slate-300" htmlFor="owner-key">
                    Owner key
                  </label>
                  <input
                    id="owner-key"
                    type="password"
                    autoComplete="current-password"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder="Paste owner key"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 font-mono text-sm text-white outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
                  />
                  <button
                    type="submit"
                    disabled={refreshing || !draft}
                    className="w-full rounded-xl bg-sky-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {refreshing ? "Loading…" : "Open dashboard"}
                  </button>
                </>
              )}
              {message && (
                <p
                  role="alert"
                  className={`rounded-xl px-3 py-2 text-xs ${
                    state === "misconfigured"
                      ? "bg-amber-400/10 text-amber-300"
                      : "bg-rose-400/10 text-rose-300"
                  }`}
                >
                  {message}
                </p>
              )}
              {state === "error" && ownerKey && (
                <button
                  type="button"
                  onClick={() => void loadDashboard(ownerKey)}
                  className="w-full rounded-xl border border-slate-700 px-4 py-2.5 text-sm text-slate-200 hover:border-slate-500"
                >
                  Try again
                </button>
              )}
            </form>
          )}
          <Link href="/" className="mt-6 inline-block text-xs text-slate-500 hover:text-slate-300">
            ← Back to Workbench
          </Link>
        </section>
      </main>
    );
  }

  const tokens = dashboard.totals.tokensIn + dashboard.totals.tokensOut;

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-400">
              Workbench owner
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              Usage dashboard
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              Updated {new Date(dashboard.generatedAt).toLocaleString()}
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/"
              className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm text-slate-300 transition hover:border-slate-500 hover:text-white"
            >
              Workbench
            </Link>
            <button
              type="button"
              onClick={() => void loadDashboard(ownerKey)}
              disabled={refreshing}
              className="rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-sky-400 disabled:opacity-50"
            >
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
            <button
              type="button"
              onClick={lock}
              className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm text-slate-300 transition hover:border-rose-500/70 hover:text-rose-300"
            >
              Lock
            </button>
          </div>
        </header>

        {message && (
          <p
            role="alert"
            className="mt-5 rounded-xl bg-rose-400/10 px-4 py-3 text-sm text-rose-300"
          >
            {message}
          </p>
        )}

        <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Requests"
            value={integer.format(dashboard.totals.requests)}
            detail={`${dashboard.users.length} attributed user${dashboard.users.length === 1 ? "" : "s"}`}
          />
          <MetricCard
            label="Tokens"
            value={integer.format(tokens)}
            detail={`${integer.format(dashboard.totals.tokensCached)} cached input`}
          />
          <MetricCard
            label="Estimated cost"
            value={formatCost(dashboard.totals.costCents)}
            detail={dashboard.totals.costCents == null ? "Set USAGE_RATES to price every row" : "All recorded requests"}
          />
          <MetricCard
            label="Retry rate"
            value={formatRate(dashboard.totals.retryRate)}
            detail="Requests requiring more than one attempt"
          />
        </section>

        <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold text-white">Outcome mix</h2>
              <p className="mt-1 text-xs text-slate-500">Every durable generation row</p>
            </div>
            <OutcomeMix summary={dashboard.totals} />
          </div>
        </section>

        <section className="mt-8">
          <div className="mb-3">
            <h2 className="text-lg font-semibold text-white">Per-user usage</h2>
            <p className="mt-1 text-xs text-slate-500">Stable invite identities, never raw access keys</p>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/60">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="border-b border-slate-800 bg-slate-900 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium">Requests</th>
                  <th className="px-4 py-3 font-medium">Input</th>
                  <th className="px-4 py-3 font-medium">Output</th>
                  <th className="px-4 py-3 font-medium">Cached</th>
                  <th className="px-4 py-3 font-medium">Cost</th>
                  <th className="px-4 py-3 font-medium">Retry rate</th>
                  <th className="px-5 py-3 font-medium">Outcomes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {dashboard.users.map((user) => (
                  <tr key={user.userId} className="text-slate-300">
                    <td className="px-5 py-4 font-mono text-xs font-semibold text-sky-300">{user.userId}</td>
                    <td className="px-4 py-4 font-mono">{integer.format(user.requests)}</td>
                    <td className="px-4 py-4 font-mono">{integer.format(user.tokensIn)}</td>
                    <td className="px-4 py-4 font-mono">{integer.format(user.tokensOut)}</td>
                    <td className="px-4 py-4 font-mono">{integer.format(user.tokensCached)}</td>
                    <td className="px-4 py-4 font-mono">{formatCost(user.costCents)}</td>
                    <td className="px-4 py-4 font-mono">{formatRate(user.retryRate)}</td>
                    <td className="px-5 py-4"><OutcomeMix summary={user} /></td>
                  </tr>
                ))}
                {dashboard.users.length === 0 && (
                  <tr><td colSpan={8} className="px-5 py-10 text-center text-slate-500">No generation usage recorded yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-8 pb-12">
          <div className="mb-3">
            <h2 className="text-lg font-semibold text-white">Recent timeline</h2>
            <p className="mt-1 text-xs text-slate-500">Latest 100 real generation requests</p>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/60">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="border-b border-slate-800 bg-slate-900 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">When</th>
                  <th className="px-4 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium">Mode</th>
                  <th className="px-4 py-3 font-medium">Parts</th>
                  <th className="px-4 py-3 font-medium">Attempts</th>
                  <th className="px-4 py-3 font-medium">Tokens</th>
                  <th className="px-4 py-3 font-medium">Duration</th>
                  <th className="px-4 py-3 font-medium">Cost</th>
                  <th className="px-5 py-3 font-medium">Outcome</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {dashboard.timeline.map((item) => (
                  <tr key={item.id} className="text-slate-300">
                    <td className="whitespace-nowrap px-5 py-4 text-xs text-slate-400">{new Date(item.ts).toLocaleString()}</td>
                    <td className="px-4 py-4 font-mono text-xs text-sky-300">{item.userId}</td>
                    <td className="px-4 py-4 capitalize">{item.mode}</td>
                    <td className="px-4 py-4 font-mono">{item.parts ?? "—"}</td>
                    <td className="px-4 py-4 font-mono">{item.attempts}</td>
                    <td className="px-4 py-4 font-mono">{integer.format(item.tokensIn + item.tokensOut)}</td>
                    <td className="px-4 py-4 font-mono">{formatDuration(item.durationMs)}</td>
                    <td className="px-4 py-4 font-mono">{formatCost(item.costCents)}</td>
                    <td className="px-5 py-4"><span className="rounded-full bg-slate-800 px-2.5 py-1 text-xs">{item.outcome}</span></td>
                  </tr>
                ))}
                {dashboard.timeline.length === 0 && (
                  <tr><td colSpan={9} className="px-5 py-10 text-center text-slate-500">The timeline will appear after the first recorded generation.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
