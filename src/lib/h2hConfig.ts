export interface H2HConfiguration {
  PICKS_PER_USER: number;
  TEAMS_PER_USER: number;
  WIN_POINTS: number;
  TIE_POINTS: number;
  LOSS_POINTS: number;
  DRAFT_OPEN_HOURS_BEFORE: number;
  DRAFT_CLOSE_HOURS_BEFORE: number;
  SCORING_BUFFER_DAYS: number;
  LABEL: string;
  DESCRIPTION: string;
}

export const H2H_CONFIG: H2HConfiguration = {
  PICKS_PER_USER: 6,
  TEAMS_PER_USER: 3,
  WIN_POINTS: 20,
  TIE_POINTS: 10,
  LOSS_POINTS: 0,
  DRAFT_OPEN_HOURS_BEFORE: 192,
  DRAFT_CLOSE_HOURS_BEFORE: 24,
  SCORING_BUFFER_DAYS: 1,
  LABEL: "1v1 Draft",
  DESCRIPTION: "Pick 6 teams in order of preference. An alternating draft determines your final 3.",
};
