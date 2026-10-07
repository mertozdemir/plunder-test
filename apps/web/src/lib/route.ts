import { useEffect, useState } from "react";

export type Route =
  | { name: "home" }
  | { name: "server"; serverId: string; channelId?: string }
  | { name: "join"; code: string }
  | { name: "lab" };

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (parts[0] === "s" && parts[1]) return { name: "server", serverId: parts[1], channelId: parts[2] };
  if (parts[0] === "join" && parts[1]) return { name: "join", code: parts[1] };
  if (parts[0] === "lab") return { name: "lab" };
  return { name: "home" };
}

export function go(path: string) {
  window.location.hash = path;
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  useEffect(() => {
    const on = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}
