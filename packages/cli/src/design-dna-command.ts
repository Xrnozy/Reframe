import { analyzeDesignDna, designDnaStatus, persistDesignDna, reviewDesignDna, type DesignReviewStatus } from "@reframe/dev-server";

const flags: Readonly<Record<string, DesignReviewStatus>> = { "--correct": "correct", "--incorrect": "incorrect", "--exception": "intentional-exception", "--deprecated": "deprecated", "--review": "needs-review" };

export async function runDesignDnaCommand(args: readonly string[], projectRoot: string, output: Pick<NodeJS.WriteStream, "write"> = process.stdout): Promise<number> {
  const command = args[0] ?? "preview";
  if (command === "status") { output.write(`${await designDnaStatus(projectRoot)}\n`); return 0; }
  const preview = command === "analyze"
    ? await analyzeDesignDna(projectRoot, { useCodex: true })
    : await analyzeDesignDna(projectRoot);
  if (command === "preview") { output.write(`${JSON.stringify(preview, null, 2)}\n`); return 0; }
  if (command !== "write") throw new Error("DNA_USAGE: use `reframe dna preview`, `reframe dna analyze`, `reframe dna status`, or `reframe dna write --correct=<id> [--agents]`");
  const updates: Record<string, DesignReviewStatus> = {};
  for (const argument of args.slice(1)) { const [name, id] = argument.split("=", 2); if (name === "--agents") continue; const status = flags[name!]; if (!status || !id) throw new Error(`DNA_REVIEW_INVALID:${argument}`); updates[id] = status; }
  const known = new Set([...preview.findings, ...preview.components].map((item) => item.id)); for (const id of Object.keys(updates)) if (!known.has(id)) throw new Error(`DNA_FINDING_UNKNOWN:${id}`);
  const reviewed = reviewDesignDna(preview, updates); await persistDesignDna(projectRoot, reviewed, { permission: true, agentsPermission: args.includes("--agents") }); output.write(`Design DNA ${reviewed.version} written.\n`); return 0;
}
