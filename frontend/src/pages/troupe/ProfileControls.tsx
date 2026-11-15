/** The troupe's own controls on its Overview (#781), among the profile's editing parts (#912): who sees the profile, and its lead's name and description. */
import { useState, type ReactNode } from "react";
import { api, unwrap } from "../../api/client";
import type { TroupeOut, TroupeProfileOut } from "../../api/types";
import { CardHeading } from "../../components/Headings";
import { Toggle } from "../../components/Toggle";
import { Button, ErrorText, Field, Input, Textarea } from "../../components/ui";
import { useAction, useRulesAction } from "../../hooks";
import { publicPath } from "./profile";

/** Who sees the profile: anyone, or only people signed in. Saves as soon as it is changed. First of the profile's editing parts (#912). */
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
    <div>
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
    </div>
  );
}

/** A part of the profile under its own heading, inside the profile's card. `wide` takes the whole row. */
export function ProfileSection({ title, actions, wide = false, children }: { title: string; actions?: ReactNode; wide?: boolean; children: ReactNode }) {
  return (
    <section className={`flex min-w-0 flex-col gap-2 ${wide ? "md:col-span-2" : ""}`}>
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-2">
        <CardHeading>
          {title}
        </CardHeading>
        {actions}
      </div>
      {children}
    </section>
  );
}

/**
 * The troupe's name and description, which only its lead changes: among the
 * profile's editing parts (#912), the description being the profile's own first lines.
 */
export function NameAndDescription({ troupe }: { troupe: TroupeOut }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(troupe.name);
  const [description, setDescription] = useState(troupe.description);
  const save = useRulesAction(() =>
    unwrap(api.PATCH("/api/troupes/{troupe_id}", { params: { path: { troupe_id: troupe.id } }, body: { name, description } })),
  );
  const close = () => {
    setName(troupe.name);
    setDescription(troupe.description);
    save.reset();
    setOpen(false);
  };
  return (
    <ProfileSection
      title="Name and description"
      actions={
        !open && (
          <Button variant="ghost" className="min-h-8 px-2" aria-label="Edit name and description" onClick={() => setOpen(true)}>
            Edit
          </Button>
        )
      }
    >
      {open ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(undefined, { onSuccess: () => setOpen(false) });
          }}
        >
          <Field label="Name">
            <Input required maxLength={200} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Description" hint="Its first lines show on the troupe list, to help players choose.">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <ErrorText error={save.error} />
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      ) : (
        <dl className="flex flex-col gap-2 text-sm">
          <div>
            <dt className="text-xs text-mist">Name</dt>
            <dd>{troupe.name}</dd>
          </div>
          <div>
            <dt className="text-xs text-mist">Description</dt>
            <dd className="line-clamp-3 whitespace-pre-line">{troupe.description || <span className="text-mist">None yet.</span>}</dd>
          </div>
        </dl>
      )}
    </ProfileSection>
  );
}
