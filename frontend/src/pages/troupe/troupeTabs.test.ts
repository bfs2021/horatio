import { describe, expect, it } from "vitest";
import { repeatedLabels } from "../character/characterTabs";
import { abilities } from "./roles";
import { troupeTabGroups, type TroupeTabsTroupe } from "./troupeTabs";

// Every optional part switched on, so each role's whole set shows.
const troupe: TroupeTabsTroupe = {
  id: "t1",
  archived: false,
  whos_who: true,
  nominations: true,
  player_nominations: true,
  court_history_players: true,
  chronicle_players: true,
  blood_bonds: "staff",
  boons: true,
  quests_enabled: true,
};

const roles = ["lead_storyteller", "storyteller", "assistant_storyteller", "narrator", null] as const;
const flags = ["archived", "whos_who", "nominations", "player_nominations", "court_history_players", "chronicle_players", "boons", "quests_enabled"] as const;

/** Every combination of the troupe's switches, with blood bonds off and on. */
function everyTroupe(): TroupeTabsTroupe[] {
  return Array.from({ length: 1 << (flags.length + 1) }, (_, n) => {
    const t: TroupeTabsTroupe = { ...troupe, blood_bonds: n & (1 << flags.length) ? "staff" : "off" };
    flags.forEach((f, i) => (t[f] = !!(n & (1 << i))));
    return t;
  });
}

/** Each shown group with its tabs' labels. */
function layout(can: ReturnType<typeof abilities>, t: TroupeTabsTroupe = troupe) {
  return Object.fromEntries(
    troupeTabGroups(t, can)
      .filter((g) => g.tabs.length > 0)
      .map((g) => [g.label, g.tabs.map((tab) => tab.label)]),
  );
}

const storytellerLayout = {
  Troupe: ["Overview", "The setting", "Story bible", "Who's Who", "News", "Announcements", "Nominations", "Staff", "Log"],
  Characters: ["Approvals", "Being built", "Roster", "Players", "Lines and veils"],
  Games: ["At game", "Scenes ↗", "Award XP"],
  Court: ["Titles", "Court over time", "Chronicle", "Boons", "Bonds", "Web of obligation"],
  Downtimes: ["Cycles", "My work", "Fill tables", "Influence log", "Quests"],
  World: ["Locations", "Equipment", "Shared backgrounds"],
  Customise: ["Setup", "Troupe settings", "House rules", "Specialisations", "News agencies", "Connectors", "Export and import"],
};

describe("troupeTabGroups (#779)", () => {
  it("groups a lead storyteller's tabs by job", () => {
    expect(layout(abilities("lead_storyteller", false))).toEqual(storytellerLayout);
  });

  it("never shows two tabs with one label, nor a tab named as its group (#905)", () => {
    for (const t of everyTroupe()) {
      for (const role of roles) {
        for (const custodian of [false, true]) {
          const groups = troupeTabGroups(t, abilities(role, custodian));
          const why = JSON.stringify({ role, custodian, ...t });
          expect(repeatedLabels(groups), why).toEqual([]);
          expect(groups.flatMap((g) => g.tabs.filter((tab) => tab.label === g.label).map((tab) => `${g.label} › ${tab.label}`)), why).toEqual([]);
        }
      }
    }
  });

  it("gives a storyteller and an assistant storyteller the same groups as the lead", () => {
    expect(layout(abilities("storyteller", false))).toEqual(storytellerLayout);
    expect(layout(abilities("assistant_storyteller", false))).toEqual(storytellerLayout);
  });

  it("gives a narrator the troupe, lines and veils, and their downtime work", () => {
    expect(layout(abilities("narrator", false))).toEqual({
      Troupe: ["Overview", "The setting", "Who's Who", "News", "Announcements", "Nominations", "House rules", "Staff"],
      Characters: ["Lines and veils"],
      Court: ["Court over time", "Chronicle"],
      Downtimes: ["My work", "Fill tables", "Quests"],
    });
  });

  it("puts Court and Chronicle under Court for a player, as for staff", () => {
    expect(layout(abilities(null, false))).toEqual({
      Troupe: ["Overview", "The setting", "Who's Who", "News", "Announcements", "Nominations", "House rules"],
      Court: ["Court over time", "Chronicle"],
    });
  });

  it("leaves a player's Court group out when the troupe shares neither", () => {
    const quiet = { ...troupe, court_history_players: false, chronicle_players: false };
    expect(Object.keys(layout(abilities(null, false), quiet))).toEqual(["Troupe"]);
  });

  it("keeps each tab in one group whoever is looking, but House rules", () => {
    const groupOf = (role: Parameters<typeof abilities>[0]) =>
      new Map(troupeTabGroups(troupe, abilities(role, false)).flatMap((g) => g.tabs.map((tab) => [tab.to, g.label] as const)));
    const lead = groupOf("lead_storyteller");
    for (const role of ["storyteller", "assistant_storyteller", "narrator", null] as const) {
      for (const [to, group] of groupOf(role)) {
        if (to === "/troupes/t1/house-rules") continue;
        expect(group, `${to} for ${role}`).toBe(lead.get(to));
      }
    }
  });

  it("puts House rules under Customise for running staff, where they change it, and under Troupe for the rest (#782)", () => {
    const houseRulesIn = (role: Parameters<typeof abilities>[0]) =>
      troupeTabGroups(troupe, abilities(role, false)).find((g) => g.tabs.some((tab) => tab.to === "/troupes/t1/house-rules"))?.label;
    expect(houseRulesIn("lead_storyteller")).toBe("Customise");
    expect(houseRulesIn("assistant_storyteller")).toBe("Customise");
    expect(houseRulesIn("narrator")).toBe("Troupe");
    expect(houseRulesIn(null)).toBe("Troupe");
  });

  it("keeps a narrator's My work open inside a cycle, where their work opens (#789)", () => {
    const work = (role: Parameters<typeof abilities>[0]) =>
      troupeTabGroups(troupe, abilities(role, false))
        .find((g) => g.label === "Downtimes")
        ?.tabs.find((tab) => tab.label === "My work");
    expect(work("narrator")?.also).toBe("/troupes/t1/downtimes");
    expect(work("storyteller")?.also).toBeUndefined();
  });

  it("keeps the story bible to running staff of a troupe still open (#879)", () => {
    const has = (role: Parameters<typeof abilities>[0], t: TroupeTabsTroupe = troupe) =>
      troupeTabGroups(t, abilities(role, false)).some((g) => g.tabs.some((tab) => tab.label === "Story bible"));
    expect(has("assistant_storyteller")).toBe(true);
    expect(has("narrator")).toBe(false);
    expect(has(null)).toBe(false);
    expect(has("lead_storyteller", { ...troupe, archived: true })).toBe(false);
  });

  it("opens Characters on the roster, and Scenes on the scenes page, saying it leaves (#922)", () => {
    const groups = troupeTabGroups(troupe, abilities("storyteller", false));
    expect(groups.find((g) => g.label === "Characters")?.to).toBe("/troupes/t1/characters");
    const scenes = groups.find((g) => g.label === "Games")?.tabs.find((tab) => tab.to === "/play/troupes/t1/scenes");
    expect(scenes).toMatchObject({ label: "Scenes ↗", ariaLabel: "Scenes (opens the scenes page)" });
  });
});
