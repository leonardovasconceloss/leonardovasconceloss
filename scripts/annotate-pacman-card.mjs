import { existsSync, readFileSync, writeFileSync } from "node:fs";

const token = process.env.PROFILE_STATS_TOKEN || process.env.GITHUB_TOKEN;
const username =
  process.env.PROFILE_USERNAME ||
  process.env.GITHUB_REPOSITORY_OWNER ||
  "leonardovasconceloss";

if (!token) {
  throw new Error("PROFILE_STATS_TOKEN is required to include private/restricted activity.");
}

const now = new Date();
const year = now.getUTCFullYear();

const query = `
query($login: String!, $yearStart: DateTime!, $yearEnd: DateTime!) {
  user(login: $login) {
    rolling: contributionsCollection {
      totalCommitContributions
      restrictedContributionsCount
      contributionCalendar {
        totalContributions
      }
    }
    currentYear: contributionsCollection(from: $yearStart, to: $yearEnd) {
      totalCommitContributions
      restrictedContributionsCount
      contributionCalendar {
        totalContributions
      }
    }
  }
}
`;

const response = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    query,
    variables: {
      login: username,
      yearStart: `${year}-01-01T00:00:00Z`,
      yearEnd: `${year}-12-31T23:59:59Z`,
    },
  }),
});

if (!response.ok) {
  throw new Error(`GitHub GraphQL request failed: ${response.status} ${response.statusText}`);
}

const payload = await response.json();
if (payload.errors?.length) {
  throw new Error(payload.errors.map((error) => error.message).join("; "));
}

const user = payload.data?.user;
if (!user) {
  throw new Error(`GitHub user not found: ${username}`);
}

const rolling = normalizeStats(user.rolling);
const currentYear = normalizeStats(user.currentYear);
const updatedAt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "short",
  timeStyle: "short",
}).format(now);

const visibilityLabel =
  rolling.restrictedContributions > 0 || currentYear.restrictedContributions > 0
    ? "publicas + privadas/restritas"
    : "publicas";

const summaryLine =
  `${rolling.totalContributions} contribuicoes nos ultimos 12 meses (${visibilityLabel})`;
const detailLine =
  `${year}: ${currentYear.totalContributions} contribuicoes - ` +
  `${currentYear.restrictedContributions} privadas/restritas - ` +
  `atualizado em ${updatedAt}`;

for (const file of [
  { path: "dist/pacman-contribution-graph.svg", theme: "light" },
  { path: "dist/pacman-contribution-graph-dark.svg", theme: "dark" },
]) {
  if (!existsSync(file.path)) {
    throw new Error(`Generated SVG not found: ${file.path}`);
  }

  const svg = readFileSync(file.path, "utf8");
  writeFileSync(file.path, annotateSvg(svg, file.theme, summaryLine, detailLine));
}

function normalizeStats(collection) {
  return {
    totalContributions: collection.contributionCalendar.totalContributions,
    commitContributions: collection.totalCommitContributions,
    restrictedContributions: collection.restrictedContributionsCount,
  };
}

function annotateSvg(svg, theme, title, subtitle) {
  const headerHeight = 46;
  const titleFill = theme === "dark" ? "#e6edf3" : "#24292f";
  const subtitleFill = theme === "dark" ? "#8b949e" : "#57606a";

  const resized = svg.replace(
    /<svg\b([^>]*?)height="(\d+)"([^>]*)>/,
    (_match, before, height, after) =>
      `<svg${before}height="${Number(height) + headerHeight}"${after}>`
  );

  if (resized === svg) {
    throw new Error("Could not resize generated Pac-Man SVG.");
  }

  const defsEnd = resized.indexOf("</defs>");
  if (defsEnd === -1) {
    throw new Error("Could not find SVG defs block.");
  }

  const insertAt = defsEnd + "</defs>".length;
  const before = resized.slice(0, insertAt);
  const rest = resized.slice(insertAt, -"</svg>".length);

  return `${before}
<g id="activity-summary" font-family="'Segoe UI', Ubuntu, 'Helvetica Neue', Sans-Serif">
  <text x="0" y="18" font-size="16" font-weight="700" fill="${titleFill}">${escapeXml(title)}</text>
  <text x="0" y="38" font-size="12" fill="${subtitleFill}">${escapeXml(subtitle)}</text>
</g>
<g transform="translate(0, ${headerHeight})">${rest}</g></svg>`;
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
