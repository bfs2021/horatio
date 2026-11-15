/** The troupe's own controls on its Overview (#781): who sees the profile, and its lead's name and description. */
import { useState } from "react";
import { api, unwrap } from "../../api/client";
import type { TroupeOut, TroupeProfileOut } from "../../api/types";
import { Toggle } from "../../components/Toggle";
import { Button, Card, ErrorText, Field, Input, Textarea } from "../../components/ui";
import { useAction, useRulesAction } from "../../hooks";
import { publicPath } from "./profile";

/** Who sees the profile: anyone, or only people signed in. Saves as soon as it is changed. */
export function PublicSwitch({ profile }: { profile: TroupeProfileOut }) {
  const [copied, setCopied] = useState(false);
  const change = useAction((on: boolean) =>
    unwrap(api.PUT("/api/troupes/{troupe_id}/profile/public", { params: { path: { troupe_id: profile.id } }, body: { public: on } })),
  );
  const on = change.isPending && change.variables !== undefined ? change.variables : profile.public;
  const address = `${window.location.origin}${publicPath(profile.id)}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
    } catch {
      // No clipboard here (an insecure page, or refused): the link is there to copy by hand.
    }
  };

  return (
    <Card>
      <Toggle
        label={on ? "Public: anyone can see this profile, even people not signed in" : "Signed-in only"}
        aria-label="Public"
        hint={
          on
            ? "Share the link when recruiting. The venue's street address still shows only to people signed in."
            : "Only people signed in can see this profile. Switch it on to share it when recruiting."
        }
        checked={on}
        disabled={change.isPending}
        onChange={(next) => change.mutate(next)}
        className="text-parchment"
      >
        {on && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs break-all">{address}</span>
            <Button type="button" variant="ghost" className="min-h-8 px-2" onClick={() => void copy()}>
              {copied ? "Copied" : "Copy the link"}
            </Button>
          </div>
        )}
      </Toggle>
      <ErrorText error={change.error} />
    </Card>
  );
}

/** The troupe's name and description, which only its lead changes. */
export function NameAndDescription({ troupe }: { troupe: TroupeOut }) {
  const [name, setName] = useState(troupe.name);
  const [description, setDescription] = useState(troupe.description);
  const save = useRulesAction(() =>
    unwrap(api.PATCH("/api/troupes/{troupe_id}", { params: { path: { troupe_id: troupe.id } }, body: { name, description } })),
  );
  return (
    <Card title="Name and description">
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(undefined);
        }}
      >
        <Field label="Name">
          <Input required maxLength={200} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Description" hint="Its first lines show on the troupe list, to help players choose.">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <ErrorText error={save.error} />
        <div>
          <Button type="submit" disabled={save.isPending}>
            Save
          </Button>
        </div>
      </form>
    </Card>
  );
}
