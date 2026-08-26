import { Client } from "pg";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Keep a single persistent client and a set of active senders/subscribers
let listenClient = null;
const subscribers = new Set();

async function initListenClient() {
  if (listenClient) return listenClient;

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query("LISTEN pos_events");

  client.on("notification", (msg) => {
    let data;
    try {
      data = JSON.parse(msg.payload);
    } catch {
      data = { raw: msg.payload };
    }
    for (const sendFn of subscribers) {
      try {
        sendFn(data);
      } catch {
        // Subscriber might be closed/stale
      }
    }
  });

  client.on("error", (err) => {
    console.error("Global listen client error, reconnecting:", err);
    listenClient = null;
    try {
      client.end();
    } catch {}
  });

  listenClient = client;
  return listenClient;
}

export async function GET() {
  const user = await getSession();
  if (!user) return new Response("No autenticado", { status: 401 });

  const encoder = new TextEncoder();
  let sendFn;
  let ping;

  const stream = new ReadableStream({
    async start(controller) {
      sendFn = (data) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // Stream closed
        }
      };

      try {
        // Ensure the single global listener is connected
        await initListenClient();
        
        // Add this request's sender function to the active subscribers list
        subscribers.add(sendFn);
        
        // Send initial greeting
        sendFn({ hello: true, ts: Date.now() });

        ping = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(`: ping\n\n`));
          } catch {
            // Already closed, interval will be cleared in cancel()
          }
        }, 25000);
      } catch (err) {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: err.message })}\n\n`));
        } catch {}
        controller.close();
      }
    },
    cancel() {
      clearInterval(ping);
      if (sendFn) {
        subscribers.delete(sendFn);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
