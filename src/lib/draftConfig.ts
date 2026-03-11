interface TeamSlotConfig {
  count: number;
  label: string;
  rules: string[];
}

interface DraftConfiguration {
  TOTAL_TEAMS: number;
  STANDARD: TeamSlotConfig;
  WILDCARD: TeamSlotConfig;
  WILDCARD_MIN_TEAM_NUMBER: number;
}

export const DRAFT_CONFIG: DraftConfiguration = {
  TOTAL_TEAMS: 10,

  STANDARD: {
    count: 8,
    label: "Standard Teams",
    rules: [
      "Pick 8 teams total",
      "No two teams from the same US state",
      "No two teams from the same country (non-US)",
    ],
  },

  WILDCARD: {
    count: 2,
    label: "Wildcard Teams",
    rules: [
      "Pick 2 teams with a team number greater than 5,000",
      "No geographic restrictions apply",
    ],
  },

  WILDCARD_MIN_TEAM_NUMBER: 5000,
};
