import type { Command, Report } from "./protocol.ts";
import { Session } from "./session.ts";

const post = (report: Report) => postMessage(report);

const session = new Session({
  post,
  schedule: (task) => setTimeout(task, 0),
  now: () => performance.now(),
});

addEventListener("message", (message: MessageEvent<Command>) => {
  try {
    session.handle(message.data);
  } catch (error) {
    post({ type: "error", message: error instanceof Error ? error.message : String(error) });
  }
});
