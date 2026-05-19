import { createFileRoute } from "@tanstack/react-router";
import { runMondayBoard } from "@/server/cadence.server";
import { checkCronAuth } from "@/server/cron-auth.server";

export const Route = createFileRoute("/api/public/cron/monday-board")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = checkCronAuth(request);
        if (auth) return auth;
        try {
          const result = await runMondayBoard();
          return Response.json({ ok: true, ...result });
        } catch (e: any) {
          return Response.json({ ok: false, error: e.message }, { status: 500 });
        }
      },
    },
  },
});
