import type { Criterion } from "./types.ts";

export interface Template {
  id: string;
  name: string;
  blurb: string;
  title: string;
  criteria: Criterion[];
  tieRule: "lowest" | "split";
}

/** Presets are only starting points: every one still goes through the contract's own linter. */
export const TEMPLATES: Template[] = [
  {
    id: "grant",
    name: "Open-source grant",
    blurb: "Fund a public good. The proposal must name its license and ship in public.",
    title: "Open-source grant",
    tieRule: "lowest",
    criteria: [
      { kind: "contains", text: "Milestones" },
      { kind: "license", allowed: ["MIT", "Apache-2.0", "MPL-2.0"] },
      { kind: "deliverable", prefix: "https://github.com/" },
      { kind: "question", text: "Does the page name the people who will do the work?" },
    ],
  },
  {
    id: "hackathon",
    name: "Hackathon prize",
    blurb: "Pay the working submission. Every entry that clears the bar splits the pool.",
    title: "Hackathon prize",
    tieRule: "split",
    criteria: [
      { kind: "contains", text: "Demo" },
      { kind: "deliverable", prefix: "https://github.com/" },
      { kind: "question", text: "Does the page link to a working demo?" },
    ],
  },
  {
    id: "procurement",
    name: "Procurement bid",
    blurb: "Buy a service at the lowest compliant price, with a hard price ceiling.",
    title: "Service procurement",
    tieRule: "lowest",
    criteria: [
      { kind: "contains", text: "Scope of work" },
      { kind: "contains", text: "Security considerations" },
      { kind: "price_max", max: 50000 },
      { kind: "question", text: "Does the page name an independent security auditor?" },
    ],
  },
  {
    id: "blank",
    name: "Start blank",
    blurb: "One required phrase to begin with. Add the rest yourself.",
    title: "",
    tieRule: "lowest",
    criteria: [{ kind: "contains", text: "" }],
  },
];

export const KIND_LABEL: Record<Criterion["kind"], string> = {
  contains: "Page contains",
  license: "Names a license",
  price_max: "Price ceiling",
  deliverable: "Links a public deliverable",
  question: "Yes/no fact (jury)",
};

export const KIND_HELP: Record<Criterion["kind"], string> = {
  contains: "Checked by code. The page must contain this phrase, ignoring case. Good for required section headings.",
  license: "Checked by code. The page must name one of these SPDX license ids, as a whole word.",
  price_max: "Checked by code. The bid's revealed price must be at or under this ceiling.",
  deliverable: "Checked by code and the web. The page must link a URL starting with this prefix, and that URL must load.",
  question: "The only jury-judged kind. It must be a yes/no fact the page states, never a matter of taste.",
};

export function describeCriterion(c: Criterion): string {
  switch (c.kind) {
    case "contains":
      return `Page contains "${c.text}"`;
    case "license":
      return `Names a license: ${c.allowed.join(", ")}`;
    case "price_max":
      return `Price at most ${c.max.toLocaleString("en-US")}`;
    case "deliverable":
      return `Links a working deliverable under ${c.prefix}`;
    case "question":
      return c.text;
  }
}
