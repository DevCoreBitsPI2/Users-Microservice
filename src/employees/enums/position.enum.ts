export enum PositionId {
  CEO = 1,
  CIO = 2,
  CHRO = 3,
  CFO = 4,
  COO = 5,
  TechnologyLead = 6,
  HumanTalentLead = 7,
  FinanceLead = 8,
  OperationsLead = 9,
  RecruitmentCoordinator = 10,
  SelectionAnalyst = 11,
  BackendDeveloper = 13,
  HumanTalentAssistant = 14,
}

export const C_LEVEL_POSITION_IDS = [
  PositionId.CEO,
  PositionId.CIO,
  PositionId.CHRO,
  PositionId.CFO,
  PositionId.COO,
];

export const LEAD_POSITION_IDS = [
  PositionId.TechnologyLead,
  PositionId.HumanTalentLead,
  PositionId.FinanceLead,
  PositionId.OperationsLead,
];
