import { cn } from "../lib/utils";
import {
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import { highlight } from "./code-block";
import { CopyButton } from "./code-copy-button";

type TabsState = { value: string; setValue: (value: string) => void };
const TabsContext = createContext<TabsState | null>(null);

function useTabs(): TabsState {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error("Tabs parts must be used inside <Tabs>");
  return ctx;
}

/** Minimal shadcn Tabs (no @radix-ui/react-tabs installed). */
function Tabs({
  defaultValue,
  className,
  children,
}: {
  defaultValue: string;
  className?: string;
  children: ReactNode;
}) {
  const [value, setValue] = useState(defaultValue);
  return (
    <TabsContext.Provider value={{ value, setValue }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

function TabsList({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex h-10 items-center justify-center rounded-md bg-input p-1 text-muted-foreground border",
        className,
      )}
    >
      {children}
    </div>
  );
}

function TabsTrigger({
  value,
  className,
  children,
}: {
  value: string;
  className?: string;
  children: ReactNode;
}) {
  const ctx = useTabs();
  const active = ctx.value === value;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      data-state={active ? "active" : "inactive"}
      onClick={() => ctx.setValue(value)}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap  px-3 py-2 text-sm font-medium ring-offset-background transition-all focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-xs rounded-md",
        className,
      )}
    >
      {children}
    </button>
  );
}

function TabsContent({
  value,
  className,
  children,
}: {
  value: string;
  className?: string;
  children: ReactNode;
}) {
  const ctx = useTabs();
  if (ctx.value !== value) return null;
  return (
    <div
      role="tabpanel"
      data-state="active"
      className={cn("mt-2 ring-offset-background", className)}
    >
      {children}
    </div>
  );
}

export type CodeTabInput = {
  id: string;
  label: ReactNode;
  code: string;
  lang?: string;
};

export function CodeTabs({
  tabs,
  defaultValue,
  className,
  isLogos = false,
}: {
  tabs: CodeTabInput[];
  defaultValue?: string;
  className?: string;
  isLogos?: boolean;
}) {
  const [highlighted, setHighlighted] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        tabs.map(async (t) => {
          const html = await highlight(t.code, t.lang ?? "tsx");
          return [t.id, html] as const;
        }),
      );
      if (!cancelled) setHighlighted(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [tabs]);

  if (tabs.length === 0) return null;

  // Single tab → plain block, no Tabs UI
  if (tabs.length === 1) {
    const t = tabs[0];
    return (
      <div
        className={`uil-code relative rounded bg-zinc-900 p-4 ${className ?? ""}`}
      >
        <CopyButton code={t.code} classname="top-2 right-2 absolute" />
        {highlighted[t.id] ? (
          <div dangerouslySetInnerHTML={{ __html: highlighted[t.id] }} />
        ) : (
          <pre className="opacity-50">
            <code>{t.code}</code>
          </pre>
        )}
      </div>
    );
  }

  return (
    <div className="uil-code">
      {isLogos ? (
        <>
          <Tabs
            defaultValue={defaultValue ?? "ui-layouts"}
            className="rounded-xl bg-muted border backdrop-blur-md relative p-1 my-5"
          >
            <TabsList className="rounded-lg mt-1 mx-1 bg-transparent border-0">
              {tabs.map((tab) => (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className="data-[state=active]:bg-card gap-1 data-[state=active]:border"
                >
                  {tab.id === "ui-layouts" ? (
                    <>
                      <svg
                        width="238"
                        height="264"
                        viewBox="0 0 238 264"
                        fill="none"
                        className="size-4"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M130 0C146.292 0 159.5 13.2076 159.5 29.5V39.5C159.5 55.2401 172.26 68 188 68H208C224.292 68 237.5 81.2076 237.5 97.5V234.5C237.5 250.792 224.292 264 208 264H105C88.7076 264 75.5 250.792 75.5 234.5V226.5C75.5 210.76 62.7401 198 47 198H29.5C13.2076 198 0 184.792 0 168.5V29.5C0 13.2076 13.2076 0 29.5 0H130ZM86 78C81.5817 78 78 81.5817 78 86V191C78 195.418 81.5817 199 86 199H158C162.418 199 166 195.418 166 191V86C166 81.5817 162.418 78 158 78H86Z"
                          fill="currentColor"
                        />
                      </svg>
                      ui-layouts
                    </>
                  ) : (
                    <>
                      <svg viewBox="0 0 256 256" className="size-4" fill="none">
                        <line
                          x1="208"
                          y1="128"
                          x2="128"
                          y2="208"
                          stroke="currentColor"
                          strokeWidth="32"
                        />
                        <line
                          x1="192"
                          y1="40"
                          x2="40"
                          y2="192"
                          stroke="currentColor"
                          strokeWidth="32"
                        />
                      </svg>
                      shadcn
                    </>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>

            {tabs.map((tab) => (
              <TabsContent
                key={tab.id}
                value={tab.id}
                className="mt-1 border-none"
              >
                <CopyButton
                  code={tab.code}
                  classname="top-1.5 border bg-card absolute right-3"
                />
                <div
                  className="cliblocks rounded-xl p-1 px-2 border-none"
                  dangerouslySetInnerHTML={{
                    __html: highlighted[tab.id] ?? "",
                  }}
                />
              </TabsContent>
            ))}
          </Tabs>
        </>
      ) : (
        <Tabs
          defaultValue={defaultValue ?? tabs[0].id}
          className={cn(
            "rounded-xl bg-muted border backdrop-blur-md relative p-1 my-5",
            className,
          )}
        >
          <TabsList className="rounded-lg mt-1 mx-1 bg-transparent border-0">
            {tabs.map((t) => (
              <TabsTrigger
                key={t.id}
                value={t.id}
                className="data-[state=active]:bg-card gap-1 data-[state=active]:border"
              >
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {tabs.map((t) => (
            <TabsContent key={t.id} value={t.id} className="mt-1 border-none">
              <CopyButton
                code={t.code}
                classname="top-1.5 border bg-card absolute right-3"
              />
              {highlighted[t.id] ? (
                <div
                  className="cliblocks rounded-xl p-1 px-2 border-none"
                  dangerouslySetInnerHTML={{ __html: highlighted[t.id] }}
                />
              ) : (
                <pre className="cliblocks rounded-xl p-1 px-2 opacity-50">
                  <code>{t.code}</code>
                </pre>
              )}
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}
