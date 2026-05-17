import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const username = process.env.PROFILE_USERNAME || process.env.GITHUB_REPOSITORY_OWNER || "leonardovasconceloss";
const token = process.env.PROFILE_STATS_TOKEN || process.env.GITHUB_TOKEN;
const outputPath = process.env.OUTPUT_PATH || "assets/github-contributions.svg";
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

const cell = 8;
const gap = 3;
const graphX = 402;
const graphY = 64;
const maxWeeks = 53;
const visibleWeeks = weeks.slice(-maxWeeks);

const contributionCells = visibleWeeks
  .flatMap((week, weekIndex) =>
    week.contributionDays.map((day, dayIndex) => {
      const x = graphX + weekIndex * (cell + gap);
      const y = graphY + dayIndex * (cell + gap);
      const color = day.contributionCount > 0 ? day.color || "#238636" : "#161b22";
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
<svg xmlns="http://www.w3.org/2000/svg" width="760" height="220" viewBox="0 0 760 220" role="img" aria-labelledby="title desc">
  <title id="title">Contribuições no GitHub</title>
  <desc id="desc">${escapeXml(totalContributions)} contribuições em ${escapeXml(year)}. Atividade recente concentrada em repositórios privados e organizações.</desc>
  <style>
    .bg { fill: #0d1117; stroke: #30363d; stroke-width: 1; }
    .muted { fill: #8b949e; font: 500 14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .title { fill: #58a6ff; font: 700 18px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .number { fill: #f0f6fc; font: 800 56px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .label { fill: #c9d1d9; font: 700 22px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .note { fill: #8b949e; font: 500 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .pill { fill: #161b22; stroke: #30363d; stroke-width: 1; }
    .pill-text { fill: #c9d1d9; font: 600 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  </style>
  <rect class="bg" x="0.5" y="0.5" width="759" height="219" rx="14" />
  <text class="title" x="34" y="42">Contribuições no GitHub</text>
  <text class="muted" x="34" y="68">Atividade do ano</text>
  <text class="number" x="34" y="130">${escapeXml(totalContributions)}</text>
  <text class="label" x="170" y="116">contribuições em ${escapeXml(year)}</text>
  <text class="note" x="170" y="140">total consolidado do ano, sem separar público e privado</text>
  <rect class="pill" x="34" y="158" width="268" height="30" rx="15" />
  <text class="pill-text" x="52" y="178">privados + organizações + projetos públicos</text>
  <text class="muted" x="402" y="42">Calendário de contribuições</text>
  ${contributionCells}
  <text class="note" x="402" y="177">Atividade recente concentrada em repositórios privados e organizações.</text>
  <text class="note" x="402" y="197">Atualizado em ${escapeXml(generatedAt)}</text>
</svg>
`;

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, svg, "utf8");

console.log(`Generated ${outputPath} with ${totalContributions} contributions for ${year}.`);
