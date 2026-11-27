"use client";

import {
  ListIcon,
  MagnifyingGlassIcon,
  MoonIcon,
  SunIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Flag } from "@/components/Flag";
import { TeamBadge } from "@/components/TeamBadge";
import { Mark, Navigation, sectionLabel } from "./Sidebar";

type Entry = { id: number; name: string; role: 'bat' | 'bowl'; rank: number | null; ipl: string | null; country: string | null };

export function Topbar() {
  const router = useRouter();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [dark, setDark] = useState(false);
  // the player list is a separate file, fetched the first time search opens (not repeated in every page)
  const [players, setPlayers] = useState<Entry[] | null>(null);
  const [searchFailed, setSearchFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!open || players) return;
    const request = new AbortController();
    fetch("/search.json", { signal: request.signal })
      .then((r) => {
        if (!r.ok) throw new Error("Player search unavailable");
        return r.json();
      })
      .then((d: Entry[]) => {
        if (!request.signal.aborted) {
          setSearchFailed(false);
          setPlayers(d);
        }
      })
      .catch(() => {
        if (!request.signal.aborted) setSearchFailed(true);
      });
    return () => request.abort();
  }, [open, players, attempt]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDark(document.documentElement.classList.contains("dark"));
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setMenu(false);
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggleTheme = () => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      /* storage unavailable: the theme still applies for this visit */
    }
    setDark(next);
  };

  const go = (href: string) => {
    setOpen(false);
    setMenu(false);
    router.push(href);
  };

  return (
    <header className="flex min-h-16 items-center gap-2 border-b border-line bg-rail px-4 sm:gap-3 sm:px-7 lg:px-8">
      <Sheet open={menu} onOpenChange={setMenu}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="size-10 lg:hidden" aria-label="Open navigation">
            <ListIcon />
          </Button>
        </SheetTrigger>
        <SheetContent>
          <SheetTitle className="mb-6 px-3 text-lg font-semibold">Pressure Index</SheetTitle>
          <SheetDescription className="sr-only">Navigate the dashboard</SheetDescription>
          <Navigation onNavigate={() => setMenu(false)} />
        </SheetContent>
      </Sheet>
      <Link href="/" className="flex min-w-0 items-center gap-2 lg:hidden" aria-label="Pressure Index home">
        <Mark size={28} />
        <span className="truncate text-base font-semibold">Pressure Index</span>
      </Link>
      <span className="hidden text-sm font-medium text-ink-2 lg:block">{sectionLabel(path) ?? "Pressure Index"}</span>

      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search players"
        aria-haspopup="dialog"
        className="ml-auto flex h-10 shrink-0 items-center gap-2 rounded-md border border-line bg-panel px-3 text-sm text-ink-2 transition-colors hover:border-line-strong hover:text-foreground lg:w-64"
      >
        <MagnifyingGlassIcon size={16} />
        <span className="hidden sm:inline">Search players</span>
        <kbd className="ml-auto hidden whitespace-nowrap rounded-sm border border-line bg-panel-2 px-1.5 text-xs text-ink-3 lg:inline">Ctrl K</kbd>
      </button>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-10 shrink-0"
            onClick={toggleTheme}
            aria-label={dark ? "Use light theme" : "Use dark theme"}
          >
            {dark ? <SunIcon /> : <MoonIcon />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{dark ? "Light theme" : "Dark theme"}</TooltipContent>
      </Tooltip>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Search players"
        description="Find a batting or bowling profile"
        className="sm:max-w-lg"
      >
        {open && <Command>
          <CommandInput placeholder="Type a player name" />
          <CommandList>
            <CommandEmpty>
              {searchFailed ? (
                <>
                  Player search is unavailable.{" "}
                  <button type="button" className="font-semibold text-signal-ink underline" onClick={() => {
                    setSearchFailed(false);
                    setAttempt((n) => n + 1);
                  }}>
                    Try again
                  </button>
                </>
              ) : players ? "No players match that name." : "Loading players…"}
            </CommandEmpty>
            {(["bat", "bowl"] as const).map((role) => (
              <CommandGroup
                key={role}
                heading={role === "bat" ? "Batters" : "Bowlers"}
              >
                {(players ?? [])
                  .filter((p) => p.role === role)
                  .map((p) => (
                    <CommandItem
                      key={`${role}-${p.id}`}
                      value={`${p.name} ${role}`}
                      onSelect={() => go(`/players/${role}/${p.id}/`)}
                    >
                      <span className="num w-8 shrink-0 text-[13px] font-medium text-signal-ink">
                        {p.rank ?? "–"}
                      </span>
                      <span className="min-w-0 truncate font-medium">{p.name}</span>
                      {/* fixed slots so flags and crests line up in two columns */}
                      <span className="ml-auto grid shrink-0 grid-cols-[28px_26px] items-center justify-items-center gap-1.5">
                        <span className="grid h-6 w-7 place-items-center">
                          <Flag country={p.country} size={22} />
                        </span>
                        <span className="grid size-6 place-items-center">
                          <TeamBadge team={p.ipl} size={24} />
                        </span>
                      </span>
                    </CommandItem>
                  ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>}
      </CommandDialog>
    </header>
  );
}
