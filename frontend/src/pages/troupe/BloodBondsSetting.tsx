import { api, unwrap } from "../../api/client";
import type { TroupeOut } from "../../api/types";
import { BOND_PAGE, BOND_SETTINGS, type BondSetting } from "../../bonds";
import { RadioList } from "../../components/RadioList";
import { SettingCard, useSaveOnChange } from "../../components/SettingCard";
import { ErrorText } from "../../components/ui";

/**
 * How Horatio tracks the troupe's blood bonds, once they're on: with its running staff
 * recording them; with players reporting drinks for staff to approve; or with players
 * recording them (#661). In the Bonds tab's Settings (#784, #909); bonds are switched on
 * and off in Troupe settings' Features list, which hides every bond and every drink
 * waiting while keeping what was recorded.
 */
export function BloodBondsSetting({ troupe, canEdit }: { troupe: TroupeOut; canEdit: boolean }) {
  const now = troupe.blood_bonds ?? "off";
  const save = useSaveOnChange(
    (setting: NonNullable<BondSetting>) => unwrap(api.PUT("/api/troupes/{troupe_id}/blood-bonds", { params: { path: { troupe_id: troupe.id } }, body: { setting } })),
    {
      message: (setting) =>
        setting === "staff" ? "Staff keep the blood bonds now." : "Players report drinks on their sheets and in the Play View now; staff see every bond here.",
    },
  );
  const chosen = BOND_SETTINGS.find((s) => s.value === now) ?? BOND_SETTINGS[0]!;
  return (
    <SettingCard
      title="Blood bonds"
      readOnly={!canEdit}
      about={`How Horatio keeps the blood bonds between characters (${BOND_PAGE}). A thrall's player sees their own bonds, a regnant's player only those staff mark known to them, and nobody else any. Changing the mode leaves drinks already waiting where they are.`}
    >
      {!canEdit ? (
        <p className="text-sm">
          {chosen.label}. <span className="text-mist">{chosen.meaning}</span>
        </p>
      ) : (
        <div className="flex flex-col gap-2 text-sm">
          <RadioList
            label="How Horatio tracks blood bonds"
            hideLabel
            value={now}
            // Off is the Features list's switch, the one place it is set.
            options={BOND_SETTINGS.filter((s) => s.value !== "off").map((s) => ({ value: s.value, label: s.label, hint: s.meaning }))}
            disabled={save.isPending}
            onChange={(setting) => save.mutate(setting)}
          />
          <ErrorText error={save.error} />
        </div>
      )}
    </SettingCard>
  );
}
