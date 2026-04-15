import { useEffect, useState } from "react";
import { useEventBusClient } from "./EventBusContext";
import type { ConnectionStatus } from "./client";

export function useEventBusStatus(): ConnectionStatus {
  const client = useEventBusClient();
  const [status, setStatus] = useState<ConnectionStatus>(client.getStatus());

  useEffect(() => {
    return client.onStatusChange(setStatus);
  }, [client]);

  return status;
}
