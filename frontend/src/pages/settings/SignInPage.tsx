import type { PlayerOut } from "../../api/types";
import { AccountEmail } from "../AccountEmail";
import { ViewedAs } from "../ViewedAs";
import { DiscordLinkCard } from "./DiscordLinkCard";
import { EmailNotifications } from "./EmailNotifications";
import { HandleCard } from "./HandleCard";
import { PasswordCard } from "./PasswordCard";
import { PreferenceCards, useScrollToHash } from "./PreferenceControls";

/**
 * How the signed-in person signs in, and what they are sent (#910): their email and
 * handle, either of which signs them in, their password and their linked Discord
 * account; which notifications also come by email (#notifications, from the bell);
 * and each time the custodian viewed Horatio as them.
 */
export function SignInPage({ player }: { player: PlayerOut }) {
  useScrollToHash();
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <AccountEmail player={player} />
      <HandleCard />
      <PasswordCard />
      <DiscordLinkCard />
      <PreferenceCards id="notifications">
        <EmailNotifications />
      </PreferenceCards>
      <ViewedAs />
    </div>
  );
}
