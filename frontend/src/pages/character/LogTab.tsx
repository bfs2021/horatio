import { useQuery } from "@tanstack/react-query";
import { api, unwrap } from "../../api/client";
import { LogList } from "../../components/LogList";
import { EmptyState } from "../../components/EmptyState";
import { Card, ErrorText, Loading } from "../../components/ui";

/** Everything done to the character, newest first. */
export function CharacterLogTab({ characterId }: { characterId: string }) {
  const log = useQuery({
    queryKey: ["character-log", characterId],
    queryFn: () => unwrap(api.GET("/api/characters/{character_id}/log", { params: { path: { character_id: characterId } } })),
  });
  if (log.isPending) return <Loading />;
  if (log.error) return <ErrorText error={log.error} />;
  if (!log.data.length)
    return (
      <Card title="Log">
        <EmptyState title="Nothing has happened yet.">Everything done to the character shows here as it happens, newest first.</EmptyState>
      </Card>
    );

  return (
    <Card title="Log">
      <LogList entries={log.data} />
    </Card>
  );
}
