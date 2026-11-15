import { useQuery } from "@tanstack/react-query";
import { api, unwrap } from "../../api/client";
import { LogList } from "../../components/LogList";
import { EmptyState } from "../../components/EmptyState";
import { Card, ErrorText, Loading } from "../../components/ui";

/** What has happened in the troupe, newest first, for its storytellers and assistants. */
export function LogTab({ troupeId }: { troupeId: string }) {
  const log = useQuery({
    queryKey: ["log", troupeId],
    queryFn: () => unwrap(api.GET("/api/troupes/{troupe_id}/log", { params: { path: { troupe_id: troupeId } } })),
    refetchInterval: 60_000,
  });
  if (log.isPending) return <Loading />;
  if (log.error) return <ErrorText error={log.error} />;
  if (!log.data.length)
    return (
      <Card title="Log">
        <EmptyState title="Nothing has happened yet.">Everything done in the troupe shows here as it happens, newest first.</EmptyState>
      </Card>
    );

  return (
    <Card title="Log">
      <LogList entries={log.data} linkTo={(e) => (e.character_id ? `/characters/${e.character_id}?troupe=${troupeId}` : null)} />
    </Card>
  );
}
