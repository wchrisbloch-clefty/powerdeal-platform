export { buildBriefPrompt } from './brief';
export { buildQualifyPrompt } from './qualify';
export { buildPlanPrompt } from './plan';
export { buildMapPrompt } from './map-gen';
export { buildOutreachPrompt } from './outreach';
export { buildCampaignPrompt, type CampaignContext } from './campaign';
export { buildIntelPrompt, buildPortfolioIntelPrompt } from './intel';
export { buildBusinessCasePrompt } from './business-case';
export { buildObjectionsPrompt } from './objections';
export { buildMarketWatchPrompt, type MarketWatchItem } from './market-watch';
export { buildPersuadePrompt, type PersuadeContext } from './persuade';
export {
  AUDIENCE_PERSONAS,
  getAudienceContext,
  dealBlock,
  economicsBlock,
  signalsBlock,
  marketWatchBlock,
  territoryBlock,
  type PromptContext,
} from './shared';
