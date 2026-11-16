import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useState } from "react";
import { Navigate, Route, Routes, useParams } from "react-router";
import { api, unwrap } from "../../api/client";
import { Empty, ErrorText, Loading, Select } from "../../components/ui";
import { BackLink } from "../../components/BackLink";
import { AuditsCard } from "../troupe/BoonAudits";
import { BoonbreakersTab } from "../troupe/Boonbreakers";
import { HarpyMode } from "../troupe/boonKeeper";
import { BoonReviewTab } from "../troupe/BoonReviewTab";
import { BoonStandingsTab } from "../troupe/BoonStandingsTab";
import { BoonsTab, type LedgerKeeper } from "../troupe/BoonsTab";
import { BoonTabs, partPath, partTo, type BoonPart } from "../troupe/BoonTabs";
import { TalonsCard } from "../troupe/BoonTalons";
import { useTitle } from "../../title";

// It brings d3, so it loads on its own, only when opened (as on the staff screen).
const BoonStatisticsPage = lazy(() => import("../troupe/BoonStatisticsPage").then((m) => ({ default: m.BoonStatisticsPage })));

/**
 * The boon ledger its Harpy keeps (#688), or one of its Lesser Harpies (#689), linked
 * from the Play View's Boons tab: the review queue, or the whole ledger, as the troupe
 * lets its Harpy reach and the Harpy lets a Lesser Harpy act. Everything done here is
 * logged as done by the character. The Harpy also gives others access here. With no
 * Harpy title or access given, or no access, there is nothing to keep. Where the
 * troupe lets its Harpy read them (#749), the boon standings and statistics too, with
 * who has left as the court knows it. Each part is a tab, as on staff's boons screen
 * (#982): Ledger, To review, Standings, Statistics, Boonbreakers (the Harpy's, not a
 * Lesser Harpy's) and Audits, as far as each reaches; with only the review queue and
 * no standings, the queue alone.
 */
export function HarpyLedgerPage() {
  const { characterId = "" } = useParams();
  const ledgers = useQuery({
    queryKey: ["harpy-ledgers", characterId],
    queryFn: () => unwrap(api.GET("/api/characters/{character_id}/harpy-ledgers", { params: { path: { character_id: characterId } } })),
  });
  const [picked, setPicked] = useState<string | null>(null);
  const found = ledgers.isSuccess ? ledgers.data : [];
  const shown = found.find((l) => l.troupe_id === picked) ?? found[0];
  const keeper: LedgerKeeper | null = shown
    ? {
        access: shown.access,
        role: shown.role ?? "harpy",
        add: shown.can_add ?? true,
        edit: shown.can_edit ?? true,
        settle: shown.can_settle ?? true,
        review: shown.can_review ?? true,
        audit: shown.can_audit ?? true,
        export: shown.can_export ?? false,
        word: shown.talon_word ?? "Lesser Harpy",
      }
    : null;

  const full = shown?.access === "full";
  const parts: BoonPart[] = [
    ...(full ? (["ledger"] as const) : []),
    ...(keeper?.review ? (["review"] as const) : []),
    ...(shown?.sees_standings ? (["standings", "statistics"] as const) : []),
    ...(full && keeper?.role === "harpy" ? (["boonbreakers"] as const) : []),
    ...(full && keeper?.audit ? (["audits"] as const) : []),
  ];
  const base = `/play/characters/${characterId}/ledger`;

  const heading = shown?.access === "submissions" ? "Boons to review" : "The boon ledger";
  useTitle(heading);

  return (
    <div className="min-h-screen bg-night pb-16 text-parchment">
      <header className="sticky top-0 z-10 border-b border-ash bg-night/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-2">
          <BackLink label="Play View" to={`/play/characters/${characterId}?tab=boons`} />
          <h1 className="text-lg">{heading}</h1>
        </div>
      </header>
      <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 pt-3">
        {ledgers.isPending ? (
          <Loading />
        ) : ledgers.error ? (
          <ErrorText error={ledgers.error} />
        ) : !shown ? (
          <Empty>
            This character keeps no boon ledger: it holds no Harpy title where the troupe gives its Harpy the ledger, and no Harpy has given it access.
          </Empty>
        ) : (
          <>
            {found.length > 1 && (
              <Select aria-label="Troupe" value={shown.troupe_id} onChange={(e) => setPicked(e.target.value)}>
                {found.map((l) => (
                  <option key={l.troupe_id} value={l.troupe_id}>
                    {l.troupe_name}
                  </option>
                ))}
              </Select>
            )}
            <p className="text-sm text-mist">
              As {keeper?.role === "talon" ? `a ${keeper.word}` : "Harpy"} of {shown.troupe_name}.
            </p>
            <HarpyMode.Provider value={keeper}>
              <BoonTabs key={shown.troupe_id} troupeId={shown.troupe_id} base={base} parts={parts} holdsReview={!full} />
              <Routes>
                {parts.map((part) => {
                  const element = partOf(part, shown.troupe_id, keeper!, shown.gives_access ?? false, partTo(base, parts, "review"));
                  const path = partPath(parts, part);
                  return path ? <Route key={part} path={path} element={element} /> : <Route key={part} index element={element} />;
                })}
                {/* A part this troupe's ledger doesn't give, as after picking another troupe. */}
                <Route path="*" element={<Navigate to={base} replace />} />
              </Routes>
            </HarpyMode.Provider>
          </>
        )}
      </main>
    </div>
  );
}

/** A part of the ledger the Harpy keeps, for its tab: each keyed by troupe, so picking another starts it afresh. */
function partOf(part: BoonPart, troupeId: string, keeper: LedgerKeeper, givesAccess: boolean, reviewTo: string) {
  switch (part) {
    case "ledger":
      return (
        <>
          <BoonsTab key={troupeId} troupeId={troupeId} harpy={keeper} review={keeper.review ? reviewTo : undefined} />
          {givesAccess && <TalonsCard key={`talons-${troupeId}`} troupeId={troupeId} />}
        </>
      );
    case "review":
      return <BoonReviewTab key={troupeId} troupeId={troupeId} />;
    case "standings":
      return <BoonStandingsTab key={troupeId} troupeId={troupeId} harpy />;
    case "statistics":
      return (
        <Suspense fallback={<Loading />}>
          <BoonStatisticsPage key={troupeId} troupeId={troupeId} harpy />
        </Suspense>
      );
    case "boonbreakers":
      return <BoonbreakersTab key={troupeId} troupeId={troupeId} />;
    case "audits":
      return <AuditsCard key={troupeId} troupeId={troupeId} inPlay />;
  }
}
