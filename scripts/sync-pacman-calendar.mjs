import { existsSync, readFileSync, writeFileSync } from "node:fs";

const token = process.env.PROFILE_STATS_TOKEN || process.env.GITHUB_TOKEN;
const username =
  process.env.PROFILE_USERNAME ||
  process.env.GITHUB_REPOSITORY_OWNER ||
  "leonardovasconceloss";

if (!token) {
  throw new Error("PROFILE_STATS_TOKEN is required to include private and organization activity.");
}

const query = `
query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks {
          contributionDays {
            date
            contributionCount
            contributionLevel
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
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ query, variables: { login: username } }),
});

if (!response.ok) {
  throw new Error(`GitHub GraphQL request failed: ${response.status} ${response.statusText}`);
}

const payload = await response.json();
if (payload.errors?.length) {
  throw new Error(payload.errors.map((error) => error.message).join("; "));
}

const calendar = payload.data?.user?.contributionsCollection?.contributionCalendar;
if (!calendar?.weeks?.length) {
  throw new Error(`Contribution calendar not found for ${username}.`);
}

const totalContributions = calendar.totalContributions;
const activeDays = calendar.weeks
  .flatMap((week) => week.contributionDays)
  .filter((day) => day.contributionCount > 0).length;

if (totalContributions === 0 || activeDays === 0) {
  throw new Error("Authenticated contribution calendar is empty; refusing to publish a misleading SVG.");
}

for (const file of [
  { path: "dist/pacman-contribution-graph.svg", theme: "light" },
  { path: "dist/pacman-contribution-graph-dark.svg", theme: "dark" },
]) {
  if (!existsSync(file.path)) {
    throw new Error(`Generated SVG not found: ${file.path}`);
  }

  const svg = readFileSync(file.path, "utf8");
  const synced = syncContributionBlocks(svg, calendar.weeks, file.theme);
  writeFileSync(file.path, synced);
}

function syncContributionBlocks(svg, weeks, theme) {
  const cleanSvg = removePreviousSummary(svg);

  return cleanSvg.replace(
    /<rect id="c-(\d+)-(\d+)"([\s\S]*?)<\/rect>/g,
    (match, weekIndexText, dayIndexText) => {
      const weekIndex = Number(weekIndexText);
      const dayIndex = Number(dayIndexText);
      const day = weeks[weekIndex]?.contributionDays?.[dayIndex];

      if (!day) {
        return match;
      }

      const color = colorFor(day.contributionLevel, theme);
      const stableAnimate = `<animate attributeName="fill" dur="82800ms" repeatCount="indefinite"
          values="${color};${color}"
          keyTimes="0;1"/>`;

      return match
        .replace(/fill="[^"]*"/, `fill="${color}"`)
        .replace(/<animate attributeName="fill"[\s\S]*?\/>/, stableAnimate)
        .replace(/<title>[\s\S]*?<\/title>/, "")
        .replace(/(<rect id="c-\d+-\d+"[^>]*>)/, `$1<title>${day.date}: ${day.contributionCount}</title>`);
    }
  );
}

function colorFor(level, theme) {
  const palettes = {
    light: {
      NONE: "#ebedf0",
      FIRST_QUARTILE: "#9be9a8",
      SECOND_QUARTILE: "#40c463",
      THIRD_QUARTILE: "#30a14e",
      FOURTH_QUARTILE: "#216e39",
    },
    dark: {
      NONE: "#161b22",
      FIRST_QUARTILE: "#0e4429",
      SECOND_QUARTILE: "#006d32",
      THIRD_QUARTILE: "#26a641",
      FOURTH_QUARTILE: "#39d353",
    },
  };

  return palettes[theme][level] || palettes[theme].NONE;
}

function removePreviousSummary(svg) {
  if (!svg.includes('id="activity-summary"')) {
    return svg;
  }

  const headerHeight = 46;
  const withoutHeader = svg
    .replace(/<g id="activity-summary"[\s\S]*?<\/g>\s*<g transform="translate\(0, 46\)">/, "")
    .replace(/<\/g><\/svg>\s*$/, "</svg>");

  return withoutHeader.replace(
    /<svg\b([^>]*?)height="(\d+)"([^>]*)>/,
    (_match, before, height, after) =>
      `<svg${before}height="${Math.max(Number(height) - headerHeight, 1)}"${after}>`
  );
}
