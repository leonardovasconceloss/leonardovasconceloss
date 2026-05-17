import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const username = process.env.PROFILE_USERNAME || process.env.GITHUB_REPOSITORY_OWNER || "leonardovasconceloss";
const token = process.env.PROFILE_STATS_TOKEN || process.env.GITHUB_TOKEN;
const outputPath = process.env.OUTPUT_PATH || "assets/github-contributions.svg";
const readmePath = process.env.README_PATH || "README.md";
const year = Number(process.env.PROFILE_STATS_YEAR || new Date().getUTCFullYear());

if (!token) {
  throw new Error("PROFILE_STATS_TOKEN is required to generate authenticated contribution stats.");
}

const now = new Date();
const from = new Date(Date.UTC(year, 0, 1, 0, 0, 0));
const to =
  year === now.getUTCFullYear()
    ? now
    : new Date(Date.UTC(year, 11, 31, 23, 59, 59));

const query = `
  query ($login: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $login) {
      contributionsCollection(from: $from, to: $to) {
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              contributionCount
              color
              date
            }
          }
        }
      }
    }
  }
`;

const response = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    "user-agent": "profile-contributions-card",
  },
  body: JSON.stringify({
    query,
    variables: {
      login: username,
      from: from.toISOString(),
      to: to.toISOString(),
    },
  }),
});

if (!response.ok) {
  throw new Error(`GitHub API returned ${response.status}: ${await response.text()}`);
}

const payload = await response.json();

if (payload.errors) {
  throw new Error(JSON.stringify(payload.errors, null, 2));
}

const calendar = payload.data?.user?.contributionsCollection?.contributionCalendar;

if (!calendar) {
  throw new Error(`Could not load contribution calendar for ${username}.`);
}

const totalContributions = calendar.totalContributions;
const weeks = calendar.weeks ?? [];
const generatedAt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
}).format(now);

const escapeXml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const getContributionColor = (count) => {
  if (count === 0) return "#161b22";
  if (count <= 2) return "#0e4429";
  if (count <= 5) return "#006d32";
  if (count <= 10) return "#26a641";
  return "#39d353";
};

const cell = 8;
const gap = 3;
const graphX = 405;
const graphY = 88;
const maxWeeks = 26;
const visibleWeeks = weeks.slice(-maxWeeks);

const contributionCells = visibleWeeks
  .flatMap((week, weekIndex) =>
    week.contributionDays.map((day) => {
      const x = graphX + weekIndex * (cell + gap);
      const dayIndex = new Date(`${day.date}T00:00:00Z`).getUTCDay();
      const y = graphY + dayIndex * (cell + gap);
      const color = getContributionColor(day.contributionCount);
      const title = `${day.date}: ${day.contributionCount} contribuições`;

      return [
        `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="2" fill="${escapeXml(color)}">`,
        `<title>${escapeXml(title)}</title>`,
        "</rect>",
      ].join("");
    }),
  )
  .join("\n");

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="760" height="240" viewBox="0 0 760 240" role="img" aria-labelledby="title desc">
  <title id="title">Contribuições no GitHub</title>
  <desc id="desc">${escapeXml(totalContributions)} contribuições em ${escapeXml(year)}. Atividade recente concentrada em repositórios privados e organizações.</desc>
  <style>
    .bg { fill: #0d1117; stroke: #30363d; stroke-width: 1; }
    .divider { stroke: #30363d; stroke-width: 1; opacity: 0.8; }
    .title { fill: #58a6ff; font: 700 20px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .subtitle { fill: #8b949e; font: 600 14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .number { fill: #f0f6fc; font: 800 68px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .label { fill: #c9d1d9; font: 700 22px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .note { fill: #8b949e; font: 600 14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .section { fill: #c9d1d9; font: 700 15px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .date { fill: #f0f6fc; font: 700 15px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .legend { fill: #8b949e; font: 600 11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  </style>
  <rect class="bg" x="0.5" y="0.5" width="759" height="239" rx="12" />
  <text class="title" x="34" y="42">Contribuições no GitHub</text>
  <text class="subtitle" x="34" y="66">Atividade consolidada em ${escapeXml(year)}</text>
  <text class="number" x="34" y="138">${escapeXml(totalContributions)}</text>
  <text class="label" x="34" y="166">contribuições em ${escapeXml(year)}</text>
  <text class="note" x="34" y="190">privados, organizações e projetos públicos incluídos</text>
  <line class="divider" x1="370" y1="32" x2="370" y2="208" />
  <text class="section" x="405" y="42">Atividade recente</text>
  <text class="subtitle" x="405" y="66">últimas semanas visíveis</text>
  ${contributionCells}
  <text class="note" x="405" y="190">Atualizado em <tspan class="date">${escapeXml(generatedAt)}</tspan></text>
  <text class="legend" x="405" y="216">menos</text>
  <rect x="450" y="206" width="8" height="8" rx="2" fill="#161b22" />
  <rect x="464" y="206" width="8" height="8" rx="2" fill="#0e4429" />
  <rect x="478" y="206" width="8" height="8" rx="2" fill="#006d32" />
  <rect x="492" y="206" width="8" height="8" rx="2" fill="#26a641" />
  <rect x="506" y="206" width="8" height="8" rx="2" fill="#39d353" />
  <text class="legend" x="524" y="216">mais</text>
</svg>
`;

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, svg, "utf8");

const cacheKey = `${year}-${totalContributions}-${now.toISOString().slice(0, 10).replaceAll("-", "")}`;
const readme = await readFile(readmePath, "utf8").catch(() => null);

if (readme) {
  const updatedReadme = readme.replace(
    /src="\.\/assets\/github-contributions\.svg(?:\?v=[^"]*)?"/,
    `src="./assets/github-contributions.svg?v=${cacheKey}"`,
  );

  if (updatedReadme !== readme) {
    await writeFile(readmePath, updatedReadme, "utf8");
  }
}

console.log(`Generated ${outputPath} with ${totalContributions} contributions for ${year}.`);
