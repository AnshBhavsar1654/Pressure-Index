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
import { cn } from "@/lib/utils";
import { Flag } from "@/components/Flag";
import { TeamBadge } from "@/components/TeamBadge";
import { Mark, NAV } from "./Sidebar";

type Entry = { id: number; name: string; role: 'bat' | 'bowl'; rank: number | null; ipl: string | null; country: string | null };

export function Topbar({ players }: { players: Entry[] }) {
  const router = useRouter();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [dark, setDark] = useState(true);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDark(document.documentElement.classList.contains("dark"));
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggleTheme = () => {
    const next = !dark;
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
    <header className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Link
          href="/"
          className="flex items-center gap-2.5 lg:hidden"
          aria-label="Pressure Index home"
        >
          <Mark size={32} />
          <span className="display text-[1.35rem] uppercase">
            Pressure Index
          </span>
        </Link>
        <button
          onClick={() => setOpen(true)}
          className="ml-auto flex h-11 min-w-0 items-center gap-2.5 rounded-lg border border-line bg-panel px-4 text-[14px] text-ink-3 transition-colors hover:border-line-strong hover:text-ink-2 lg:ml-0 lg:w-[380px]"
        >
          <MagnifyingGlassIcon size={17} weight="bold" />
          <span className="hidden sm:inline">Search any player</span>
          <kbd className="ml-auto hidden rounded-md border border-line bg-panel-2 px-1.5 py-0.5 text-[11px] text-ink-3 lg:inline">
            Ctrl K
          </kbd>
        </button>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="size-11 rounded-lg lg:ml-auto"
              onClick={toggleTheme}
              aria-label={dark ? "Use light theme" : "Use dark theme"}
            >
              {dark ? <SunIcon /> : <MoonIcon />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{dark ? "Light theme" : "Dark theme"}</TooltipContent>
        </Tooltip>
        <Button
          variant="outline"
          size="icon"
          className="size-11 rounded-lg lg:hidden"
          onClick={() => setMenu((m) => !m)}
          aria-label="Open sections menu"
          aria-expanded={menu}
        >
          <ListIcon />
        </Button>
      </div>
      {menu && (
        <nav
          aria-label="Sections"
          className="panel grid grid-cols-2 gap-1 p-2 lg:hidden"
        >
          {NAV.map((n) => (
            <button
              key={n.href}
              onClick={() => go(n.href)}
              className={cn(
                "flex min-h-11 items-center gap-2.5 rounded-xl px-3 text-left text-[14px] font-medium",
                (n.href === "/" ? path === "/" : path.startsWith(n.href))
                  ? "bg-pink text-white"
                  : "text-ink-2 hover:bg-panel-2",
              )}
            >
              <n.icon size={18} />
              {n.label}
            </button>
          ))}
        </nav>
      )}
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Search players"
        description="Find any rated batter or bowler"
      >
        <Command>
          <CommandInput placeholder="Type a player name" />
          <CommandList>
            <CommandEmpty>No rated player matches that name.</CommandEmpty>
            {(["bat", "bowl"] as const).map((role) => (
              <CommandGroup
                key={role}
                heading={role === "bat" ? "Batters" : "Bowlers"}
              >
                {players
                  .filter((p) => p.role === role)
                  .map((p) => (
                    <CommandItem
                      key={`${role}-${p.id}`}
                      value={`${p.name} ${role}`}
                      onSelect={() => go(`/players/${role}/${p.id}/`)}
                    >
                      <span className="display num w-8 shrink-0 text-[1.1rem] text-pink">
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
        </Command>
      </CommandDialog>
    </header>
  );
}
